begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(26);

select has_function(
    'public',
    'update_my_display_name',
    array['text'],
    'self-service display-name RPC bestaat'
);
select ok(
    has_function_privilege(
        'authenticated',
        'public.update_my_display_name(text)',
        'EXECUTE'
    ),
    'authenticated mag de narrowly scoped RPC uitvoeren'
);
select ok(
    not has_function_privilege(
        'anon',
        'public.update_my_display_name(text)',
        'EXECUTE'
    ),
    'anon mag de display-name RPC niet uitvoeren'
);
select is(
    pg_get_function_arguments('public.update_my_display_name(text)'::regprocedure),
    'new_display_name text',
    'de client levert uitsluitend de nieuwe naam aan'
);
select is(
    pg_get_function_result('public.update_my_display_name(text)'::regprocedure),
    'TABLE(profile_id uuid, member_id uuid, display_name text)',
    'RPC retourneert alleen de bijgewerkte eigen identiteit en naam'
);
select ok(
    not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'),
    'authenticated krijgt geen algemene profiel-update'
);
select ok(
    not has_table_privilege('authenticated', 'public.club_members', 'UPDATE'),
    'authenticated krijgt geen algemene member-update'
);

insert into auth.users (
    id,
    aud,
    role,
    email,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
)
values
    (
        'f1000000-0000-4000-8000-000000000001',
        'authenticated',
        'authenticated',
        'profile-a@example.test',
        '{}'::jsonb,
        '{"display_name":"Profiel A"}'::jsonb,
        now(),
        now()
    ),
    (
        'f1000000-0000-4000-8000-000000000002',
        'authenticated',
        'authenticated',
        'profile-b@example.test',
        '{}'::jsonb,
        '{"display_name":"Profiel B"}'::jsonb,
        now(),
        now()
    ),
    (
        'f1000000-0000-4000-8000-000000000003',
        'authenticated',
        'authenticated',
        'zonder-member@example.test',
        '{}'::jsonb,
        '{"display_name":"Zonder Member"}'::jsonb,
        now(),
        now()
    ),
    (
        'f1000000-0000-4000-8000-000000000004',
        'authenticated',
        'authenticated',
        'profile-planner@example.test',
        '{}'::jsonb,
        '{"display_name":"Profiel Planner"}'::jsonb,
        now(),
        now()
    );

update public.profiles
set role = 'planner'
where id = 'f1000000-0000-4000-8000-000000000004';

set local role authenticated;
select set_config(
    'request.jwt.claim.sub',
    'f1000000-0000-4000-8000-000000000001',
    true
);
select lives_ok(
    $sql$select * from public.self_onboard_member('Profiel A')$sql$,
    'participant A kan zichzelf eerst onboarden'
);
select set_config(
    'request.jwt.claim.sub',
    'f1000000-0000-4000-8000-000000000002',
    true
);
select lives_ok(
    $sql$select * from public.self_onboard_member('Profiel B')$sql$,
    'participant B kan zichzelf eerst onboarden'
);
select set_config('request.jwt.claim.sub', '', true);
reset role;

insert into public.member_sport_profiles (member_id, sport, ranking, active)
select member_id, 'padel', 4, true
from public.profiles
where id = 'f1000000-0000-4000-8000-000000000001';

insert into public.tos_events (
    id,
    slug,
    title,
    sport,
    starts_at,
    ends_at,
    signup_deadline,
    status,
    created_by
)
values (
    'f3000000-0000-4000-8000-000000000001',
    'profile-name-social',
    'Naamtest TOS',
    'padel',
    now() + interval '10 days',
    now() + interval '10 days 2 hours',
    now() + interval '9 days',
    'open',
    'f1000000-0000-4000-8000-000000000004'
);

insert into public.registrations (
    event_id,
    user_id,
    member_id,
    response,
    available_from,
    available_until,
    source
)
select
    'f3000000-0000-4000-8000-000000000001',
    profile.id,
    profile.member_id,
    'attending',
    now() + interval '10 days',
    now() + interval '10 days 2 hours',
    'admin'
from public.profiles as profile
where profile.id = 'f1000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
    'request.jwt.claim.sub',
    'f1000000-0000-4000-8000-000000000001',
    true
);

