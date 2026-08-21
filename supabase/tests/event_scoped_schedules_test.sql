begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_column('public', 'schedules', 'event_id', 'schedules heeft event_id');
select has_column('public', 'schedules', 'generation_seed', 'schedules heeft generation_seed');
select has_column('public', 'schedules', 'planner_draft_revision', 'schedules heeft draftrevision');
select fk_ok('public', 'schedules', 'event_id', 'public', 'tos_events', 'id', 'event_id verwijst naar tos_events');
select has_function('public', 'staff_event_schedule_summaries', array['uuid'], 'summary-RPC bestaat');
select has_function('public', 'staff_event_schedule', array['uuid','uuid'], 'detail-RPC bestaat');
select has_function('public', 'staff_save_event_schedule', array['uuid','bigint','bigint','jsonb','jsonb','jsonb'], 'save-RPC bestaat');
select has_function('public', 'staff_set_schedule_published', array['uuid','boolean'], 'publish-RPC bestaat');

select ok(not has_function_privilege('anon', 'public.staff_event_schedule_summaries(uuid)', 'EXECUTE'), 'anon kan staffsummary niet uitvoeren');
select ok(not has_function_privilege('anon', 'public.staff_event_schedule(uuid,uuid)', 'EXECUTE'), 'anon kan staffdetail niet uitvoeren');
select ok(not has_function_privilege('anon', 'public.staff_save_event_schedule(uuid,bigint,bigint,jsonb,jsonb,jsonb)', 'EXECUTE'), 'anon kan private save niet uitvoeren');
select ok(not has_function_privilege('anon', 'public.staff_set_schedule_published(uuid,boolean)', 'EXECUTE'), 'anon kan niet publiceren');
select ok(has_function_privilege('authenticated', 'public.staff_event_schedule_summaries(uuid)', 'EXECUTE'), 'authenticated heeft begrensde staffsummary-execute');
select ok(has_function_privilege('authenticated', 'public.staff_event_schedule(uuid,uuid)', 'EXECUTE'), 'authenticated heeft begrensde detail-execute');
select ok(has_function_privilege('authenticated', 'public.staff_save_event_schedule(uuid,bigint,bigint,jsonb,jsonb,jsonb)', 'EXECUTE'), 'authenticated heeft begrensde save-execute');
select ok(has_function_privilege('authenticated', 'public.staff_set_schedule_published(uuid,boolean)', 'EXECUTE'), 'authenticated heeft begrensde publish-execute');

select is((select proconfig from pg_proc where oid = 'public.staff_save_event_schedule(uuid,bigint,bigint,jsonb,jsonb,jsonb)'::regprocedure), array['search_path=""']::text[], 'save gebruikt lege search_path');
select is((select proconfig from pg_proc where oid = 'public.staff_set_schedule_published(uuid,boolean)'::regprocedure), array['search_path=""']::text[], 'publish gebruikt lege search_path');
select ok((select prosecdef from pg_proc where oid = 'public.staff_save_event_schedule(uuid,bigint,bigint,jsonb,jsonb,jsonb)'::regprocedure), 'save is SECURITY DEFINER');
select ok((select prosecdef from pg_proc where oid = 'public.staff_set_schedule_published(uuid,boolean)'::regprocedure), 'publish is SECURITY DEFINER');
select ok(position('service_role' in lower(pg_get_functiondef('public.staff_save_event_schedule(uuid,bigint,bigint,jsonb,jsonb,jsonb)'::regprocedure))) = 0, 'save bevat geen service role');
select ok(position('auth.uid()' in lower(pg_get_functiondef('public.staff_save_event_schedule(uuid,bigint,bigint,jsonb,jsonb,jsonb)'::regprocedure))) > 0, 'creator komt uit auth.uid()');
select ok(position('member_id' in lower(pg_get_functiondef('public.staff_save_event_schedule(uuid,bigint,bigint,jsonb,jsonb,jsonb)'::regprocedure))) = 0, 'staffsave vereist geen membership');
select ok(position('event_row.title' in lower(pg_get_functiondef('public.staff_save_event_schedule(uuid,bigint,bigint,jsonb,jsonb,jsonb)'::regprocedure))) > 0, 'eventmetadata komt database-side uit het event');
select ok(position('draft_row.players' in lower(pg_get_functiondef('public.staff_save_event_schedule(uuid,bigint,bigint,jsonb,jsonb,jsonb)'::regprocedure))) > 0, 'private spelers komen uit de actuele draft');

