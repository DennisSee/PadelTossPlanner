begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(46);

select has_function(
    'public',
    'participant_has_registration_for_event',
    array['uuid'],
    'recursievrije eigen-eventhelper bestaat'
);
select function_returns(
    'public',
    'participant_has_registration_for_event',
    array['uuid'],
    'boolean',
    'eigen-eventhelper lekt uitsluitend een boolean'
);

select has_function(
    'public',
    'participant_event_attendee_names',
    array['uuid'],
    'nauw begrensde deelnemersnamen-RPC bestaat'
);
select function_returns(
    'public',
    'participant_event_attendee_names',
    array['uuid'],
    'setof text',
    'RPC retourneert uitsluitend display_name-tekst'
);
select ok(
    has_function_privilege(
        'authenticated',
        'public.participant_event_attendee_names(uuid)',
        'EXECUTE'
    ),
    'authenticated mag de veilige namen-RPC uitvoeren'
);
select ok(
    not has_function_privilege(
        'anon',
        'public.participant_event_attendee_names(uuid)',
        'EXECUTE'
    ),
    'anon heeft geen execute-recht op de namen-RPC'
);
select is(
    (
        select language.lanname::text
        from pg_proc as procedure
        join pg_language as language on language.oid = procedure.prolang
        where procedure.oid =
            'public.participant_event_attendee_names(uuid)'::regprocedure
    ),
    'sql',
    'namen-RPC blijft een SQL-functie'
);
select is(
    (
        select procedure.provolatile::text
        from pg_proc as procedure
        where procedure.oid =
            'public.participant_event_attendee_names(uuid)'::regprocedure
    ),
    's',
    'namen-RPC blijft STABLE'
);
select ok(
    (
        select procedure.prosecdef
        from pg_proc as procedure
        where procedure.oid =
            'public.participant_event_attendee_names(uuid)'::regprocedure
    ),
    'namen-RPC blijft SECURITY DEFINER'
);
select is(
    (
        select procedure.proconfig
        from pg_proc as procedure
        where procedure.oid =
            'public.participant_event_attendee_names(uuid)'::regprocedure
    ),
    array['search_path=""']::text[],
    'namen-RPC gebruikt een lege search_path'
);
select ok(
    not exists (
        select 1
        from pg_proc as procedure
        cross join lateral aclexplode(procedure.proacl) as privilege
        where procedure.oid =
                'public.participant_event_attendee_names(uuid)'::regprocedure
          and privilege.grantee = 0
          and privilege.privilege_type = 'EXECUTE'
    ),
    'PUBLIC heeft geen execute-recht op de namen-RPC'
);
select ok(
    (
        select count(*) = 1
           and bool_and(role.rolname = 'authenticated')
        from pg_proc as procedure
        cross join lateral aclexplode(procedure.proacl) as privilege
        join pg_roles as role on role.oid = privilege.grantee
        where procedure.oid =
                'public.participant_event_attendee_names(uuid)'::regprocedure
          and privilege.privilege_type = 'EXECUTE'
          and privilege.grantee <> procedure.proowner
    ),
    'alleen authenticated heeft naast de functie-eigenaar execute'
);