select lives_ok(
    $sql$select * from public.update_my_display_name('  Dennis Seesing  ')$sql$,
    'participant kan de eigen zichtbare naam wijzigen'
);
select is(
    (
        select display_name
        from public.profiles
        where id = 'f1000000-0000-4000-8000-000000000001'
    ),
    'Dennis Seesing',
    'profiles.display_name wordt getrimd bijgewerkt'
);
select is(
    (
        select member.display_name
        from public.club_members as member
        join public.profiles as profile on profile.member_id = member.id
        where profile.id = 'f1000000-0000-4000-8000-000000000001'
    ),
    'Dennis Seesing',
    'club_members.display_name blijft atomair gelijk aan het profiel'
);
select results_eq(
    $sql$
        select display_name
        from public.participant_event_attendee_names(
            'f3000000-0000-4000-8000-000000000001'
        )
    $sql$,
    $sql$ values ('Dennis Seesing'::text) $sql$,
    'de veilige sociale namenprojectie gebruikt direct de nieuwe naam'
);
select set_config('request.jwt.claim.sub', '', true);
reset role;

select is(
    (
        select display_name
        from public.profiles
        where id = 'f1000000-0000-4000-8000-000000000002'
    ),
    'Profiel B',
    'profiel B is niet gewijzigd'
);
select is(
    (
        select member.display_name
        from public.club_members as member
        join public.profiles as profile on profile.member_id = member.id
        where profile.id = 'f1000000-0000-4000-8000-000000000002'
    ),
    'Profiel B',
    'member B is niet gewijzigd'
);
select is(
    (
        select email
        from public.profiles
        where id = 'f1000000-0000-4000-8000-000000000001'
    ),
    'profile-a@example.test',
    'e-mail blijft ongewijzigd'
);
select is(
    (
        select role
        from public.profiles
        where id = 'f1000000-0000-4000-8000-000000000001'
    ),
    'participant',
    'rol blijft participant'
);
select ok(
    (
        select active
        from public.profiles
        where id = 'f1000000-0000-4000-8000-000000000001'
    ),
    'account-active blijft ongewijzigd'
);
select is(
    (
        select member.approval_status
        from public.club_members as member
        join public.profiles as profile on profile.member_id = member.id
        where profile.id = 'f1000000-0000-4000-8000-000000000001'
    ),
    'approved',
    'approval-status blijft ongewijzigd'
);
select ok(
    (
        select member.active
        from public.club_members as member
        join public.profiles as profile on profile.member_id = member.id
        where profile.id = 'f1000000-0000-4000-8000-000000000001'
    ),
    'member-active blijft ongewijzigd'
);
select is(
    (
        select sport_profile.ranking
        from public.member_sport_profiles as sport_profile
        join public.profiles as profile on profile.member_id = sport_profile.member_id
        where profile.id = 'f1000000-0000-4000-8000-000000000001'
          and sport_profile.sport = 'padel'
    ),
    4::smallint,
    'padelranking blijft ongewijzigd'
);

set local role authenticated;
select set_config(
    'request.jwt.claim.sub',
    'f1000000-0000-4000-8000-000000000003',
    true
);
select throws_ok(
    $sql$select * from public.update_my_display_name('Geen koppeling')$sql$,
    '55000',
    'Maak eerst je eigen clubprofiel aan.',
    'een ontbrekende eigen memberkoppeling faalt veilig'
);
select set_config(
    'request.jwt.claim.sub',
    'f1000000-0000-4000-8000-000000000001',
    true
);
select throws_ok(
    $sql$select * from public.update_my_display_name('   ')$sql$,
    '22023',
    'De naam moet 1 tot en met 120 geldige tekens bevatten.',
    'een lege naam wordt geweigerd'
);
select throws_ok(
    $sql$select * from public.update_my_display_name(repeat('x', 121))$sql$,
    '22023',
    'De naam moet 1 tot en met 120 geldige tekens bevatten.',
    'een te lange naam wordt geweigerd'
);
select throws_ok(
    $sql$select * from public.update_my_display_name(E'Dennis\nSeesing')$sql$,
    '22023',
    'De naam moet 1 tot en met 120 geldige tekens bevatten.',
    'control characters worden geweigerd'
);
select set_config('request.jwt.claim.sub', '', true);
reset role;

set local role anon;
select throws_ok(
    $sql$select * from public.update_my_display_name('Onbevoegd')$sql$,
    '42501',
    'permission denied for function update_my_display_name',
    'anon kan de RPC niet uitvoeren'
);
reset role;

select * from finish();
rollback;
