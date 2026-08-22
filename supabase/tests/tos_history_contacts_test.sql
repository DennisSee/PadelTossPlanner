begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Catalog and privilege boundaries.
select has_table('public','tos_history_events','history events bestaan');
select has_table('public','tos_history_event_players','history players bestaan');
select has_table('public','tos_history_rounds','history rounds bestaan');
select has_table('public','tos_history_matches','history matches bestaan');
select has_table('public','tos_history_round_participants','history participantstates bestaan');
select has_table('public','member_contact_requests','contactrequests bestaan');
select ok((select bool_and(relrowsecurity) from pg_class where oid in (
  'public.tos_history_events'::regclass,'public.tos_history_event_players'::regclass,
  'public.tos_history_rounds'::regclass,'public.tos_history_matches'::regclass,
  'public.tos_history_round_participants'::regclass,'public.member_contact_requests'::regclass
)), 'alle WEB-7-tabellen hebben RLS');
select ok(not has_table_privilege('authenticated','public.tos_history_events','SELECT')
  and not has_table_privilege('authenticated','public.member_contact_requests','SELECT'),
  'authenticated heeft geen brede WEB-7 table reads');
select ok(not has_table_privilege('authenticated','public.tos_history_events','INSERT')
  and not has_table_privilege('authenticated','public.member_contact_requests','UPDATE'),
  'authenticated heeft geen brede WEB-7 writes');

select has_function('public','my_tos_history',array[]::text[],'eigen historie-RPC bestaat');
select has_function('public','my_tos_clubmates',array[]::text[],'clubmates-RPC bestaat');
select has_function('public','my_shared_tos_history',array['uuid'],'gedeelde historie-RPC bestaat');
select has_function('public','request_history_contact',array['uuid'],'contactrequest-RPC bestaat');
select has_function('public','respond_history_contact',array['uuid','boolean'],'contactresponse-RPC bestaat');
select has_function('public','my_accepted_history_contact',array['uuid'],'accepted-contact-RPC bestaat');
select has_function('public','admin_set_profile_role',array['uuid','text'],'admin-role-RPC bestaat');
select ok((select bool_and(prosecdef and proconfig = array['search_path=""']::text[])
  from pg_proc where oid in (
    'public.my_tos_history()'::regprocedure,
    'public.my_tos_clubmates()'::regprocedure,
    'public.my_shared_tos_history(uuid)'::regprocedure,
    'public.request_history_contact(uuid)'::regprocedure,
    'public.respond_history_contact(uuid,boolean)'::regprocedure,
    'public.my_accepted_history_contact(uuid)'::regprocedure,
    'public.admin_set_profile_role(uuid,text)'::regprocedure
  )), 'publieke WEB-7-RPCs zijn SECURITY DEFINER met lege search_path');
select ok(not has_function_privilege('anon','public.my_tos_history()','EXECUTE')
  and not has_function_privilege('anon','public.request_history_contact(uuid)','EXECUTE')
  and not has_function_privilege('anon','public.admin_set_profile_role(uuid,text)','EXECUTE'),
  'anon kan geen WEB-7 participant- of admin-RPC uitvoeren');
select ok(has_function_privilege('authenticated','public.my_tos_history()','EXECUTE')
  and has_function_privilege('authenticated','public.request_history_contact(uuid)','EXECUTE')
  and has_function_privilege('authenticated','public.admin_set_profile_role(uuid,text)','EXECUTE'),
  'authenticated execute blijft door database-guards begrensd');
select ok(not has_table_privilege('authenticated','auth.users','SELECT'),
  'WEB-7 voegt geen auth.users table grant toe');
select is(pg_get_function_arguments('public.admin_set_profile_role(uuid,text)'::regprocedure),
  'p_target_profile_id uuid, p_role text','role-RPC accepteert alleen targetprofile en rol');
select ok(position('update public.profiles' in lower(pg_get_functiondef(
  'public.admin_set_profile_role(uuid,text)'::regprocedure))) > 0
  and position('set role' in lower(pg_get_functiondef(
  'public.admin_set_profile_role(uuid,text)'::regprocedure))) > 0,
  'role-RPC wijzigt uitsluitend de profielrol');

insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 ('71000000-0000-4000-8000-000000000001','authenticated','authenticated','alice.history@example.test','{}','{"display_name":"Alice"}',now(),now()),
 ('71000000-0000-4000-8000-000000000002','authenticated','authenticated','bob.history@example.test','{}','{"display_name":"Bob"}',now(),now()),
 ('71000000-0000-4000-8000-000000000003','authenticated','authenticated','carol.history@example.test','{}','{"display_name":"Carol"}',now(),now()),
 ('71000000-0000-4000-8000-000000000004','authenticated','authenticated','daan.history@example.test','{}','{"display_name":"Daan"}',now(),now()),
 ('71000000-0000-4000-8000-000000000005','authenticated','authenticated','waitlist.history@example.test','{}','{"display_name":"Wachtlijst"}',now(),now()),
 ('71000000-0000-4000-8000-000000000006','authenticated','authenticated','admin.history@example.test','{}','{"display_name":"Admin"}',now(),now()),
 ('71000000-0000-4000-8000-000000000007','authenticated','authenticated','planner.nomember@example.test','{}','{"display_name":"Planner zonder lid"}',now(),now()),
 ('71000000-0000-4000-8000-000000000008','authenticated','authenticated','inactive.admin@example.test','{}','{"display_name":"Inactive admin"}',now(),now());

insert into public.club_members (id,display_name,approval_status,active) values
 ('72000000-0000-4000-8000-000000000001','Alice','approved',true),
 ('72000000-0000-4000-8000-000000000002','Bob','approved',true),
 ('72000000-0000-4000-8000-000000000003','Carol','approved',true),
 ('72000000-0000-4000-8000-000000000004','Daan','approved',true),
 ('72000000-0000-4000-8000-000000000005','Wachtlijst','approved',true),
 ('72000000-0000-4000-8000-000000000006','Admin','approved',true);

update public.profiles set
  member_id = case id
    when '71000000-0000-4000-8000-000000000001' then '72000000-0000-4000-8000-000000000001'::uuid
    when '71000000-0000-4000-8000-000000000002' then '72000000-0000-4000-8000-000000000002'::uuid
    when '71000000-0000-4000-8000-000000000003' then '72000000-0000-4000-8000-000000000003'::uuid
    when '71000000-0000-4000-8000-000000000004' then '72000000-0000-4000-8000-000000000004'::uuid
    when '71000000-0000-4000-8000-000000000005' then '72000000-0000-4000-8000-000000000005'::uuid
    when '71000000-0000-4000-8000-000000000006' then '72000000-0000-4000-8000-000000000006'::uuid
    else null end,
  role = case id
    when '71000000-0000-4000-8000-000000000006' then 'admin'
    when '71000000-0000-4000-8000-000000000007' then 'planner'
    when '71000000-0000-4000-8000-000000000008' then 'admin'
    else 'participant' end,
  active = id <> '71000000-0000-4000-8000-000000000008'
where id::text like '71000000-%';

insert into public.tos_events (id,slug,title,sport,starts_at,ends_at,status,max_participants,created_by)
values ('73000000-0000-4000-8000-000000000001','web7-history','Historieavond','padel',
        now()-interval '2 days 2 hours',now()-interval '2 days','closed',4,
        '71000000-0000-4000-8000-000000000006');

insert into public.registrations (id,event_id,user_id,member_id,response,available_from,available_until,source)
values
 ('74000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','attending',now()-interval '2 days 2 hours',now()-interval '2 days','admin'),
 ('74000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000002','attending',now()-interval '2 days 2 hours',now()-interval '2 days','admin'),
 ('74000000-0000-4000-8000-000000000003','73000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000003','72000000-0000-4000-8000-000000000003','attending',now()-interval '2 days 2 hours',now()-interval '2 days','admin'),
 ('74000000-0000-4000-8000-000000000004','73000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000004','72000000-0000-4000-8000-000000000004','attending',now()-interval '2 days 2 hours',now()-interval '2 days','admin'),
 ('74000000-0000-4000-8000-000000000005','73000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000005','72000000-0000-4000-8000-000000000005','attending',now()-interval '2 days 2 hours',now()-interval '2 days','admin');

