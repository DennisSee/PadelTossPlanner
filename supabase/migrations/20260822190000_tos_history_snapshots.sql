-- WEB-7: participant-scoped TOS history derived from the official published
-- schedule. Stable identity is carried in a private, server-built row map and
-- revalidated against the persisted planner draft and registrations.

alter table public.schedules
    add column history_identity_private jsonb;

revoke select (history_identity_private), insert (history_identity_private),
    update (history_identity_private)
    on table public.schedules from public, anon, authenticated;

create function public._tos_history_join_names(p_players jsonb, p_separator text)
returns text
language sql
immutable
set search_path = ''
as $$
    select case when count(*) = 0 then 'Niemand'
                else string_agg(item.value ->> 'name', p_separator order by item.ordinality)
           end
      from jsonb_array_elements(p_players) with ordinality as item(value, ordinality);
$$;

revoke all privileges on function public._tos_history_join_names(jsonb, text)
    from public, anon, authenticated;

drop function public.staff_save_event_schedule(uuid, bigint, bigint, jsonb, jsonb, jsonb);

create function public.staff_save_event_schedule(
    p_event_id uuid,
    p_planner_draft_revision bigint,
    p_generation_seed bigint,
    p_schedule_private jsonb,
    p_history_identity_private jsonb,
    p_statistics_private jsonb,
    p_diagnostics jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor_id uuid := auth.uid();
    actor_name text;
    event_row public.tos_events%rowtype;
    draft_row public.tos_event_planner_drafts%rowtype;
    new_schedule_id uuid;
    public_rows jsonb;
    public_participants jsonb;
begin
    select profile.display_name into actor_name
      from public.profiles as profile
     where profile.id = actor_id
       and profile.active
       and profile.role in ('planner', 'admin');
    if actor_name is null then
        raise exception 'Schedule access denied.' using errcode = '42501';
    end if;

    select event.* into event_row
      from public.tos_events as event
     where event.id = p_event_id
       and event.sport = 'padel'
       and event.status <> 'cancelled';
    if not found then
        raise exception 'Schedule event unavailable.' using errcode = '42501';
    end if;

    select draft.* into draft_row
      from public.tos_event_planner_drafts as draft
     where draft.event_id = p_event_id
       and draft.revision = p_planner_draft_revision;
    if not found then
        raise exception 'Planner draft changed.' using errcode = '40001';
    end if;

    if p_generation_seed is null or p_generation_seed < 0
       or p_schedule_private is null
       or p_history_identity_private is null
       or p_statistics_private is null
       or p_diagnostics is null
       or jsonb_typeof(p_schedule_private) <> 'array'
       or jsonb_array_length(p_schedule_private) = 0
       or jsonb_array_length(p_schedule_private) > 1000
       or jsonb_typeof(p_history_identity_private) <> 'array'
       or jsonb_array_length(p_history_identity_private) <> jsonb_array_length(p_schedule_private)
       or jsonb_typeof(p_statistics_private) <> 'array'
       or jsonb_typeof(p_diagnostics) <> 'object'
       or exists (
           select 1 from jsonb_array_elements(p_schedule_private) as item(value)
            where jsonb_typeof(item.value) <> 'object'
               or not (item.value ?& array[
                   'Ronde','Tijd','Baan','Team 1','Niveau T1','Team 2','Niveau T2',
                   'Teamverschil','Rust','Nog niet aanwezig','Niet meer beschikbaar'
               ])
               or (select count(*) <> 11 from jsonb_object_keys(item.value))
               or jsonb_typeof(item.value -> 'Ronde') <> 'number'
               or (item.value ->> 'Ronde')::numeric <> trunc((item.value ->> 'Ronde')::numeric)
               or (item.value ->> 'Ronde')::integer < 1
               or jsonb_typeof(item.value -> 'Tijd') <> 'string'
               or (item.value ->> 'Tijd') !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9] - (?:[01][0-9]|2[0-3]):[0-5][0-9]$'
               or jsonb_typeof(item.value -> 'Baan') <> 'string'
               or length(btrim(item.value ->> 'Baan')) not between 1 and 120
               or jsonb_typeof(item.value -> 'Team 1') <> 'string'
               or jsonb_typeof(item.value -> 'Team 2') <> 'string'
               or jsonb_typeof(item.value -> 'Niveau T1') <> 'number'
               or jsonb_typeof(item.value -> 'Niveau T2') <> 'number'
               or jsonb_typeof(item.value -> 'Teamverschil') <> 'number'
               or jsonb_typeof(item.value -> 'Rust') <> 'string'
               or jsonb_typeof(item.value -> 'Nog niet aanwezig') <> 'string'
               or jsonb_typeof(item.value -> 'Niet meer beschikbaar') <> 'string'
       )
       or exists (
           select 1
             from jsonb_array_elements(p_history_identity_private) with ordinality as identity(item, position)
             join jsonb_array_elements(p_schedule_private) with ordinality as schedule(item, position)
               using (position)
            where jsonb_typeof(identity.item) <> 'object'
               or not (identity.item ?& array[
                   'Ronde','Tijd','Baan','Team 1','Team 2','Rust',
                   'Nog niet aanwezig','Niet meer beschikbaar'
               ])
               or (select count(*) <> 8 from jsonb_object_keys(identity.item))
               or identity.item -> 'Ronde' <> schedule.item -> 'Ronde'
               or identity.item -> 'Tijd' <> schedule.item -> 'Tijd'
               or identity.item -> 'Baan' <> schedule.item -> 'Baan'
               or jsonb_typeof(identity.item -> 'Team 1') <> 'array'
               or jsonb_typeof(identity.item -> 'Team 2') <> 'array'
               or jsonb_typeof(identity.item -> 'Rust') <> 'array'
               or jsonb_typeof(identity.item -> 'Nog niet aanwezig') <> 'array'
               or jsonb_typeof(identity.item -> 'Niet meer beschikbaar') <> 'array'
               or public._tos_history_join_names(identity.item -> 'Team 1', ' & ') <> schedule.item ->> 'Team 1'
               or public._tos_history_join_names(identity.item -> 'Team 2', ' & ') <> schedule.item ->> 'Team 2'
               or public._tos_history_join_names(identity.item -> 'Rust', ', ') <> schedule.item ->> 'Rust'
               or public._tos_history_join_names(identity.item -> 'Nog niet aanwezig', ', ') <> schedule.item ->> 'Nog niet aanwezig'
               or public._tos_history_join_names(identity.item -> 'Niet meer beschikbaar', ', ') <> schedule.item ->> 'Niet meer beschikbaar'
               or exists (
                   select 1
                     from jsonb_array_elements(
                         (identity.item -> 'Team 1') || (identity.item -> 'Team 2') ||
                         (identity.item -> 'Rust') || (identity.item -> 'Nog niet aanwezig') ||
                         (identity.item -> 'Niet meer beschikbaar')
                     ) as reference(item)
                    where jsonb_typeof(reference.item) <> 'object'
                       or not (reference.item ?& array['row_id','name'])
                       or (select count(*) <> 2 from jsonb_object_keys(reference.item))
                       or jsonb_typeof(reference.item -> 'row_id') <> 'string'
                       or (reference.item ->> 'row_id') !~
                          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                       or jsonb_typeof(reference.item -> 'name') <> 'string'
                       or not exists (
                           select 1 from jsonb_array_elements(draft_row.players) as player(item)
                            where (player.item ->> 'included')::boolean
                              and player.item ->> 'row_id' = reference.item ->> 'row_id'
                              and player.item ->> 'name' = reference.item ->> 'name'
                       )
               )
               or (
                   select count(*) <> count(distinct reference.item ->> 'row_id')
                     from jsonb_array_elements(
                         (identity.item -> 'Team 1') || (identity.item -> 'Team 2') ||
                         (identity.item -> 'Rust') || (identity.item -> 'Nog niet aanwezig') ||
                         (identity.item -> 'Niet meer beschikbaar')
                     ) as reference(item)
               )
       ) then
        raise exception 'Invalid schedule payload.' using errcode = '22023';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
               'Ronde', item.value -> 'Ronde',
               'Tijd', item.value -> 'Tijd',
               'Baan', item.value -> 'Baan',
               'Team 1', item.value -> 'Team 1',
               'Team 2', item.value -> 'Team 2',
               'Rust', item.value -> 'Rust',
               'Nog niet aanwezig', item.value -> 'Nog niet aanwezig',
               'Niet meer beschikbaar', item.value -> 'Niet meer beschikbaar'
           ) order by item.ordinality), '[]'::jsonb)
      into public_rows
      from jsonb_array_elements(p_schedule_private) with ordinality as item(value, ordinality);

    select coalesce(jsonb_agg(player.value ->> 'name' order by lower(player.value ->> 'name')), '[]'::jsonb)
      into public_participants
      from jsonb_array_elements(draft_row.players) as player(value)
     where (player.value ->> 'included')::boolean;

    insert into public.schedules (
        title, event_date, created_by, created_by_name, start_time, end_time,
        match_minutes, courts, players_private, participants_public,
        schedule_private, history_identity_private, schedule_public,
        statistics_private, diagnostics, is_published, event_id,
        generation_seed, planner_draft_revision
    ) values (
        event_row.title,
        (event_row.starts_at at time zone 'Europe/Amsterdam')::date,
        actor_id,
        btrim(actor_name),
        to_char(event_row.starts_at at time zone 'Europe/Amsterdam', 'HH24:MI'),
        to_char(event_row.ends_at at time zone 'Europe/Amsterdam', 'HH24:MI'),
        draft_row.match_minutes,
        draft_row.selected_courts,
        draft_row.players,
        public_participants,
        p_schedule_private,
        p_history_identity_private,
        public_rows,
        p_statistics_private,
        p_diagnostics,
        false,
        p_event_id,
        p_generation_seed,
        p_planner_draft_revision
    ) returning id into new_schedule_id;

    return new_schedule_id;