insert into auth.users (
    id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
    (
        'e1000000-0000-4000-8000-000000000001',
        'authenticated', 'authenticated', 'viewer@example.test', '{}',
        '{"display_name":"Viewer"}', now(), now()
    ),
    (
        'e1000000-0000-4000-8000-000000000002',
        'authenticated', 'authenticated', 'attending@example.test', '{}',
        '{"display_name":"Attending"}', now(), now()
    ),
    (
        'e1000000-0000-4000-8000-000000000003',
        'authenticated', 'authenticated', 'declined@example.test', '{}',
        '{"display_name":"Declined"}', now(), now()
    ),
    (
        'e1000000-0000-4000-8000-000000000004',
        'authenticated', 'authenticated', 'pending@example.test', '{}',
        '{"display_name":"Pending"}', now(), now()
    ),
    (
        'e1000000-0000-4000-8000-000000000005',
        'authenticated', 'authenticated', 'inactive@example.test', '{}',
        '{"display_name":"Inactive"}', now(), now()
    ),
    (
        'e1000000-0000-4000-8000-000000000006',
        'authenticated', 'authenticated', 'rejected@example.test', '{}',
        '{"display_name":"Rejected"}', now(), now()
    ),
    (
        'e1000000-0000-4000-8000-000000000007',
        'authenticated', 'authenticated', 'planner-social@example.test', '{}',
        '{"display_name":"Planner Social"}', now(), now()
    ),
    (
        'e1000000-0000-4000-8000-000000000008',
        'authenticated', 'authenticated', 'admin-social@example.test', '{}',
        '{"display_name":"Admin Social"}', now(), now()
    ),
    (
        'e1000000-0000-4000-8000-000000000009',
        'authenticated', 'authenticated', 'no-member-social@example.test', '{}',
        '{"display_name":"No Member Social"}', now(), now()
    );

update public.profiles
set role = case id
    when 'e1000000-0000-4000-8000-000000000007'::uuid then 'planner'
    when 'e1000000-0000-4000-8000-000000000008'::uuid then 'admin'
    else role
end
where id in (
    'e1000000-0000-4000-8000-000000000007',
    'e1000000-0000-4000-8000-000000000008'
);

insert into public.club_members (id, display_name, approval_status, active)
values
    ('e2000000-0000-4000-8000-000000000001', 'Viewer', 'approved', true),
    ('e2000000-0000-4000-8000-000000000002', 'Marieke', 'approved', true),
    ('e2000000-0000-4000-8000-000000000003', 'Declined Name', 'approved', true),
    ('e2000000-0000-4000-8000-000000000004', 'Pending Name', 'pending', true),
    ('e2000000-0000-4000-8000-000000000005', 'Inactive Name', 'approved', false),
    ('e2000000-0000-4000-8000-000000000006', 'Rejected Name', 'rejected', true),
    ('e2000000-0000-4000-8000-000000000007', 'Planner Viewer', 'approved', true),
    ('e2000000-0000-4000-8000-000000000008', 'Admin Viewer', 'approved', true);

update public.profiles as profile
set member_id = mapping.member_id
from (
    values
        ('e1000000-0000-4000-8000-000000000001'::uuid, 'e2000000-0000-4000-8000-000000000001'::uuid),
        ('e1000000-0000-4000-8000-000000000002'::uuid, 'e2000000-0000-4000-8000-000000000002'::uuid),
        ('e1000000-0000-4000-8000-000000000003'::uuid, 'e2000000-0000-4000-8000-000000000003'::uuid),
        ('e1000000-0000-4000-8000-000000000004'::uuid, 'e2000000-0000-4000-8000-000000000004'::uuid),
        ('e1000000-0000-4000-8000-000000000005'::uuid, 'e2000000-0000-4000-8000-000000000005'::uuid),
        ('e1000000-0000-4000-8000-000000000006'::uuid, 'e2000000-0000-4000-8000-000000000006'::uuid),
        ('e1000000-0000-4000-8000-000000000007'::uuid, 'e2000000-0000-4000-8000-000000000007'::uuid),
        ('e1000000-0000-4000-8000-000000000008'::uuid, 'e2000000-0000-4000-8000-000000000008'::uuid)
) as mapping(user_id, member_id)
where profile.id = mapping.user_id;

insert into public.tos_events (
    id, slug, title, sport, starts_at, ends_at, signup_deadline, status, created_by
)
values
    (
        'e3000000-0000-4000-8000-000000000001', 'social-open', 'Social Open',
        'padel', now() + interval '10 days', now() + interval '10 days 2 hours',
        now() + interval '9 days', 'open',
        'e1000000-0000-4000-8000-000000000007'
    ),
    (
        'e3000000-0000-4000-8000-000000000002', 'social-closed', 'Social Closed',
        'padel', now() + interval '20 days', now() + interval '20 days 2 hours',
        now() + interval '19 days', 'closed',
        'e1000000-0000-4000-8000-000000000007'
    ),
    (
        'e3000000-0000-4000-8000-000000000003', 'other-closed', 'Other Closed',
        'padel', now() + interval '30 days', now() + interval '30 days 2 hours',
        now() + interval '29 days', 'closed',
        'e1000000-0000-4000-8000-000000000007'
    ),
    (
        'e3000000-0000-4000-8000-000000000004', 'social-cancelled', 'Social Cancelled',
        'padel', now() + interval '40 days', now() + interval '40 days 2 hours',
        now() + interval '39 days', 'cancelled',
        'e1000000-0000-4000-8000-000000000007'
    ),
    (
        'e3000000-0000-4000-8000-000000000005', 'social-expired', 'Social Expired',
        'padel', now() - interval '2 days', now() - interval '46 hours',
        now() - interval '3 days', 'open',
        'e1000000-0000-4000-8000-000000000007'
    );

insert into public.registrations (
    event_id, user_id, member_id, response, available_from, available_until, source
)
values
    (
        'e3000000-0000-4000-8000-000000000001',
        'e1000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000001',
        'attending', now() + interval '10 days', now() + interval '10 days 2 hours', 'admin'
    ),
    (
        'e3000000-0000-4000-8000-000000000001',
        'e1000000-0000-4000-8000-000000000002',
        'e2000000-0000-4000-8000-000000000002',
        'attending', now() + interval '10 days', now() + interval '10 days 2 hours', 'admin'
    ),
    (
        'e3000000-0000-4000-8000-000000000001',
        'e1000000-0000-4000-8000-000000000003',
        'e2000000-0000-4000-8000-000000000003',
        'declined', null, null, 'admin'
    ),
    (
        'e3000000-0000-4000-8000-000000000001',
        'e1000000-0000-4000-8000-000000000004',
        'e2000000-0000-4000-8000-000000000004',
        'attending', now() + interval '10 days', now() + interval '10 days 2 hours', 'admin'
    ),
    (
        'e3000000-0000-4000-8000-000000000001',
        'e1000000-0000-4000-8000-000000000005',
        'e2000000-0000-4000-8000-000000000005',
        'attending', now() + interval '10 days', now() + interval '10 days 2 hours', 'admin'
    ),
    (
        'e3000000-0000-4000-8000-000000000001',
        'e1000000-0000-4000-8000-000000000006',
        'e2000000-0000-4000-8000-000000000006',
        'attending', now() + interval '10 days', now() + interval '10 days 2 hours', 'admin'
    ),
    (
        'e3000000-0000-4000-8000-000000000002',
        'e1000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000001',
        'attending', now() + interval '20 days', now() + interval '20 days 2 hours', 'admin'
    ),
    (
        'e3000000-0000-4000-8000-000000000004',
        'e1000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000001',
        'attending', now() + interval '40 days', now() + interval '40 days 2 hours', 'admin'
    ),
    (
        'e3000000-0000-4000-8000-000000000005',
        'e1000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000001',
        'attending', now() - interval '2 days', now() - interval '46 hours', 'admin'
    );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);

