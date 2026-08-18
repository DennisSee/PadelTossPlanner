-- Foundation for self-service TOS registrations.
-- This migration contains schema and authorization rules only; it adds no data.

create table public.club_members (
    id uuid primary key default gen_random_uuid(),
    display_name text not null,
    ranking smallint not null
        constraint club_members_ranking_check check (ranking between 1 and 5),
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint club_members_display_name_check
        check (length(btrim(display_name)) between 1 and 120)
);

create index club_members_active_display_name_idx
    on public.club_members (active, display_name);

alter table public.profiles
    drop constraint profiles_role_check;

alter table public.profiles
    alter column role set default 'participant',
    add constraint profiles_role_check
        check (role in ('participant', 'planner', 'admin')),
    add column member_id uuid,
    add constraint profiles_member_id_fkey
        foreign key (member_id)
        references public.club_members(id)
        on delete set null,
    add constraint profiles_member_id_key unique (member_id);

create table public.tos_events (
    id uuid primary key default gen_random_uuid(),
    slug text not null unique,
    title text not null default 'TOS Padelavond',
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    signup_deadline timestamptz,
    status text not null default 'draft',
    created_by uuid not null references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint tos_events_slug_check
        check (
            length(slug) between 3 and 80
            and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
        ),
    constraint tos_events_title_check
        check (length(btrim(title)) between 1 and 160),
    constraint tos_events_time_range_check check (ends_at > starts_at),
    constraint tos_events_signup_deadline_check
        check (signup_deadline is null or signup_deadline <= starts_at),
    constraint tos_events_status_check
        check (status in ('draft', 'open', 'closed', 'cancelled'))
);

create index tos_events_status_starts_at_idx
    on public.tos_events (status, starts_at);

create index tos_events_created_by_starts_at_idx
    on public.tos_events (created_by, starts_at desc);

create table public.registrations (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null
        references public.tos_events(id) on delete cascade,
    user_id uuid not null default auth.uid()
        references auth.users(id) on delete cascade,
    member_id uuid not null
        references public.club_members(id) on delete restrict,
    response text not null,
    available_from timestamptz,
    available_until timestamptz,
    source text not null default 'self',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint registrations_event_user_key unique (event_id, user_id),
    constraint registrations_event_member_key unique (event_id, member_id),
    constraint registrations_response_check
        check (response in ('attending', 'declined')),
    constraint registrations_source_check
        check (source in ('self', 'admin')),
    constraint registrations_availability_check
        check (
            (
                response = 'attending'
                and available_from is not null
                and available_until is not null
                and available_until > available_from
            )
            or (
                response = 'declined'
                and available_from is null
                and available_until is null
            )
        )
);

create index registrations_user_event_idx
    on public.registrations (user_id, event_id);

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
        'participant',
        true
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

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
        where profile.id = actor_id
          and profile.active;

        if linked_member_id is null then
            raise exception 'Een actieve ledenkoppeling is vereist voor zelf-aanmelding.'
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
    elsif new.response = 'declined' then
        new.available_from := null;
        new.available_until := null;
    end if;

    return new;
end;
$$;

create trigger club_members_set_updated_at
before update on public.club_members
for each row execute function public.set_updated_at();

create trigger tos_events_set_updated_at
before update on public.tos_events
for each row execute function public.set_updated_at();

create trigger registrations_validate_self_signup
before insert or update on public.registrations
for each row execute function public.validate_self_signup_registration();

create trigger registrations_set_updated_at
before update on public.registrations
for each row execute function public.set_updated_at();

alter table public.club_members enable row level security;
alter table public.tos_events enable row level security;
alter table public.registrations enable row level security;

revoke all privileges on table public.club_members from anon, authenticated;
revoke all privileges on table public.tos_events from anon, authenticated;
revoke all privileges on table public.registrations from anon, authenticated;

revoke all privileges on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all privileges on function public.validate_self_signup_registration()
    from public, anon, authenticated;

grant select (id, display_name, role, active, member_id)
    on table public.profiles to authenticated;
grant select (id, display_name, ranking, active)
    on table public.club_members to authenticated;
grant select (id, slug, title, starts_at, ends_at, signup_deadline, status)
    on table public.tos_events to anon, authenticated;
grant select on table public.registrations to authenticated;
grant insert (event_id, response, available_from, available_until)
    on table public.registrations to authenticated;
grant update (response, available_from, available_until)
    on table public.registrations to authenticated;

grant select, insert, update, delete, truncate, references, trigger, maintain
    on table public.club_members to service_role;
grant select, insert, update, delete, truncate, references, trigger, maintain
    on table public.tos_events to service_role;
grant select, insert, update, delete, truncate, references, trigger, maintain
    on table public.registrations to service_role;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using (id = (select auth.uid()));

create policy club_members_select_linked
on public.club_members
for select
to authenticated
using (
    exists (
        select 1
        from public.profiles as profile
        where profile.id = (select auth.uid())
          and profile.active
          and profile.member_id = club_members.id
    )
);

create policy tos_events_select_open
on public.tos_events
for select
to anon, authenticated
using (status = 'open');

create policy registrations_select_own
on public.registrations
for select
to authenticated
using (user_id = (select auth.uid()));

create policy registrations_insert_own
on public.registrations
for insert
to authenticated
with check (
    user_id = (select auth.uid())
    and exists (
        select 1
        from public.profiles as profile
        where profile.id = (select auth.uid())
          and profile.active
          and profile.member_id = registrations.member_id
    )
    and exists (
        select 1
        from public.tos_events as event
        where event.id = registrations.event_id
          and event.status = 'open'
          and (
              event.signup_deadline is null
              or now() <= event.signup_deadline
          )
    )
);

create policy registrations_update_own
on public.registrations
for update
to authenticated
using (
    user_id = (select auth.uid())
    and exists (
        select 1
        from public.tos_events as event
        where event.id = registrations.event_id
          and event.status = 'open'
          and (
              event.signup_deadline is null
              or now() <= event.signup_deadline
          )
    )
)
with check (
    user_id = (select auth.uid())
    and exists (
        select 1
        from public.profiles as profile
        where profile.id = (select auth.uid())
          and profile.active
          and profile.member_id = registrations.member_id
    )
    and exists (
        select 1
        from public.tos_events as event
        where event.id = registrations.event_id
          and event.status = 'open'
          and (
              event.signup_deadline is null
              or now() <= event.signup_deadline
          )
    )
);
