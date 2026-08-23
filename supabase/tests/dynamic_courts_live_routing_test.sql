begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_table('public', 'club_courts', 'club_courts bestaat');
select col_is_pk('public', 'club_courts', 'id', 'court-id is stabiele primary key');
select col_type_is('public', 'club_courts', 'sport', 'text', 'sport is gecontroleerde tekst');
select col_type_is('public', 'club_courts', 'active', 'boolean', 'active is boolean');
select col_type_is('public', 'club_courts', 'sort_order', 'integer', 'sortering is integer');
select ok((select relrowsecurity from pg_class where oid = 'public.club_courts'::regclass), 'club_courts heeft RLS');
select ok(not has_table_privilege('anon', 'public.club_courts', 'SELECT'), 'anon heeft geen directe courtread');
select ok(not has_table_privilege('authenticated', 'public.club_courts', 'SELECT'), 'authenticated heeft geen directe courtread');
select ok(not has_table_privilege('authenticated', 'public.club_courts', 'INSERT,UPDATE,DELETE,TRUNCATE'), 'authenticated heeft geen brede courtwrites');
select is((select count(*) from public.club_courts where sport = 'padel'), 4::bigint, 'exact vier bestaande padelbanen zijn gebootstrapt');
select is((select count(*) from public.club_courts where sport = 'tennis'), 0::bigint, 'geen tennisbaan is verzonnen');
select results_eq(
    $$select name from public.club_courts where sport='padel' order by sort_order$$,
    $$values ('Kremer Baan'::text),('ZGA/F&F Baan'::text),('PlaySeat Baan'::text),('Seppworks/Bax Baan'::text)$$,
    'bestaande padelbaannamen en volgorde zijn exact behouden'
);

select has_function('public', 'staff_courts', array['text'], 'smalle staffread bestaat');
select has_function('public', 'staff_create_court', array['text','text','boolean','integer'], 'smalle create-RPC bestaat');
select has_function('public', 'staff_update_court', array['uuid','text','boolean','integer'], 'smalle update-RPC bestaat');
select ok((select prosecdef from pg_proc where oid='public.staff_courts(text)'::regprocedure), 'staffread is SECURITY DEFINER');
select is((select proconfig from pg_proc where oid='public.staff_courts(text)'::regprocedure), array['search_path=""']::text[], 'staffread heeft lege search_path');
select ok(has_function_privilege('authenticated','public.staff_courts(text)','EXECUTE'), 'authenticated mag de intern begrensde RPC uitvoeren');
select ok(not has_function_privilege('anon','public.staff_courts(text)','EXECUTE'), 'anon kan staffread niet uitvoeren');
select ok(not has_function_privilege('anon','public.staff_create_court(text,text,boolean,integer)','EXECUTE'), 'anon kan geen baan maken');
select ok(not has_function_privilege('anon','public.staff_update_court(uuid,text,boolean,integer)','EXECUTE'), 'anon kan geen baan wijzigen');

insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('d9100000-0000-4000-8000-000000000001','authenticated','authenticated','court-participant@example.test','{}','{"display_name":"Participant"}',now(),now()),
 ('d9100000-0000-4000-8000-000000000002','authenticated','authenticated','court-planner@example.test','{}','{"display_name":"Planner"}',now(),now()),
 ('d9100000-0000-4000-8000-000000000003','authenticated','authenticated','court-admin@example.test','{}','{"display_name":"Admin"}',now(),now()),
 ('d9100000-0000-4000-8000-000000000004','authenticated','authenticated','court-inactive@example.test','{}','{"display_name":"Inactive"}',now(),now());
update public.profiles set role = case
 when id in ('d9100000-0000-4000-8000-000000000002','d9100000-0000-4000-8000-000000000004') then 'planner'
 when id='d9100000-0000-4000-8000-000000000003' then 'admin' else 'participant' end,
 active = id <> 'd9100000-0000-4000-8000-000000000004';

set local role authenticated;
select set_config('request.jwt.claim.sub','d9100000-0000-4000-8000-000000000001',true);
select is((select count(*) from public.staff_courts(null)),0::bigint,'participant krijgt geen staffcourtdata');
select throws_ok(
 $$select public.staff_create_court('tennis','Verboden',true,10)$$,
 '42501','Court access denied.','participant kan geen baan maken'
);