select results_eq(
    $sql$
        select display_name
        from public.participant_event_attendee_names(
            'e3000000-0000-4000-8000-000000000001'
        )
    $sql$,
    $sql$ values ('Marieke'::text), ('Viewer'::text) $sql$,
    'authenticated ziet alleen attending, approved en actieve namen'
);
select is(
    (
        select role
        from public.profiles
        where id = 'e1000000-0000-4000-8000-000000000001'
    ),
    'participant',
    'participantrol blijft ongewijzigd door de namen-RPC'
);

select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000007', true);
select results_eq(
    $sql$
        select display_name
        from public.participant_event_attendee_names(
            'e3000000-0000-4000-8000-000000000001'
        )
    $sql$,
    $sql$ values ('Marieke'::text), ('Viewer'::text) $sql$,
    'planner met actieve approved membership ziet veilige namen'
);
select is(
    (
        select role
        from public.profiles
        where id = 'e1000000-0000-4000-8000-000000000007'
    ),
    'planner',
    'plannerrol blijft ongewijzigd door de namen-RPC'
);

select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000008', true);
select results_eq(
    $sql$
        select display_name
        from public.participant_event_attendee_names(
            'e3000000-0000-4000-8000-000000000001'
        )
    $sql$,
    $sql$ values ('Marieke'::text), ('Viewer'::text) $sql$,
    'admin met actieve approved membership ziet veilige namen'
);
select is(
    (
        select role
        from public.profiles
        where id = 'e1000000-0000-4000-8000-000000000008'
    ),
    'admin',
    'adminrol blijft ongewijzigd door de namen-RPC'
);

