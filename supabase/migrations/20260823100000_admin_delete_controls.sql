-- WEB-8: narrow, transactional, admin-only hard-delete contracts.
-- Creator snapshots remain useful after account deletion; creator identity is
-- therefore nullable while all new rows still receive auth.uid() by default.

alter table public.tos_events
    drop constraint tos_events_created_by_fkey,
    alter column created_by drop not null,
    add constraint tos_events_created_by_fkey
        foreign key (created_by) references auth.users(id) on delete set null;

alter table public.schedules
    drop constraint schedules_created_by_fkey,
    alter column created_by drop not null,
    add constraint schedules_created_by_fkey
        foreign key (created_by) references auth.users(id) on delete set null;

create function public.admin_delete_tos_event(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    affected integer;
begin
    if auth.uid() is null or not exists (
        select 1
          from public.profiles as actor
         where actor.id = auth.uid()
           and actor.active
           and actor.role = 'admin'
    ) then
        raise exception 'Admin authorization required.' using errcode = '42501';
    end if;

    perform 1
      from public.tos_events as event
     where event.id = p_event_id
     for update;
    if not found then
        raise exception 'TOS event not found.' using errcode = 'P0002';
    end if;

    -- schedules.event_id is intentionally RESTRICT. Removing schedules first
    -- also removes their event history snapshot through existing cascades.
    delete from public.schedules as schedule
     where schedule.event_id = p_event_id;

    delete from public.tos_events as event
     where event.id = p_event_id;
    get diagnostics affected = row_count;
    if affected <> 1 then
        raise exception 'TOS event changed during deletion.' using errcode = '40001';
    end if;

    return true;
end;
$$;

create function public.admin_delete_member_account(p_member_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor_id uuid := auth.uid();
    actor_member_id uuid;
    target_profile_id uuid;
    affected integer;
begin
    select actor.member_id
      into actor_member_id
      from public.profiles as actor
     where actor.id = actor_id
       and actor.active
       and actor.role = 'admin';
    if not found then
        raise exception 'Admin authorization required.' using errcode = '42501';
    end if;

    perform 1
      from public.club_members as member
     where member.id = p_member_id
     for update;
    if not found then
        raise exception 'Club member not found.' using errcode = 'P0002';
    end if;

    select profile.id
      into target_profile_id
      from public.profiles as profile
     where profile.member_id = p_member_id
     for update;

    if actor_member_id = p_member_id or target_profile_id = actor_id then
        raise exception 'An admin cannot delete their own account.' using errcode = '42501';
    end if;

    -- Fail closed while the member still participates in a non-finished event.
    if exists (
        select 1
          from public.registrations as registration
          join public.tos_events as event on event.id = registration.event_id
         where registration.member_id = p_member_id
           and registration.response = 'attending'
           and event.ends_at > now()
    ) or exists (
        select 1
          from public.tos_event_planner_drafts as draft
          join public.tos_events as event on event.id = draft.event_id
          cross join lateral jsonb_array_elements(draft.players) as player(value)
         where event.ends_at > now()
           and player.value ->> 'member_id' = p_member_id::text
           and player.value ->> 'included' = 'true'
    ) or exists (
        select 1
          from public.schedules as schedule
          join public.tos_events as event on event.id = schedule.event_id
          cross join lateral jsonb_array_elements(schedule.players_private) as player(value)
         where event.ends_at > now()
           and player.value ->> 'member_id' = p_member_id::text
           and player.value ->> 'included' = 'true'
    ) then
        raise exception 'Club member still participates in an active TOS event.'
            using errcode = '55000';
    end if;

    -- Past private planner snapshots keep display/ranking context but lose all
    -- stable account/member/registration identifiers for the deleted member.
    update public.tos_event_planner_drafts as draft
       set players = (
           select coalesce(jsonb_agg(
               case when player.value ->> 'member_id' = p_member_id::text
                    then player.value - 'member_id' - 'user_id'
                         - 'registration_id' - 'registration_updated_at'
                    else player.value end
               order by player.ordinality
           ), '[]'::jsonb)
             from jsonb_array_elements(draft.players)
                  with ordinality as player(value, ordinality)
       )
     where exists (
         select 1 from jsonb_array_elements(draft.players) as player(value)
          where player.value ->> 'member_id' = p_member_id::text
     );

    update public.schedules as schedule
       set players_private = (
           select coalesce(jsonb_agg(
               case when player.value ->> 'member_id' = p_member_id::text
                    then player.value - 'member_id' - 'user_id'
                         - 'registration_id' - 'registration_updated_at'
                    else player.value end
               order by player.ordinality
           ), '[]'::jsonb)
             from jsonb_array_elements(schedule.players_private)
                  with ordinality as player(value, ordinality)
       )
     where exists (
         select 1 from jsonb_array_elements(schedule.players_private) as player(value)
          where player.value ->> 'member_id' = p_member_id::text
     );

    delete from public.registrations as registration
     where registration.member_id = p_member_id;

    if target_profile_id is not null then
        -- auth.users owns the actual account lifecycle. Its existing cascades
        -- remove the profile, sessions, identities and legacy personal draft.
        delete from auth.users as account
         where account.id = target_profile_id;
        get diagnostics affected = row_count;
        if affected <> 1 then
            raise exception 'Linked Auth account could not be deleted.' using errcode = '40001';
        end if;
    end if;

    -- Existing FKs cascade sport profiles/contact requests and SET NULL the
    -- history identity while preserving display_name_snapshot.
    delete from public.club_members as member
     where member.id = p_member_id;
    get diagnostics affected = row_count;
    if affected <> 1 then
        raise exception 'Club member changed during deletion.' using errcode = '40001';
    end if;

    return true;
end;
$$;

revoke all privileges on function public.admin_delete_tos_event(uuid),
    public.admin_delete_member_account(uuid)
    from public, anon, authenticated;

grant execute on function public.admin_delete_tos_event(uuid),
    public.admin_delete_member_account(uuid)
    to authenticated;