select ok(not has_column_privilege('anon', 'public.schedules', 'event_id', 'SELECT'), 'anon leest event_id niet');
select ok(not has_column_privilege('authenticated', 'public.schedules', 'generation_seed', 'SELECT'), 'authenticated leest seed niet direct');
select ok(not has_column_privilege('anon', 'public.schedules', 'players_private', 'SELECT'), 'anon leest private spelers niet');
select ok(not has_column_privilege('authenticated', 'public.schedules', 'schedule_private', 'SELECT'), 'authenticated leest private schema niet direct');
select ok(has_column_privilege('anon', 'public.schedules', 'schedule_public', 'SELECT'), 'bestaande publieke schemaprojectie blijft leesbaar');
select ok(has_column_privilege('anon', 'public.schedules', 'participants_public', 'SELECT'), 'bestaande publieke deelnemersprojectie blijft leesbaar');
select ok((select relrowsecurity from pg_class where oid = 'public.schedules'::regclass), 'schedules-RLS blijft actief');
select ok(exists (select 1 from pg_policies where tablename = 'schedules' and policyname = 'schedules_select_published'), 'published-only policy blijft bestaan');
select ok(exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and indexname = 'schedules_one_published_per_event_idx'
       and indexdef ilike '%where ((event_id is not null) and is_published)%'
), 'partiële unieke index begrenst één publicatie per event');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
 ('c2100000-0000-4000-8000-000000000001','authenticated','authenticated','schedule-participant@example.test','{}','{"display_name":"Participant"}',now(),now()),
 ('c2100000-0000-4000-8000-000000000002','authenticated','authenticated','schedule-owner@example.test','{}','{"display_name":"Planner Owner"}',now(),now()),
 ('c2100000-0000-4000-8000-000000000003','authenticated','authenticated','schedule-other@example.test','{}','{"display_name":"Planner Other"}',now(),now()),
 ('c2100000-0000-4000-8000-000000000004','authenticated','authenticated','schedule-admin@example.test','{}','{"display_name":"Admin Publisher"}',now(),now()),
 ('c2100000-0000-4000-8000-000000000005','authenticated','authenticated','schedule-inactive@example.test','{}','{"display_name":"Inactive Planner"}',now(),now());
update public.profiles set role = case
 when id in ('c2100000-0000-4000-8000-000000000002','c2100000-0000-4000-8000-000000000003','c2100000-0000-4000-8000-000000000005') then 'planner'
 when id = 'c2100000-0000-4000-8000-000000000004' then 'admin' else 'participant' end,
 active = id <> 'c2100000-0000-4000-8000-000000000005';

insert into public.tos_events (id,slug,title,sport,starts_at,ends_at,status,created_by)
values
 ('c2200000-0000-4000-8000-000000000001','schedule-padel','Schema Padel','padel','2099-08-21 18:00+00','2099-08-21 20:00+00','closed','c2100000-0000-4000-8000-000000000002'),
 ('c2200000-0000-4000-8000-000000000002','schedule-other','Schema Ander','padel','2099-08-22 18:00+00','2099-08-22 20:00+00','open','c2100000-0000-4000-8000-000000000003'),
 ('c2200000-0000-4000-8000-000000000003','schedule-tennis','Schema Tennis','tennis','2099-08-23 18:00+00','2099-08-23 20:00+00','closed','c2100000-0000-4000-8000-000000000002');

