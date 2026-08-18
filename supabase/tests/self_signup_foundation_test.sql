begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(47);

select has_table('public', 'club_members', 'club_members bestaat');
select has_table('public', 'tos_events', 'tos_events bestaat');
select has_table('public', 'registrations', 'registrations bestaat');
select has_table('public', 'club_drafts', 'bestaande club_drafts blijft bestaan');
select has_column('public', 'profiles', 'member_id', 'profiles heeft member_id');

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
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'authenticated',
        'authenticated',
        'user-a@example.test',
        '{}'::jsonb,
        '{"display_name":"User A"}'::jsonb,
        now(),
        now()
    ),
    (
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'authenticated',
        'authenticated',
        'user-b@example.test',
        '{}'::jsonb,
        '{"display_name":"User B"}'::jsonb,
        now(),
        now()
    ),
    (
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        'authenticated',
        'authenticated',
        'planner@example.test',
        '{}'::jsonb,
        '{"display_name":"Planner"}'::jsonb,
        now(),
        now()
    ),
    (
        'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        'authenticated',
        'authenticated',
        'admin@example.test',
        '{}'::jsonb,
        '{"display_name":"Admin"}'::jsonb,
        now(),
        now()
    );

select is(
    (select role from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    'participant',
    'nieuwe Auth-user A wordt participant'
);
select is(
    (select role from public.profiles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
    'participant',
    'nieuwe Auth-user B wordt participant'
);

update public.profiles
set role = 'planner'
where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
update public.profiles
set role = 'admin'
where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

select is(
    (select role from public.profiles where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
    'planner',
    'bestaande plannerrol blijft geldig'
);
select is(
    (select role from public.profiles where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
    'admin',
    'bestaande adminrol blijft geldig'
);
select ok(
    (select member_id is null from public.profiles where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
    'bestaande planner hoeft geen member-koppeling te hebben'
);

insert into public.club_members (id, display_name)
values
    ('11111111-1111-4111-8111-111111111111', 'Lid A'),
    ('22222222-2222-4222-8222-222222222222', 'Lid B');

update public.profiles
set member_id = '11111111-1111-4111-8111-111111111111'
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
update public.profiles
set member_id = '22222222-2222-4222-8222-222222222222'
where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

insert into public.tos_events (
    id,
    slug,
    title,
    starts_at,
    ends_at,
    signup_deadline,
    status,
    sport,
    created_by
)
values
    (
        '10000000-0000-4000-8000-000000000001',
        'open-event',
        'Open TOS',
        '2099-01-01 20:00:00+00',
        '2099-01-01 22:00:00+00',
        '2098-12-31 20:00:00+00',
        'open',
        'padel',
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    ),
    (
        '10000000-0000-4000-8000-000000000002',
        'closed-event',
        'Gesloten TOS',
        '2099-02-01 20:00:00+00',
        '2099-02-01 22:00:00+00',
        '2099-01-31 20:00:00+00',
        'closed',
        'padel',
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    ),
    (
        '10000000-0000-4000-8000-000000000003',
        'expired-event',
        'Verlopen TOS',
        '2099-03-01 20:00:00+00',
        '2099-03-01 22:00:00+00',
        '2000-01-01 00:00:00+00',
        'open',
        'padel',
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    ),
    (
        '10000000-0000-4000-8000-000000000004',
        'deadline-event',
        'Deadline TOS',
        '2099-04-01 20:00:00+00',
        '2099-04-01 22:00:00+00',
        '2099-03-31 20:00:00+00',
        'open',
        'padel',
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    );

select ok(
    not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'),
    'authenticated heeft geen profiel-updateprivilege'
);
select ok(
    not has_table_privilege('authenticated', 'public.club_members', 'INSERT'),
    'authenticated kan geen leden aanmaken'
);
select ok(
    not has_table_privilege('authenticated', 'public.tos_events', 'INSERT'),
    'authenticated kan geen events aanmaken'
);
select ok(
    not has_table_privilege('anon', 'public.registrations', 'INSERT'),
    'anon kan geen registratie aanmaken'
);
select ok(
    has_column_privilege(
        'authenticated',
        'public.registrations',
        'response',
        'INSERT'
    ),
    'authenticated mag alleen toegestane registratiekolommen schrijven'
);
select ok(
    not has_column_privilege(
        'authenticated',
        'public.registrations',
        'user_id',
        'INSERT'
    ),
    'authenticated kan user_id niet aanleveren'
);

set local role authenticated;
select set_config(
    'request.jwt.claim.sub',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    true
);

select lives_ok(
    $sql$
        insert into public.registrations (event_id, response)
        values ('10000000-0000-4000-8000-000000000001', 'attending')
    $sql$,
    'user A kan een eigen registratie aanmaken'
);
select results_eq(
    $sql$
        select
            user_id::text,
            member_id::text,
            source,
            response,
            available_from,
            available_until
        from public.registrations
        where event_id = '10000000-0000-4000-8000-000000000001'
    $sql$,
    $sql$
        values (
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            '11111111-1111-4111-8111-111111111111',
            'self',
            'attending',
            '2099-01-01 20:00:00+00'::timestamptz,
            '2099-01-01 22:00:00+00'::timestamptz
        )
    $sql$,
    'identiteit, ledenkoppeling en standaardtijden worden database-side bepaald'
);
select is(
    (select count(*) from public.registrations),
    1::bigint,
    'user A leest zijn eigen registratie'
);

select set_config('request.jwt.claim.sub', '', true);
reset role;
set local role authenticated;
select set_config(
    'request.jwt.claim.sub',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    true
);

select lives_ok(
    $sql$
        insert into public.registrations (event_id, response)
        values ('10000000-0000-4000-8000-000000000001', 'declined')
    $sql$,
    'user B kan een eigen registratie aanmaken'
);
select is(
    (select count(*) from public.registrations),
    1::bigint,
    'user B leest uitsluitend zijn eigen registratie'
);

select set_config('request.jwt.claim.sub', '', true);
reset role;
set local role authenticated;
select set_config(
    'request.jwt.claim.sub',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    true
);

select is(
    (
        select count(*)
        from public.registrations
        where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    ),
    0::bigint,
    'user A kan registratie van user B niet lezen'
);
select lives_ok(
    $sql$
        update public.registrations
        set available_from = '2099-01-01 20:30:00+00',
            available_until = '2099-01-01 21:30:00+00'
        where event_id = '10000000-0000-4000-8000-000000000001'
    $sql$,
    'user A kan zijn eigen registratie wijzigen'
);
select is(
    (
        select available_from
        from public.registrations
        where event_id = '10000000-0000-4000-8000-000000000001'
    ),
    '2099-01-01 20:30:00+00'::timestamptz,
    'wijziging van user A is opgeslagen'
);
select lives_ok(
    $sql$
        update public.registrations
        set response = 'attending',
            available_from = '2099-01-01 20:00:00+00',
            available_until = '2099-01-01 22:00:00+00'
        where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    $sql$,
    'RLS verbergt registratie van user B voor een update door user A'
);

select set_config('request.jwt.claim.sub', '', true);
reset role;
select is(
    (
        select response
        from public.registrations
        where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
          and event_id = '10000000-0000-4000-8000-000000000001'
    ),
    'declined',
    'registratie van user B bleef ongewijzigd'
);

set local role anon;
select throws_ok(
    $sql$
        insert into public.registrations (event_id, response)
        values ('10000000-0000-4000-8000-000000000001', 'attending')
    $sql$,
    '42501',
    'permission denied for table registrations',
    'anon kan geen registratie schrijven'
);
select throws_ok(
    $sql$select * from public.registrations$sql$,
    '42501',
    'permission denied for table registrations',
    'anon kan geen registraties lezen'
);
reset role;

set local role authenticated;
select set_config(
    'request.jwt.claim.sub',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    true
);
select throws_ok(
    $sql$
        update public.profiles
        set role = 'admin'
        where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    $sql$,
    '42501',
    'permission denied for table profiles',
    'participant kan zichzelf geen admin maken'
);
select throws_ok(
    $sql$
        update public.profiles
        set role = 'planner'
        where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    $sql$,
    '42501',
    'permission denied for table profiles',
    'participant kan zichzelf geen planner maken'
);
select set_config('request.jwt.claim.sub', '', true);
reset role;
select is(
    (select role from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    'participant',
    'participantrol bleef ongewijzigd'
);

set local role authenticated;
select set_config(
    'request.jwt.claim.sub',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    true
);
select throws_ok(
    $sql$
        update public.profiles
        set member_id = '22222222-2222-4222-8222-222222222222'
        where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    $sql$,
    '42501',
    'permission denied for table profiles',
    'participant kan zijn member_id niet wijzigen'
);
select set_config('request.jwt.claim.sub', '', true);
reset role;
select is(
    (
        select member_id::text
        from public.profiles
        where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    ),
    '11111111-1111-4111-8111-111111111111',
    'ledenkoppeling bleef ongewijzigd'
);

set local role authenticated;
select set_config(
    'request.jwt.claim.sub',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    true
);
select throws_ok(
    $sql$
        insert into public.club_members (display_name)
        values ('Onbevoegd lid')
    $sql$,
    '42501',
    'permission denied for table club_members',
    'participant kan geen club_member aanmaken'
);
select throws_ok(
    $sql$
        update public.club_members
        set approval_status = 'approved'
        where id = '11111111-1111-4111-8111-111111111111'
    $sql$,
    '42501',
    'permission denied for table club_members',
    'participant kan een club_member niet wijzigen'
);
select throws_ok(
    $sql$
        insert into public.tos_events (
            slug, title, starts_at, ends_at, status, sport, created_by
        )
        values (
            'onbevoegd-event',
            'Onbevoegd',
            '2099-05-01 20:00:00+00',
            '2099-05-01 22:00:00+00',
            'open',
            'padel',
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
        )
    $sql$,
    '42501',
    'permission denied for table tos_events',
    'participant kan geen event aanmaken'
);
select throws_ok(
    $sql$
        update public.tos_events
        set title = 'Onbevoegd gewijzigd'
        where id = '10000000-0000-4000-8000-000000000001'
    $sql$,
    '42501',
    'permission denied for table tos_events',
    'participant kan geen event wijzigen'
);
select throws_ok(
    $sql$
        update public.registrations
        set available_from = '2099-01-01 19:59:00+00'
        where event_id = '10000000-0000-4000-8000-000000000001'
    $sql$,
    '22007',
    'Beschikbaarheid moet binnen de TOS-tijden vallen.',
    'beschikbaarheid voor de eventstart wordt geweigerd'
);
select is(
    (
        select available_from
        from public.registrations
        where event_id = '10000000-0000-4000-8000-000000000001'
    ),
    '2099-01-01 20:30:00+00'::timestamptz,
    'ongeldige beschikbaarheid is niet opgeslagen'
);
select throws_ok(
    $sql$
        insert into public.registrations (event_id, response)
        values ('10000000-0000-4000-8000-000000000002', 'attending')
    $sql$,
    '42501',
    'Zelf-service voor dit TOS-event is gesloten.',
    'gesloten event weigert self-service registratie'
);
select throws_ok(
    $sql$
        insert into public.registrations (event_id, response)
        values ('10000000-0000-4000-8000-000000000003', 'attending')
    $sql$,
    '42501',
    'Zelf-service voor dit TOS-event is gesloten.',
    'verlopen deadline weigert self-service registratie'
);
select lives_ok(
    $sql$
        insert into public.registrations (event_id, response)
        values ('10000000-0000-4000-8000-000000000004', 'attending')
    $sql$,
    'registratie voor deadline-event lukt vóór de deadline'
);

select set_config('request.jwt.claim.sub', '', true);
reset role;
update public.tos_events
set signup_deadline = '2000-01-01 00:00:00+00'
where id = '10000000-0000-4000-8000-000000000004';

set local role authenticated;
select set_config(
    'request.jwt.claim.sub',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    true
);
select lives_ok(
    $sql$
        update public.registrations
        set response = 'declined'
        where event_id = '10000000-0000-4000-8000-000000000004'
    $sql$,
    'RLS verbergt registratie voor self-service update na de deadline'
);
select set_config('request.jwt.claim.sub', '', true);
reset role;
select is(
    (
        select response
        from public.registrations
        where event_id = '10000000-0000-4000-8000-000000000004'
          and user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    ),
    'attending',
    'registratie bleef na de deadline ongewijzigd'
);

select ok(
    (select relrowsecurity from pg_class where oid = 'public.club_members'::regclass),
    'RLS staat aan op club_members'
);
select ok(
    (select relrowsecurity from pg_class where oid = 'public.tos_events'::regclass),
    'RLS staat aan op tos_events'
);
select ok(
    (select relrowsecurity from pg_class where oid = 'public.registrations'::regclass),
    'RLS staat aan op registrations'
);

select * from finish();
rollback;
