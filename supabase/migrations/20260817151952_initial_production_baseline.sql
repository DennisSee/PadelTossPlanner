-- Reproduceerbare applicatiebaseline, afgeleid van de read-only
-- productie-inventarisatie. Dit bestand bevat uitsluitend schema-DDL.

create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text not null unique,
    display_name text not null,
    role text not null default 'planner'
        check (role in ('admin', 'planner')),
    active boolean not null default true,
    created_at timestamptz not null default now()
);

create table public.planner_drafts (
    user_id uuid primary key references auth.users(id) on delete cascade,
    event_title text not null default 'TOS Padelavond',
    event_date date not null default current_date,
    start_time text not null default '20:00',
    end_time text not null default '22:00',
    match_minutes integer not null default 20,
    selected_courts jsonb not null default '[]'::jsonb,
    players jsonb not null default '[]'::jsonb,
    search_profile text not null default 'Normaal',
    allow_repeat_partners boolean not null default false,
    updated_at timestamptz not null default now(),
    level_mix integer not null default 50,
    team_difference_tolerance double precision not null default 0.5,
    constraint planner_drafts_level_mix_check
        check (level_mix >= 0 and level_mix <= 100),
    constraint planner_drafts_team_difference_tolerance_check
        check (
            team_difference_tolerance >= 0::double precision
            and team_difference_tolerance <= 2.0::double precision
        )
);

create table public.schedules (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    event_date date not null,
    created_by uuid not null references auth.users(id) on delete restrict,
    created_by_name text not null,
    start_time text not null,
    end_time text not null,
    match_minutes integer not null,
    courts jsonb not null,
    players_private jsonb not null,
    participants_public jsonb not null,
    schedule_private jsonb not null,
    schedule_public jsonb not null,
    statistics_private jsonb not null,
    diagnostics jsonb not null,
    is_published boolean not null default true,
    created_at timestamptz not null default now()
);

create table public.club_drafts (
    id text primary key default 'club',
    event_title text not null default 'TOS Padelavond',
    event_date date not null default current_date,
    start_time text not null default '20:00',
    end_time text not null default '22:00',
    match_minutes integer not null default 20,
    selected_courts jsonb not null default '[]'::jsonb,
    players jsonb not null default '[]'::jsonb,
    search_profile text not null default 'Normaal',
    allow_repeat_partners boolean not null default false,
    updated_by uuid references auth.users(id) on delete set null,
    updated_by_name text,
    updated_at timestamptz not null default now(),
    level_mix integer not null default 50,
    team_difference_tolerance double precision not null default 0.5,
    rest_minutes integer not null default 0,
    constraint club_drafts_id_check check (id = 'club'),
    constraint club_drafts_level_mix_check
        check (level_mix >= 0 and level_mix <= 100),
    constraint club_drafts_team_difference_tolerance_check
        check (
            team_difference_tolerance >= 0::double precision
            and team_difference_tolerance <= 2.0::double precision
        ),
    constraint club_drafts_rest_minutes_check
        check (rest_minutes >= 0 and rest_minutes <= 30)
);

create index schedules_public_latest_idx
    on public.schedules (is_published, event_date desc, created_at desc);

create index schedules_created_by_idx
    on public.schedules (created_by, event_date desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id, email, display_name, role, active)
    values (
        new.id,
        coalesce(new.email, new.id::text || '@unknown.local'),
        coalesce(
            new.raw_user_meta_data ->> 'display_name',
            split_part(coalesce(new.email, 'Gebruiker'), '@', 1)
        ),
        'planner',
        true
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

create trigger planner_drafts_set_updated_at
before update on public.planner_drafts
for each row execute function public.set_updated_at();

create trigger club_drafts_set_updated_at
before update on public.club_drafts
for each row execute function public.set_updated_at();

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

alter table public.profiles enable row level security;
alter table public.planner_drafts enable row level security;
alter table public.schedules enable row level security;
alter table public.club_drafts enable row level security;

revoke all privileges on table public.profiles from anon, authenticated;
revoke all privileges on table public.planner_drafts from anon, authenticated;
revoke all privileges on table public.schedules from anon, authenticated;
revoke all privileges on table public.club_drafts from anon, authenticated;

grant select, insert, update, delete, truncate, references, trigger, maintain
    on table public.profiles to service_role;
grant select, insert, update, delete, truncate, references, trigger, maintain
    on table public.planner_drafts to service_role;
grant select, insert, update, delete, truncate, references, trigger, maintain
    on table public.schedules to service_role;
grant select, insert, update, delete, truncate, references, trigger, maintain
    on table public.club_drafts to service_role;
