begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(42);

select ok(
    not has_function_privilege('anon', 'public.self_onboard_member(text)', 'EXECUTE'),
    'anon kan self-onboarding niet uitvoeren'
);
select ok(
    has_function_privilege('authenticated', 'public.self_onboard_member(text)', 'EXECUTE'),
    'authenticated mag de auth.uid()-gebonden onboarding-RPC uitvoeren'
);
select is(
    pg_get_function_arguments('public.self_onboard_member(text)'::regprocedure),
    'p_display_name text',
    'onboarding accepteert geen user-id, member-id of rol'
);
select ok(
    position(
        'PROFILE_ROLE' in upper(
            pg_get_functiondef('public.self_onboard_member(text)'::regprocedure)
        )
    ) = 0,
    'onboarding gebruikt role niet als membershipvoorwaarde'
);
select ok(
    not has_function_privilege('anon', 'public.update_my_display_name(text)', 'EXECUTE'),
    'anon kan de eigen naam-RPC niet uitvoeren'
);
select ok(
    has_function_privilege('authenticated', 'public.update_my_display_name(text)', 'EXECUTE'),
    'authenticated mag de auth.uid()-gebonden naam-RPC uitvoeren'
);
select ok(
    not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'),
    'AUTH-2 voegt geen brede profielupdates toe'
);
select ok(
    not has_table_privilege('authenticated', 'public.club_members', 'UPDATE'),
    'AUTH-2 voegt geen brede memberupdates toe'
);

insert into auth.users (
    id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
    (
        '21000000-0000-4000-8000-000000000001',
        'authenticated', 'authenticated', 'auth2-participant@example.test',
        '{}'::jsonb, '{"display_name":"AUTH2 Participant"}'::jsonb, now(), now()
    ),
    (
        '21000000-0000-4000-8000-000000000002',
        'authenticated', 'authenticated', 'auth2-planner@example.test',
        '{}'::jsonb, '{"display_name":"AUTH2 Planner"}'::jsonb, now(), now()
    ),
    (
        '21000000-0000-4000-8000-000000000003',
        'authenticated', 'authenticated', 'auth2-admin@example.test',
        '{}'::jsonb, '{"display_name":"AUTH2 Admin"}'::jsonb, now(), now()
    ),
    (
        '21000000-0000-4000-8000-000000000004',
        'authenticated', 'authenticated', 'auth2-no-member@example.test',
        '{}'::jsonb, '{"display_name":"AUTH2 No Member"}'::jsonb, now(), now()
    ),
    (
        '21000000-0000-4000-8000-000000000005',
        'authenticated', 'authenticated', 'auth2-pending@example.test',
        '{}'::jsonb, '{"display_name":"AUTH2 Pending"}'::jsonb, now(), now()
    ),
    (
        '21000000-0000-4000-8000-000000000006',
        'authenticated', 'authenticated', 'auth2-rejected@example.test',
        '{}'::jsonb, '{"display_name":"AUTH2 Rejected"}'::jsonb, now(), now()
    ),
    (
        '21000000-0000-4000-8000-000000000007',
        'authenticated', 'authenticated', 'auth2-inactive@example.test',
        '{}'::jsonb, '{"display_name":"AUTH2 Inactive"}'::jsonb, now(), now()
    );

update public.profiles
set role = case id
    when '21000000-0000-4000-8000-000000000002'::uuid then 'planner'
    when '21000000-0000-4000-8000-000000000003'::uuid then 'admin'
    when '21000000-0000-4000-8000-000000000004'::uuid then 'planner'
    when '21000000-0000-4000-8000-000000000005'::uuid then 'planner'
    when '21000000-0000-4000-8000-000000000006'::uuid then 'admin'
    when '21000000-0000-4000-8000-000000000007'::uuid then 'planner'
    else role
end
where id between
    '21000000-0000-4000-8000-000000000001'::uuid
    and '21000000-0000-4000-8000-000000000007'::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', '21000000-0000-4000-8000-000000000001', true);
select lives_ok(
    $sql$select * from public.self_onboard_member('AUTH2 Participant')$sql$,
    'participant kan zichzelf onboarden'
);
select set_config('request.jwt.claim.sub', '21000000-0000-4000-8000-000000000002', true);
select lives_ok(
    $sql$select * from public.self_onboard_member('AUTH2 Planner')$sql$,
    'planner kan zichzelf als clublid onboarden'
);
select set_config('request.jwt.claim.sub', '21000000-0000-4000-8000-000000000003', true);
select lives_ok(
    $sql$select * from public.self_onboard_member('AUTH2 Admin')$sql$,
    'admin kan zichzelf als clublid onboarden'
);
select set_config('request.jwt.claim.sub', '', true);
reset role;

select is(
    (select role from public.profiles where id = '21000000-0000-4000-8000-000000000001'),
    'participant',
    'participantrol blijft na onboarding gelijk'
);
select is(
    (select role from public.profiles where id = '21000000-0000-4000-8000-000000000002'),
    'planner',
    'plannerrol blijft na onboarding gelijk'
);
select is(
    (select role from public.profiles where id = '21000000-0000-4000-8000-000000000003'),
    'admin',
    'adminrol blijft na onboarding gelijk'
);
select is(
    (
        select count(*)
        from public.profiles
        where id in (
            '21000000-0000-4000-8000-000000000001',
            '21000000-0000-4000-8000-000000000002',
            '21000000-0000-4000-8000-000000000003'
        )
          and member_id is not null
    ),
    3::bigint,
    'alle drie staffniveaus krijgen exact een eigen memberkoppeling'
);
select is(
    (
        select count(*)
        from public.club_members as member
        join public.profiles as profile on profile.member_id = member.id
        where profile.id in (
            '21000000-0000-4000-8000-000000000001',
            '21000000-0000-4000-8000-000000000002',
            '21000000-0000-4000-8000-000000000003'
        )
          and member.active
          and member.approval_status = 'approved'
    ),
    3::bigint,
    'approval-default blijft voor alle rollen gelijk toegepast'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '21000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.profiles), 1::bigint,
    'participant-JWT leest uitsluitend het eigen profiel');
select is((select count(*) from public.club_members), 1::bigint,
    'participant-JWT leest uitsluitend het eigen gekoppelde clublid');
select set_config('request.jwt.claim.sub', '21000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.profiles), 1::bigint,
    'planner-JWT leest uitsluitend het eigen profiel');
select is((select count(*) from public.club_members), 1::bigint,
    'planner-member leest uitsluitend het eigen gekoppelde clublid');
select set_config('request.jwt.claim.sub', '21000000-0000-4000-8000-000000000003', true);
select is((select count(*) from public.profiles), 1::bigint,
    'admin-JWT leest uitsluitend het eigen profiel');
select is((select count(*) from public.club_members), 1::bigint,
    'admin-member leest uitsluitend het eigen gekoppelde clublid');
select set_config('request.jwt.claim.sub', '', true);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '21000000-0000-4000-8000-000000000003', true);
select throws_ok(
    $sql$select * from public.self_onboard_member('Tweede Admin Member')$sql$,
    '23505',
    'Dit account is al aan een clublid gekoppeld.',
    'dubbele staff-onboarding wordt gecontroleerd geweigerd'
);
select throws_ok(
    $sql$
        update public.profiles
        set role = 'participant'
        where id = '21000000-0000-4000-8000-000000000003'
    $sql$,
    '42501',
    null,
    'admin-member kan via user-RLS de eigen staffrol niet wijzigen'
);
select set_config('request.jwt.claim.sub', '', true);
reset role;
select is(
    (select role from public.profiles where id = '21000000-0000-4000-8000-000000000003'),
    'admin',
    'adminrol bleef na onbevoegde wijzigingspoging intact'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '21000000-0000-4000-8000-000000000001', true);
