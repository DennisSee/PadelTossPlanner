begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

-- Schema- en privilegecontracten.
select col_type_is('public', 'tos_events', 'max_participants', 'integer',
    'eventcapaciteit is een integer');
select col_not_null('public', 'tos_events', 'max_participants',
    'eventcapaciteit is verplicht');
select col_default_is('public', 'tos_events', 'max_participants', '24',
    'nieuwe events krijgen de eenvoudige fresh-startcapaciteit 24');
select col_type_is('public', 'registrations', 'attending_since', 'timestamp with time zone',
    'registratievolgorde gebruikt een server-side tijdstip');
select ok(
    exists (
        select 1 from pg_constraint
        where conname = 'tos_events_max_participants_check'
          and conrelid = 'public.tos_events'::regclass
    ),
    'positieve eventcapaciteit is database-side begrensd'
);
select ok(
    exists (
        select 1 from pg_constraint
        where conname = 'registrations_attending_since_check'
          and conrelid = 'public.registrations'::regclass
    ),
    'response en attending_since blijven database-side consistent'
);
select ok(
    exists (
        select 1 from pg_indexes
        where schemaname = 'public'
          and indexname = 'registrations_event_attending_order_idx'
    ),
    'plaatsingsvolgorde heeft een gericht gedeeltelijk index'
);
select ok(
    has_column_privilege('authenticated', 'public.tos_events', 'max_participants', 'SELECT')
    and has_column_privilege('authenticated', 'public.tos_events', 'max_participants', 'INSERT')
    and has_column_privilege('authenticated', 'public.tos_events', 'max_participants', 'UPDATE'),
    'authenticated heeft alleen de benodigde eventkolomprivileges; RLS blijft leidend'
);
select ok(
    not has_column_privilege('authenticated', 'public.registrations', 'attending_since', 'INSERT')
    and not has_column_privilege('authenticated', 'public.registrations', 'attending_since', 'UPDATE'),
    'de browser kan attending_since nooit schrijven'
);
select ok(
    not has_table_privilege('authenticated', 'public.member_sport_profiles', 'SELECT')
    and not has_table_privilege('authenticated', 'public.member_sport_profiles', 'INSERT')
    and not has_table_privilege('authenticated', 'public.member_sport_profiles', 'UPDATE'),
    'ledenbeheer voegt geen brede sportprofielrechten toe'
);

select has_function('public', 'participant_event_capacity', array['uuid'],
    'participantcapaciteit-RPC bestaat');
select has_function('public', 'participant_event_attendance', array['uuid'],
    'smalle participantdeelnemers-RPC bestaat');
select has_function('public', 'participant_own_registration_position', array['uuid'],
    'eigen plaatsings-RPC bestaat');
select has_function('public', 'staff_event_capacity_summaries', array[]::text[],
    'staffcapaciteit-RPC bestaat');
select has_function('public', 'staff_event_registration_overview', array['uuid'],
    'staffregistratieoverzicht-RPC bestaat');
select has_function('public', 'staff_member_directory', array[]::text[],
    'smalle ledenlijst-RPC bestaat');
select has_function('public', 'staff_update_member_sport_profile',
    array['uuid', 'text', 'boolean', 'smallint'], 'smalle sportprofielwrite-RPC bestaat');

select is(
    pg_get_function_result('public.participant_event_attendance(uuid)'::regprocedure),
    'TABLE(display_name text, placement_status text, waitlist_position bigint)',
    'participantprojectie bevat uitsluitend naam en afgeleide plaatsing'
);
select ok(
    (
        select bool_and(procedure.prosecdef)
           and bool_and(procedure.proconfig = array['search_path=""']::text[])
        from pg_proc as procedure
        where procedure.oid in (
            'public.participant_event_capacity(uuid)'::regprocedure,
            'public.participant_event_attendance(uuid)'::regprocedure,
            'public.participant_own_registration_position(uuid)'::regprocedure,
            'public.staff_event_capacity_summaries()'::regprocedure,
            'public.staff_event_registration_overview(uuid)'::regprocedure,
            'public.staff_event_planner_input(uuid)'::regprocedure,
            'public.staff_member_directory()'::regprocedure,
            'public.staff_update_member_sport_profile(uuid,text,boolean,smallint)'::regprocedure
        )
    ),
    'alle nieuwe read/write-RPCs zijn SECURITY DEFINER met lege search_path'
);
select ok(
    has_function_privilege('authenticated', 'public.participant_event_capacity(uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.staff_member_directory()', 'EXECUTE')
    and not has_function_privilege('anon', 'public.participant_event_capacity(uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.staff_member_directory()', 'EXECUTE'),
    'alleen authenticated kan de nieuwe contracts uitvoeren'
);
select ok(
    position('viewer.role' in lower(pg_get_functiondef(
        'public.participant_event_attendance(uuid)'::regprocedure
    ))) = 0,
    'participantzichtbaarheid hangt niet af van staffrol'
);
select ok(
    position('viewer.role' in lower(pg_get_functiondef(
        'public.staff_member_directory()'::regprocedure
    ))) > 0
    and position('viewer.member_id' in lower(pg_get_functiondef(
        'public.staff_member_directory()'::regprocedure
    ))) = 0,
    'staffledenbeheer vereist role maar geen membership'
);