insert into public.tos_event_planner_drafts(event_id,players,selected_courts,revision,updated_by,updated_by_name)
values ('73000000-0000-4000-8000-000000000001',
 '[
  {"row_id":"75000000-0000-4000-8000-000000000001","name":"Alice","ranking":3,"included":true,"available_from":"20:00","available_until":"22:00","member_id":"72000000-0000-4000-8000-000000000001","user_id":"71000000-0000-4000-8000-000000000001","registration_id":"74000000-0000-4000-8000-000000000001","registration_updated_at":"2026-08-22T10:00:00Z","source_event_id":"73000000-0000-4000-8000-000000000001"},
  {"row_id":"75000000-0000-4000-8000-000000000002","name":"Bob","ranking":3,"included":true,"available_from":"20:00","available_until":"22:00","member_id":"72000000-0000-4000-8000-000000000002","user_id":"71000000-0000-4000-8000-000000000002","registration_id":"74000000-0000-4000-8000-000000000002","registration_updated_at":"2026-08-22T10:00:00Z","source_event_id":"73000000-0000-4000-8000-000000000001"},
  {"row_id":"75000000-0000-4000-8000-000000000003","name":"Carol","ranking":3,"included":true,"available_from":"20:00","available_until":"22:00","member_id":"72000000-0000-4000-8000-000000000003","user_id":"71000000-0000-4000-8000-000000000003","registration_id":"74000000-0000-4000-8000-000000000003","registration_updated_at":"2026-08-22T10:00:00Z","source_event_id":"73000000-0000-4000-8000-000000000001"},
  {"row_id":"75000000-0000-4000-8000-000000000004","name":"Daan","ranking":3,"included":true,"available_from":"20:00","available_until":"22:00","member_id":"72000000-0000-4000-8000-000000000004","user_id":"71000000-0000-4000-8000-000000000004","registration_id":"74000000-0000-4000-8000-000000000004","registration_updated_at":"2026-08-22T10:00:00Z","source_event_id":"73000000-0000-4000-8000-000000000001"},
  {"row_id":"75000000-0000-4000-8000-000000000005","name":"Gast","ranking":3,"included":true,"available_from":"20:00","available_until":"22:00"}
 ]','["Kremer Baan"]',1,'71000000-0000-4000-8000-000000000006','Admin');

create temporary table web7_schedule(id uuid primary key);
grant select, insert on web7_schedule to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000006',true);
insert into web7_schedule select public.staff_save_event_schedule(
 '73000000-0000-4000-8000-000000000001',1,17,
 '[
  {"Ronde":1,"Tijd":"20:00 - 20:20","Baan":"Kremer Baan","Team 1":"Alice & Bob","Niveau T1":3,"Team 2":"Carol & Daan","Niveau T2":3,"Teamverschil":0,"Rust":"Gast","Nog niet aanwezig":"Niemand","Niet meer beschikbaar":"Niemand"},
  {"Ronde":2,"Tijd":"20:20 - 20:40","Baan":"Kremer Baan","Team 1":"Bob & Carol","Niveau T1":3,"Team 2":"Daan & Gast","Niveau T2":3,"Teamverschil":0,"Rust":"Alice","Nog niet aanwezig":"Niemand","Niet meer beschikbaar":"Niemand"}
 ]',
 '[
  {"Ronde":1,"Tijd":"20:00 - 20:20","Baan":"Kremer Baan","Team 1":[{"row_id":"75000000-0000-4000-8000-000000000001","name":"Alice"},{"row_id":"75000000-0000-4000-8000-000000000002","name":"Bob"}],"Team 2":[{"row_id":"75000000-0000-4000-8000-000000000003","name":"Carol"},{"row_id":"75000000-0000-4000-8000-000000000004","name":"Daan"}],"Rust":[{"row_id":"75000000-0000-4000-8000-000000000005","name":"Gast"}],"Nog niet aanwezig":[],"Niet meer beschikbaar":[]},
  {"Ronde":2,"Tijd":"20:20 - 20:40","Baan":"Kremer Baan","Team 1":[{"row_id":"75000000-0000-4000-8000-000000000002","name":"Bob"},{"row_id":"75000000-0000-4000-8000-000000000003","name":"Carol"}],"Team 2":[{"row_id":"75000000-0000-4000-8000-000000000004","name":"Daan"},{"row_id":"75000000-0000-4000-8000-000000000005","name":"Gast"}],"Rust":[{"row_id":"75000000-0000-4000-8000-000000000001","name":"Alice"}],"Nog niet aanwezig":[],"Niet meer beschikbaar":[]}
 ]','[]','{}');
select ok(public.staff_set_schedule_published((select id from web7_schedule),true),'official publication bouwt history snapshot');
reset role;

select is((select count(*) from public.tos_history_events),1::bigint,'één official snapshot per event');
select is((select count(*) from public.tos_history_event_players),5::bigint,'official spelers inclusief manual guest zijn gesnapshot');
select is((select count(*) from public.tos_history_event_players where member_id is null),1::bigint,'manual guest houdt nullable identity');
select is((select count(*) from public.tos_history_matches),2::bigint,'matches zijn genormaliseerd');
select is((select count(*) from public.tos_history_round_participants where state='rest'),2::bigint,'echte ruststatussen zijn bewaard');
select ok(position('member_id' in (select schedule_public::text from public.schedules where id=(select id from web7_schedule)))=0,
  'private historyidentity lekt niet naar publieke schedule');

set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
select results_eq(
 $$select match_count,rest_count from public.my_tos_history()$$,
 $$values (1::bigint,1::bigint)$$,
 'caller ziet eigen match en rust uit official history');