insert into public.tos_event_planner_drafts (event_id,players,selected_courts,revision,updated_by,updated_by_name)
values
 ('c2200000-0000-4000-8000-000000000001',
  '[{"row_id":"c2300000-0000-4000-8000-000000000001","name":"Publieke Naam","ranking":4,"included":true,"available_from":"20:00","available_until":"22:00","member_id":"c2400000-0000-4000-8000-000000000001"},{"row_id":"c2300000-0000-4000-8000-000000000002","name":"Niet Meedoen","ranking":3,"included":false,"available_from":"20:00","available_until":"22:00"}]',
  '["Kremer Baan"]',3,'c2100000-0000-4000-8000-000000000002','Planner Owner'),
 ('c2200000-0000-4000-8000-000000000002','[]','["Kremer Baan"]',1,'c2100000-0000-4000-8000-000000000003','Planner Other');

set local role authenticated;
select set_config('request.jwt.claim.sub','c2100000-0000-4000-8000-000000000001',true);
select throws_ok(
 $$select public.staff_save_event_schedule('c2200000-0000-4000-8000-000000000001',3,77,'[]','[]','{}')$$,
 '42501','Schedule access denied.','participant kan geen schema opslaan');

select set_config('request.jwt.claim.sub','c2100000-0000-4000-8000-000000000005',true);
select throws_ok(
 $$select public.staff_save_event_schedule('c2200000-0000-4000-8000-000000000001',3,77,'[]','[]','{}')$$,
 '42501','Schedule access denied.','inactieve staff kan geen schema opslaan');

select set_config('request.jwt.claim.sub','c2100000-0000-4000-8000-000000000002',true);
select throws_ok(
 $$select public.staff_save_event_schedule('c2200000-0000-4000-8000-000000000001',2,77,'[]','[]','{}')$$,
 '40001','Planner draft changed.','stale draftrevision faalt');
select throws_ok(
 $$select public.staff_save_event_schedule('c2200000-0000-4000-8000-000000000003',1,77,'[]','[]','{}')$$,
 '42501','Schedule event unavailable.','tennis kan geen padelschema opslaan');

create temporary table saved_ids (id uuid primary key, label text);
grant select on table saved_ids to anon, authenticated;
insert into saved_ids
select public.staff_save_event_schedule(
 'c2200000-0000-4000-8000-000000000001',3,77,
 '[{"Ronde":1,"Tijd":"20:00 - 20:20","Baan":"Kremer Baan","Team 1":"Publieke Naam & B","Niveau T1":4,"Team 2":"C & D","Niveau T2":3.5,"Teamverschil":0.5,"Rust":"Niemand","Nog niet aanwezig":"Niemand","Niet meer beschikbaar":"Niemand"}]',
 '[{"Speler":"Publieke Naam","Ranking":4}]',
 '{"rounds":1,"private_marker":"diagnostic"}'
), 'first';
select ok((select id is not null from saved_ids where label='first'), 'geldige private save retourneert schedule-id');
insert into saved_ids
select public.staff_save_event_schedule(
 'c2200000-0000-4000-8000-000000000001',3,78,
 '[{"Ronde":1,"Tijd":"20:00 - 20:20","Baan":"Kremer Baan","Team 1":"Publieke Naam & B","Niveau T1":4,"Team 2":"C & D","Niveau T2":3.5,"Teamverschil":0.5,"Rust":"Niemand","Nog niet aanwezig":"Niemand","Niet meer beschikbaar":"Niemand"}]',
 '[]', '{"rounds":1}'
), 'second';

