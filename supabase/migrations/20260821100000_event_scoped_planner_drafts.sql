-- WEB-5B2A: private, event-scoped planner drafts with optimistic locking.
-- Staff uses the authenticated JWT through narrowly scoped SECURITY DEFINER
-- functions; the underlying table remains inaccessible to authenticated users.

create table public.tos_event_planner_drafts (
    event_id uuid primary key
        references public.tos_events(id) on delete cascade,
    players jsonb not null default '[]'::jsonb,
    selected_courts jsonb not null default '[]'::jsonb,
    match_minutes integer not null default 20,
    rest_minutes integer not null default 0,
    search_profile text not null default 'Normaal',
    allow_repeat_partners boolean not null default false,
    level_mix integer not null default 50,
    team_difference_tolerance double precision not null default 0.5,
    revision bigint not null default 1,
    updated_by uuid references auth.users(id) on delete set null,
    updated_by_name text,
    updated_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    constraint tos_event_planner_drafts_players_array_check
        check (jsonb_typeof(players) = 'array'),
    constraint tos_event_planner_drafts_courts_array_check
        check (jsonb_typeof(selected_courts) = 'array'),
    constraint tos_event_planner_drafts_match_minutes_check
        check (match_minutes in (15, 20, 25, 30)),
    constraint tos_event_planner_drafts_rest_minutes_check
        check (rest_minutes between 0 and 30),
    constraint tos_event_planner_drafts_search_profile_check
        check (search_profile in ('Snel', 'Normaal', 'Uitgebreid')),
    constraint tos_event_planner_drafts_level_mix_check
        check (level_mix between 0 and 100),
    constraint tos_event_planner_drafts_tolerance_check
        check (team_difference_tolerance between 0.0 and 1.5),
    constraint tos_event_planner_drafts_revision_check
        check (revision >= 1)
);

alter table public.tos_event_planner_drafts enable row level security;

revoke all privileges on table public.tos_event_planner_drafts
    from public, anon, authenticated;
grant select, insert, update, delete, truncate, references, trigger, maintain
    on table public.tos_event_planner_drafts to service_role;