select is((select count(*) from public.my_tos_clubmates()),3::bigint,'manual guest telt niet als profileerbare clubgenoot');
select is((select shared_matches from public.my_tos_clubmates() where member_id='72000000-0000-4000-8000-000000000002'),1::bigint,
  'gedeelde match met Bob is correct');
select is((select count(*) from public.my_shared_tos_history('72000000-0000-4000-8000-000000000002')),1::bigint,
  'shared history is alleen voor een echte historische clubgenoot');
select is((select count(*) from public.my_shared_tos_history('72000000-0000-4000-8000-000000000005')),0::bigint,
  'wachtlijst-only member heeft geen shared history');
select is((select count(*) from public.my_accepted_history_contact('72000000-0000-4000-8000-000000000002')),0::bigint,
  'pending/geen consent geeft geen email');

create temporary table web7_contact(id uuid primary key);
grant select, insert on web7_contact to authenticated;
insert into web7_contact select public.request_history_contact('72000000-0000-4000-8000-000000000002');
select is((select status from public.my_history_contact_requests() where request_id=(select id from web7_contact)),'pending','requester ziet pending zonder contactdata');
select is((select count(*) from public.my_accepted_history_contact('72000000-0000-4000-8000-000000000002')),0::bigint,'pending onthult geen email');
select throws_ok($$select public.request_history_contact('72000000-0000-4000-8000-000000000005')$$,
 '42501','Contact request unavailable.','unrelated wachtlijstmember wordt geweigerd');
select throws_ok($$select public.request_history_contact('72000000-0000-4000-8000-000000000001')$$,
 '42501','Contact request unavailable.','self request wordt geweigerd');

select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select ok(public.respond_history_contact((select id from web7_contact),true),'recipient accepteert verzoek');
select results_eq(
 $$select contact_email from public.my_accepted_history_contact('72000000-0000-4000-8000-000000000001')$$,
 $$values ('alice.history@example.test'::text)$$,
 'acceptance onthult wederzijds alleen actuele andere email');
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
select results_eq(
 $$select contact_email from public.my_accepted_history_contact('72000000-0000-4000-8000-000000000002')$$,
 $$values ('bob.history@example.test'::text)$$,
 'requester krijgt na consent uitsluitend Bobs actuele email');
select ok(public.revoke_history_contact((select id from web7_contact)),'accepted sharing kan worden ingetrokken');
select is((select count(*) from public.my_accepted_history_contact('72000000-0000-4000-8000-000000000002')),0::bigint,'revoked onthult geen email');

select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000007',true);
select is((select count(*) from public.my_tos_history()),0::bigint,'staffrol zonder membership verleent geen history');
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000006',true);
select is((select count(*) from public.my_tos_history()),0::bigint,'adminmember zonder geplande deelname ziet geen andermans history');

-- Admin-only role management is independent from membership.
select results_eq(
 $$select profile_id,role from public.admin_set_profile_role('71000000-0000-4000-8000-000000000002','planner')$$,
 $$values ('71000000-0000-4000-8000-000000000002'::uuid,'planner'::text)$$,
 'active admin promoveert gekoppeld account');
select set_config('request.jwt.claim.sub','',true);
reset role;
select is((select member_id from public.profiles where id='71000000-0000-4000-8000-000000000002'),
 '72000000-0000-4000-8000-000000000002'::uuid,'rolewijziging laat membership intact');
select is((select approval_status from public.club_members where id='72000000-0000-4000-8000-000000000002'),
 'approved','rolewijziging laat approval intact');
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000006',true);
select throws_ok($$select * from public.admin_set_profile_role('71000000-0000-4000-8000-000000000006','participant')$$,
 '42501','Role change unavailable.','self-demotion is volledig geblokkeerd');
select throws_ok($$select * from public.admin_set_profile_role('71000000-0000-4000-8000-000000000002','owner')$$,
 '42501','Role change unavailable.','onbekende role wordt geweigerd');
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select throws_ok($$select * from public.admin_set_profile_role('71000000-0000-4000-8000-000000000003','admin')$$,
 '42501','Role change unavailable.','planner kan geen rollen wijzigen');
reset role;

set local role anon;
select throws_ok($$select * from public.my_tos_history()$$,'42501','permission denied for function my_tos_history','anon kan history niet lezen');
select throws_ok($$select public.request_history_contact('72000000-0000-4000-8000-000000000002')$$,'42501','permission denied for function request_history_contact','anon kan geen contact verzoeken');
reset role;

-- Unpublish removes official visibility atomically.
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000006',true);
select ok(public.staff_set_schedule_published((select id from web7_schedule),false),'admin unpublisht official schedule');
reset role;
select is((select count(*) from public.tos_history_events),0::bigint,'unpublish verwijdert official snapshotzichtbaarheid');

select * from finish();
rollback;