select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
select is(
    (
        select count(*)
        from public.participant_event_attendee_names(
            'e3000000-0000-4000-8000-000000000002'
        )
    ),
    0::bigint,
    'gesloten event geeft geen sociale namen vrij'
);
select is(
    (
        select count(*)
        from public.participant_event_attendee_names(
            'e3000000-0000-4000-8000-000000000004'
        )
    ),
    0::bigint,
    'geannuleerd event geeft geen sociale namen vrij'
);
select is(
    (
        select count(*)
        from public.participant_event_attendee_names(
            'e3000000-0000-4000-8000-000000000005'
        )
    ),
    0::bigint,
    'verlopen event geeft geen sociale namen vrij'
);
select is(
    (
        select count(*)
        from public.registrations
        where user_id <> 'e1000000-0000-4000-8000-000000000001'
    ),
    0::bigint,
    'bestaande registrations-RLS verbergt alle registraties van anderen'
);
select is(
    (select count(*) from public.tos_events where slug = 'social-closed'),
    1::bigint,
    'participant ziet gesloten eventdata van de eigen registratie'
);
select is(
    (select count(*) from public.tos_events where slug = 'other-closed'),
    0::bigint,
    'participant ziet geen ander gesloten event'
);
select ok(
    not has_column_privilege('authenticated', 'public.profiles', 'email', 'SELECT'),
    'authenticated kan profiel-e-mail niet selecteren'
);
select ok(
    not has_column_privilege('authenticated', 'public.member_sport_profiles', 'ranking', 'SELECT'),
    'authenticated kan ranking niet selecteren'
);
select ok(
    not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'),
    'namen-RPC voegt geen brede profielupdates toe'
);
select ok(
    not has_table_privilege('authenticated', 'public.club_members', 'UPDATE'),
    'namen-RPC voegt geen brede memberupdates toe'
);
select is(
    (
        select count(*)
        from public.participant_event_attendee_names(
            'e3000000-0000-4000-8000-000000000001'
        )
        where display_name = 'Declined Name'
    ),
    0::bigint,
    'declined deelnemer verschijnt niet in de namenlijst'
);
select is(
    (
        select count(*)
        from public.participant_event_attendee_names(
            'e3000000-0000-4000-8000-000000000001'
        )
        where display_name = 'Rejected Name'
    ),
    0::bigint,
    'rejected deelnemer verschijnt niet in de namenlijst'
);

select set_config('request.jwt.claim.sub', '', true);
reset role;

update public.club_members
set approval_status = 'pending'
where id = 'e2000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
select is(
    (
        select count(*)
        from public.participant_event_attendee_names(
            'e3000000-0000-4000-8000-000000000001'
        )
    ),
    1::bigint,
    'pending deelnemer verdwijnt direct uit de veilige namenlijst'
);
select set_config('request.jwt.claim.sub', '', true);
reset role;