select set_config('request.jwt.claim.sub','d9100000-0000-4000-8000-000000000004',true);
select is((select count(*) from public.staff_courts(null)),0::bigint,'inactive staff krijgt geen staffcourtdata');
select throws_ok(
 $$select public.staff_update_court('c9000000-0000-4000-8000-000000000001','Verboden',true,10)$$,
 '42501','Court access denied.','inactive staff kan geen baan wijzigen'
);

select set_config('request.jwt.claim.sub','d9100000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.staff_courts('padel')),4::bigint,'actieve planner leest padelbanen zonder membership');
create temporary table web9_ids (kind text primary key, id uuid not null);
grant select, insert on table web9_ids to authenticated;
insert into web9_ids values ('tennis', public.staff_create_court('tennis','Tennisbaan Centrum',true,15));
select ok((select id is not null from web9_ids where kind='tennis'),'planner maakt een tennisbaan');
select is((select count(*) from public.staff_courts('tennis')),1::bigint,'tennisbaan staat in sportprojectie');
select throws_ok(
 $$select public.staff_create_court('squash','Onbekend',true,20)$$,
 '22023','Invalid court.','ongeldige sport wordt geweigerd'
);
select throws_ok(
 $$select public.staff_create_court('tennis','   ',true,20)$$,
 '22023','Invalid court.','lege naam wordt geweigerd'
);
select throws_ok(
 $$select public.staff_create_court('tennis','Tennisbaan Centrum',true,20)$$,
 '23505','Court already exists.','dubbele naam binnen sport wordt geweigerd'
);
select ok(public.staff_update_court((select id from web9_ids where kind='tennis'),'Tennisbaan Noord',false,25),'rename/deactivate slaagt');
select is((select name from public.staff_courts('tennis') where id=(select id from web9_ids where kind='tennis')),'Tennisbaan Noord','rename behoudt hetzelfde court-id');
select is((select active from public.staff_courts('tennis') where id=(select id from web9_ids where kind='tennis')),false,'baan kan worden gedeactiveerd');
select is((select sort_order from public.staff_courts('tennis') where id=(select id from web9_ids where kind='tennis')),25,'sortering wordt opgeslagen');
select ok(public.staff_update_court((select id from web9_ids where kind='tennis'),'Tennisbaan Noord',true,5),'reactiveren slaagt');

select set_config('request.jwt.claim.sub','d9100000-0000-4000-8000-000000000003',true);
select is((select count(*) from public.staff_courts(null)),5::bigint,'actieve admin leest beide sporten zonder membership');

reset role;
insert into public.tos_events (id,slug,title,sport,starts_at,ends_at,status,created_by) values
 ('d9200000-0000-4000-8000-000000000001','web9-padel','WEB9 Padel','padel','2099-08-21 18:00+00','2099-08-21 20:00+00','closed','d9100000-0000-4000-8000-000000000002'),
 ('d9200000-0000-4000-8000-000000000002','web9-tennis','WEB9 Tennis','tennis','2099-08-22 18:00+00','2099-08-22 20:00+00','closed','d9100000-0000-4000-8000-000000000002'),
 ('d9200000-0000-4000-8000-000000000003','web9-cancelled','WEB9 Geannuleerd','padel','2099-08-23 18:00+00','2099-08-23 20:00+00','cancelled','d9100000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub','d9100000-0000-4000-8000-000000000002',true);
select is(public.staff_save_event_planner_draft(
 'd9200000-0000-4000-8000-000000000001',0,'[]','["c9000000-0000-4000-8000-000000000001"]',20,0,'Normaal',false,50,0.5
),1::bigint,'padeldraft accepteert actieve padelcourt-ID');
select throws_ok(
 $$select public.staff_save_event_planner_draft('d9200000-0000-4000-8000-000000000001',1,'[]',jsonb_build_array((select id from web9_ids where kind='tennis')),20,0,'Normaal',false,50,0.5)$$,
 '22023','Invalid planner courts.','padeldraft weigert tennisbaan'
);
select is(public.staff_save_event_planner_draft(
 'd9200000-0000-4000-8000-000000000002',0,'[]',jsonb_build_array((select id from web9_ids where kind='tennis')),20,0,'Normaal',false,50,0.5
),1::bigint,'tennisdraft accepteert actieve tennisbaan');
select throws_ok(
 $$select public.staff_save_event_planner_draft('d9200000-0000-4000-8000-000000000002',1,'[]',jsonb_build_array((select id from web9_ids where kind='tennis'),(select id from web9_ids where kind='tennis')),20,0,'Normaal',false,50,0.5)$$,
 '22023','Invalid planner courts.','dubbele selected court-ID wordt geweigerd'
);

reset role;
insert into public.schedules (
 id,event_id,title,event_date,created_by,created_by_name,start_time,end_time,match_minutes,courts,
 players_private,participants_public,schedule_private,schedule_public,statistics_private,diagnostics,is_published
) values
 ('d9300000-0000-4000-8000-000000000001','d9200000-0000-4000-8000-000000000001','WEB9 Padel','2099-08-21','d9100000-0000-4000-8000-000000000002','Planner','20:00','22:00',20,
  '["c9000000-0000-4000-8000-000000000001"]','[]','["Veilige Naam"]','[]','[]','[]','{}',true),
 ('d9300000-0000-4000-8000-000000000002','d9200000-0000-4000-8000-000000000003','WEB9 Geannuleerd','2099-08-23','d9100000-0000-4000-8000-000000000002','Planner','20:00','22:00',20,
  '["c9000000-0000-4000-8000-000000000001"]','[]','[]','[]','[]','[]','{}',true);
select is((select courts from public.schedules where id='d9300000-0000-4000-8000-000000000001'),'["Kremer Baan"]'::jsonb,'schedule bewaart baannaam als snapshot');
select throws_ok(
 $$insert into public.schedules (
   id,event_id,title,event_date,created_by,created_by_name,start_time,end_time,match_minutes,courts,
   players_private,participants_public,schedule_private,schedule_public,statistics_private,diagnostics,is_published
 ) values (
   'd9300000-0000-4000-8000-000000000003','d9200000-0000-4000-8000-000000000001','WEB9 Injectie','2099-08-21',
   'd9100000-0000-4000-8000-000000000002','Planner','20:00','22:00',20,
   '["c9000000-0000-4000-8000-000000000001"]','[]','[]','[{"Baan":"Tennisbaan Noord"}]','[]','[]','{}',false
 )$$,
 '22023','Invalid planner courts.','schedule snapshot weigert een baan buiten de vertrouwde eventselectie'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','d9100000-0000-4000-8000-000000000002',true);
select ok(public.staff_update_court('c9000000-0000-4000-8000-000000000001','Kremer Centre Court',true,10),'catalogusrename slaagt');
reset role;
select is((select courts from public.schedules where id='d9300000-0000-4000-8000-000000000001'),'["Kremer Baan"]'::jsonb,'bestaande schedule snapshot verandert niet na rename');

select has_function('public','public_event_live_schedule',array['text'],'eventgebonden publieke live-RPC bestaat');
select has_function('public','public_live_schedule_candidates',array[]::text[],'smalle resolver-RPC bestaat');
select ok((select prosecdef from pg_proc where oid='public.public_event_live_schedule(text)'::regprocedure),'publieke eventread is SECURITY DEFINER');
select is((select proconfig from pg_proc where oid='public.public_event_live_schedule(text)'::regprocedure),array['search_path=""']::text[],'publieke eventread heeft lege search_path');
select ok(has_function_privilege('anon','public.public_event_live_schedule(text)','EXECUTE'),'anon mag veilige publicatieprojectie uitvoeren');
select ok(has_function_privilege('anon','public.public_live_schedule_candidates()','EXECUTE'),'anon mag veilige resolverkandidaten lezen');
select ok(position('players_private' in lower(pg_get_functiondef('public.public_event_live_schedule(text)'::regprocedure)))=0,'publieke eventread bevat geen private spelers');
select ok(position('schedule_private' in lower(pg_get_functiondef('public.public_event_live_schedule(text)'::regprocedure)))=0,'publieke eventread bevat geen private schema');

set local role anon;
select is((select count(*) from public.public_event_live_schedule('web9-padel')),1::bigint,'anon leest gepubliceerde niet-geannuleerde eventroute');
select is((select event_slug from public.public_event_live_schedule('web9-padel')),'web9-padel','eventslug blijft canoniek');
select is((select count(*) from public.public_event_live_schedule('web9-cancelled')),0::bigint,'geannuleerd event lekt geen livepublicatie');
select is((select count(*) from public.public_event_live_schedule('bestaat-niet')),0::bigint,'onbekende slug blijft leeg');
select is((select count(*) from public.public_live_schedule_candidates()),1::bigint,'resolver bevat uitsluitend publiceerbare niet-geannuleerde events');
reset role;

select * from finish();
rollback;
