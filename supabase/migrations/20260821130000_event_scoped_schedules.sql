-- WEB-5C2: event-scoped private schedules and owner/admin publication.
-- Existing legacy schedules remain valid with a NULL event_id.

alter table public.schedules
    add column event_id uuid references public.tos_events(id) on delete restrict,
    add column generation_seed bigint,
    add column planner_draft_revision bigint,
    add constraint schedules_generation_seed_check
        check (generation_seed is null or generation_seed >= 0),
    add constraint schedules_planner_draft_revision_check
        check (planner_draft_revision is null or planner_draft_revision >= 1);

create index schedules_event_created_at_idx
    on public.schedules (event_id, created_at desc)
    where event_id is not null;

create unique index schedules_one_published_per_event_idx
    on public.schedules (event_id)
    where event_id is not null and is_published;

create function public.staff_event_schedule_summaries(p_event_id uuid)
returns table (
    id uuid,
    event_id uuid,
    created_by uuid,
    created_by_name text,
    is_published boolean,
    generation_seed bigint,
    planner_draft_revision bigint,
    created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
    select schedule.id,
           schedule.event_id,
           schedule.created_by,
           schedule.created_by_name,
           schedule.is_published,
           schedule.generation_seed,
           schedule.planner_draft_revision,
           schedule.created_at
      from public.schedules as schedule
     where schedule.event_id = p_event_id
       and exists (
           select 1 from public.profiles as viewer
            where viewer.id = auth.uid()
              and viewer.active
              and viewer.role in ('planner', 'admin')
       )
     order by schedule.created_at desc, schedule.id desc;
$$;

create function public.staff_event_schedule(p_event_id uuid, p_schedule_id uuid)
returns table (
    id uuid,
    event_id uuid,
    created_by uuid,
    created_by_name text,
    title text,
    event_date date,
    start_time text,
    end_time text,
    match_minutes integer,
    courts jsonb,
    players_private jsonb,
    schedule_private jsonb,
    statistics_private jsonb,
    diagnostics jsonb,
    is_published boolean,
    generation_seed bigint,
    planner_draft_revision bigint,
    created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
    select schedule.id,
           schedule.event_id,
           schedule.created_by,
           schedule.created_by_name,
           schedule.title,
           schedule.event_date,
           schedule.start_time,
           schedule.end_time,
           schedule.match_minutes,
           schedule.courts,
           schedule.players_private,
           schedule.schedule_private,
           schedule.statistics_private,
           schedule.diagnostics,
           schedule.is_published,
           schedule.generation_seed,
           schedule.planner_draft_revision,
           schedule.created_at
      from public.schedules as schedule
     where schedule.event_id = p_event_id
       and schedule.id = p_schedule_id
       and exists (
           select 1 from public.profiles as viewer
            where viewer.id = auth.uid()
              and viewer.active
              and viewer.role in ('planner', 'admin')
       );
$$;

create function public.staff_save_event_schedule(
    p_event_id uuid,
    p_planner_draft_revision bigint,
    p_generation_seed bigint,
    p_schedule_private jsonb,
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
       or p_statistics_private is null
       or p_diagnostics is null
       or jsonb_typeof(p_schedule_private) <> 'array'
       or jsonb_array_length(p_schedule_private) = 0
       or jsonb_array_length(p_schedule_private) > 1000
       or jsonb_typeof(p_statistics_private) <> 'array'
       or jsonb_typeof(p_diagnostics) <> 'object'
       or exists (
           select 1 from jsonb_array_elements(p_schedule_private) as item(value)
            where jsonb_typeof(item.value) <> 'object'
               or not (item.value ?& array[
                   'Ronde','Tijd','Baan','Team 1','Niveau T1','Team 2','Niveau T2',
                   'Teamverschil','Rust','Nog niet aanwezig','Niet meer beschikbaar'
               ])
               or (
                   select count(*) <> 11
                     from jsonb_object_keys(item.value)
               )
               or jsonb_typeof(item.value -> 'Ronde') <> 'number'
               or jsonb_typeof(item.value -> 'Tijd') <> 'string'
               or jsonb_typeof(item.value -> 'Baan') <> 'string'
               or jsonb_typeof(item.value -> 'Team 1') <> 'string'
               or jsonb_typeof(item.value -> 'Team 2') <> 'string'
               or jsonb_typeof(item.value -> 'Niveau T1') <> 'number'
               or jsonb_typeof(item.value -> 'Niveau T2') <> 'number'
               or jsonb_typeof(item.value -> 'Teamverschil') <> 'number'
               or jsonb_typeof(item.value -> 'Rust') <> 'string'
               or jsonb_typeof(item.value -> 'Nog niet aanwezig') <> 'string'
               or jsonb_typeof(item.value -> 'Niet meer beschikbaar') <> 'string'
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
        schedule_private, schedule_public, statistics_private, diagnostics,
        is_published, event_id, generation_seed, planner_draft_revision
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

create function public.staff_set_schedule_published(p_schedule_id uuid, p_published boolean)
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

    select schedule.event_id, schedule.created_by
      into target_event_id, target_owner
      from public.schedules as schedule
     where schedule.id = p_schedule_id
       and schedule.event_id is not null;
    if target_event_id is null or (target_owner <> actor_id and actor_role <> 'admin') then
        raise exception 'Schedule publication denied.' using errcode = '42501';
    end if;

    if p_published is null then
        raise exception 'Invalid publication state.' using errcode = '22023';
    end if;

    if p_published then
        update public.schedules
           set is_published = false
         where event_id = target_event_id
           and id <> p_schedule_id
           and is_published;
    end if;
    update public.schedules
       set is_published = p_published
     where id = p_schedule_id
       and event_id = target_event_id;
    get diagnostics affected_rows = row_count;
    if affected_rows <> 1 then
        raise exception 'Schedule changed.' using errcode = '40001';
    end if;
    return true;
end;
$$;

revoke all privileges on function public.staff_event_schedule_summaries(uuid)
    from public, anon, authenticated;
revoke all privileges on function public.staff_event_schedule(uuid, uuid)
    from public, anon, authenticated;
revoke all privileges on function public.staff_save_event_schedule(uuid, bigint, bigint, jsonb, jsonb, jsonb)
    from public, anon, authenticated;
revoke all privileges on function public.staff_set_schedule_published(uuid, boolean)
    from public, anon, authenticated;

grant execute on function public.staff_event_schedule_summaries(uuid) to authenticated;
grant execute on function public.staff_event_schedule(uuid, uuid) to authenticated;
grant execute on function public.staff_save_event_schedule(uuid, bigint, bigint, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.staff_set_schedule_published(uuid, boolean) to authenticated;
