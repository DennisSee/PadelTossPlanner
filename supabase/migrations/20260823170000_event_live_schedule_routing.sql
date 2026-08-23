-- WEB-9: narrow public projections for canonical event live pages and /live resolution.

create function public.public_event_live_schedule(p_slug text)
returns table (
    id uuid,
    event_slug text,
    event_title text,
    event_sport text,
    event_starts_at timestamptz,
    event_ends_at timestamptz,
    event_date date,
    created_by_name text,
    start_time text,
    end_time text,
    courts jsonb,
    participants_public jsonb,
    schedule_public jsonb,
    is_published boolean,
    created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
    select schedule.id,
           event.slug,
           event.title,
           event.sport,
           event.starts_at,
           event.ends_at,
           schedule.event_date,
           schedule.created_by_name,
           schedule.start_time,
           schedule.end_time,
           schedule.courts,
           schedule.participants_public,
           schedule.schedule_public,
           schedule.is_published,
           schedule.created_at
      from public.tos_events as event
      join public.schedules as schedule
        on schedule.event_id = event.id and schedule.is_published
     where event.slug = p_slug
       and event.status <> 'cancelled'
     order by schedule.created_at desc, schedule.id desc
     limit 1;
$$;

create function public.public_live_schedule_candidates()
returns table (
    slug text,
    title text,
    sport text,
    starts_at timestamptz,
    ends_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
    select event.slug, event.title, event.sport, event.starts_at, event.ends_at
      from public.tos_events as event
     where event.status <> 'cancelled'
       and exists (
           select 1 from public.schedules as schedule
            where schedule.event_id = event.id and schedule.is_published
       )
     order by event.starts_at, event.ends_at, event.slug;
$$;

revoke all privileges on function public.public_event_live_schedule(text),
    public.public_live_schedule_candidates()
    from public, anon, authenticated;
grant execute on function public.public_event_live_schedule(text),
    public.public_live_schedule_candidates()
    to anon, authenticated;
