-- WEB-6: eventcapaciteit, deterministische wachtlijst en smal ledenbeheer.
-- De browser bepaalt nooit plaatsing, attending_since of staff-identiteit.

alter table public.tos_events
    add column max_participants integer not null default 24,
    add constraint tos_events_max_participants_check
        check (max_participants > 0);

alter table public.registrations
    add column attending_since timestamptz;

-- Eenmalige technische initialisatie voor rows die vóór WEB-6 zijn ontstaan.
-- created_at is verplicht en stabiel; declined rows blijven volledig ongemoeid.
update public.registrations
set attending_since = created_at
where response = 'attending'
  and attending_since is null;

alter table public.registrations
    add constraint registrations_attending_since_check
        check (
            (response = 'attending' and attending_since is not null)
            or (response = 'declined' and attending_since is null)
        );

create index registrations_event_attending_order_idx
    on public.registrations (event_id, attending_since, id)
    where response = 'attending';

grant select (max_participants)
    on table public.tos_events to anon, authenticated;
grant insert (max_participants), update (max_participants)
    on table public.tos_events to authenticated;

-- Goedgekeurde actieve clubleden mogen ook veilige gesloten events zien.
-- Draft en cancelled blijven buiten de participant-directory; anon houdt
-- uitsluitend de bestaande open-eventpolicy.
create policy tos_events_select_participant_closed
on public.tos_events
for select
to authenticated
using (
    status = 'closed'
    and exists (
        select 1
        from public.profiles as viewer
        join public.club_members as viewer_member
          on viewer_member.id = viewer.member_id
        where viewer.id = (select auth.uid())
          and viewer.active
          and viewer_member.active
          and viewer_member.approval_status = 'approved'
    )
);

create or replace function public.validate_self_signup_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor_id uuid := auth.uid();
    linked_member_id uuid;
    event_starts_at timestamptz;
    event_ends_at timestamptz;
    event_signup_deadline timestamptz;
    event_status text;
begin
    if actor_id is not null then
        select profile.member_id
        into linked_member_id
        from public.profiles as profile
        join public.club_members as member
          on member.id = profile.member_id
        where profile.id = actor_id
          and profile.active
          and member.active
          and member.approval_status = 'approved';

        if linked_member_id is null then
            raise exception 'Een goedgekeurde actieve ledenkoppeling is vereist voor zelf-aanmelding.'
                using errcode = '42501';
        end if;

        if tg_op = 'INSERT' then
            new.user_id := actor_id;
            new.member_id := linked_member_id;
            new.source := 'self';
        else
            if old.user_id <> actor_id then
                raise exception 'Een registratie van een andere gebruiker mag niet worden gewijzigd.'
                    using errcode = '42501';
            end if;

            new.event_id := old.event_id;
            new.user_id := old.user_id;
            new.member_id := old.member_id;
            new.source := old.source;
        end if;
    end if;

    select event.starts_at,
           event.ends_at,
           event.signup_deadline,
           event.status
    into event_starts_at,
         event_ends_at,
         event_signup_deadline,
         event_status
    from public.tos_events as event
    where event.id = new.event_id;

    if not found then
        raise exception 'Het TOS-event bestaat niet.'
            using errcode = '23503';
    end if;

    if actor_id is not null
       and (
           event_status <> 'open'
           or (
               event_signup_deadline is not null
               and now() > event_signup_deadline
           )
       ) then
        raise exception 'Zelf-service voor dit TOS-event is gesloten.'
            using errcode = '42501';
    end if;

    if new.response = 'attending' then
        new.available_from := coalesce(new.available_from, event_starts_at);
        new.available_until := coalesce(new.available_until, event_ends_at);

        if new.available_from < event_starts_at
           or new.available_until > event_ends_at
           or new.available_until <= new.available_from then
            raise exception 'Beschikbaarheid moet binnen de TOS-tijden vallen.'
                using errcode = '22007';
        end if;

        if tg_op = 'INSERT' then
            new.attending_since := statement_timestamp();
        elsif old.response <> 'attending' then
            new.attending_since := statement_timestamp();
        else
            new.attending_since := old.attending_since;
        end if;
    elsif new.response = 'declined' then
        new.available_from := null;
        new.available_until := null;
        new.attending_since := null;
    end if;

    return new;
