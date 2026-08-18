-- Openbare schemaweergave via de publishable key, met RLS en kolomrechten.
-- De service_role-grants uit de baseline blijven ongewijzigd voor planner/admin.

alter table public.schedules enable row level security;

revoke all privileges on table public.schedules from anon, authenticated;

-- Tabel-REVOKE verwijdert eventuele oudere kolomgrants niet. Trek die daarom
-- expliciet in voordat de beperkte openbare projectie wordt toegekend.
revoke select (
    id,
    title,
    event_date,
    created_by,
    created_by_name,
    start_time,
    end_time,
    match_minutes,
    courts,
    players_private,
    participants_public,
    schedule_private,
    schedule_public,
    statistics_private,
    diagnostics,
    is_published,
    created_at
) on table public.schedules from anon, authenticated;

revoke insert (
    id,
    title,
    event_date,
    created_by,
    created_by_name,
    start_time,
    end_time,
    match_minutes,
    courts,
    players_private,
    participants_public,
    schedule_private,
    schedule_public,
    statistics_private,
    diagnostics,
    is_published,
    created_at
) on table public.schedules from anon, authenticated;

revoke update (
    id,
    title,
    event_date,
    created_by,
    created_by_name,
    start_time,
    end_time,
    match_minutes,
    courts,
    players_private,
    participants_public,
    schedule_private,
    schedule_public,
    statistics_private,
    diagnostics,
    is_published,
    created_at
) on table public.schedules from anon, authenticated;

grant select (
    id,
    event_date,
    created_by_name,
    start_time,
    end_time,
    courts,
    participants_public,
    schedule_public,
    is_published,
    created_at
) on table public.schedules to anon, authenticated;

create policy schedules_select_published
on public.schedules
for select
to anon, authenticated
using (is_published = true);
