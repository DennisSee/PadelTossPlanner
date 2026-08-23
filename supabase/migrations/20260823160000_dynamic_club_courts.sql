-- WEB-9: database-driven club courts and stable court identities in planner drafts.

create table public.club_courts (
    id uuid primary key default gen_random_uuid(),
    sport text not null check (sport in ('padel', 'tennis')),
    name text not null,
    active boolean not null default true,
    sort_order integer not null default 0 check (sort_order between 0 and 10000),
    created_by uuid references auth.users(id) on delete set null,
    updated_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint club_courts_name_check check (
        length(btrim(name)) between 1 and 80 and name = btrim(name) and name !~ '[[:cntrl:]]'
    )
);

create unique index club_courts_sport_name_unique_idx
    on public.club_courts (sport, lower(name));
create index club_courts_order_idx
    on public.club_courts (sport, active desc, sort_order, lower(name), id);

alter table public.club_courts enable row level security;
revoke all privileges on table public.club_courts from public, anon, authenticated;
grant select, insert, update, delete, truncate, references, trigger, maintain
    on table public.club_courts to service_role;

insert into public.club_courts (id, sport, name, active, sort_order) values
    ('c9000000-0000-4000-8000-000000000001', 'padel', 'Kremer Baan', true, 10),
    ('c9000000-0000-4000-8000-000000000002', 'padel', 'ZGA/F&F Baan', true, 20),
    ('c9000000-0000-4000-8000-000000000003', 'padel', 'PlaySeat Baan', true, 30),
    ('c9000000-0000-4000-8000-000000000004', 'padel', 'Seppworks/Bax Baan', true, 40);

create function public.staff_courts(p_sport text default null)
returns table (id uuid, sport text, name text, active boolean, sort_order integer)
language sql
stable
security definer
set search_path = ''
as $$
    select court.id, court.sport, court.name, court.active, court.sort_order
      from public.club_courts as court
     where (p_sport is null or court.sport = p_sport)
       and (p_sport is null or p_sport in ('padel', 'tennis'))
       and exists (
           select 1 from public.profiles as viewer
            where viewer.id = auth.uid()
              and viewer.active
              and viewer.role in ('planner', 'admin')
       )
     order by court.sport, court.sort_order, lower(court.name), court.id;
$$;