end;
$$;

-- Alleen een actieve, goedgekeurde participant ziet capaciteit van events die
-- binnen de participant-directory vallen. Er worden geen registrationrijen
-- of identiteiten teruggegeven.
create function public.participant_event_capacity(p_event_id uuid)
returns table (
    max_participants integer,
    placed_count bigint,
    available_count bigint,
    waitlist_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
    select event.max_participants,
           least(count(registration.id), event.max_participants::bigint),
           greatest(event.max_participants::bigint - count(registration.id), 0::bigint),
           greatest(count(registration.id) - event.max_participants::bigint, 0::bigint)
    from public.tos_events as event
    left join public.registrations as registration
      on registration.event_id = event.id
     and registration.response = 'attending'
    where event.id = p_event_id
      and event.status in ('open', 'closed')
      and event.ends_at >= now()
      and exists (
          select 1
          from public.profiles as viewer
          join public.club_members as viewer_member
            on viewer_member.id = viewer.member_id
          where viewer.id = auth.uid()
            and viewer.active
            and viewer_member.active
            and viewer_member.approval_status = 'approved'
      )
    group by event.id, event.max_participants;
$$;

create function public.participant_event_attendance(p_event_id uuid)
returns table (
    display_name text,
    placement_status text,
    waitlist_position bigint
)
language sql
stable
security definer
set search_path = ''
as $$
    with ranked as (
        select registration.member_id,
               row_number() over (
                   order by registration.attending_since, registration.id
               ) as position
        from public.registrations as registration
        where registration.event_id = p_event_id
          and registration.response = 'attending'
    )
    select member.display_name,
           case
               when ranked.position <= event.max_participants then 'placed'
               else 'waitlist'
           end,
           case
               when ranked.position > event.max_participants
               then ranked.position - event.max_participants
               else null
           end
    from public.tos_events as event
    join ranked on true
    join public.club_members as member
      on member.id = ranked.member_id
    where event.id = p_event_id
      and event.status in ('open', 'closed')
      and event.ends_at >= now()
      and member.active
      and member.approval_status = 'approved'
      and exists (
          select 1
          from public.profiles as viewer
          join public.club_members as viewer_member
            on viewer_member.id = viewer.member_id
          where viewer.id = auth.uid()
            and viewer.active
            and viewer_member.active
            and viewer_member.approval_status = 'approved'
      )
    order by ranked.position, lower(member.display_name), member.id;
$$;

create function public.participant_own_registration_position(p_event_id uuid)
returns table (
    placement_status text,
    waitlist_position bigint
)
language sql
stable
security definer
set search_path = ''
as $$
    with attending as (
        select registration.id,
               row_number() over (
                   order by registration.attending_since, registration.id
               ) as attending_position
        from public.registrations as registration
        where registration.event_id = p_event_id
          and registration.response = 'attending'
    ), own_registration as (
        select registration.id,
               registration.user_id,
               registration.response,
               attending.attending_position
        from public.registrations as registration
        left join attending on attending.id = registration.id
        where registration.event_id = p_event_id
    )
    select case
               when own_registration.response = 'declined' then 'declined'
               when own_registration.attending_position <= event.max_participants then 'placed'
               else 'waitlist'
           end,
           case
               when own_registration.response = 'attending'
                and own_registration.attending_position > event.max_participants
               then own_registration.attending_position - event.max_participants
               else null
           end
    from own_registration
    join public.tos_events as event on event.id = p_event_id
    where own_registration.user_id = auth.uid()
      and exists (
          select 1
          from public.profiles as viewer
          join public.club_members as viewer_member
            on viewer_member.id = viewer.member_id
          where viewer.id = auth.uid()
            and viewer.active
            and viewer_member.active
            and viewer_member.approval_status = 'approved'
      );
$$;

create function public.staff_event_capacity_summaries()
returns table (
    event_id uuid,
    max_participants integer,
    placed_count bigint,
    available_count bigint,
    waitlist_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
    select event.id,
           event.max_participants,
           least(count(registration.id), event.max_participants::bigint),
           greatest(event.max_participants::bigint - count(registration.id), 0::bigint),
           greatest(count(registration.id) - event.max_participants::bigint, 0::bigint)
    from public.tos_events as event
    left join public.registrations as registration
      on registration.event_id = event.id
     and registration.response = 'attending'
    where exists (
        select 1
        from public.profiles as viewer
        where viewer.id = auth.uid()
          and viewer.active
          and viewer.role in ('planner', 'admin')
    )
    group by event.id, event.max_participants
    order by event.starts_at desc, event.id;
$$;

create function public.staff_event_registration_overview(p_event_id uuid)
returns table (
    registration_id uuid,
    user_id uuid,
    member_id uuid,
    response text,
    available_from timestamptz,
    available_until timestamptz,
    registration_updated_at timestamptz,
    display_name text,
    approval_status text,
    member_active boolean,
    sport_profile_active boolean,
    ranking smallint,
    placement_status text,
    waitlist_position bigint
)
language sql
stable
security definer
set search_path = ''
as $$
    with attending as (
        select registration.id,
               row_number() over (
                   order by registration.attending_since, registration.id
               ) as attending_position
        from public.registrations as registration
        where registration.event_id = p_event_id
          and registration.response = 'attending'
    ), ranked as (
        select registration.*,
               attending.attending_position
        from public.registrations as registration
        left join attending on attending.id = registration.id
        where registration.event_id = p_event_id
    )
    select ranked.id,
           ranked.user_id,
           ranked.member_id,
           ranked.response,
           ranked.available_from,
           ranked.available_until,
           ranked.updated_at,
           member.display_name,
           member.approval_status,
           member.active,
           coalesce(sport_profile.active, false),
           sport_profile.ranking,
           case
               when ranked.response = 'declined' then 'declined'
               when ranked.attending_position <= event.max_participants then 'placed'
               else 'waitlist'
           end,
           case
               when ranked.response = 'attending'
                and ranked.attending_position > event.max_participants
               then ranked.attending_position - event.max_participants
               else null
           end
    from public.tos_events as event
    join ranked on true
    join public.club_members as member on member.id = ranked.member_id
    left join public.member_sport_profiles as sport_profile
      on sport_profile.member_id = ranked.member_id
     and sport_profile.sport = event.sport
    where event.id = p_event_id
      and exists (
          select 1
          from public.profiles as viewer
          where viewer.id = auth.uid()
            and viewer.active
            and viewer.role in ('planner', 'admin')
      )
    order by case
                 when ranked.response = 'attending'
                  and ranked.attending_position <= event.max_participants then 0
                 when ranked.response = 'attending' then 1
                 else 2
             end,
             ranked.attending_position nulls last,
             lower(member.display_name),
             member.id;
$$;

-- De bestaande planner-RPC blijft exact dezelfde projectie houden, maar geeft
-- voortaan uitsluitend attending-registraties binnen de capaciteit terug.
create or replace function public.staff_event_planner_input(p_event_id uuid)
returns table (
    registration_id uuid,
    user_id uuid,
    member_id uuid,
    response text,
    available_from timestamptz,
    available_until timestamptz,
    registration_updated_at timestamptz,
    display_name text,
    approval_status text,
    member_active boolean,
    sport_profile_active boolean,
    ranking smallint
)
language sql
stable
security definer
set search_path = ''
as $$
    with ranked as (
        select registration.*,
               row_number() over (
                   order by registration.attending_since, registration.id
               ) as attending_position
        from public.registrations as registration
        where registration.event_id = p_event_id
          and registration.response = 'attending'
    )
    select ranked.id,
           ranked.user_id,
           ranked.member_id,
           ranked.response,
           ranked.available_from,
           ranked.available_until,
           ranked.updated_at,
           member.display_name,
           member.approval_status,
           member.active,
           coalesce(sport_profile.active, false),
           sport_profile.ranking
    from public.tos_events as event
    join ranked
      on ranked.attending_position <= event.max_participants
    join public.club_members as member
      on member.id = ranked.member_id
    left join public.member_sport_profiles as sport_profile
      on sport_profile.member_id = ranked.member_id
     and sport_profile.sport = event.sport
    where event.id = p_event_id
      and exists (
          select 1
          from public.profiles as viewer
          where viewer.id = auth.uid()
            and viewer.active
            and viewer.role in ('planner', 'admin')
      )
    order by ranked.attending_position, ranked.id;
$$;

create function public.staff_member_directory()
returns table (
    member_id uuid,
    display_name text,
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
           member.approval_status,
           member.active,
           exists (
               select 1 from public.profiles as linked
               where linked.member_id = member.id
           ),
           coalesce(padel.active, false),
           padel.ranking,
           coalesce(tennis.active, false),
           tennis.ranking
    from public.club_members as member
    left join public.member_sport_profiles as padel
      on padel.member_id = member.id and padel.sport = 'padel'
    left join public.member_sport_profiles as tennis
      on tennis.member_id = member.id and tennis.sport = 'tennis'
    where exists (
        select 1
        from public.profiles as viewer
        where viewer.id = auth.uid()
          and viewer.active
          and viewer.role in ('planner', 'admin')
    )
    order by lower(member.display_name), member.display_name, member.id;
$$;

create function public.staff_update_member_sport_profile(
    p_member_id uuid,
    p_sport text,
    p_active boolean,
    p_ranking smallint
)
returns table (
    member_id uuid,
    sport text,
    active boolean,
    ranking smallint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not exists (
        select 1
        from public.profiles as viewer
        where viewer.id = auth.uid()
          and viewer.active
          and viewer.role in ('planner', 'admin')
    ) then
        raise exception 'Actieve planner- of adminrechten zijn vereist.'
            using errcode = '42501';
    end if;

    if p_member_id is null
       or p_sport not in ('padel', 'tennis')
       or p_active is null
       or (p_ranking is not null and (p_ranking < 1 or p_ranking > 5)) then
        raise exception 'Het sportprofiel is ongeldig.'
            using errcode = '22023';
    end if;

    if not exists (
        select 1 from public.club_members as member
        where member.id = p_member_id
    ) then
        raise exception 'Het clublid bestaat niet.'
            using errcode = '23503';
    end if;

    insert into public.member_sport_profiles as profile (
        member_id,
        sport,
        active,
        ranking
    ) values (
        p_member_id,
        p_sport,
        p_active,
        p_ranking
    )
    on conflict on constraint member_sport_profiles_pkey do update
    set active = excluded.active,
        ranking = excluded.ranking;

    return query
    select profile.member_id,
           profile.sport,
           profile.active,
           profile.ranking
    from public.member_sport_profiles as profile
    where profile.member_id = p_member_id
      and profile.sport = p_sport;
end;
$$;

revoke all privileges on function public.participant_event_capacity(uuid)
    from public, anon, authenticated;
revoke all privileges on function public.participant_event_attendance(uuid)
    from public, anon, authenticated;
revoke all privileges on function public.participant_own_registration_position(uuid)
    from public, anon, authenticated;
revoke all privileges on function public.staff_event_capacity_summaries()
    from public, anon, authenticated;
revoke all privileges on function public.staff_event_registration_overview(uuid)
    from public, anon, authenticated;
revoke all privileges on function public.staff_event_planner_input(uuid)
    from public, anon, authenticated;
revoke all privileges on function public.staff_member_directory()
    from public, anon, authenticated;
revoke all privileges on function public.staff_update_member_sport_profile(uuid, text, boolean, smallint)
    from public, anon, authenticated;

grant execute on function public.participant_event_capacity(uuid)
    to authenticated;
grant execute on function public.participant_event_attendance(uuid)
    to authenticated;
grant execute on function public.participant_own_registration_position(uuid)
    to authenticated;
grant execute on function public.staff_event_capacity_summaries()
    to authenticated;
grant execute on function public.staff_event_registration_overview(uuid)
    to authenticated;
grant execute on function public.staff_event_planner_input(uuid)
    to authenticated;
grant execute on function public.staff_member_directory()
    to authenticated;
grant execute on function public.staff_update_member_sport_profile(uuid, text, boolean, smallint)
    to authenticated;