select set_config('request.jwt.claim.sub','',true); reset role;
select is((select created_by from public.schedules where id=(select id from saved_ids where label='first')), 'c2100000-0000-4000-8000-000000000002'::uuid, 'creator is database-derived');
select is((select created_by_name from public.schedules where id=(select id from saved_ids where label='first')), 'Planner Owner', 'creatornaam is database-derived');
select is((select title from public.schedules where id=(select id from saved_ids where label='first')), 'Schema Padel', 'titel is event-derived');
select is((select event_date from public.schedules where id=(select id from saved_ids where label='first')), '2099-08-21'::date, 'eventdatum gebruikt Europe/Amsterdam');
select is((select is_published from public.schedules where id=(select id from saved_ids where label='first')), false, 'nieuw schema is privé');
select is((select participants_public from public.schedules where id=(select id from saved_ids where label='first')), '["Publieke Naam"]'::jsonb, 'publieke namen bevatten alleen included namen');
select ok(not ((select schedule_public from public.schedules where id=(select id from saved_ids where label='first'))->0 ? 'Niveau T1'), 'publieke schema bevat geen niveau');
select ok(not ((select schedule_public from public.schedules where id=(select id from saved_ids where label='first'))->0 ? 'Teamverschil'), 'publieke schema bevat geen teamverschil');
select ok(position('member_id' in (select schedule_public::text from public.schedules where id=(select id from saved_ids where label='first'))) = 0, 'publieke schema bevat geen identity');

set local role authenticated;
select set_config('request.jwt.claim.sub','c2100000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.staff_event_schedule_summaries('c2200000-0000-4000-8000-000000000001')),2::bigint,'owner leest uitsluitend eventscoped summaries');
select is((select count(*) from public.staff_event_schedule('c2200000-0000-4000-8000-000000000001',(select id from saved_ids where label='first'))),1::bigint,'owner leest private eventdetail');
select is((select count(*) from public.staff_event_schedule('c2200000-0000-4000-8000-000000000002',(select id from saved_ids where label='first'))),0::bigint,'event A schedule verschijnt niet in event B detail');
select throws_ok(
 $$select public.staff_set_schedule_published((select id from saved_ids where label='first'),null)$$,
 '22023','Invalid publication state.','null is geen geldige publicatiestatus'
);
select ok(public.staff_set_schedule_published((select id from saved_ids where label='first'),true),'owner publiceert eigen schema');
select ok(public.staff_set_schedule_published((select id from saved_ids where label='second'),true),'owner publiceert vervangend schema');

select set_config('request.jwt.claim.sub','',true); reset role;
select is((select is_published from public.schedules where id=(select id from saved_ids where label='first')),false,'oude eventpublicatie wordt atomair privé');
select is((select is_published from public.schedules where id=(select id from saved_ids where label='second')),true,'nieuwe eventpublicatie is openbaar');
set local role anon;
select is((select count(*) from public.schedules where id=(select id from saved_ids where label='second')),1::bigint,'anon ziet uitsluitend de actieve publicatie');
select ok(not ((select schedule_public from public.schedules where id=(select id from saved_ids where label='second'))->0 ? 'Niveau T1'),'anonprojectie bevat geen niveaukolom');
select ok(position('diagnostic' in coalesce((select schedule_public::text from public.schedules where id=(select id from saved_ids where label='second')),'')) = 0,'anonprojectie bevat geen diagnostiek');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','c2100000-0000-4000-8000-000000000003',true);
select throws_ok(
 $$select public.staff_set_schedule_published((select id from saved_ids where label='first'),false)$$,
 '42501','Schedule publication denied.','andere planner kan publicatie niet wijzigen');

select set_config('request.jwt.claim.sub','c2100000-0000-4000-8000-000000000004',true);
select ok(public.staff_set_schedule_published((select id from saved_ids where label='second'),false),'actieve admin kan publicatie intrekken');

select set_config('request.jwt.claim.sub','',true); reset role;
insert into public.schedules (
 title,event_date,created_by,created_by_name,start_time,end_time,match_minutes,courts,
 players_private,participants_public,schedule_private,schedule_public,statistics_private,diagnostics,is_published
) values ('Legacy','2099-01-01','c2100000-0000-4000-8000-000000000002','Planner Owner','20:00','22:00',20,'[]','[]','[]','[]','[]','[]','{}',false);
select is((select count(*) from public.schedules where title='Legacy' and event_id is null),1::bigint,'legacy schedule zonder event_id blijft geldig');

set local role anon;
select is((select count(*) from public.schedules),0::bigint,'anon ziet geen private of ingetrokken schema');
reset role;

select * from finish();
rollback;