create function public.staff_event_planner_draft(p_event_id uuid)
returns table (
    event_id uuid,
    players jsonb,
    selected_courts jsonb,
    match_minutes integer,
    rest_minutes integer,
    search_profile text,
    allow_repeat_partners boolean,
    level_mix integer,
    team_difference_tolerance double precision,
    revision bigint,
    updated_by uuid,
    updated_by_name text,
    updated_at timestamptz,
    created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
    select draft.event_id,
           draft.players,
           draft.selected_courts,
           draft.match_minutes,
           draft.rest_minutes,
           draft.search_profile,
           draft.allow_repeat_partners,
           draft.level_mix,
           draft.team_difference_tolerance,
           draft.revision,
           draft.updated_by,
           draft.updated_by_name,
           draft.updated_at,
           draft.created_at
    from public.tos_event_planner_drafts as draft
    join public.tos_events as event on event.id = draft.event_id
    where draft.event_id = p_event_id
      and event.sport = 'padel'
      and exists (
          select 1
          from public.profiles as viewer
          where viewer.id = auth.uid()
            and viewer.active
            and viewer.role in ('planner', 'admin')
      );
$$;

create function public.staff_save_event_planner_draft(
    p_event_id uuid,
    p_expected_revision bigint,
    p_players jsonb,
    p_selected_courts jsonb,
    p_match_minutes integer,
    p_rest_minutes integer,
    p_search_profile text,
    p_allow_repeat_partners boolean,
    p_level_mix integer,
    p_team_difference_tolerance double precision
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor_id uuid := auth.uid();
    actor_name text;
    saved_revision bigint;
    affected_rows integer;
begin
    if actor_id is null then
        raise exception 'Planner draft access denied.' using errcode = '42501';
    end if;

    select profile.display_name
      into actor_name
      from public.profiles as profile
     where profile.id = actor_id
       and profile.active
       and profile.role in ('planner', 'admin');
    if actor_name is null then
        raise exception 'Planner draft access denied.' using errcode = '42501';
    end if;

    if not exists (
        select 1
          from public.tos_events as event
         where event.id = p_event_id
           and event.sport = 'padel'
           and event.status <> 'cancelled'
    ) then
        raise exception 'Planner draft event unavailable.' using errcode = '42501';
    end if;

    if p_expected_revision is null or p_expected_revision < 0 then
        raise exception 'Invalid planner draft revision.' using errcode = '22023';
    end if;
    if p_players is null
       or jsonb_typeof(p_players) <> 'array'
       or jsonb_array_length(p_players) > 160
       or exists (
           select 1
             from jsonb_array_elements(p_players) as item(value)
            where jsonb_typeof(item.value) <> 'object'
               or not (item.value ?& array[
                   'row_id', 'name', 'ranking', 'included',
                   'available_from', 'available_until'
               ])
               or exists (
                   select 1
                     from jsonb_object_keys(item.value) as key(name)
                    where key.name not in (
                        'row_id', 'name', 'ranking', 'included',
                        'available_from', 'available_until', 'member_id',
                        'user_id', 'registration_id',
                        'registration_updated_at', 'source_event_id'
                    )
               )
               or jsonb_typeof(item.value -> 'row_id') <> 'string'
               or (item.value ->> 'row_id') !~
                    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
               or jsonb_typeof(item.value -> 'name') <> 'string'
               or length(btrim(item.value ->> 'name')) not between 1 and 120
               or (item.value ->> 'name') ~ '[[:cntrl:]]'
               or jsonb_typeof(item.value -> 'ranking') <> 'number'
               or (item.value ->> 'ranking')::double precision not between 1.0 and 5.0
               or (item.value ->> 'ranking')::numeric <> trunc((item.value ->> 'ranking')::numeric)
               or jsonb_typeof(item.value -> 'included') <> 'boolean'
               or jsonb_typeof(item.value -> 'available_from') not in ('string', 'null')
               or (
                   jsonb_typeof(item.value -> 'available_from') = 'string'
                   and (item.value ->> 'available_from') !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
               )
               or jsonb_typeof(item.value -> 'available_until') not in ('string', 'null')
               or (
                   jsonb_typeof(item.value -> 'available_until') = 'string'
                   and (item.value ->> 'available_until') !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
               )
               or (
                   item.value ? 'member_id'
                   and (
                       jsonb_typeof(item.value -> 'member_id') not in ('string', 'null')
                       or (
                           jsonb_typeof(item.value -> 'member_id') = 'string'
                           and (item.value ->> 'member_id') !~
                          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                       )
                   )
               )
               or (
                   item.value ? 'user_id'
                   and (
                       jsonb_typeof(item.value -> 'user_id') not in ('string', 'null')
                       or (
                           jsonb_typeof(item.value -> 'user_id') = 'string'
                           and (item.value ->> 'user_id') !~
                          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                       )
                   )
               )
               or (
                   item.value ? 'registration_id'
                   and (
                       jsonb_typeof(item.value -> 'registration_id') not in ('string', 'null')
                       or (
                           jsonb_typeof(item.value -> 'registration_id') = 'string'
                           and (item.value ->> 'registration_id') !~
                          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                       )
                   )
               )
               or (
                   item.value ? 'source_event_id'
                   and (
                       jsonb_typeof(item.value -> 'source_event_id') not in ('string', 'null')
                       or (
                           jsonb_typeof(item.value -> 'source_event_id') = 'string'
                           and (item.value ->> 'source_event_id') !~
                          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                       )
                   )
               )
               or (
                   item.value ? 'registration_updated_at'
                   and (
                       jsonb_typeof(item.value -> 'registration_updated_at') not in ('string', 'null')
                       or (
                           jsonb_typeof(item.value -> 'registration_updated_at') = 'string'
                           and (item.value ->> 'registration_updated_at') !~
                               '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\.[0-9]{1,6})?)?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$'
                       )
                   )
               )
       )
       or (
           select count(*) <> count(distinct lower(item.value ->> 'row_id'))
             from jsonb_array_elements(p_players) as item(value)
       )
       or (
           select count(*) <> count(distinct lower(item.value ->> 'name'))
             from jsonb_array_elements(p_players) as item(value)
       ) then
        raise exception 'Invalid planner players.' using errcode = '22023';
    end if;

    begin
        perform (item.value ->> 'registration_updated_at')::timestamptz
          from jsonb_array_elements(p_players) as item(value)
         where jsonb_typeof(item.value -> 'registration_updated_at') = 'string';
    exception
        when invalid_datetime_format or datetime_field_overflow then
            raise exception 'Invalid planner players.' using errcode = '22023';
    end;

    if p_selected_courts is null
       or jsonb_typeof(p_selected_courts) <> 'array'
       or jsonb_array_length(p_selected_courts) not between 1 and 4
       or exists (
           select 1
             from jsonb_array_elements(p_selected_courts) as court(value)
            where jsonb_typeof(court.value) <> 'string'
               or court.value #>> '{}' not in (
                   'Kremer Baan', 'ZGA/F&F Baan',
                   'PlaySeat Baan', 'Seppworks/Bax Baan'
               )
       )
       or (
           select count(*) <> count(distinct court.value #>> '{}')
             from jsonb_array_elements(p_selected_courts) as court(value)
       ) then
        raise exception 'Invalid planner courts.' using errcode = '22023';
    end if;

    if p_match_minutes is null
       or p_rest_minutes is null
       or p_search_profile is null
       or p_allow_repeat_partners is null
       or p_level_mix is null
       or p_team_difference_tolerance is null
       or p_match_minutes not in (15, 20, 25, 30)
       or p_rest_minutes not between 0 and 30
       or p_search_profile not in ('Snel', 'Normaal', 'Uitgebreid')
       or p_level_mix not between 0 and 100
       or p_team_difference_tolerance not between 0.0 and 1.5 then
        raise exception 'Invalid planner settings.' using errcode = '22023';
    end if;

    if p_expected_revision = 0 then
        begin
            insert into public.tos_event_planner_drafts (
                event_id, players, selected_courts, match_minutes, rest_minutes,
                search_profile, allow_repeat_partners, level_mix,
                team_difference_tolerance, revision, updated_by, updated_by_name
            ) values (
                p_event_id, p_players, p_selected_courts, p_match_minutes,
                p_rest_minutes, p_search_profile, p_allow_repeat_partners,
                p_level_mix, p_team_difference_tolerance, 1, actor_id,
                btrim(actor_name)
            ) returning revision into saved_revision;
        exception when unique_violation then
            raise exception 'Planner draft changed.' using errcode = '40001';
        end;
    else
        update public.tos_event_planner_drafts as draft
           set players = p_players,
               selected_courts = p_selected_courts,
               match_minutes = p_match_minutes,
               rest_minutes = p_rest_minutes,
               search_profile = p_search_profile,
               allow_repeat_partners = p_allow_repeat_partners,
               level_mix = p_level_mix,
               team_difference_tolerance = p_team_difference_tolerance,
               revision = draft.revision + 1,
               updated_by = actor_id,
               updated_by_name = btrim(actor_name),
               updated_at = now()
         where draft.event_id = p_event_id
           and draft.revision = p_expected_revision
        returning draft.revision into saved_revision;
        get diagnostics affected_rows = row_count;
        if affected_rows <> 1 then
            raise exception 'Planner draft changed.' using errcode = '40001';
        end if;
    end if;

    return saved_revision;
end;
$$;

revoke all privileges on function public.staff_event_planner_draft(uuid)
    from public, anon, authenticated;
grant execute on function public.staff_event_planner_draft(uuid)
    to authenticated;

revoke all privileges on function public.staff_save_event_planner_draft(
    uuid, bigint, jsonb, jsonb, integer, integer, text, boolean, integer,
    double precision
) from public, anon, authenticated;
grant execute on function public.staff_save_event_planner_draft(
    uuid, bigint, jsonb, jsonb, integer, integer, text, boolean, integer,
    double precision
) to authenticated;
