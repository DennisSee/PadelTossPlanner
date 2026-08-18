-- Clubbrede self-onboarding en sportneutrale ledenidentiteit.
-- Deze migration bevat alleen schema/configuratie en transformeert bestaande
-- rankingwaarden zonder persoonsgegevens in de repository op te nemen.

create table public.club_settings (
    id text primary key default 'club',
    require_member_approval boolean not null default false,
    updated_at timestamptz not null default now(),
    constraint club_settings_singleton_check check (id = 'club')
);

insert into public.club_settings (id, require_member_approval)
values ('club', false);

alter table public.club_members
    add column approval_status text not null default 'approved',
    add constraint club_members_approval_status_check
        check (approval_status in ('pending', 'approved', 'rejected'));

create table public.member_sport_profiles (
    member_id uuid not null
        references public.club_members(id) on delete cascade,
    sport text not null,
    ranking smallint,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (member_id, sport),
    constraint member_sport_profiles_sport_check
        check (sport in ('padel', 'tennis')),
    constraint member_sport_profiles_ranking_check
        check (ranking is null or ranking between 1 and 5)
);

create index member_sport_profiles_sport_active_idx
    on public.member_sport_profiles (sport, active, member_id);

-- Bestaande rankings zijn aantoonbaar padelrankings. Nieuwe onboarders krijgen
-- geen sportprofiel of ranking totdat een bevoegde beheerflow die vaststelt.
insert into public.member_sport_profiles (member_id, sport, ranking, active)
select member.id, 'padel', member.ranking, member.active
from public.club_members as member;

alter table public.club_members
    drop column ranking;

alter table public.tos_events
    add column sport text;

update public.tos_events
set sport = 'padel';

alter table public.tos_events
    alter column sport set not null,
    alter column title set default 'TOS-avond',
    add constraint tos_events_sport_check
        check (sport in ('padel', 'tennis'));

create trigger club_settings_set_updated_at
before update on public.club_settings
for each row execute function public.set_updated_at();

create trigger member_sport_profiles_set_updated_at
before update on public.member_sport_profiles
for each row execute function public.set_updated_at();

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
    elsif new.response = 'declined' then
        new.available_from := null;
        new.available_until := null;
    end if;

    return new;
end;
$$;

create or replace function public.self_onboard_member(p_display_name text)
returns table (
    member_id uuid,
    display_name text,
    approval_status text,
    active boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor_id uuid := auth.uid();
    normalized_display_name text := btrim(coalesce(p_display_name, ''));
    profile_member_id uuid;
    profile_role text;
    profile_active boolean;
    approval_required boolean;
    new_approval_status text;
    new_member_id uuid;
    updated_profile_count integer;
begin
    if actor_id is null then
        raise exception 'Authenticatie is vereist voor self-onboarding.'
            using errcode = '42501';
    end if;

    if length(normalized_display_name) < 1
       or length(normalized_display_name) > 120 then
        raise exception 'De weergavenaam moet tussen 1 en 120 tekens bevatten.'
            using errcode = '22023';
    end if;

    -- Dit row lock serialiseert twee gelijktijdige verzoeken voor hetzelfde account.
    select profile.member_id,
           profile.role,
           profile.active
    into profile_member_id,
         profile_role,
         profile_active
    from public.profiles as profile
    where profile.id = actor_id
    for update;

    if not found or not profile_active or profile_role <> 'participant' then
        raise exception 'Alleen een actief participant-account kan zichzelf onboarden.'
            using errcode = '42501';
    end if;

    if profile_member_id is not null then
        raise exception 'Dit account is al aan een clublid gekoppeld.'
            using errcode = '23505';
    end if;

    select settings.require_member_approval
    into approval_required
    from public.club_settings as settings
    where settings.id = 'club';

    if not found then
        raise exception 'De onboardinginstelling ontbreekt.'
            using errcode = '55000';
    end if;

    new_approval_status := case
        when approval_required then 'pending'
        else 'approved'
    end;

    insert into public.club_members (
        display_name,
        approval_status,
        active
    )
    values (
        normalized_display_name,
        new_approval_status,
        true
    )
    returning id into new_member_id;

    update public.profiles as target_profile
    set member_id = new_member_id
    where target_profile.id = actor_id
      and target_profile.member_id is null;

    get diagnostics updated_profile_count = row_count;
    if updated_profile_count <> 1 then
        raise exception 'De ledenkoppeling kon niet veilig worden opgeslagen.'
            using errcode = '40001';
    end if;

    return query
    select member.id,
           member.display_name,
           member.approval_status,
           member.active
    from public.club_members as member
    where member.id = new_member_id;
end;
$$;

drop policy registrations_insert_own on public.registrations;
drop policy registrations_update_own on public.registrations;

create policy registrations_insert_own
on public.registrations
for insert
to authenticated
with check (
    user_id = (select auth.uid())
    and exists (
        select 1
        from public.profiles as profile
        join public.club_members as member
          on member.id = profile.member_id
        where profile.id = (select auth.uid())
          and profile.active
          and member.id = registrations.member_id
          and member.active
          and member.approval_status = 'approved'
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
        from public.profiles as profile
        join public.club_members as member
          on member.id = profile.member_id
        where profile.id = (select auth.uid())
          and profile.active
          and member.id = registrations.member_id
          and member.active
          and member.approval_status = 'approved'
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
)
with check (
    user_id = (select auth.uid())
    and exists (
        select 1
        from public.profiles as profile
        join public.club_members as member
          on member.id = profile.member_id
        where profile.id = (select auth.uid())
          and profile.active
          and member.id = registrations.member_id
          and member.active
          and member.approval_status = 'approved'
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

alter table public.club_settings enable row level security;
alter table public.member_sport_profiles enable row level security;

revoke all privileges on table public.club_settings from anon, authenticated;
revoke all privileges on table public.member_sport_profiles from anon, authenticated;
revoke all privileges on function public.self_onboard_member(text)
    from public, anon, authenticated;

grant select (approval_status)
    on table public.club_members to authenticated;
grant select (sport)
    on table public.tos_events to anon, authenticated;
grant execute on function public.self_onboard_member(text) to authenticated;

grant select, insert, update, delete, truncate, references, trigger, maintain
    on table public.club_settings to service_role;
grant select, insert, update, delete, truncate, references, trigger, maintain
    on table public.member_sport_profiles to service_role;