create function public.staff_create_court(
    p_sport text,
    p_name text,
    p_active boolean,
    p_sort_order integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor_id uuid := auth.uid();
    new_id uuid;
begin
    if not exists (
        select 1 from public.profiles as viewer
         where viewer.id = actor_id and viewer.active and viewer.role in ('planner', 'admin')
    ) then
        raise exception 'Court access denied.' using errcode = '42501';
    end if;
    if p_sport not in ('padel', 'tennis') or p_active is null
       or p_sort_order is null or p_sort_order not between 0 and 10000
       or p_name is null or length(btrim(p_name)) not between 1 and 80
       or p_name ~ '[[:cntrl:]]' then
        raise exception 'Invalid court.' using errcode = '22023';
    end if;
    begin
        insert into public.club_courts (sport, name, active, sort_order, created_by, updated_by)
        values (p_sport, btrim(p_name), p_active, p_sort_order, actor_id, actor_id)
        returning id into new_id;
    exception when unique_violation then
        raise exception 'Court already exists.' using errcode = '23505';
    end;
    return new_id;
end;
$$;

create function public.staff_update_court(
    p_court_id uuid,
    p_name text,
    p_active boolean,
    p_sort_order integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor_id uuid := auth.uid();
    affected integer;
begin
    if not exists (
        select 1 from public.profiles as viewer
         where viewer.id = actor_id and viewer.active and viewer.role in ('planner', 'admin')
    ) then
        raise exception 'Court access denied.' using errcode = '42501';
    end if;
    if p_court_id is null or p_active is null
       or p_sort_order is null or p_sort_order not between 0 and 10000
       or p_name is null or length(btrim(p_name)) not between 1 and 80
       or p_name ~ '[[:cntrl:]]' then
        raise exception 'Invalid court.' using errcode = '22023';
    end if;
    begin
        update public.club_courts
           set name = btrim(p_name), active = p_active, sort_order = p_sort_order,
               updated_by = actor_id, updated_at = now()
         where id = p_court_id;
        get diagnostics affected = row_count;
    exception when unique_violation then
        raise exception 'Court already exists.' using errcode = '23505';
    end;
    if affected <> 1 then
        raise exception 'Court unavailable.' using errcode = 'P0002';
    end if;
    return true;
end;
$$;

-- Fresh-start planner drafts use JSON UUID values. Existing local/test drafts are
-- reset to an empty selection; no historical compatibility layer is retained.
update public.tos_event_planner_drafts set selected_courts = '[]'::jsonb;

create or replace function public.staff_event_planner_draft(p_event_id uuid)
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
    select draft.event_id, draft.players, draft.selected_courts,
           draft.match_minutes, draft.rest_minutes, draft.search_profile,
           draft.allow_repeat_partners, draft.level_mix,
           draft.team_difference_tolerance, draft.revision, draft.updated_by,
           draft.updated_by_name, draft.updated_at, draft.created_at
      from public.tos_event_planner_drafts as draft
      join public.tos_events as event on event.id = draft.event_id
     where draft.event_id = p_event_id
       and exists (
           select 1 from public.profiles as viewer
            where viewer.id = auth.uid() and viewer.active
              and viewer.role in ('planner', 'admin')
       );
$$;

create or replace function public.staff_save_event_planner_draft(
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
    event_sport text;
    saved_revision bigint;
    affected_rows integer;
begin
    select profile.display_name into actor_name
      from public.profiles as profile
     where profile.id = actor_id and profile.active and profile.role in ('planner', 'admin');
    if actor_name is null then
        raise exception 'Planner draft access denied.' using errcode = '42501';
    end if;
    select event.sport into event_sport from public.tos_events as event
     where event.id = p_event_id and event.status <> 'cancelled';
    if event_sport is null then
        raise exception 'Planner draft event unavailable.' using errcode = '42501';
    end if;
    if p_expected_revision is null or p_expected_revision < 0 then
        raise exception 'Invalid planner draft revision.' using errcode = '22023';
    end if;
    if p_players is null or jsonb_typeof(p_players) <> 'array'
       or jsonb_array_length(p_players) > 160
       or exists (
           select 1 from jsonb_array_elements(p_players) as item(value)
            where jsonb_typeof(item.value) <> 'object'
               or not (item.value ?& array['row_id','name','ranking','included','available_from','available_until'])
               or exists (
                   select 1 from jsonb_object_keys(item.value) as key(name)
                    where key.name not in ('row_id','name','ranking','included','available_from','available_until',
                        'member_id','user_id','registration_id','registration_updated_at','source_event_id')
               )
               or jsonb_typeof(item.value -> 'row_id') <> 'string'
               or (item.value ->> 'row_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
               or jsonb_typeof(item.value -> 'name') <> 'string'
               or length(btrim(item.value ->> 'name')) not between 1 and 120
               or (item.value ->> 'name') ~ '[[:cntrl:]]'
               or jsonb_typeof(item.value -> 'ranking') <> 'number'
               or (item.value ->> 'ranking')::numeric <> trunc((item.value ->> 'ranking')::numeric)
               or (item.value ->> 'ranking')::integer not between 1 and 5
               or jsonb_typeof(item.value -> 'included') <> 'boolean'
               or jsonb_typeof(item.value -> 'available_from') not in ('string','null')
               or (jsonb_typeof(item.value -> 'available_from') = 'string'
                   and (item.value ->> 'available_from') !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$')
               or jsonb_typeof(item.value -> 'available_until') not in ('string','null')
               or (jsonb_typeof(item.value -> 'available_until') = 'string'
                   and (item.value ->> 'available_until') !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$')
               or exists (
                   select 1 from jsonb_object_keys(item.value) as optional(name)
                    where optional.name in ('member_id','user_id','registration_id','source_event_id')
                      and (
                          jsonb_typeof(item.value -> optional.name) not in ('string','null')
                          or (
                              jsonb_typeof(item.value -> optional.name) = 'string'
                              and (item.value ->> optional.name) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                          )
                      )
               )
               or jsonb_typeof(item.value -> 'registration_updated_at') not in ('string','null')
               or (
                   jsonb_typeof(item.value -> 'registration_updated_at') = 'string'
                   and (item.value ->> 'registration_updated_at') !~
                       '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\.[0-9]{1,6})?)?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$'
               )
       )
       or (select count(*) <> count(distinct lower(item.value ->> 'row_id'))
             from jsonb_array_elements(p_players) as item(value))
       or (select count(*) <> count(distinct lower(item.value ->> 'name'))
             from jsonb_array_elements(p_players) as item(value)) then
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
    if p_selected_courts is null or jsonb_typeof(p_selected_courts) <> 'array'
       or jsonb_array_length(p_selected_courts) > 12
       or exists (
           select 1 from jsonb_array_elements_text(p_selected_courts) as selected(id)
            where selected.id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
               or not exists (
                   select 1 from public.club_courts as court
                    where court.id = selected.id::uuid and court.sport = event_sport
               )
       )
       or (select count(*) <> count(distinct selected.id)
             from jsonb_array_elements_text(p_selected_courts) as selected(id)) then
        raise exception 'Invalid planner courts.' using errcode = '22023';
    end if;
    if p_match_minutes not in (15,20,25,30) or p_rest_minutes not between 0 and 30
       or p_search_profile not in ('Snel','Normaal','Uitgebreid')
       or p_allow_repeat_partners is null or p_level_mix not between 0 and 100
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
                p_event_id, p_players, p_selected_courts, p_match_minutes, p_rest_minutes,
                p_search_profile, p_allow_repeat_partners, p_level_mix,
                p_team_difference_tolerance, 1, actor_id, btrim(actor_name)
            ) returning revision into saved_revision;
        exception when unique_violation then
            raise exception 'Planner draft changed.' using errcode = '40001';
        end;
    else
        update public.tos_event_planner_drafts as draft
           set players = p_players, selected_courts = p_selected_courts,
               match_minutes = p_match_minutes, rest_minutes = p_rest_minutes,
               search_profile = p_search_profile,
               allow_repeat_partners = p_allow_repeat_partners,
               level_mix = p_level_mix,
               team_difference_tolerance = p_team_difference_tolerance,
               revision = draft.revision + 1, updated_by = actor_id,
               updated_by_name = btrim(actor_name), updated_at = now()
         where draft.event_id = p_event_id and draft.revision = p_expected_revision
        returning draft.revision into saved_revision;
        get diagnostics affected_rows = row_count;
        if affected_rows <> 1 then
            raise exception 'Planner draft changed.' using errcode = '40001';
        end if;
    end if;
    return saved_revision;
end;
$$;

-- The immutable WEB-7 schedule function only had a legacy Padel event guard.
-- Remove exactly that catalog clause; all payload, identity and publication
-- validation remains byte-for-byte in the existing function body.
do $migration$
declare
    definition text;
    rewritten text;
begin
    select pg_get_functiondef(
        'public.staff_save_event_schedule(uuid,bigint,bigint,jsonb,jsonb,jsonb,jsonb)'::regprocedure
    ) into definition;
    rewritten := regexp_replace(definition, E'\\n\\s+and event\\.sport = ''padel''', '', 'g');
    if rewritten = definition then
        raise exception 'Expected planner sport guard was not found.';
    end if;
    execute rewritten;
end;
$migration$;

create function public._snapshot_dynamic_schedule_courts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    event_sport text;
    resolved jsonb;
begin
    if new.event_id is null or jsonb_typeof(new.courts) <> 'array' then
        return new;
    end if;
    if exists (
        select 1 from jsonb_array_elements_text(new.courts) as selected(id)
         where selected.id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ) then
        return new;
    end if;
    select event.sport into event_sport from public.tos_events as event where event.id = new.event_id;
    if event_sport is null or exists (
        select 1
          from jsonb_array_elements(new.schedule_private) as item(value)
         where jsonb_typeof(item.value) = 'object'
           and not exists (
               select 1
                 from jsonb_array_elements_text(new.courts) as selected(id)
                 join public.club_courts as court
                   on court.id = selected.id::uuid and court.sport = event_sport
                where court.name = item.value ->> 'Baan'
           )
    ) then
        raise exception 'Invalid planner courts.' using errcode = '22023';
    end if;
    select coalesce(jsonb_agg(court.name order by selected.ordinality), '[]'::jsonb)
      into resolved
      from jsonb_array_elements_text(new.courts) with ordinality as selected(id, ordinality)
      join public.club_courts as court on court.id = selected.id::uuid and court.sport = event_sport;
    if jsonb_array_length(resolved) <> jsonb_array_length(new.courts) then
        raise exception 'Invalid planner courts.' using errcode = '22023';
    end if;
    new.courts := resolved;
    return new;
end;
$$;

revoke all privileges on function public._snapshot_dynamic_schedule_courts()
    from public, anon, authenticated;
create trigger schedules_snapshot_dynamic_courts
    before insert on public.schedules
    for each row execute function public._snapshot_dynamic_schedule_courts();

revoke all privileges on function public.staff_courts(text),
    public.staff_create_court(text,text,boolean,integer),
    public.staff_update_court(uuid,text,boolean,integer)
    from public, anon, authenticated;
grant execute on function public.staff_courts(text),
    public.staff_create_court(text,text,boolean,integer),
    public.staff_update_court(uuid,text,boolean,integer)
    to authenticated;
