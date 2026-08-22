-- WEB-7: privacy-friendly contact consent between actual historical clubmates,
-- plus an admin-only role boundary for linked accounts.

create table public.member_contact_requests (
    id uuid primary key default gen_random_uuid(),
    member_a_id uuid not null references public.club_members(id) on delete cascade,
    member_b_id uuid not null references public.club_members(id) on delete cascade,
    requester_member_id uuid not null references public.club_members(id) on delete cascade,
    recipient_member_id uuid not null references public.club_members(id) on delete cascade,
    status text not null check (status in ('pending','accepted','declined','revoked')),
    created_at timestamptz not null default now(),
    responded_at timestamptz,
    updated_at timestamptz not null default now(),
    unique (member_a_id, member_b_id),
    constraint member_contact_requests_pair_order_check check (member_a_id < member_b_id),
    constraint member_contact_requests_parties_check check (
        requester_member_id <> recipient_member_id
        and requester_member_id in (member_a_id, member_b_id)
        and recipient_member_id in (member_a_id, member_b_id)
    ),
    constraint member_contact_requests_response_check check (
        (status = 'pending' and responded_at is null)
        or (status <> 'pending' and responded_at is not null)
    )
);

create index member_contact_requests_recipient_pending_idx
    on public.member_contact_requests (recipient_member_id, created_at)
    where status = 'pending';
create index member_contact_requests_requester_idx
    on public.member_contact_requests (requester_member_id, updated_at desc);

alter table public.member_contact_requests enable row level security;
revoke all privileges on table public.member_contact_requests
    from public, anon, authenticated;
grant all privileges on table public.member_contact_requests to service_role;