select lives_ok(
    $sql$select * from public.update_my_display_name('Naam Participant')$sql$,
    'participant kan de eigen gekoppelde naam wijzigen'
);
select set_config('request.jwt.claim.sub', '21000000-0000-4000-8000-000000000002', true);
select lives_ok(
    $sql$select * from public.update_my_display_name('Naam Planner')$sql$,
    'planner-member kan de eigen gekoppelde naam wijzigen'
);
select set_config('request.jwt.claim.sub', '21000000-0000-4000-8000-000000000003', true);
select lives_ok(
    $sql$select * from public.update_my_display_name('Naam Admin')$sql$,
    'admin-member kan de eigen gekoppelde naam wijzigen'
);
select set_config('request.jwt.claim.sub', '', true);
reset role;

select results_eq(
    $sql$
        select role, display_name
        from public.profiles
        where id in (
            '21000000-0000-4000-8000-000000000001',
            '21000000-0000-4000-8000-000000000002',
            '21000000-0000-4000-8000-000000000003'
        )
        order by id
    $sql$,
    $sql$
        values
            ('participant'::text, 'Naam Participant'::text),
            ('planner'::text, 'Naam Planner'::text),
            ('admin'::text, 'Naam Admin'::text)
    $sql$,
    'naamwijziging houdt alle staffrollen intact'
);
select is(
    (
        select count(*)
        from public.club_members as member
        join public.profiles as profile on profile.member_id = member.id
        where member.display_name = profile.display_name
          and profile.id in (
              '21000000-0000-4000-8000-000000000001',
              '21000000-0000-4000-8000-000000000002',
              '21000000-0000-4000-8000-000000000003'
          )
    ),
    3::bigint,
    'profiel- en membernamen blijven voor alle rollen atomair gelijk'
);
select is(
    (select display_name from public.profiles where id = '21000000-0000-4000-8000-000000000004'),
    'AUTH2 No Member',
    'naamwijzigingen raken geen ander account'
);

insert into public.club_members (id, display_name, approval_status, active)
values
    ('22000000-0000-4000-8000-000000000005', 'AUTH2 Pending', 'pending', true),
    ('22000000-0000-4000-8000-000000000006', 'AUTH2 Rejected', 'rejected', true),
    ('22000000-0000-4000-8000-000000000007', 'AUTH2 Inactive', 'approved', false);
