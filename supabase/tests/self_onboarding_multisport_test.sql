begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(69);

select has_table('public', 'club_settings', 'club_settings bestaat');
select has_table('public', 'member_sport_profiles', 'member_sport_profiles bestaat');
select has_pk('public', 'club_settings', 'club_settings heeft een primary key');
select has_pk(
    'public',
    'member_sport_profiles',
    'member_sport_profiles heeft een samengestelde primary key'
);
select col_is_fk(
    'public',
    'member_sport_profiles',
    'member_id',
    'sportprofiel verwijst naar de sportneutrale memberidentiteit'
);
select has_index(
    'public',
    'member_sport_profiles',
    'member_sport_profiles_sport_active_idx',
    'sportprofielen hebben de lookup-index'
);
select ok(
    (
        select relrowsecurity
        from pg_class
        where oid = 'public.club_settings'::regclass
    ),
    'RLS staat aan op club_settings'
);
select ok(
    (
        select relrowsecurity
        from pg_class
        where oid = 'public.member_sport_profiles'::regclass
    ),
    'RLS staat aan op member_sport_profiles'
);
select has_column('public', 'club_members', 'approval_status', 'club_members heeft approval_status');
select has_column('public', 'tos_events', 'sport', 'tos_events heeft sport');
select ok(
    not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'club_members'
          and column_name = 'ranking'
    ),
    'club_members bevat geen sportafhankelijke ranking meer'
);
select is(
    (select require_member_approval from public.club_settings where id = 'club'),
    false,
    'approval-setting staat standaard uit'
);
select is(
    (
        select column_default::text
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'tos_events'
          and column_name = 'sport'
    ),
    null::text,
    'nieuwe events moeten sport expliciet opgeven'
);
select is(
    (
        select column_default::text
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'tos_events'
          and column_name = 'title'
    ),
    '''TOS-avond''::text'::text,
    'de standaard eventtitel is sportneutraal'
);
select ok(
    not has_function_privilege('anon', 'public.self_onboard_member(text)', 'EXECUTE'),
    'anon kan de onboarding-RPC niet uitvoeren'
);
select ok(
    has_function_privilege('authenticated', 'public.self_onboard_member(text)', 'EXECUTE'),
    'authenticated kan de narrowly scoped onboarding-RPC uitvoeren'
);
select ok(
    not has_table_privilege('authenticated', 'public.club_settings', 'SELECT'),
    'participant hoeft club_settings niet te lezen'
);
select ok(
    not has_table_privilege('authenticated', 'public.club_settings', 'UPDATE'),
    'participant kan club_settings niet wijzigen'
);
select ok(
    not has_table_privilege('authenticated', 'public.club_members', 'INSERT'),
    'participant heeft geen algemene INSERT op club_members'
);
select ok(
    not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'),
    'participant heeft geen algemene UPDATE op profiles'
);
select ok(
    not has_table_privilege('authenticated', 'public.member_sport_profiles', 'INSERT'),
    'participant kan geen eigen sportprofiel of ranking aanmaken'
);
select ok(
    not has_table_privilege('authenticated', 'public.member_sport_profiles', 'SELECT'),
    'participant hoeft sportprofielen in C1 niet te lezen'
);
select ok(
    has_table_privilege('service_role', 'public.club_settings', 'UPDATE'),
    'service-side beheer kan de approval-setting later wijzigen'
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
        'a1000000-0000-4000-8000-000000000001',
        'authenticated',
        'authenticated',
        'onboard-a@example.test',
        '{}'::jsonb,
        '{"display_name":"Onboard A"}'::jsonb,
        now(),
        now()
    ),
    (
        'b1000000-0000-4000-8000-000000000002',
        'authenticated',
        'authenticated',
        'onboard-b@example.test',
        '{}'::jsonb,
        '{"display_name":"Onboard B"}'::jsonb,
        now(),
        now()
    ),
    (
        'c1000000-0000-4000-8000-000000000003',
        'authenticated',
        'authenticated',
        'planner-c1@example.test',
        '{}'::jsonb,
        '{"display_name":"Planner C1"}'::jsonb,
        now(),
        now()
    ),
    (
        'd1000000-0000-4000-8000-000000000004',
        'authenticated',
        'authenticated',
        'admin-c1@example.test',
        '{}'::jsonb,
        '{"display_name":"Admin C1"}'::jsonb,
        now(),
        now()
    );

select is(
    (select role from public.profiles where id = 'a1000000-0000-4000-8000-000000000001'),
    'participant',
    'nieuwe user A is participant'
);
select is(
    (select role from public.profiles where id = 'b1000000-0000-4000-8000-000000000002'),
    'participant',
    'nieuwe user B is participant'
);

update public.profiles
set role = 'planner'
where id = 'c1000000-0000-4000-8000-000000000003';
update public.profiles
set role = 'admin'
where id = 'd1000000-0000-4000-8000-000000000004';

select is(
    (select role from public.profiles where id = 'c1000000-0000-4000-8000-000000000003'),
    'planner',
    'bestaande plannerrol blijft geldig'
);
select is(
    (select role from public.profiles where id = 'd1000000-0000-4000-8000-000000000004'),
    'admin',
    'bestaande adminrol blijft geldig'
);

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
    'e1000000-0000-4000-8000-000000000001',
    'c1-padel-event',
    'C1 Padel TOS',
    'padel',
    '2099-06-01 20:00:00+00',
    '2099-06-01 22:00:00+00',
    '2099-05-31 20:00:00+00',
    'open',
    'c1000000-0000-4000-8000-000000000003'
);

set local role authenticated;
select set_config(
    'request.jwt.claim.sub',
    'a1000000-0000-4000-8000-000000000001',
    true
);

select lives_ok(
    $sql$select * from public.self_onboard_member('  Onboard A  ')$sql$,
    'onboarding bij setting uit slaagt'
);
select ok(
    (
        select member_id is not null
        from public.profiles
        where id = 'a1000000-0000-4000-8000-000000000001'
    ),
    'onboarding koppelt het eigen profiel'
);
select is(
    (
        select member.approval_status
        from public.club_members as member
        join public.profiles as profile on profile.member_id = member.id
        where profile.id = 'a1000000-0000-4000-8000-000000000001'
    ),
    'approved',
    'onboarding bij setting uit resulteert in approved'
);

select set_config('request.jwt.claim.sub', '', true);
reset role;

select is(
    (
        select count(*)
        from public.member_sport_profiles as sport_profile
        join public.profiles as profile on profile.member_id = sport_profile.member_id
        where profile.id = 'a1000000-0000-4000-8000-000000000001'
    ),
    0::bigint,
    'self-onboarding maakt geen user-controlled ranking of sportprofiel'
);

set local role authenticated;
select set_config(
    'request.jwt.claim.sub',
    'a1000000-0000-4000-8000-000000000001',
    true
);

select is(
    (
        select count(*)
        from public.club_members as member
        join public.profiles as profile on profile.member_id = member.id
        where profile.id = 'a1000000-0000-4000-8000-000000000001'
    ),
    1::bigint,
    'één Auth-account levert exact één memberidentiteit op'
);
select throws_ok(
    $sql$select * from public.self_onboard_member('Tweede identiteit')$sql$,
    '23505',
    'Dit account is al aan een clublid gekoppeld.',
    'dubbele onboarding wordt veilig geweigerd'
);
select ok(
    position(
        'FOR UPDATE' in upper(
            pg_get_functiondef('public.self_onboard_member(text)'::regprocedure)
        )
    ) > 0,
    'onboarding serialiseert gelijktijdige verzoeken met een row lock'
);
select throws_ok(
    $sql$
        update public.profiles
        set role = 'admin'
        where id = 'a1000000-0000-4000-8000-000000000001'
    $sql$,
    '42501',
    null,
    'participant kan zichzelf geen admin maken'
);
select throws_ok(
    $sql$
        update public.profiles
        set member_id = null
        where id = 'a1000000-0000-4000-8000-000000000001'
    $sql$,
    '42501',
    null,
    'participant kan member_id niet algemeen wijzigen'
);
select throws_ok(
    $sql$
        update public.club_members
        set approval_status = 'approved'
    $sql$,
    '42501',
    null,
    'participant kan approval-status niet manipuleren'
);
select throws_ok(
    $sql$
        update public.club_settings
        set require_member_approval = true
        where id = 'club'
    $sql$,
    '42501',
    null,
    'participant kan require_member_approval niet wijzigen'
);
select throws_ok(
    $sql$select require_member_approval from public.club_settings$sql$,
    '42501',
    null,
    'participant kan de interne approval-setting niet lezen'
);

select set_config('request.jwt.claim.sub', '', true);
reset role;

update public.club_settings
set require_member_approval = true
where id = 'club';

select is(
    (select require_member_approval from public.club_settings where id = 'club'),
    true,
    'approval-setting kan service-side aan worden gezet'
);
select is(
    (
        select member.approval_status
        from public.club_members as member
        join public.profiles as profile on profile.member_id = member.id
        where profile.id = 'a1000000-0000-4000-8000-000000000001'
    ),
    'approved',
    'setting aanzetten herschrijft bestaande approved member niet'
);

set local role authenticated;
select set_config(
    'request.jwt.claim.sub',
    'b1000000-0000-4000-8000-000000000002',
    true
);

select lives_ok(
    $sql$select * from public.self_onboard_member('Onboard B')$sql$,
    'onboarding bij setting aan slaagt als pending'
);
select is(
    (
        select approval_status
        from public.club_members
    ),
    'pending',
    'user B leest via RLS de eigen pending approval-status'
);
select ok(
    (
        select active
        from public.profiles
        where id = 'b1000000-0000-4000-8000-000000000002'
    ),
    'account active blijft losstaan van pending membership approval'
);
select throws_ok(
    $sql$
        insert into public.registrations (event_id, response)
        values ('e1000000-0000-4000-8000-000000000001', 'attending')
    $sql$,
    '42501',
    'Een goedgekeurde actieve ledenkoppeling is vereist voor zelf-aanmelding.',
    'pending user kan geen registration maken'
);

select set_config('request.jwt.claim.sub', '', true);
reset role;

update public.club_settings
set require_member_approval = false
where id = 'club';

select is(
    (
        select member.approval_status
        from public.club_members as member
        join public.profiles as profile on profile.member_id = member.id
        where profile.id = 'b1000000-0000-4000-8000-000000000002'
    ),
    'pending',
    'setting uitzetten herschrijft bestaande pending member niet'
);

set local role authenticated;
select set_config(
    'request.jwt.claim.sub',
    'a1000000-0000-4000-8000-000000000001',
    true
);

select lives_ok(
    $sql$
        insert into public.registrations (event_id, response)
        values ('e1000000-0000-4000-8000-000000000001', 'attending')
    $sql$,
    'approved user behoudt registrationmogelijkheden'
);
select is(
    (
        select event.sport
        from public.registrations as registration
        join public.tos_events as event on event.id = registration.event_id
        where registration.user_id = 'a1000000-0000-4000-8000-000000000001'
    ),
    'padel',
    'registration-sport is ondubbelzinnig via event_id'
);
select throws_ok(
    $sql$
        update public.profiles
        set member_id = (
            select member_id
            from public.profiles
            where id = 'b1000000-0000-4000-8000-000000000002'
        )
        where id = 'a1000000-0000-4000-8000-000000000001'
    $sql$,
    '42501',
    null,
    'user A kan member van B niet claimen'
);
select throws_ok(
    $sql$
        update public.profiles
        set member_id = null
        where id = 'b1000000-0000-4000-8000-000000000002'
    $sql$,
    '42501',
    null,
    'user A kan onboarding van B niet beïnvloeden'
);
select is(
    (
        select count(*)
        from public.club_members
        where id = (
            select member_id
            from public.profiles
            where id = 'b1000000-0000-4000-8000-000000000002'
        )
    ),
    0::bigint,
    'RLS verbergt de memberidentiteit van user B voor user A'
);

select set_config('request.jwt.claim.sub', '', true);
reset role;

select lives_ok(
    $sql$
        insert into public.member_sport_profiles (member_id, sport, ranking)
        select member_id, 'padel', 3
        from public.profiles
        where id = 'a1000000-0000-4000-8000-000000000001';

        insert into public.member_sport_profiles (member_id, sport, ranking)
        select member_id, 'tennis', 5
        from public.profiles
        where id = 'a1000000-0000-4000-8000-000000000001'
    $sql$,
    'één member kan padel- en tennissportprofielen hebben'
);
select is(
    (
        select count(*)
        from public.member_sport_profiles as sport_profile
        join public.profiles as profile on profile.member_id = sport_profile.member_id
        where profile.id = 'a1000000-0000-4000-8000-000000000001'
    ),
    2::bigint,
    'één clubidentiteit heeft twee onafhankelijke sportprofielen'
);
select results_eq(
    $sql$
        select sport, ranking::integer
        from public.member_sport_profiles as sport_profile
        join public.profiles as profile on profile.member_id = sport_profile.member_id
        where profile.id = 'a1000000-0000-4000-8000-000000000001'
        order by sport
    $sql$,
    $sql$values ('padel', 3), ('tennis', 5)$sql$,
    'padel- en tennisranking kunnen onafhankelijk verschillen'
);
select throws_ok(
    $sql$
        insert into public.member_sport_profiles (member_id, sport, ranking)
        select member_id, 'badminton', 3
        from public.profiles
        where id = 'b1000000-0000-4000-8000-000000000002'
    $sql$,
    '23514',
    null,
    'ongeldige sportwaarde in member_sport_profiles wordt geweigerd'
);
select throws_ok(
    $sql$
        update public.member_sport_profiles
        set ranking = 6
        where sport = 'padel'
    $sql$,
    '23514',
    null,
    'ongeldige sportspecifieke ranking wordt geweigerd'
);
select throws_ok(
    $sql$
        insert into public.tos_events (
            slug, title, sport, starts_at, ends_at, status, created_by
        )
        values (
            'bad-sport-event',
            'Ongeldige sport',
            'badminton',
            '2099-07-01 20:00:00+00',
            '2099-07-01 22:00:00+00',
            'open',
            'c1000000-0000-4000-8000-000000000003'
        )
    $sql$,
    '23514',
    null,
    'ongeldige event-sport wordt geweigerd'
);
select throws_ok(
    $sql$
        insert into public.tos_events (
            slug, title, starts_at, ends_at, status, created_by
        )
        values (
            'missing-sport-event',
            'Sport ontbreekt',
            '2099-07-01 20:00:00+00',
            '2099-07-01 22:00:00+00',
            'open',
            'c1000000-0000-4000-8000-000000000003'
        )
    $sql$,
    '23502',
    null,
    'nieuw event zonder expliciete sport wordt geweigerd'
);
select lives_ok(
    $sql$
        insert into public.tos_events (
            slug, title, sport, starts_at, ends_at, status, created_by
        )
        values (
            'future-tennis-event',
            'Toekomstige Tennis TOS',
            'tennis',
            '2099-08-01 20:00:00+00',
            '2099-08-01 22:00:00+00',
            'draft',
            'c1000000-0000-4000-8000-000000000003'
        )
    $sql$,
    'tennis is datamodelmatig ondersteund zonder tennis-UI'
);
select throws_ok(
    $sql$
        update public.club_members
        set approval_status = 'self-approved'
        where id = (
            select member_id
            from public.profiles
            where id = 'a1000000-0000-4000-8000-000000000001'
        )
    $sql$,
    '23514',
    null,
    'ongeldige approval-status wordt geweigerd'
);
select is(
    (select require_member_approval from public.club_settings where id = 'club'),
    false,
    'approval-setting eindigt uit zonder statusrewrites'
);
select is(
    (select count(*) from public.club_members),
    2::bigint,
    'alleen de twee onboardende participant-accounts kregen een memberidentiteit'
);
select throws_ok(
    $sql$
        insert into public.club_settings (id, require_member_approval)
        values ('andere-club', false)
    $sql$,
    '23514',
    null,
    'club_settings blijft een minimale singleton'
);

update public.tos_events
set status = 'open'
where slug = 'future-tennis-event';

set local role authenticated;
select set_config(
    'request.jwt.claim.sub',
    'a1000000-0000-4000-8000-000000000001',
    true
);
select lives_ok(
    $sql$
        insert into public.registrations (event_id, response)
        select id, 'attending'
        from public.tos_events
        where slug = 'future-tennis-event'
    $sql$,
    'approved participant gebruikt dezelfde registratieflow voor tennis'
);
select results_eq(
    $sql$
        select event.sport,
               registration.response,
               registration.available_from,
               registration.available_until
        from public.registrations as registration
        join public.tos_events as event on event.id = registration.event_id
        where event.slug = 'future-tennis-event'
    $sql$,
    $sql$
        values (
            'tennis',
            'attending',
            '2099-08-01 20:00:00+00'::timestamptz,
            '2099-08-01 22:00:00+00'::timestamptz
        )
    $sql$,
    'tennisregistratie krijgt dezelfde database-side standaardtijden'
);
select lives_ok(
    $sql$
        update public.registrations
        set response = 'declined'
        where event_id = (
            select id from public.tos_events where slug = 'future-tennis-event'
        )
    $sql$,
    'eigen tennisregistratie kan generiek worden afgemeld'
);
select results_eq(
    $sql$
        select response, available_from, available_until
        from public.registrations
        where event_id = (
            select id from public.tos_events where slug = 'future-tennis-event'
        )
    $sql$,
    $sql$values ('declined', null::timestamptz, null::timestamptz)$sql$,
    'afmelden verwijdert beschikbaarheid database-side'
);
select set_config('request.jwt.claim.sub', '', true);
reset role;

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
        'e1000000-0000-4000-8000-000000000005',
        'authenticated',
        'authenticated',
        'rejected-c2@example.test',
        '{}'::jsonb,
        '{"display_name":"Rejected C2"}'::jsonb,
        now(),
        now()
    ),
    (
        'f1000000-0000-4000-8000-000000000006',
        'authenticated',
        'authenticated',
        'inactive-c2@example.test',
        '{}'::jsonb,
        '{"display_name":"Inactive C2"}'::jsonb,
        now(),
        now()
    );

insert into public.club_members (id, display_name, approval_status, active)
values
    (
        'e2000000-0000-4000-8000-000000000005',
        'Rejected C2',
        'rejected',
        true
    ),
    (
        'f2000000-0000-4000-8000-000000000006',
        'Inactive C2',
        'approved',
        false
    );

update public.profiles
set member_id = case id
    when 'e1000000-0000-4000-8000-000000000005'::uuid
        then 'e2000000-0000-4000-8000-000000000005'::uuid
    when 'f1000000-0000-4000-8000-000000000006'::uuid
        then 'f2000000-0000-4000-8000-000000000006'::uuid
end
where id in (
    'e1000000-0000-4000-8000-000000000005',
    'f1000000-0000-4000-8000-000000000006'
);

set local role authenticated;
select set_config(
    'request.jwt.claim.sub',
    'e1000000-0000-4000-8000-000000000005',
    true
);
select throws_ok(
    $sql$
        insert into public.registrations (event_id, response)
        select id, 'attending'
        from public.tos_events
        where slug = 'future-tennis-event'
    $sql$,
    '42501',
    'Een goedgekeurde actieve ledenkoppeling is vereist voor zelf-aanmelding.',
    'rejected participant kan niet registreren'
);
select set_config(
    'request.jwt.claim.sub',
    'f1000000-0000-4000-8000-000000000006',
    true
);
select throws_ok(
    $sql$
        insert into public.registrations (event_id, response)
        select id, 'attending'
        from public.tos_events
        where slug = 'future-tennis-event'
    $sql$,
    '42501',
    'Een goedgekeurde actieve ledenkoppeling is vereist voor zelf-aanmelding.',
    'inactieve participant kan niet registreren'
);
select set_config('request.jwt.claim.sub', '', true);
reset role;

select * from finish();
rollback;
