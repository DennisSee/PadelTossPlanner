begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select has_table('public', 'tos_event_planner_drafts', 'event-scoped drafttabel bestaat');
select col_is_pk('public', 'tos_event_planner_drafts', 'event_id', 'event_id is de primary key');
select col_type_is('public', 'tos_event_planner_drafts', 'players', 'jsonb', 'players is private JSONB');
select col_type_is('public', 'tos_event_planner_drafts', 'revision', 'bigint', 'revision is bigint');
select ok(
    (select relrowsecurity from pg_class where oid = 'public.tos_event_planner_drafts'::regclass),
    'drafttabel heeft RLS'
);
select ok(not has_table_privilege('authenticated', 'public.tos_event_planner_drafts', 'SELECT'), 'authenticated heeft geen directe SELECT');
select ok(not has_table_privilege('authenticated', 'public.tos_event_planner_drafts', 'INSERT,UPDATE,DELETE,TRUNCATE'), 'authenticated heeft geen directe writes');
select ok(has_table_privilege('service_role', 'public.tos_event_planner_drafts', 'SELECT,INSERT,UPDATE,DELETE'), 'service_role behoudt normale beheertoegang');

select has_function('public', 'staff_event_planner_draft', array['uuid'], 'draftread-RPC bestaat');
select has_function(
    'public', 'staff_save_event_planner_draft',
    array['uuid','bigint','jsonb','jsonb','integer','integer','text','boolean','integer','double precision'],
    'CAS-save-RPC bestaat'
);
select is(
    pg_get_function_arguments('public.staff_event_planner_draft(uuid)'::regprocedure),
    'p_event_id uuid',
    'draftread accepteert uitsluitend event-id'
);
select is(
    pg_get_function_result('public.staff_event_planner_draft(uuid)'::regprocedure),
    'TABLE(event_id uuid, players jsonb, selected_courts jsonb, match_minutes integer, rest_minutes integer, search_profile text, allow_repeat_partners boolean, level_mix integer, team_difference_tolerance double precision, revision bigint, updated_by uuid, updated_by_name text, updated_at timestamp with time zone, created_at timestamp with time zone)',
    'draftread-resultaat is exact begrensd'
);
select ok((select prosecdef from pg_proc where oid = 'public.staff_event_planner_draft(uuid)'::regprocedure), 'draftread is SECURITY DEFINER');
select is((select provolatile::text from pg_proc where oid = 'public.staff_event_planner_draft(uuid)'::regprocedure), 's', 'draftread is STABLE');
select is((select proconfig from pg_proc where oid = 'public.staff_event_planner_draft(uuid)'::regprocedure), array['search_path=""']::text[], 'draftread heeft lege search_path');
select ok((select prosecdef from pg_proc where oid = 'public.staff_save_event_planner_draft(uuid,bigint,jsonb,jsonb,integer,integer,text,boolean,integer,double precision)'::regprocedure), 'save is SECURITY DEFINER');
select is((select provolatile::text from pg_proc where oid = 'public.staff_save_event_planner_draft(uuid,bigint,jsonb,jsonb,integer,integer,text,boolean,integer,double precision)'::regprocedure), 'v', 'save is VOLATILE');
select is((select proconfig from pg_proc where oid = 'public.staff_save_event_planner_draft(uuid,bigint,jsonb,jsonb,integer,integer,text,boolean,integer,double precision)'::regprocedure), array['search_path=""']::text[], 'save heeft lege search_path');
select ok(not has_function_privilege('public', 'public.staff_event_planner_draft(uuid)', 'EXECUTE'), 'PUBLIC kan draftread niet uitvoeren');
select ok(not has_function_privilege('anon', 'public.staff_event_planner_draft(uuid)', 'EXECUTE'), 'anon kan draftread niet uitvoeren');
select ok(has_function_privilege('authenticated', 'public.staff_event_planner_draft(uuid)', 'EXECUTE'), 'authenticated kan begrensde draftread uitvoeren');
select ok(not has_function_privilege('public', 'public.staff_save_event_planner_draft(uuid,bigint,jsonb,jsonb,integer,integer,text,boolean,integer,double precision)', 'EXECUTE'), 'PUBLIC kan save niet uitvoeren');
select ok(not has_function_privilege('anon', 'public.staff_save_event_planner_draft(uuid,bigint,jsonb,jsonb,integer,integer,text,boolean,integer,double precision)', 'EXECUTE'), 'anon kan save niet uitvoeren');
select ok(has_function_privilege('authenticated', 'public.staff_save_event_planner_draft(uuid,bigint,jsonb,jsonb,integer,integer,text,boolean,integer,double precision)', 'EXECUTE'), 'authenticated kan begrensde save uitvoeren');
select ok(position('viewer.role' in lower(pg_get_functiondef('public.staff_event_planner_draft(uuid)'::regprocedure))) > 0, 'draftread gebruikt de staffrol');
select ok(position('member_id' in lower(pg_get_functiondef('public.staff_event_planner_draft(uuid)'::regprocedure))) = 0, 'draftread vereist geen membership');
select ok(position('auth.uid()' in lower(pg_get_functiondef('public.staff_save_event_planner_draft(uuid,bigint,jsonb,jsonb,integer,integer,text,boolean,integer,double precision)'::regprocedure))) > 0, 'audit en authority komen uit auth.uid()');
select ok(position('service_role' in lower(pg_get_functiondef('public.staff_save_event_planner_draft(uuid,bigint,jsonb,jsonb,integer,integer,text,boolean,integer,double precision)'::regprocedure))) = 0, 'save bevat geen service-rolecontract');
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'tos_event_planner_drafts'), 0::bigint, 'geen directe authenticated policy bestaat');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
    ('b2100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'draft-participant@example.test', '{}', '{"display_name":"Draft Participant"}', now(), now()),
    ('b2100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'draft-planner@example.test', '{}', '{"display_name":"Draft Planner"}', now(), now()),
    ('b2100000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'draft-admin@example.test', '{}', '{"display_name":"Draft Admin"}', now(), now()),
    ('b2100000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'draft-inactive@example.test', '{}', '{"display_name":"Draft Inactive"}', now(), now());

update public.profiles
set role = case id
        when 'b2100000-0000-4000-8000-000000000002'::uuid then 'planner'
        when 'b2100000-0000-4000-8000-000000000003'::uuid then 'admin'
        when 'b2100000-0000-4000-8000-000000000004'::uuid then 'planner'
        else 'participant'
    end,
    active = id <> 'b2100000-0000-4000-8000-000000000004'::uuid;

insert into public.tos_events (id, slug, title, sport, starts_at, ends_at, status, created_by)
values
    ('b2200000-0000-4000-8000-000000000001', 'draft-padel-one', 'Padel een', 'padel', '2099-08-21 18:00+00', '2099-08-21 20:00+00', 'closed', 'b2100000-0000-4000-8000-000000000003'),
    ('b2200000-0000-4000-8000-000000000002', 'draft-padel-two', 'Padel twee', 'padel', '2099-08-22 18:00+00', '2099-08-22 20:00+00', 'open', 'b2100000-0000-4000-8000-000000000003'),
    ('b2200000-0000-4000-8000-000000000003', 'draft-tennis', 'Tennis', 'tennis', '2099-08-23 18:00+00', '2099-08-23 20:00+00', 'closed', 'b2100000-0000-4000-8000-000000000003'),
    ('b2200000-0000-4000-8000-000000000004', 'draft-cancelled', 'Geannuleerd', 'padel', '2099-08-24 18:00+00', '2099-08-24 20:00+00', 'cancelled', 'b2100000-0000-4000-8000-000000000003');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2100000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.staff_event_planner_draft('b2200000-0000-4000-8000-000000000001')), 0::bigint, 'participant leest geen staffdraft');
select throws_ok(
    $$select public.staff_save_event_planner_draft('b2200000-0000-4000-8000-000000000001',0,'[]','["Kremer Baan"]',20,0,'Normaal',false,50,0.5)$$,
    '42501', 'Planner draft access denied.', 'participant kan niet opslaan'
);

select set_config('request.jwt.claim.sub', 'b2100000-0000-4000-8000-000000000004', true);
select throws_ok(
    $$select public.staff_save_event_planner_draft('b2200000-0000-4000-8000-000000000001',0,'[]','["Kremer Baan"]',20,0,'Normaal',false,50,0.5)$$,
    '42501', 'Planner draft access denied.', 'inactieve staff kan niet opslaan'
);

select set_config('request.jwt.claim.sub', 'b2100000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.staff_event_planner_draft('b2200000-0000-4000-8000-000000000001')), 0::bigint, 'ontbrekende draft retourneert nul rijen');
select throws_ok(
    $$select public.staff_save_event_planner_draft('b2200000-0000-4000-8000-000000000003',0,'[]','["Kremer Baan"]',20,0,'Normaal',false,50,0.5)$$,
    '42501', 'Planner draft event unavailable.', 'tennisevent krijgt geen padeldraft'
);
select throws_ok(
    $$select public.staff_save_event_planner_draft('b2200000-0000-4000-8000-000000000004',0,'[]','["Kremer Baan"]',20,0,'Normaal',false,50,0.5)$$,
    '42501', 'Planner draft event unavailable.', 'geannuleerd event is niet wijzigbaar'
);
select is(
    public.staff_save_event_planner_draft(
        'b2200000-0000-4000-8000-000000000001', 0,
        '[{"row_id":"b2300000-0000-4000-8000-000000000001","name":"Speler Een","ranking":4,"included":true,"available_from":"20:00","available_until":"22:00"}]',
        '["Kremer Baan","ZGA/F&F Baan"]', 20, 0, 'Normaal', false, 50, 0.5
    ),
    1::bigint,
    'eerste save maakt revision 1'
);

select set_config('request.jwt.claim.sub', '', true);
reset role;
select is((select updated_by from public.tos_event_planner_drafts where event_id = 'b2200000-0000-4000-8000-000000000001'), 'b2100000-0000-4000-8000-000000000002'::uuid, 'updated_by is server-derived');
select is((select updated_by_name from public.tos_event_planner_drafts where event_id = 'b2200000-0000-4000-8000-000000000001'), 'Draft Planner', 'updated_by_name is server-derived');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2100000-0000-4000-8000-000000000002', true);
select is((select revision from public.staff_event_planner_draft('b2200000-0000-4000-8000-000000000001')), 1::bigint, 'staff leest event-scoped revision');
select throws_ok(
    $$select public.staff_save_event_planner_draft('b2200000-0000-4000-8000-000000000001',0,'[]','["Kremer Baan"]',20,0,'Normaal',false,50,0.5)$$,
    '40001', 'Planner draft changed.', 'stale create faalt met conflict'
);
select is(
    public.staff_save_event_planner_draft(
        'b2200000-0000-4000-8000-000000000001', 1,
        '[{"row_id":"b2300000-0000-4000-8000-000000000001","name":"Speler Een","ranking":4,"included":true,"available_from":"20:07","available_until":"22:00"}]',
        '["Kremer Baan"]', 25, 5, 'Uitgebreid', true, 70, 1.0
    ),
    2::bigint,
    'exacte revision wordt atomair verhoogd'
);
select throws_ok(
    $$select public.staff_save_event_planner_draft('b2200000-0000-4000-8000-000000000001',2,'[{"name":"Onvolledig"}]','["Kremer Baan"]',20,0,'Normaal',false,50,0.5)$$,
    '22023', 'Invalid planner players.', 'malformed player-JSON wordt geweigerd'
);
select throws_ok(
    $$select public.staff_save_event_planner_draft('b2200000-0000-4000-8000-000000000001',2,'[{"row_id":"b2300000-0000-4000-8000-000000000002","name":"Decimaal","ranking":4.5,"included":true,"available_from":null,"available_until":null}]','["Kremer Baan"]',20,0,'Normaal',false,50,0.5)$$,
    '22023', 'Invalid planner players.', 'ranking moet een geheel niveau 1 tot en met 5 zijn'
);
select is(
    public.staff_save_event_planner_draft(
        'b2200000-0000-4000-8000-000000000001', 2,
        '[{"row_id":"b2300000-0000-4000-8000-000000000001","name":"Speler Een","ranking":4,"included":true,"available_from":null,"available_until":null,"member_id":null,"user_id":null,"registration_id":null,"registration_updated_at":null,"source_event_id":null}]',
        '["Kremer Baan"]', 20, 0, 'Normaal', false, 50, 0.5
    ),
    3::bigint,
    'null availability en optionele identityvelden bewaren het contract'
);
select throws_ok(
    $$select public.staff_save_event_planner_draft('b2200000-0000-4000-8000-000000000001',3,'[{"row_id":"b2300000-0000-4000-8000-000000000001","name":"Speler Een","ranking":4,"included":true,"available_from":"20:00","available_until":"22:00","registration_updated_at":"2026-08-21Tgeen-tijdstip"}]','["Kremer Baan"]',20,0,'Normaal',false,50,0.5)$$,
    '22023', 'Invalid planner players.', 'ongeldige registratietimestamp wordt geweigerd'
);
select throws_ok(
    $$select public.staff_save_event_planner_draft('b2200000-0000-4000-8000-000000000001',2,'[]','["Onbekende Baan"]',20,0,'Normaal',false,50,0.5)$$,
    '22023', 'Invalid planner courts.', 'onbekende baan wordt geweigerd'
);
select throws_ok(
    $$select public.staff_save_event_planner_draft('b2200000-0000-4000-8000-000000000001',2,'[]','["Kremer Baan"]',17,0,'Normaal',false,50,0.5)$$,
    '22023', 'Invalid planner settings.', 'ongeldige instellingen worden geweigerd'
);

select set_config('request.jwt.claim.sub', 'b2100000-0000-4000-8000-000000000003', true);
select is(
    public.staff_save_event_planner_draft(
        'b2200000-0000-4000-8000-000000000002', 0, '[]',
        '["Kremer Baan"]', 20, 0, 'Snel', false, 25, 0.25
    ),
    1::bigint,
    'admin zonder membership kan eigen eventdraft opslaan'
);
select is((select count(*) from public.staff_event_planner_draft('b2200000-0000-4000-8000-000000000001')), 1::bigint, 'eerste event blijft leesbaar');
select is((select count(*) from public.staff_event_planner_draft('b2200000-0000-4000-8000-000000000002')), 1::bigint, 'tweede event blijft strikt gescheiden');

select set_config('request.jwt.claim.sub', '', true);
reset role;
set local role anon;
select throws_ok(
    $$select * from public.staff_event_planner_draft('b2200000-0000-4000-8000-000000000001')$$,
    '42501', 'permission denied for function staff_event_planner_draft', 'anon kan de RPC niet uitvoeren'
);
reset role;

select * from finish();
rollback;
