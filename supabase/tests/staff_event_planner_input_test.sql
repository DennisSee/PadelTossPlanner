begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(50);

-- Catalogus- en authoritycontract.
select has_function(
    'public',
    'staff_event_planner_input',
    array['uuid'],
    'event-scoped staff plannerinput-RPC bestaat'
);
select is(
    pg_get_function_arguments(
        'public.staff_event_planner_input(uuid)'::regprocedure
    ),
    'p_event_id uuid',
    'RPC accepteert uitsluitend één event-id'
);
select is(
    pg_get_function_result(
        'public.staff_event_planner_input(uuid)'::regprocedure
    ),
    'TABLE(registration_id uuid, user_id uuid, member_id uuid, response text, available_from timestamp with time zone, available_until timestamp with time zone, registration_updated_at timestamp with time zone, display_name text, approval_status text, member_active boolean, sport_profile_active boolean, ranking smallint)',
    'RPC-resultaat is exact de minimale plannerinputprojectie'
);
select is(
    (
        select language.lanname
        from pg_proc as procedure
        join pg_language as language on language.oid = procedure.prolang
        where procedure.oid =
            'public.staff_event_planner_input(uuid)'::regprocedure
    ),
    'sql',
    'RPC is een SQL-functie'
);
select is(
    (
        select procedure.provolatile::text
        from pg_proc as procedure
        where procedure.oid =
            'public.staff_event_planner_input(uuid)'::regprocedure
    ),
    's',
    'RPC is STABLE'
);
select ok(
    (
        select procedure.prosecdef
        from pg_proc as procedure
        where procedure.oid =
            'public.staff_event_planner_input(uuid)'::regprocedure
    ),
    'RPC is SECURITY DEFINER'
);
select is(
    (
        select procedure.proconfig
        from pg_proc as procedure
        where procedure.oid =
            'public.staff_event_planner_input(uuid)'::regprocedure
    ),
    array['search_path=""']::text[],
    'RPC gebruikt exact een lege search_path'
);
select ok(
    not exists (
        select 1
        from pg_proc as procedure
        cross join lateral aclexplode(procedure.proacl) as privilege
        where procedure.oid =
                'public.staff_event_planner_input(uuid)'::regprocedure
          and privilege.grantee = 0
          and privilege.privilege_type = 'EXECUTE'
    ),
    'PUBLIC heeft geen EXECUTE op de RPC'
);
select ok(
    not has_function_privilege(
        'anon',
        'public.staff_event_planner_input(uuid)',
        'EXECUTE'
    ),
    'anon heeft geen EXECUTE op de RPC'
);
select ok(
    has_function_privilege(
        'authenticated',
        'public.staff_event_planner_input(uuid)',
        'EXECUTE'
    ),
    'authenticated mag de RPC aanroepen'
);
select ok(
    position('email' in lower(pg_get_function_result(
        'public.staff_event_planner_input(uuid)'::regprocedure
    ))) = 0,
    'resultaatsignature bevat geen e-mail'
);
select ok(
    position('email' in lower(pg_get_functiondef(
        'public.staff_event_planner_input(uuid)'::regprocedure
    ))) = 0,
    'functiedefinitie leest geen e-mail'
);
select ok(
    position('service_role' in lower(pg_get_functiondef(
        'public.staff_event_planner_input(uuid)'::regprocedure
    ))) = 0,
    'RPC gebruikt geen service-rolecontract'
);
select ok(
    position('viewer.id = auth.uid()' in lower(pg_get_functiondef(
        'public.staff_event_planner_input(uuid)'::regprocedure
    ))) > 0,
    'viewer-authorisatie bindt het eigen profiel aan auth.uid()'
);
select ok(
    position('viewer.active' in lower(pg_get_functiondef(
        'public.staff_event_planner_input(uuid)'::regprocedure
    ))) > 0,
    'viewer-authorisatie vereist een actief profiel'
);
select ok(
    position('viewer.role' in lower(pg_get_functiondef(
        'public.staff_event_planner_input(uuid)'::regprocedure
    ))) > 0
    and position('planner' in lower(pg_get_functiondef(
        'public.staff_event_planner_input(uuid)'::regprocedure
    ))) > 0
    and position('admin' in lower(pg_get_functiondef(
        'public.staff_event_planner_input(uuid)'::regprocedure
    ))) > 0,
    'viewer-authorisatie vereist planner of admin'
);
select ok(
    position('viewer.member_id' in lower(pg_get_functiondef(
        'public.staff_event_planner_input(uuid)'::regprocedure
    ))) = 0
    and position('viewer_member' in lower(pg_get_functiondef(
        'public.staff_event_planner_input(uuid)'::regprocedure
    ))) = 0,
    'viewer-authorisatie bevat geen membershippredicate'
);
select ok(
    position('event.id = p_event_id' in lower(pg_get_functiondef(
        'public.staff_event_planner_input(uuid)'::regprocedure
    ))) > 0
    and position('registration.event_id = p_event_id' in lower(pg_get_functiondef(
        'public.staff_event_planner_input(uuid)'::regprocedure
    ))) > 0,
    'RPC scope is exact p_event_id via de gekoppelde eventrow'
);
select ok(
    position('sport_profile.sport = event.sport' in lower(pg_get_functiondef(
        'public.staff_event_planner_input(uuid)'::regprocedure
    ))) > 0,
    'event.sport bepaalt het gekoppelde sportprofiel'
);
select ok(
    position('event.status' in lower(pg_get_functiondef(
        'public.staff_event_planner_input(uuid)'::regprocedure
    ))) = 0
    and position('event.ends_at' in lower(pg_get_functiondef(
        'public.staff_event_planner_input(uuid)'::regprocedure
    ))) = 0
    and position('event.signup_deadline' in lower(pg_get_functiondef(
        'public.staff_event_planner_input(uuid)'::regprocedure
    ))) = 0,
    'staffread heeft geen eventstatus-, eindtijd- of deadlinefilter'
);
select ok(
    position('registration.response =' in lower(pg_get_functiondef(
        'public.staff_event_planner_input(uuid)'::regprocedure
    ))) > 0,
    'RPC neemt uitsluitend attending-registraties mee'
);
select ok(
    position('registration.attending_since' in lower(pg_get_functiondef(
        'public.staff_event_planner_input(uuid)'::regprocedure
    ))) > 0
    and position('registration.id' in lower(pg_get_functiondef(
        'public.staff_event_planner_input(uuid)'::regprocedure
    ))) > 0,
    'RPC plaatst op attending_since met registratie-id als stabiele tie-break'
);