update public.profiles
set member_id = case id
    when '21000000-0000-4000-8000-000000000005'::uuid
        then '22000000-0000-4000-8000-000000000005'::uuid
    when '21000000-0000-4000-8000-000000000006'::uuid
        then '22000000-0000-4000-8000-000000000006'::uuid
    when '21000000-0000-4000-8000-000000000007'::uuid
        then '22000000-0000-4000-8000-000000000007'::uuid
end
where id in (
    '21000000-0000-4000-8000-000000000005',
    '21000000-0000-4000-8000-000000000006',
    '21000000-0000-4000-8000-000000000007'
);

insert into public.tos_events (
    id, slug, title, sport, starts_at, ends_at, signup_deadline, status, created_by
)
values (
    '23000000-0000-4000-8000-000000000001',
    'auth2-registration-event',
    'AUTH2 Registration Event',
    'padel',
    now() + interval '10 days',
    now() + interval '10 days 2 hours',
    now() + interval '9 days',
    'open',
    '21000000-0000-4000-8000-000000000003'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '21000000-0000-4000-8000-000000000001', true);
select lives_ok(
    $sql$
        insert into public.registrations (event_id, response)
        values ('23000000-0000-4000-8000-000000000001', 'attending')
    $sql$,
    'approved participant-member kan zichzelf registreren'
);
select set_config('request.jwt.claim.sub', '21000000-0000-4000-8000-000000000002', true);
select lives_ok(
    $sql$
        insert into public.registrations (event_id, response)
        values ('23000000-0000-4000-8000-000000000001', 'attending')
    $sql$,
    'approved planner-member kan zichzelf onder RLS registreren'
);
select set_config('request.jwt.claim.sub', '21000000-0000-4000-8000-000000000003', true);
select lives_ok(
    $sql$
        insert into public.registrations (event_id, response)
        values ('23000000-0000-4000-8000-000000000001', 'attending')
    $sql$,
    'approved admin-member kan zichzelf onder RLS registreren'
);
select is(
    (
        select count(*)
        from public.registrations
        where user_id = '21000000-0000-4000-8000-000000000001'
    ),
    0::bigint,
    'admin-member kan de registratie van participant niet lezen'
);
select lives_ok(
    $sql$
        update public.registrations
        set response = 'declined'
        where user_id = '21000000-0000-4000-8000-000000000001'
    $sql$,
    'cross-user update wordt door RLS als lege update afgehandeld'
);
select set_config('request.jwt.claim.sub', '', true);
reset role;

select is(
    (
        select response
        from public.registrations
        where event_id = '23000000-0000-4000-8000-000000000001'
          and user_id = '21000000-0000-4000-8000-000000000001'
    ),
    'attending',
    'admin-member heeft de andere registratie niet gewijzigd'
);
select is(
    (
        select count(*)
        from public.registrations
        where event_id = '23000000-0000-4000-8000-000000000001'
          and source = 'self'
          and user_id = any(array[
              '21000000-0000-4000-8000-000000000001'::uuid,
              '21000000-0000-4000-8000-000000000002'::uuid,
              '21000000-0000-4000-8000-000000000003'::uuid
          ])
    ),
    3::bigint,
    'trigger bepaalt identiteit, member en source voor alle rollen database-side'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '21000000-0000-4000-8000-000000000004', true);
select throws_ok(
    $sql$
        insert into public.registrations (event_id, response)
        values ('23000000-0000-4000-8000-000000000001', 'attending')
    $sql$,
    '42501',
    'Een goedgekeurde actieve ledenkoppeling is vereist voor zelf-aanmelding.',
    'planner zonder member_id kan niet registreren'
);
select set_config('request.jwt.claim.sub', '21000000-0000-4000-8000-000000000005', true);
select throws_ok(
    $sql$
        insert into public.registrations (event_id, response)
        values ('23000000-0000-4000-8000-000000000001', 'attending')
    $sql$,
    '42501',
    'Een goedgekeurde actieve ledenkoppeling is vereist voor zelf-aanmelding.',
    'pending planner-member kan niet registreren'
);
select set_config('request.jwt.claim.sub', '21000000-0000-4000-8000-000000000006', true);
select throws_ok(
    $sql$
        insert into public.registrations (event_id, response)
        values ('23000000-0000-4000-8000-000000000001', 'attending')
    $sql$,
    '42501',
    'Een goedgekeurde actieve ledenkoppeling is vereist voor zelf-aanmelding.',
    'rejected admin-member kan niet registreren'
);
select set_config('request.jwt.claim.sub', '21000000-0000-4000-8000-000000000007', true);
select throws_ok(
    $sql$
        insert into public.registrations (event_id, response)
        values ('23000000-0000-4000-8000-000000000001', 'attending')
    $sql$,
    '42501',
    'Een goedgekeurde actieve ledenkoppeling is vereist voor zelf-aanmelding.',
    'inactive planner-member kan niet registreren'
);
select set_config('request.jwt.claim.sub', '', true);
reset role;

select * from finish();
rollback;