create function public._tos_active_member_for_user(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
    select profile.member_id
      from public.profiles as profile
      join public.club_members as member on member.id = profile.member_id
     where profile.id = p_user_id and profile.active
       and member.active and member.approval_status = 'approved';
$$;

create function public._tos_members_shared_match(p_first uuid, p_second uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
          from public.tos_history_event_players as first_player
          join public.tos_history_round_participants as first_slot
            on first_slot.event_player_id = first_player.id and first_slot.state = 'playing'
          join public.tos_history_round_participants as second_slot
            on second_slot.match_id = first_slot.match_id
           and second_slot.event_player_id <> first_player.id
          join public.tos_history_event_players as second_player
            on second_player.id = second_slot.event_player_id
           and second_player.member_id = p_second
          join public.tos_history_events as history on history.id = first_player.history_event_id
          join public.tos_events as event on event.id = history.event_id
          join public.schedules as schedule
            on schedule.id = history.source_schedule_id and schedule.is_published
         where first_player.member_id = p_first
           and p_first is not null and p_second is not null and p_first <> p_second
           and history.ends_at <= now() and event.status <> 'cancelled'
    );
$$;

revoke all privileges on function public._tos_active_member_for_user(uuid),
    public._tos_members_shared_match(uuid, uuid)
    from public, anon, authenticated;

create function public.request_history_contact(p_other_member_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller_member_id uuid := public._tos_active_member_for_user(auth.uid());
    pair_a uuid;
    pair_b uuid;
    request_id uuid;
begin
    if caller_member_id is null or p_other_member_id is null
       or caller_member_id = p_other_member_id then
        raise exception 'Contact request unavailable.' using errcode = '42501';
    end if;
    if public._tos_active_member_for_user((
        select profile.id from public.profiles as profile
         where profile.member_id = p_other_member_id and profile.active
         limit 1
    )) is null
       or not exists (
           select 1 from public.profiles as profile
           join auth.users as account on account.id = profile.id
          where profile.member_id = p_other_member_id and profile.active
            and nullif(btrim(account.email::text), '') is not null
       )
       or not public._tos_members_shared_match(caller_member_id, p_other_member_id) then
        raise exception 'Contact request unavailable.' using errcode = '42501';
    end if;

    pair_a := least(caller_member_id, p_other_member_id);
    pair_b := greatest(caller_member_id, p_other_member_id);
    insert into public.member_contact_requests (
        member_a_id, member_b_id, requester_member_id, recipient_member_id, status
    ) values (
        pair_a, pair_b, caller_member_id, p_other_member_id, 'pending'
    )
    on conflict (member_a_id, member_b_id) do update
       set requester_member_id = excluded.requester_member_id,
           recipient_member_id = excluded.recipient_member_id,
           status = 'pending', created_at = now(), responded_at = null, updated_at = now()
     where public.member_contact_requests.status in ('declined','revoked')
    returning id into request_id;
    if request_id is null then
        raise exception 'Contact request already active.' using errcode = '23505';
    end if;
    return request_id;
end;
$$;

create function public.respond_history_contact(p_request_id uuid, p_accept boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller_member_id uuid := public._tos_active_member_for_user(auth.uid());
    affected integer;
begin
    if caller_member_id is null or p_request_id is null or p_accept is null then
        raise exception 'Contact response unavailable.' using errcode = '42501';
    end if;
    update public.member_contact_requests
       set status = case when p_accept then 'accepted' else 'declined' end,
           responded_at = now(), updated_at = now()
     where id = p_request_id and recipient_member_id = caller_member_id and status = 'pending';
    get diagnostics affected = row_count;
    if affected <> 1 then
        raise exception 'Contact response unavailable.' using errcode = '42501';
    end if;
    return true;
end;
$$;

create function public.cancel_history_contact(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller_member_id uuid := public._tos_active_member_for_user(auth.uid());
    affected integer;
begin
    update public.member_contact_requests
       set status = 'revoked', responded_at = now(), updated_at = now()
     where id = p_request_id and requester_member_id = caller_member_id and status = 'pending';
    get diagnostics affected = row_count;
    if caller_member_id is null or affected <> 1 then
        raise exception 'Contact cancellation unavailable.' using errcode = '42501';
    end if;
    return true;
end;
$$;

create function public.revoke_history_contact(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller_member_id uuid := public._tos_active_member_for_user(auth.uid());
    affected integer;
begin
    update public.member_contact_requests
       set status = 'revoked', responded_at = coalesce(responded_at, now()), updated_at = now()
     where id = p_request_id and caller_member_id in (member_a_id, member_b_id)
       and status = 'accepted';
    get diagnostics affected = row_count;
    if caller_member_id is null or affected <> 1 then
        raise exception 'Contact revocation unavailable.' using errcode = '42501';
    end if;
    return true;
end;
$$;

create function public.my_history_contact_requests()
returns table (
    request_id uuid,
    other_member_id uuid,
    display_name text,
    status text,
    direction text,
    created_at timestamptz,
    responded_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
    with viewer as (
        select public._tos_active_member_for_user(auth.uid()) as member_id
    )
    select request.id,
           case when request.requester_member_id = viewer.member_id
                then request.recipient_member_id else request.requester_member_id end,
           other.display_name,
           request.status,
           case when request.requester_member_id = viewer.member_id then 'outgoing' else 'incoming' end,
           request.created_at,
           request.responded_at
      from viewer
      join public.member_contact_requests as request
        on viewer.member_id in (request.member_a_id, request.member_b_id)
      join public.club_members as other
        on other.id = case when request.requester_member_id = viewer.member_id
                           then request.recipient_member_id else request.requester_member_id end
     where viewer.member_id is not null
       and public._tos_members_shared_match(
           viewer.member_id,
           case when request.requester_member_id = viewer.member_id
                then request.recipient_member_id else request.requester_member_id end
       )
     order by (request.status = 'pending' and request.recipient_member_id = viewer.member_id) desc,
              request.updated_at desc, request.id;
$$;

create function public.my_accepted_history_contact(p_other_member_id uuid)
returns table (contact_email text)
language sql
stable
security definer
set search_path = ''
as $$
    with viewer as (
        select public._tos_active_member_for_user(auth.uid()) as member_id
    )
    select account.email::text
      from viewer
      join public.member_contact_requests as request
        on request.member_a_id = least(viewer.member_id, p_other_member_id)
       and request.member_b_id = greatest(viewer.member_id, p_other_member_id)
       and request.status = 'accepted'
      join public.profiles as other_profile
        on other_profile.member_id = p_other_member_id and other_profile.active
      join public.club_members as other_member
        on other_member.id = other_profile.member_id and other_member.active
       and other_member.approval_status = 'approved'
      join auth.users as account on account.id = other_profile.id
     where viewer.member_id is not null and p_other_member_id <> viewer.member_id
       and public._tos_members_shared_match(viewer.member_id, p_other_member_id)
       and nullif(btrim(account.email::text), '') is not null;
$$;

revoke all privileges on function public.request_history_contact(uuid),
    public.respond_history_contact(uuid, boolean),
    public.cancel_history_contact(uuid), public.revoke_history_contact(uuid),
    public.my_history_contact_requests(), public.my_accepted_history_contact(uuid)
    from public, anon, authenticated;
grant execute on function public.request_history_contact(uuid),
    public.respond_history_contact(uuid, boolean),
    public.cancel_history_contact(uuid), public.revoke_history_contact(uuid),
    public.my_history_contact_requests(), public.my_accepted_history_contact(uuid)
    to authenticated;

drop function public.staff_member_directory();

create function public.staff_member_directory()
returns table (
    member_id uuid,
    display_name text,
    profile_id uuid,
    account_role text,
    login_email text,
    approval_status text,
    member_active boolean,
    account_linked boolean,
    padel_profile_active boolean,
    padel_ranking smallint,
    tennis_profile_active boolean,
    tennis_ranking smallint
)
language sql
stable
security definer
set search_path = ''
as $$
    select member.id,
           member.display_name,
           linked_profile.id,
           linked_profile.role,
           linked_user.email::text,
           member.approval_status,
           member.active,
           linked_profile.id is not null,
           coalesce(padel.active, false),
           padel.ranking,
           coalesce(tennis.active, false),
           tennis.ranking
    from public.club_members as member
    left join public.profiles as linked_profile on linked_profile.member_id = member.id
    left join auth.users as linked_user on linked_user.id = linked_profile.id
    left join public.member_sport_profiles as padel
      on padel.member_id = member.id and padel.sport = 'padel'
    left join public.member_sport_profiles as tennis
      on tennis.member_id = member.id and tennis.sport = 'tennis'
    where exists (
        select 1 from public.profiles as viewer
         where viewer.id = auth.uid() and viewer.active
           and viewer.role in ('planner', 'admin')
    )
    order by lower(member.display_name), member.display_name,
             lower(linked_user.email::text) nulls last, member.id;
$$;

create function public.admin_set_profile_role(p_target_profile_id uuid, p_role text)
returns table (profile_id uuid, role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor_id uuid := auth.uid();
    affected integer;
begin
    if p_target_profile_id is null or p_target_profile_id = actor_id
       or p_role not in ('participant','planner','admin')
       or not exists (
           select 1 from public.profiles as actor
            where actor.id = actor_id and actor.active and actor.role = 'admin'
       )
       or not exists (
           select 1 from public.profiles as target
           join public.club_members as member on member.id = target.member_id
            where target.id = p_target_profile_id
       ) then
        raise exception 'Role change unavailable.' using errcode = '42501';
    end if;
    update public.profiles as target set role = p_role
     where target.id = p_target_profile_id and target.member_id is not null;
    get diagnostics affected = row_count;
    if affected <> 1 then
        raise exception 'Role change unavailable.' using errcode = '42501';
    end if;
    return query select target.id, target.role
      from public.profiles as target where target.id = p_target_profile_id;
end;
$$;

revoke all privileges on function public.staff_member_directory(),
    public.admin_set_profile_role(uuid, text)
    from public, anon, authenticated;
grant execute on function public.staff_member_directory(),
    public.admin_set_profile_role(uuid, text)
    to authenticated;