-- Bestaande tabelrechten blijven ongewijzigd en RLS blijft de directe
-- authenticated registrations-read own-only maken.
select ok(
    (select relrowsecurity from pg_class where oid = 'public.registrations'::regclass)
    and exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'registrations'
          and policyname = 'registrations_select_own'
          and cmd = 'SELECT'
    ),
    'registrations-RLS en own-only SELECT-policy blijven intact'
);
select ok(
    has_table_privilege('authenticated', 'public.registrations', 'SELECT'),
    'bestaande registrations-SELECT blijft aanwezig en door RLS begrensd'
);
select ok(
    not has_table_privilege('authenticated', 'public.registrations', 'INSERT')
    and not has_table_privilege('authenticated', 'public.registrations', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.registrations', 'DELETE')
    and not has_table_privilege('authenticated', 'public.registrations', 'TRUNCATE'),
    'authenticated krijgt geen brede registrations-writes'
);
select ok(
    not has_table_privilege('authenticated', 'public.club_members', 'SELECT')
    and not has_table_privilege('authenticated', 'public.club_members', 'UPDATE'),
    'authenticated krijgt geen brede club_members-read of -update'
);
select ok(
    not has_table_privilege('authenticated', 'public.member_sport_profiles', 'SELECT')
    and not has_table_privilege('authenticated', 'public.member_sport_profiles', 'UPDATE'),
    'authenticated krijgt geen algemene sportprofiel- of rankingrechten'
);
select ok(
    not has_table_privilege('authenticated', 'public.profiles', 'SELECT')
    and not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'),
    'authenticated krijgt geen brede profile-read of -update'
);
select ok(
    not has_table_privilege('authenticated', 'public.club_settings', 'INSERT,UPDATE,DELETE')
    and not has_table_privilege('authenticated', 'public.club_drafts', 'INSERT,UPDATE,DELETE')
    and not has_table_privilege('authenticated', 'public.planner_drafts', 'INSERT,UPDATE,DELETE')
    and not has_table_privilege('authenticated', 'public.schedules', 'INSERT,UPDATE,DELETE'),
    'RPC verbreedt geen writes op overige applicatietabellen'
);

-- Accounts: een participant-member, actieve staff zonder membership en
-- inactieve staff. De overige users dragen de eventregistraties.
insert into auth.users (
    id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
    ('5b000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'viewer-participant@example.test', '{}'::jsonb, '{"display_name":"Viewer Participant"}'::jsonb, now(), now()),
    ('5b000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'viewer-planner@example.test', '{}'::jsonb, '{"display_name":"Viewer Planner"}'::jsonb, now(), now()),
    ('5b000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'viewer-admin@example.test', '{}'::jsonb, '{"display_name":"Viewer Admin"}'::jsonb, now(), now()),
    ('5b000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'viewer-inactive-planner@example.test', '{}'::jsonb, '{"display_name":"Inactive Planner"}'::jsonb, now(), now()),
    ('5b000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'viewer-inactive-admin@example.test', '{}'::jsonb, '{"display_name":"Inactive Admin"}'::jsonb, now(), now()),
    ('5b000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'declined@example.test', '{}'::jsonb, '{"display_name":"Declined"}'::jsonb, now(), now()),
    ('5b000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'pending@example.test', '{}'::jsonb, '{"display_name":"Pending"}'::jsonb, now(), now()),
    ('5b000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'rejected@example.test', '{}'::jsonb, '{"display_name":"Rejected"}'::jsonb, now(), now()),
    ('5b000000-0000-4000-8000-000000000009', 'authenticated', 'authenticated', 'inactive-member@example.test', '{}'::jsonb, '{"display_name":"Inactive Member"}'::jsonb, now(), now()),
    ('5b000000-0000-4000-8000-000000000010', 'authenticated', 'authenticated', 'missing-sport@example.test', '{}'::jsonb, '{"display_name":"Missing Sport"}'::jsonb, now(), now()),
    ('5b000000-0000-4000-8000-000000000011', 'authenticated', 'authenticated', 'inactive-sport@example.test', '{}'::jsonb, '{"display_name":"Inactive Sport"}'::jsonb, now(), now()),
    ('5b000000-0000-4000-8000-000000000012', 'authenticated', 'authenticated', 'missing-ranking@example.test', '{}'::jsonb, '{"display_name":"Missing Ranking"}'::jsonb, now(), now());

insert into public.club_members (id, display_name, approval_status, active)
values
    ('5c000000-0000-4000-8000-000000000001', 'Ready Member', 'approved', true),
    ('5c000000-0000-4000-8000-000000000002', 'Declined Member', 'approved', true),
    ('5c000000-0000-4000-8000-000000000003', 'Pending Member', 'pending', true),
    ('5c000000-0000-4000-8000-000000000004', 'Rejected Member', 'rejected', true),
    ('5c000000-0000-4000-8000-000000000005', 'Inactive Member', 'approved', false),
    ('5c000000-0000-4000-8000-000000000006', 'Missing Sport Member', 'approved', true),
    ('5c000000-0000-4000-8000-000000000007', 'Inactive Sport Member', 'approved', true),
    ('5c000000-0000-4000-8000-000000000008', 'Missing Ranking Member', 'approved', true);

update public.profiles
set role = case id
        when '5b000000-0000-4000-8000-000000000002'::uuid then 'planner'
        when '5b000000-0000-4000-8000-000000000003'::uuid then 'admin'
        when '5b000000-0000-4000-8000-000000000004'::uuid then 'planner'
        when '5b000000-0000-4000-8000-000000000005'::uuid then 'admin'
        else 'participant'
    end,
    active = id not in (
        '5b000000-0000-4000-8000-000000000004'::uuid,
        '5b000000-0000-4000-8000-000000000005'::uuid
    ),
    member_id = case id
        when '5b000000-0000-4000-8000-000000000001'::uuid then '5c000000-0000-4000-8000-000000000001'::uuid
        when '5b000000-0000-4000-8000-000000000006'::uuid then '5c000000-0000-4000-8000-000000000002'::uuid
        when '5b000000-0000-4000-8000-000000000007'::uuid then '5c000000-0000-4000-8000-000000000003'::uuid
        when '5b000000-0000-4000-8000-000000000008'::uuid then '5c000000-0000-4000-8000-000000000004'::uuid
        when '5b000000-0000-4000-8000-000000000009'::uuid then '5c000000-0000-4000-8000-000000000005'::uuid
        when '5b000000-0000-4000-8000-000000000010'::uuid then '5c000000-0000-4000-8000-000000000006'::uuid
        when '5b000000-0000-4000-8000-000000000011'::uuid then '5c000000-0000-4000-8000-000000000007'::uuid
        when '5b000000-0000-4000-8000-000000000012'::uuid then '5c000000-0000-4000-8000-000000000008'::uuid
        else null
    end;

insert into public.member_sport_profiles (member_id, sport, ranking, active)
values
    ('5c000000-0000-4000-8000-000000000001', 'padel', 4, true),
    ('5c000000-0000-4000-8000-000000000001', 'tennis', 2, true),
    ('5c000000-0000-4000-8000-000000000002', 'padel', 3, true),
    ('5c000000-0000-4000-8000-000000000003', 'padel', 3, true),
    ('5c000000-0000-4000-8000-000000000004', 'padel', 4, true),
    ('5c000000-0000-4000-8000-000000000005', 'padel', 5, true),
    ('5c000000-0000-4000-8000-000000000007', 'padel', 2, false),
    ('5c000000-0000-4000-8000-000000000008', 'padel', null, true);

insert into public.tos_events (
    id, slug, title, sport, starts_at, ends_at, signup_deadline, status, created_by
)
values
    (
        '5d000000-0000-4000-8000-000000000001',
        'web5b0-padel', 'WEB-5B0 Padel', 'padel',
        '2099-08-20 18:00:00+00', '2099-08-20 20:00:00+00', null,
        'cancelled', '5b000000-0000-4000-8000-000000000003'
    ),
    (
        '5d000000-0000-4000-8000-000000000002',
        'web5b0-tennis', 'WEB-5B0 Tennis', 'tennis',
        '2099-08-21 18:00:00+00', '2099-08-21 20:00:00+00', null,
        'closed', '5b000000-0000-4000-8000-000000000003'
    );

insert into public.registrations (
    id, event_id, user_id, member_id, response,
    available_from, available_until, source, created_at, updated_at
)
values
    ('5e000000-0000-4000-8000-000000000001', '5d000000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-000000000001', '5c000000-0000-4000-8000-000000000001', 'attending', '2099-08-20 18:00:00+00', '2099-08-20 20:00:00+00', 'self', '2099-01-01 10:01:00+00', '2099-01-02 11:01:00+00'),
    ('5e000000-0000-4000-8000-000000000002', '5d000000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-000000000006', '5c000000-0000-4000-8000-000000000002', 'declined', null, null, 'self', '2099-01-01 10:02:00+00', '2099-01-02 11:02:00+00'),
    ('5e000000-0000-4000-8000-000000000003', '5d000000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-000000000007', '5c000000-0000-4000-8000-000000000003', 'attending', '2099-08-20 18:00:00+00', '2099-08-20 20:00:00+00', 'self', '2099-01-01 10:03:00+00', '2099-01-02 11:03:00+00'),
    ('5e000000-0000-4000-8000-000000000004', '5d000000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-000000000008', '5c000000-0000-4000-8000-000000000004', 'attending', '2099-08-20 18:10:00+00', '2099-08-20 19:50:00+00', 'self', '2099-01-01 10:04:00+00', '2099-01-02 11:04:00+00'),
    ('5e000000-0000-4000-8000-000000000005', '5d000000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-000000000009', '5c000000-0000-4000-8000-000000000005', 'attending', '2099-08-20 18:00:00+00', '2099-08-20 20:00:00+00', 'self', '2099-01-01 10:05:00+00', '2099-01-02 11:05:00+00'),
    ('5e000000-0000-4000-8000-000000000006', '5d000000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-000000000010', '5c000000-0000-4000-8000-000000000006', 'attending', '2099-08-20 18:00:00+00', '2099-08-20 20:00:00+00', 'self', '2099-01-01 10:06:00+00', '2099-01-02 11:06:00+00'),
    ('5e000000-0000-4000-8000-000000000007', '5d000000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-000000000011', '5c000000-0000-4000-8000-000000000007', 'attending', '2099-08-20 18:00:00+00', '2099-08-20 20:00:00+00', 'self', '2099-01-01 10:07:00+00', '2099-01-02 11:07:00+00'),
    ('5e000000-0000-4000-8000-000000000008', '5d000000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-000000000012', '5c000000-0000-4000-8000-000000000008', 'attending', '2099-08-20 18:00:00+00', '2099-08-20 20:00:00+00', 'self', '2099-01-01 10:07:00+00', '2099-01-02 11:08:00+00'),
    ('5e000000-0000-4000-8000-000000000009', '5d000000-0000-4000-8000-000000000002', '5b000000-0000-4000-8000-000000000001', '5c000000-0000-4000-8000-000000000001', 'attending', '2099-08-21 18:00:00+00', '2099-08-21 20:00:00+00', 'self', '2099-01-01 10:08:00+00', '2099-01-02 11:09:00+00');

select is(
    (
        select count(*)
        from public.profiles
        where id in (
            '5b000000-0000-4000-8000-000000000002',
            '5b000000-0000-4000-8000-000000000003'
        )
          and member_id is null
    ),
    2::bigint,
    'actieve planner en admin hebben voor staffread geen membership'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '5b000000-0000-4000-8000-000000000002', true);
select is(
    (select count(*) from public.staff_event_planner_input(
        '5d000000-0000-4000-8000-000000000001'
    )),
    7::bigint,
    'actieve planner zonder membership leest alleen geplaatste attending-registraties'
);
select is(
    (select count(*) from public.registrations),
    0::bigint,
    'dezelfde planner kan registrations niet direct cross-user lezen'
);
select results_eq(
    $sql$
        select registration_id
        from public.staff_event_planner_input(
            '5d000000-0000-4000-8000-000000000001'
        )
    $sql$,
    $values$
        values
            ('5e000000-0000-4000-8000-000000000001'::uuid),
            ('5e000000-0000-4000-8000-000000000003'::uuid),
            ('5e000000-0000-4000-8000-000000000004'::uuid),
            ('5e000000-0000-4000-8000-000000000005'::uuid),
            ('5e000000-0000-4000-8000-000000000006'::uuid),
            ('5e000000-0000-4000-8000-000000000007'::uuid),
            ('5e000000-0000-4000-8000-000000000008'::uuid)
    $values$,
    'plannerinput bevat uitsluitend attending-registraties in plaatsingsvolgorde'
);
select results_eq(
    $sql$
        select distinct response
        from public.staff_event_planner_input(
            '5d000000-0000-4000-8000-000000000001'
        )
        order by response
    $sql$,
    $values$values ('attending'::text)$values$,
    'declined wordt uitgesloten van plannerinput'
);
select results_eq(
    $sql$
        select display_name, approval_status, member_active
        from public.staff_event_planner_input(
            '5d000000-0000-4000-8000-000000000001'
        )
        where display_name in ('Pending Member', 'Rejected Member', 'Inactive Member')
        order by display_name
    $sql$,
    $values$
        values
            ('Inactive Member'::text, 'approved'::text, false),
            ('Pending Member'::text, 'pending'::text, true),
            ('Rejected Member'::text, 'rejected'::text, true)
    $values$,
    'pending, rejected en inactieve members blijven met feitelijke status zichtbaar'
);
select results_eq(
    $sql$
        select sport_profile_active, ranking
        from public.staff_event_planner_input(
            '5d000000-0000-4000-8000-000000000001'
        )
        where member_id = '5c000000-0000-4000-8000-000000000006'
    $sql$,
    $values$values (false, null::smallint)$values$,
    'ontbrekend sportprofiel wordt false/null en verbergt de row niet'
);
select results_eq(
    $sql$
        select sport_profile_active, ranking
        from public.staff_event_planner_input(
            '5d000000-0000-4000-8000-000000000001'
        )
        where member_id = '5c000000-0000-4000-8000-000000000007'
    $sql$,
    $values$values (false, 2::smallint)$values$,
    'inactief sportprofiel behoudt de opgeslagen ranking'
);
select results_eq(
    $sql$
        select sport_profile_active, ranking
        from public.staff_event_planner_input(
            '5d000000-0000-4000-8000-000000000001'
        )
        where member_id = '5c000000-0000-4000-8000-000000000008'
    $sql$,
    $values$values (true, null::smallint)$values$,
    'actief sportprofiel met ontbrekende ranking blijft zichtbaar'
);
select is(
    (
        select ranking
        from public.staff_event_planner_input(
            '5d000000-0000-4000-8000-000000000001'
        )
        where member_id = '5c000000-0000-4000-8000-000000000001'
    ),
    4::smallint,
    'padel-event gebruikt de padelranking'
);
select results_eq(
    $sql$
        select registration_id, user_id, member_id, response,
               available_from, available_until, registration_updated_at,
               display_name, approval_status, member_active,
               sport_profile_active, ranking
        from public.staff_event_planner_input(
            '5d000000-0000-4000-8000-000000000001'
        )
        where registration_id = '5e000000-0000-4000-8000-000000000004'
    $sql$,
    $values$
        values (
            '5e000000-0000-4000-8000-000000000004'::uuid,
            '5b000000-0000-4000-8000-000000000008'::uuid,
            '5c000000-0000-4000-8000-000000000004'::uuid,
            'attending'::text,
            '2099-08-20 18:10:00+00'::timestamptz,
            '2099-08-20 19:50:00+00'::timestamptz,
            '2099-01-02 11:04:00+00'::timestamptz,
            'Rejected Member'::text,
            'rejected'::text,
            true,
            true,
            4::smallint
        )
    $values$,
    'exacte stabiele identities, availability en readinessbrondata worden geretourneerd'
);
select is(
    (
        select registration_updated_at
        from public.staff_event_planner_input(
            '5d000000-0000-4000-8000-000000000001'
        )
        where registration_id = '5e000000-0000-4000-8000-000000000001'
    ),
    '2099-01-02 11:01:00+00'::timestamptz,
    'registration_updated_at komt exact uit registrations.updated_at'
);
select is(
    (select count(*) from public.staff_event_planner_input(
        '5d000000-0000-4000-8000-000000000002'
    )),
    1::bigint,
    'tennisevent retourneert uitsluitend de eigen eventregistratie'
);
select is(
    (
        select ranking
        from public.staff_event_planner_input(
            '5d000000-0000-4000-8000-000000000002'
        )
        where member_id = '5c000000-0000-4000-8000-000000000001'
    ),
    2::smallint,
    'tennisevent gebruikt voor dezelfde member uitsluitend de tennisranking'
);
select is(
    (select count(*) from public.staff_event_planner_input(
        '5d000000-0000-4000-8000-000000000099'
    )),
    0::bigint,
    'onbekend event levert veilig geen rows'
);

select set_config('request.jwt.claim.sub', '5b000000-0000-4000-8000-000000000003', true);
select is(
    (select count(*) from public.staff_event_planner_input(
        '5d000000-0000-4000-8000-000000000001'
    )),
    7::bigint,
    'actieve admin zonder membership leest dezelfde eventscope'
);

select set_config('request.jwt.claim.sub', '5b000000-0000-4000-8000-000000000001', true);
select is(
    (select count(*) from public.staff_event_planner_input(
        '5d000000-0000-4000-8000-000000000001'
    )),
    0::bigint,
    'approved participant-member krijgt geen staffresultaat'
);
select is(
    (select count(*) from public.registrations),
    2::bigint,
    'participant houdt uitsluitend de bestaande eigen registrations-read'
);

select set_config('request.jwt.claim.sub', '5b000000-0000-4000-8000-000000000004', true);
select is(
    (select count(*) from public.staff_event_planner_input(
        '5d000000-0000-4000-8000-000000000001'
    )),
    0::bigint,
    'inactieve planner krijgt geen staffresultaat'
);

select set_config('request.jwt.claim.sub', '5b000000-0000-4000-8000-000000000005', true);
select is(
    (select count(*) from public.staff_event_planner_input(
        '5d000000-0000-4000-8000-000000000001'
    )),
    0::bigint,
    'inactieve admin krijgt geen staffresultaat'
);

select set_config('request.jwt.claim.sub', '', true);
reset role;
set local role anon;
select throws_ok(
    $sql$
        select *
        from public.staff_event_planner_input(
            '5d000000-0000-4000-8000-000000000001'
        )
    $sql$,
    '42501',
    null,
    'anon kan de RPC niet uitvoeren'
);
reset role;

select * from finish();
rollback;