end;
$$;

revoke all privileges on function public.staff_save_event_schedule(
    uuid, bigint, bigint, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.staff_save_event_schedule(
    uuid, bigint, bigint, jsonb, jsonb, jsonb, jsonb
) to authenticated;

create table public.tos_history_events (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null unique references public.tos_events(id) on delete cascade,
    source_schedule_id uuid not null unique references public.schedules(id) on delete cascade,
    title_snapshot text not null check (length(btrim(title_snapshot)) between 1 and 160),
    sport text not null check (sport in ('padel','tennis')),
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    created_at timestamptz not null default now(),
    constraint tos_history_events_time_check check (ends_at > starts_at)
);

create table public.tos_history_event_players (
    id uuid primary key default gen_random_uuid(),
    history_event_id uuid not null references public.tos_history_events(id) on delete cascade,
    source_row_id uuid not null,
    member_id uuid references public.club_members(id) on delete set null,
    display_name_snapshot text not null check (length(btrim(display_name_snapshot)) between 1 and 120),
    player_order integer not null check (player_order >= 1),
    unique (history_event_id, id),
    unique (history_event_id, source_row_id),
    unique (history_event_id, player_order)
);

create unique index tos_history_event_players_member_idx
    on public.tos_history_event_players (history_event_id, member_id)
    where member_id is not null;

create table public.tos_history_rounds (
    id uuid primary key default gen_random_uuid(),
    history_event_id uuid not null references public.tos_history_events(id) on delete cascade,
    round_number integer not null check (round_number >= 1),
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    unique (history_event_id, id),
    unique (history_event_id, round_number),
    constraint tos_history_rounds_time_check check (ends_at > starts_at)
);

create table public.tos_history_matches (
    id uuid primary key default gen_random_uuid(),
    history_event_id uuid not null,
    round_id uuid not null,
    match_index integer not null check (match_index >= 1),
    court_name text not null check (length(btrim(court_name)) between 1 and 120),
    foreign key (history_event_id, round_id)
        references public.tos_history_rounds(history_event_id, id) on delete cascade,
    unique (history_event_id, round_id, id),
    unique (round_id, match_index)
);

create table public.tos_history_round_participants (
    history_event_id uuid not null,
    round_id uuid not null,
    event_player_id uuid not null,
    state text not null check (state in ('playing','rest','not_arrived','unavailable')),
    match_id uuid,
    team_no smallint,
    slot_no smallint,
    primary key (round_id, event_player_id),
    foreign key (history_event_id, round_id)
        references public.tos_history_rounds(history_event_id, id) on delete cascade,
    foreign key (history_event_id, event_player_id)
        references public.tos_history_event_players(history_event_id, id) on delete cascade,
    foreign key (history_event_id, round_id, match_id)
        references public.tos_history_matches(history_event_id, round_id, id) on delete cascade,
    constraint tos_history_round_participants_shape_check check (
        (state = 'playing' and match_id is not null and team_no in (1,2) and slot_no >= 1)
        or
        (state <> 'playing' and match_id is null and team_no is null and slot_no is null)
    )
);

create index tos_history_event_players_member_lookup_idx
    on public.tos_history_event_players (member_id, history_event_id)
    where member_id is not null;
create index tos_history_round_participants_match_idx
    on public.tos_history_round_participants (match_id, event_player_id)
    where match_id is not null;

alter table public.tos_history_events enable row level security;
alter table public.tos_history_event_players enable row level security;
alter table public.tos_history_rounds enable row level security;
alter table public.tos_history_matches enable row level security;
alter table public.tos_history_round_participants enable row level security;

revoke all privileges on table public.tos_history_events,
    public.tos_history_event_players, public.tos_history_rounds,
    public.tos_history_matches, public.tos_history_round_participants
    from public, anon, authenticated;
grant all privileges on table public.tos_history_events,
    public.tos_history_event_players, public.tos_history_rounds,
    public.tos_history_matches, public.tos_history_round_participants
    to service_role;

create function public._replace_tos_history_snapshot(p_schedule_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    schedule_row public.schedules%rowtype;
    event_row public.tos_events%rowtype;
    history_id uuid;
    round_id_value uuid;
    match_id_value uuid;
    event_player_id_value uuid;
    identity_row jsonb;
    reference_row jsonb;
    schedule_position bigint;
    player_position bigint;
    match_position integer;
    round_number_value integer;
    round_time_value text;
    start_clock time;
    end_clock time;
    local_event_date date;
    local_event_start timestamp;
    round_start_local timestamp;
    round_end_local timestamp;
    state_value text;
    field_name text;
begin
    select schedule.* into strict schedule_row
      from public.schedules as schedule
     where schedule.id = p_schedule_id
       and schedule.event_id is not null
       and schedule.is_published
       and schedule.history_identity_private is not null;
    select event.* into strict event_row
      from public.tos_events as event
     where event.id = schedule_row.event_id;

    delete from public.tos_history_events where event_id = event_row.id;
    insert into public.tos_history_events (
        event_id, source_schedule_id, title_snapshot, sport, starts_at, ends_at
    ) values (
        event_row.id, schedule_row.id, event_row.title, event_row.sport,
        event_row.starts_at, event_row.ends_at
    ) returning id into history_id;

    insert into public.tos_history_event_players (
        history_event_id, source_row_id, member_id, display_name_snapshot, player_order
    )
    select history_id,
           (player.item ->> 'row_id')::uuid,
           case when player.item ?& array['member_id','user_id','registration_id','source_event_id']
                     and exists (
                         select 1 from public.registrations as registration
                          where registration.id = (player.item ->> 'registration_id')::uuid
                            and registration.event_id = event_row.id
                            and registration.event_id = (player.item ->> 'source_event_id')::uuid
                            and registration.user_id = (player.item ->> 'user_id')::uuid
                            and registration.member_id = (player.item ->> 'member_id')::uuid
                            and registration.response = 'attending'
                     )
                then (player.item ->> 'member_id')::uuid
                else null
           end,
           btrim(player.item ->> 'name'),
           player.position::integer
      from jsonb_array_elements(schedule_row.players_private) with ordinality as player(item, position)
     where (player.item ->> 'included')::boolean;

    local_event_date := (event_row.starts_at at time zone 'Europe/Amsterdam')::date;
    local_event_start := event_row.starts_at at time zone 'Europe/Amsterdam';

    for identity_row, schedule_position in
        select item, position
          from jsonb_array_elements(schedule_row.history_identity_private)
               with ordinality as identity(item, position)
         order by position
    loop
        round_number_value := (identity_row ->> 'Ronde')::integer;
        round_time_value := identity_row ->> 'Tijd';
        start_clock := split_part(round_time_value, ' - ', 1)::time;
        end_clock := split_part(round_time_value, ' - ', 2)::time;
        round_start_local := local_event_date + start_clock;
        if round_start_local < local_event_start then
            round_start_local := round_start_local + interval '1 day';
        end if;
        round_end_local := date_trunc('day', round_start_local) + end_clock;
        if round_end_local <= round_start_local then
            round_end_local := round_end_local + interval '1 day';
        end if;

        insert into public.tos_history_rounds (
            history_event_id, round_number, starts_at, ends_at
        ) values (
            history_id, round_number_value,
            round_start_local at time zone 'Europe/Amsterdam',
            round_end_local at time zone 'Europe/Amsterdam'
        )
        on conflict (history_event_id, round_number) do update
           set starts_at = excluded.starts_at,
               ends_at = excluded.ends_at
         where public.tos_history_rounds.starts_at = excluded.starts_at
           and public.tos_history_rounds.ends_at = excluded.ends_at
        returning id into round_id_value;
        if round_id_value is null then
            raise exception 'Inconsistent schedule round.' using errcode = '22023';
        end if;

        select coalesce(max(match_index), 0) + 1 into match_position
          from public.tos_history_matches where round_id = round_id_value;
        insert into public.tos_history_matches (
            history_event_id, round_id, match_index, court_name
        ) values (
            history_id, round_id_value, match_position, btrim(identity_row ->> 'Baan')
        ) returning id into match_id_value;

        for field_name in select unnest(array['Team 1','Team 2'])
        loop
            for reference_row, player_position in
                select item, position
                  from jsonb_array_elements(identity_row -> field_name)
                       with ordinality as reference(item, position)
            loop
                select player.id into strict event_player_id_value
                  from public.tos_history_event_players as player
                 where player.history_event_id = history_id
                   and player.source_row_id = (reference_row ->> 'row_id')::uuid
                   and player.display_name_snapshot = reference_row ->> 'name';
                insert into public.tos_history_round_participants (
                    history_event_id, round_id, event_player_id, state,
                    match_id, team_no, slot_no
                ) values (
                    history_id, round_id_value, event_player_id_value, 'playing',
                    match_id_value, case when field_name = 'Team 1' then 1 else 2 end,
                    player_position::smallint
                );
            end loop;
        end loop;

        for field_name, state_value in
            select * from (values
                ('Rust','rest'),
                ('Nog niet aanwezig','not_arrived'),
                ('Niet meer beschikbaar','unavailable')
            ) as states(field_name, state_value)
        loop
            for reference_row in select item from jsonb_array_elements(identity_row -> field_name) as reference(item)
            loop
                select player.id into strict event_player_id_value
                  from public.tos_history_event_players as player
                 where player.history_event_id = history_id
                   and player.source_row_id = (reference_row ->> 'row_id')::uuid
                   and player.display_name_snapshot = reference_row ->> 'name';
                if exists (
                    select 1 from public.tos_history_round_participants as participant
                     where participant.round_id = round_id_value
                       and participant.event_player_id = event_player_id_value
                       and participant.state <> state_value
                ) then
                    raise exception 'Inconsistent player round state.' using errcode = '22023';
                end if;
                insert into public.tos_history_round_participants (
                    history_event_id, round_id, event_player_id, state
                ) values (
                    history_id, round_id_value, event_player_id_value, state_value
                ) on conflict (round_id, event_player_id) do nothing;
            end loop;
        end loop;
    end loop;
end;
$$;

revoke all privileges on function public._replace_tos_history_snapshot(uuid)
    from public, anon, authenticated;

create or replace function public.staff_set_schedule_published(p_schedule_id uuid, p_published boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor_id uuid := auth.uid();
    actor_role text;
    target_event_id uuid;
    target_owner uuid;
    affected_rows integer;
begin
    select profile.role into actor_role
      from public.profiles as profile
     where profile.id = actor_id
       and profile.active
       and profile.role in ('planner', 'admin');
    if actor_role is null then
        raise exception 'Schedule publication denied.' using errcode = '42501';
    end if;
    select schedule.event_id, schedule.created_by into target_event_id, target_owner
      from public.schedules as schedule
     where schedule.id = p_schedule_id and schedule.event_id is not null;
    if target_event_id is null or (target_owner <> actor_id and actor_role <> 'admin') then
        raise exception 'Schedule publication denied.' using errcode = '42501';
    end if;
    if p_published is null then
        raise exception 'Invalid publication state.' using errcode = '22023';
    end if;
    if p_published then
        update public.schedules set is_published = false
         where event_id = target_event_id and id <> p_schedule_id and is_published;
    end if;
    update public.schedules set is_published = p_published
     where id = p_schedule_id and event_id = target_event_id;
    get diagnostics affected_rows = row_count;
    if affected_rows <> 1 then
        raise exception 'Schedule changed.' using errcode = '40001';
    end if;
    if p_published then
        perform public._replace_tos_history_snapshot(p_schedule_id);
    elsif not exists (
        select 1 from public.schedules
         where event_id = target_event_id and is_published
    ) then
        delete from public.tos_history_events where event_id = target_event_id;
    end if;
    return true;
end;
$$;

revoke all privileges on function public.staff_set_schedule_published(uuid, boolean)
    from public, anon, authenticated;
grant execute on function public.staff_set_schedule_published(uuid, boolean)
    to authenticated;

create function public.my_tos_history()
returns table (
    event_id uuid,
    title text,
    sport text,
    starts_at timestamptz,
    ends_at timestamptz,
    match_count bigint,
    rest_count bigint,
    rounds jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
    with viewer as (
        select profile.member_id
          from public.profiles as profile
          join public.club_members as member on member.id = profile.member_id
         where profile.id = auth.uid() and profile.active
           and member.active and member.approval_status = 'approved'
    ), own_events as (
        select history.*, own_player.id as own_player_id
          from viewer
          join public.tos_history_event_players as own_player
            on own_player.member_id = viewer.member_id
          join public.tos_history_events as history on history.id = own_player.history_event_id
          join public.tos_events as event on event.id = history.event_id
          join public.schedules as schedule
            on schedule.id = history.source_schedule_id and schedule.is_published
         where history.ends_at <= now() and event.status <> 'cancelled'
    )
    select own.event_id,
           own.title_snapshot,
           own.sport,
           own.starts_at,
           own.ends_at,
           count(*) filter (where participation.state = 'playing'),
           count(*) filter (where participation.state = 'rest'),
           coalesce(jsonb_agg(jsonb_build_object(
               'round_number', round.round_number,
               'starts_at', round.starts_at,
               'ends_at', round.ends_at,
               'state', participation.state,
               'court_name', match.court_name,
               'partners', case when participation.state = 'playing' then coalesce((
                   select jsonb_agg(jsonb_build_object(
                       'member_id', partner.member_id,
                       'display_name', partner.display_name_snapshot
                   ) order by teammate.slot_no)
                     from public.tos_history_round_participants as teammate
                     join public.tos_history_event_players as partner on partner.id = teammate.event_player_id
                    where teammate.match_id = participation.match_id
                      and teammate.team_no = participation.team_no
                      and teammate.event_player_id <> own.own_player_id
               ), '[]'::jsonb) else '[]'::jsonb end,
               'opponents', case when participation.state = 'playing' then coalesce((
                   select jsonb_agg(jsonb_build_object(
                       'member_id', opponent.member_id,
                       'display_name', opponent.display_name_snapshot
                   ) order by opponent_slot.slot_no)
                     from public.tos_history_round_participants as opponent_slot
                     join public.tos_history_event_players as opponent on opponent.id = opponent_slot.event_player_id
                    where opponent_slot.match_id = participation.match_id
                      and opponent_slot.team_no <> participation.team_no
               ), '[]'::jsonb) else '[]'::jsonb end
           ) order by round.round_number), '[]'::jsonb)
      from own_events as own
      join public.tos_history_round_participants as participation
        on participation.history_event_id = own.id and participation.event_player_id = own.own_player_id
      join public.tos_history_rounds as round on round.id = participation.round_id
      left join public.tos_history_matches as match on match.id = participation.match_id
     group by own.id, own.event_id, own.title_snapshot, own.sport,
              own.starts_at, own.ends_at
     order by own.starts_at desc, own.event_id;
$$;

create function public.my_tos_clubmates()
returns table (
    member_id uuid,
    display_name text,
    shared_matches bigint,
    shared_events bigint,
    last_shared_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
    with viewer as (
        select profile.member_id
          from public.profiles as profile
          join public.club_members as member on member.id = profile.member_id
         where profile.id = auth.uid() and profile.active
           and member.active and member.approval_status = 'approved'
    ), shared as (
        select other.member_id,
               caller.history_event_id,
               caller.match_id
          from viewer
          join public.tos_history_event_players as me on me.member_id = viewer.member_id
          join public.tos_history_round_participants as caller
            on caller.event_player_id = me.id and caller.state = 'playing'
          join public.tos_history_round_participants as peer
            on peer.match_id = caller.match_id and peer.event_player_id <> me.id
          join public.tos_history_event_players as other on other.id = peer.event_player_id
          join public.tos_history_events as history on history.id = caller.history_event_id
          join public.tos_events as event on event.id = history.event_id
          join public.schedules as schedule
            on schedule.id = history.source_schedule_id and schedule.is_published
         where other.member_id is not null and history.ends_at <= now()
           and event.status <> 'cancelled'
    )
    select member.id,
           member.display_name,
           count(distinct shared.match_id),
           count(distinct shared.history_event_id),
           max(history.ends_at)
      from shared
      join public.club_members as member
        on member.id = shared.member_id
       and member.active and member.approval_status = 'approved'
      join public.profiles as linked_profile
        on linked_profile.member_id = member.id and linked_profile.active
      join public.tos_history_events as history on history.id = shared.history_event_id
     group by member.id, member.display_name
     order by count(distinct shared.match_id) desc,
              max(history.ends_at) desc,
              lower(member.display_name), member.id;
$$;

create function public.my_shared_tos_history(p_other_member_id uuid)
returns table (
    event_id uuid,
    title text,
    sport text,
    starts_at timestamptz,
    shared_matches bigint
)
language sql
stable
security definer
set search_path = ''
as $$
    with viewer as (
        select profile.member_id
          from public.profiles as profile
          join public.club_members as member on member.id = profile.member_id
         where profile.id = auth.uid() and profile.active
           and member.active and member.approval_status = 'approved'
    ), shared as (
        select history.id as history_event_id,
               history.event_id,
               history.title_snapshot,
               history.sport,
               history.starts_at,
               caller.match_id
          from viewer
          join public.tos_history_event_players as me on me.member_id = viewer.member_id
          join public.tos_history_round_participants as caller
            on caller.event_player_id = me.id and caller.state = 'playing'
          join public.tos_history_round_participants as peer
            on peer.match_id = caller.match_id and peer.event_player_id <> me.id
          join public.tos_history_event_players as other
            on other.id = peer.event_player_id and other.member_id = p_other_member_id
          join public.tos_history_events as history on history.id = caller.history_event_id
          join public.tos_events as event on event.id = history.event_id
          join public.schedules as schedule
            on schedule.id = history.source_schedule_id and schedule.is_published
         where p_other_member_id is not null
           and history.ends_at <= now() and event.status <> 'cancelled'
    )
    select event_id, title_snapshot, sport, starts_at, count(distinct match_id)
      from shared
     group by history_event_id, event_id, title_snapshot, sport, starts_at
     order by starts_at desc, event_id;
$$;

revoke all privileges on function public.my_tos_history(),
    public.my_tos_clubmates(), public.my_shared_tos_history(uuid)
    from public, anon, authenticated;
grant execute on function public.my_tos_history(),
    public.my_tos_clubmates(), public.my_shared_tos_history(uuid)
    to authenticated;
