-- TOS Padelplanner: database-objecten voor Supabase
-- Voer dit volledige bestand één keer uit via Supabase > SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text not null unique,
    display_name text not null,
    role text not null default 'planner' check (role in ('admin', 'planner')),
    active boolean not null default true,
    created_at timestamptz not null default now()
);

create table if not exists public.planner_drafts (
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
    updated_at timestamptz not null default now()
);

create table if not exists public.schedules (
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

create index if not exists schedules_public_latest_idx
    on public.schedules (is_published, event_date desc, created_at desc);

create index if not exists schedules_created_by_idx
    on public.schedules (created_by, event_date desc);

-- Houd updated_at van de persoonlijke invoer actueel.
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

drop trigger if exists planner_drafts_set_updated_at on public.planner_drafts;
create trigger planner_drafts_set_updated_at
before update on public.planner_drafts
for each row execute function public.set_updated_at();

-- Maak automatisch een basisprofiel wanneer via Supabase Auth een gebruiker ontstaat.
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
        coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, 'Gebruiker'), '@', 1)),
        'planner',
        true
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- De app benadert deze tabellen uitsluitend server-side met de Supabase secret/service key.
-- Daarom zijn er bewust geen anon- of authenticated-policies.
alter table public.profiles enable row level security;
alter table public.planner_drafts enable row level security;
alter table public.schedules enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.planner_drafts from anon, authenticated;
revoke all on table public.schedules from anon, authenticated;

-- Eerste beheerder, nadat je die via Authentication > Users hebt aangemaakt:
-- update public.profiles
-- set role = 'admin', display_name = 'Jouw naam'
-- where email = 'jouw-email@example.com';