-- Fresh-start testdata: nieuwe events en nieuwe registrations zijn leidend.
insert into auth.users (
    id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
    ('a6100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'alpha@example.test', '{}', '{"display_name":"Alpha"}', now(), now()),
    ('a6100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'bravo@example.test', '{}', '{"display_name":"Bravo"}', now(), now()),
    ('a6100000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'charlie@example.test', '{}', '{"display_name":"Charlie"}', now(), now()),
    ('a6100000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'nomember@example.test', '{}', '{"display_name":"No Member"}', now(), now()),
    ('a6100000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'planner@example.test', '{}', '{"display_name":"Planner"}', now(), now()),
    ('a6100000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'admin@example.test', '{}', '{"display_name":"Admin"}', now(), now()),
    ('a6100000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'inactive@example.test', '{}', '{"display_name":"Inactive Planner"}', now(), now());

insert into public.club_members (id, display_name, approval_status, active)
values
    ('b6100000-0000-4000-8000-000000000001', 'Alpha', 'approved', true),
    ('b6100000-0000-4000-8000-000000000002', 'Bravo', 'approved', true),
    ('b6100000-0000-4000-8000-000000000003', 'Charlie', 'approved', true),
    ('b6100000-0000-4000-8000-000000000004', 'Pending Lid', 'pending', true);

update public.profiles
set member_id = case id
        when 'a6100000-0000-4000-8000-000000000001'::uuid then 'b6100000-0000-4000-8000-000000000001'::uuid
        when 'a6100000-0000-4000-8000-000000000002'::uuid then 'b6100000-0000-4000-8000-000000000002'::uuid
        when 'a6100000-0000-4000-8000-000000000003'::uuid then 'b6100000-0000-4000-8000-000000000003'::uuid
        else null
    end,
    role = case id
        when 'a6100000-0000-4000-8000-000000000005'::uuid then 'planner'
        when 'a6100000-0000-4000-8000-000000000006'::uuid then 'admin'
        when 'a6100000-0000-4000-8000-000000000007'::uuid then 'planner'
        else 'participant'
    end,
    active = id <> 'a6100000-0000-4000-8000-000000000007'::uuid
where id::text like 'a6100000-%';

insert into public.member_sport_profiles (member_id, sport, active, ranking)
values
    ('b6100000-0000-4000-8000-000000000001', 'padel', true, 4),
    ('b6100000-0000-4000-8000-000000000002', 'padel', true, 3),
    ('b6100000-0000-4000-8000-000000000003', 'padel', true, 2);

insert into public.tos_events (
    id, slug, title, sport, starts_at, ends_at, signup_deadline,
    status, max_participants, created_by
)
values
    (
        'c6100000-0000-4000-8000-000000000001', 'web6-capacity', 'WEB-6 Capacity', 'padel',
        now() + interval '10 days', now() + interval '10 days 2 hours', now() + interval '9 days',
        'open', 2, 'a6100000-0000-4000-8000-000000000005'
    ),
    (
        'c6100000-0000-4000-8000-000000000002', 'web6-closed', 'WEB-6 Closed', 'tennis',
        now() + interval '20 days', now() + interval '20 days 2 hours', now() + interval '19 days',
        'closed', 8, 'a6100000-0000-4000-8000-000000000005'
    );

insert into public.registrations (
    id, event_id, user_id, member_id, response,
    available_from, available_until, source
)
values
    ('d6100000-0000-4000-8000-000000000001', 'c6100000-0000-4000-8000-000000000001', 'a6100000-0000-4000-8000-000000000001', 'b6100000-0000-4000-8000-000000000001', 'attending', now() + interval '10 days', now() + interval '10 days 2 hours', 'admin'),
    ('d6100000-0000-4000-8000-000000000002', 'c6100000-0000-4000-8000-000000000001', 'a6100000-0000-4000-8000-000000000002', 'b6100000-0000-4000-8000-000000000002', 'attending', now() + interval '10 days', now() + interval '10 days 2 hours', 'admin'),
    ('d6100000-0000-4000-8000-000000000003', 'c6100000-0000-4000-8000-000000000001', 'a6100000-0000-4000-8000-000000000003', 'b6100000-0000-4000-8000-000000000003', 'attending', now() + interval '10 days', now() + interval '10 days 2 hours', 'admin');

select is(
    (select count(*) from public.registrations where attending_since is not null),
    3::bigint,
    'server vult attending_since voor iedere nieuwe attending-registratie'
);
select results_eq(
    $sql$
        select id
        from public.registrations
        where event_id = 'c6100000-0000-4000-8000-000000000001'
        order by attending_since, id
    $sql$,
    $values$
        values
            ('d6100000-0000-4000-8000-000000000001'::uuid),
            ('d6100000-0000-4000-8000-000000000002'::uuid),
            ('d6100000-0000-4000-8000-000000000003'::uuid)
    $values$,
    'gelijke aanmeldtijd gebruikt registratie-id als stabiele tie-break'
);

-- Participantmatrix.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a6100000-0000-4000-8000-000000000003', true);
select results_eq(
    $sql$ select max_participants, placed_count, available_count, waitlist_count
          from public.participant_event_capacity('c6100000-0000-4000-8000-000000000001') $sql$,
    $values$ values (2, 2::bigint, 0::bigint, 1::bigint) $values$,
    'participant ziet alleen afgeleide capaciteit'
);
select results_eq(
    $sql$ select display_name, placement_status, waitlist_position
          from public.participant_event_attendance('c6100000-0000-4000-8000-000000000001') $sql$,
    $values$
        values
            ('Alpha'::text, 'placed'::text, null::bigint),
            ('Bravo'::text, 'placed'::text, null::bigint),
            ('Charlie'::text, 'waitlist'::text, 1::bigint)
    $values$,
    'participantweergave onderscheidt geplaatst en wachtlijst deterministisch'
);
select results_eq(
    $sql$ select placement_status, waitlist_position
          from public.participant_own_registration_position('c6100000-0000-4000-8000-000000000001') $sql$,
    $values$ values ('waitlist'::text, 1::bigint) $values$,
    'derde deelnemer ziet uitsluitend de eigen wachtlijstpositie'
);
select is((select count(*) from public.registrations), 1::bigint,
    'participant blijft bij directe registrations-read own-only');
select is((select count(*) from public.tos_events where slug = 'web6-closed'), 1::bigint,
    'goedgekeurd clublid kan een veilig gesloten toekomstig event filteren');

select set_config('request.jwt.claim.sub', 'a6100000-0000-4000-8000-000000000004', true);
select is((select count(*) from public.participant_event_capacity('c6100000-0000-4000-8000-000000000001')), 0::bigint,
    'actief profiel zonder membership krijgt geen participantcapaciteit');
select is((select count(*) from public.participant_event_attendance('c6100000-0000-4000-8000-000000000001')), 0::bigint,
    'actief profiel zonder membership krijgt geen deelnemersnamen');
reset role;

set local role anon;
select throws_ok(
    $$select * from public.participant_event_capacity('c6100000-0000-4000-8000-000000000001')$$,
    '42501', 'permission denied for function participant_event_capacity',
    'anon kan capaciteit-RPC niet uitvoeren'
);
select throws_ok(
    $$select * from public.participant_event_attendance('c6100000-0000-4000-8000-000000000001')$$,
    '42501', 'permission denied for function participant_event_attendance',
    'anon kan deelnemers-RPC niet uitvoeren'
);
reset role;

-- attending_since blijft staan bij availabilitywijziging en reset bij afmelden.
create temporary table web6_original_attending_since as
select attending_since from public.registrations
where id = 'd6100000-0000-4000-8000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a6100000-0000-4000-8000-000000000002', true);
update public.registrations
set available_from = available_from + interval '7 minutes'
where id = 'd6100000-0000-4000-8000-000000000002';
reset role;
select is(
    (select attending_since from public.registrations where id = 'd6100000-0000-4000-8000-000000000002'),
    (select attending_since from web6_original_attending_since),
    'availabilitywijziging behoudt de oorspronkelijke plaatsingstijd'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a6100000-0000-4000-8000-000000000001', true);
update public.registrations
set response = 'declined'
where id = 'd6100000-0000-4000-8000-000000000001';
select is(
    (select attending_since from public.registrations where id = 'd6100000-0000-4000-8000-000000000001'),
    null::timestamptz,
    'afmelden reset attending_since server-side'
);
select results_eq(
    $sql$ select display_name, placement_status
          from public.participant_event_attendance('c6100000-0000-4000-8000-000000000001') $sql$,
    $values$ values ('Bravo'::text, 'placed'::text), ('Charlie'::text, 'placed'::text) $values$,
    'eerste wachtlijster schuift zonder mutation automatisch door'
);
update public.registrations
set response = 'attending'
where id = 'd6100000-0000-4000-8000-000000000001';
select ok(
    (select attending_since is not null from public.registrations where id = 'd6100000-0000-4000-8000-000000000001'),
    'opnieuw aanmelden krijgt een nieuwe server-side plaatsingstijd'
);
select results_eq(
    $sql$ select placement_status, waitlist_position
          from public.participant_own_registration_position('c6100000-0000-4000-8000-000000000001') $sql$,
    $values$ values ('waitlist'::text, 1::bigint) $values$,
    'opnieuw aanmelden sluit achteraan de wachtlijst aan'
);
reset role;

-- Staffmatrix: membershipvrij, maar role en active blijven vereist.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a6100000-0000-4000-8000-000000000005', true);
select results_eq(
    $sql$ select placed_count, available_count, waitlist_count
          from public.staff_event_capacity_summaries()
          where event_id = 'c6100000-0000-4000-8000-000000000001' $sql$,
    $values$ values (2::bigint, 0::bigint, 1::bigint) $values$,
    'planner zonder membership ziet capaciteit'
);
select is(
    (select count(*) from public.staff_event_registration_overview('c6100000-0000-4000-8000-000000000001')),
    3::bigint,
    'planner ziet geplaatst, wachtlijst en declined via smal staffoverzicht'
);
select is(
    (select count(*) from public.staff_event_planner_input('c6100000-0000-4000-8000-000000000001')),
    2::bigint,
    'plannerinput bevat uitsluitend de twee geplaatste deelnemers'
);
select is(
    (select count(*) from public.staff_member_directory()),
    4::bigint,
    'planner zonder membership kan het smalle ledenoverzicht lezen'
);
select results_eq(
    $sql$ select member_id, sport, active, ranking
          from public.staff_update_member_sport_profile(
              'b6100000-0000-4000-8000-000000000001', 'tennis', true, 5::smallint
          ) $sql$,
    $values$ values ('b6100000-0000-4000-8000-000000000001'::uuid, 'tennis'::text, true, 5::smallint) $values$,
    'planner kan één expliciet sportprofiel opslaan'
);
select is(
    (select padel_ranking from public.staff_member_directory()
     where member_id = 'b6100000-0000-4000-8000-000000000001'),
    4::smallint,
    'tenniswijziging laat de padelranking ongemoeid'
);
update public.tos_events
set max_participants = 3
where id = 'c6100000-0000-4000-8000-000000000001';
select is(
    (select max_participants from public.tos_events where id = 'c6100000-0000-4000-8000-000000000001'),
    3,
    'planner kan capaciteit via bestaande event-RLS wijzigen'
);

select set_config('request.jwt.claim.sub', 'a6100000-0000-4000-8000-000000000006', true);
select ok((select count(*) from public.staff_member_directory()) > 0,
    'actieve admin zonder membership heeft dezelfde staffcapability');

select set_config('request.jwt.claim.sub', 'a6100000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.staff_member_directory()), 0::bigint,
    'participant krijgt geen staffledenresultaat');
select throws_ok(
    $$select * from public.staff_update_member_sport_profile(
        'b6100000-0000-4000-8000-000000000001', 'padel', true, 1::smallint
    )$$,
    '42501', 'Actieve planner- of adminrechten zijn vereist.',
    'participant kan ranking niet wijzigen'
);

select set_config('request.jwt.claim.sub', 'a6100000-0000-4000-8000-000000000007', true);
select is((select count(*) from public.staff_event_capacity_summaries()), 0::bigint,
    'inactieve planner krijgt geen staffcapaciteit');
select is((select count(*) from public.staff_member_directory()), 0::bigint,
    'inactieve planner krijgt geen ledenoverzicht');
reset role;

select * from finish();
rollback;