update public.club_members
set approval_status = 'approved', active = false
where id = 'e2000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
select is(
    (
        select count(*)
        from public.participant_event_attendee_names(
            'e3000000-0000-4000-8000-000000000001'
        )
    ),
    1::bigint,
    'inactieve deelnemer blijft verborgen'
);
select set_config('request.jwt.claim.sub', '', true);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000009', true);
select is(
    (
        select count(*)
        from public.participant_event_attendee_names(
            'e3000000-0000-4000-8000-000000000001'
        )
    ),
    0::bigint,
    'actief profiel zonder member_id krijgt geen namen terug'
);
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000004', true);
select is(
    (
        select count(*)
        from public.participant_event_attendee_names(
            'e3000000-0000-4000-8000-000000000001'
        )
    ),
    0::bigint,
    'viewer met pending membership krijgt geen namen terug'
);
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000006', true);
select is(
    (
        select count(*)
        from public.participant_event_attendee_names(
            'e3000000-0000-4000-8000-000000000001'
        )
    ),
    0::bigint,
    'viewer met rejected membership krijgt geen namen terug'
);
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000005', true);
select is(
    (
        select count(*)
        from public.participant_event_attendee_names(
            'e3000000-0000-4000-8000-000000000001'
        )
    ),
    0::bigint,
    'viewer met inactieve approved membership krijgt geen namen terug'
);
select set_config('request.jwt.claim.sub', '', true);
reset role;

update public.profiles
set active = false
where id = 'e1000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
select is(
    (
        select count(*)
        from public.participant_event_attendee_names(
            'e3000000-0000-4000-8000-000000000001'
        )
    ),
    0::bigint,
    'inactieve viewer krijgt geen namen terug'
);
select set_config('request.jwt.claim.sub', '', true);
reset role;

set local role anon;
select throws_ok(
    $sql$
        select *
        from public.participant_event_attendee_names(
            'e3000000-0000-4000-8000-000000000001'
        )
    $sql$,
    '42501',
    'permission denied for function participant_event_attendee_names',
    'anon kan de namenlijst niet uitvoeren'
);
reset role;

select is(
    pg_get_function_result(
        'public.participant_event_attendee_names(uuid)'::regprocedure
    ),
    'TABLE(display_name text)',
    'RPC-resultaat bevat alleen display_name en geen user_id/member_id of andere metadata'
);
select ok(
    position('.role' in lower(pg_get_functiondef(
        'public.participant_event_attendee_names(uuid)'::regprocedure
    ))) = 0,
    'viewer-authorisatie bevat nadrukkelijk geen role-predicate'
);
select ok(
    position('email' in lower(pg_get_functiondef(
        'public.participant_event_attendee_names(uuid)'::regprocedure
    ))) = 0,
    'RPC bevat geen e-mailprojectie'
);
select ok(
    position('ranking' in lower(pg_get_functiondef(
        'public.participant_event_attendee_names(uuid)'::regprocedure
    ))) = 0,
    'RPC bevat geen rankingprojectie'
);
select ok(
    position('available_from' in lower(pg_get_functiondef(
        'public.participant_event_attendee_names(uuid)'::regprocedure
    ))) = 0,
    'RPC bevat geen beschikbaarheidsprojectie'
);
select ok(
    position('user_id' in lower(pg_get_functiondef(
        'public.participant_event_attendee_names(uuid)'::regprocedure
    ))) = 0,
    'RPC bevat geen user_id-projectie'
);
select ok(
    position('available_until' in lower(pg_get_functiondef(
        'public.participant_event_attendee_names(uuid)'::regprocedure
    ))) = 0,
    'RPC bevat geen tot-tijdprojectie'
);
select ok(
    position('created_at' in lower(pg_get_functiondef(
        'public.participant_event_attendee_names(uuid)'::regprocedure
    ))) = 0,
    'RPC bevat geen registratie-timestamps'
);

select * from finish();
rollback;
