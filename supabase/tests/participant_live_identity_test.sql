begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select ok(has_function_privilege('authenticated','public.my_published_event_schedule_identity(text)','EXECUTE'),'authenticated RPC access');
select ok(not has_function_privilege('anon','public.my_published_event_schedule_identity(text)','EXECUTE'),'no anonymous RPC access');
select ok(not has_function_privilege('authenticated','public._published_live_identity(uuid)','EXECUTE')
 and not has_function_privilege('anon','public._published_live_identity(uuid)','EXECUTE'),'internal helper not callable');
select ok((select bool_and(prosecdef and proconfig = array['search_path=""']::text[]) from pg_proc
 where oid in ('public.my_published_event_schedule_identity(text)'::regprocedure,
 'public._published_live_identity(uuid)'::regprocedure,'public.public_event_live_schedule(text)'::regprocedure)), 'definers have empty search_path');
select ok(not has_column_privilege('authenticated','public.schedules','players_private','SELECT')
 and not has_table_privilege('authenticated','public.tos_history_event_players','SELECT')
 and not has_table_privilege('anon','public.tos_history_round_participants','SELECT'),'no private table reads');
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.schedules'::regclass,
 'public.tos_history_events'::regclass,'public.tos_history_event_players'::regclass,
 'public.tos_history_round_participants'::regclass)), 'RLS unchanged');

insert into auth.users(id,aud,role,email,raw_user_meta_data) values
 ('a4100000-0000-4000-8000-000000000001','authenticated','authenticated','one@live.example.test','{"display_name":"Same name"}'),
 ('a4100000-0000-4000-8000-000000000002','authenticated','authenticated','two@live.example.test','{"display_name":"Same name"}'),
 ('a4100000-0000-4000-8000-000000000003','authenticated','authenticated','staff@live.example.test','{"display_name":"Staff"}');
insert into public.club_members(id,display_name,active,approval_status) values
 ('a4200000-0000-4000-8000-000000000001','Same name',true,'approved'),
 ('a4200000-0000-4000-8000-000000000002','Same name',true,'approved');
update public.profiles set active=true, member_id = case id
 when 'a4100000-0000-4000-8000-000000000001' then 'a4200000-0000-4000-8000-000000000001'::uuid
 when 'a4100000-0000-4000-8000-000000000002' then 'a4200000-0000-4000-8000-000000000002'::uuid end,
 role=case when id='a4100000-0000-4000-8000-000000000003' then 'admin' else 'participant' end
 where id::text like 'a4100000%';
insert into public.tos_events(id,slug,title,sport,starts_at,ends_at,status,max_participants,created_by)
 values ('a4300000-0000-4000-8000-000000000001','identity-live','Identity','padel',now()-interval '10 minutes',now()+interval '1 hour','open',4,'a4100000-0000-4000-8000-000000000003');
insert into public.schedules(id,event_id,title,event_date,created_by,created_by_name,start_time,end_time,match_minutes,courts,players_private,participants_public,schedule_private,schedule_public,statistics_private,diagnostics,is_published)
 values ('a4400000-0000-4000-8000-000000000001','a4300000-0000-4000-8000-000000000001','Identity',current_date,'a4100000-0000-4000-8000-000000000003','Staff','20:00','22:00',20,'["Court"]','[]','["Same name","Same name"]','[]','[]','[]','{}',true);
-- Explicit normalized snapshot fixtures isolate read authority from publication writes.
insert into public.tos_history_events(id,event_id,source_schedule_id,title_snapshot,sport,starts_at,ends_at)
 select 'a4500000-0000-4000-8000-000000000001',id,'a4400000-0000-4000-8000-000000000001',title,sport,starts_at,ends_at from public.tos_events where slug='identity-live';
insert into public.tos_history_event_players(id,history_event_id,source_row_id,member_id,display_name_snapshot,player_order) values
 ('a4600000-0000-4000-8000-000000000001','a4500000-0000-4000-8000-000000000001',gen_random_uuid(),'a4200000-0000-4000-8000-000000000001','Same name',1),
 ('a4600000-0000-4000-8000-000000000002','a4500000-0000-4000-8000-000000000001',gen_random_uuid(),'a4200000-0000-4000-8000-000000000002','Same name',2);
insert into public.tos_history_rounds(id,history_event_id,round_number,starts_at,ends_at)
 values ('a4700000-0000-4000-8000-000000000001','a4500000-0000-4000-8000-000000000001',1,now()-interval '10 minutes',now()+interval '10 minutes');
insert into public.tos_history_round_participants(history_event_id,round_id,event_player_id,state)
 select history_event_id,'a4700000-0000-4000-8000-000000000001',id,'rest' from public.tos_history_event_players where history_event_id='a4500000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','a4100000-0000-4000-8000-000000000001',true);
select is((select player_key from public.my_published_event_schedule_identity('identity-live')),'a4600000-0000-4000-8000-000000000001'::uuid,'own stable identity returned');
select is((select count(*) from public.my_published_event_schedule_identity('missing')),0::bigint,'wrong event empty');
select set_config('request.jwt.claim.sub','a4100000-0000-4000-8000-000000000002',true);
select is((select player_key from public.my_published_event_schedule_identity('identity-live')),'a4600000-0000-4000-8000-000000000002'::uuid,'duplicate names have distinct correct identity');
select set_config('request.jwt.claim.sub','a4100000-0000-4000-8000-000000000003',true);
select is((select count(*) from public.my_published_event_schedule_identity('identity-live')),0::bigint,'staff without membership empty');
reset role;
select ok((select live_identity::text !~ 'member_id|user_id|ranking|email|source_row_id|a4200000|a4100000' from public.public_event_live_schedule('identity-live')),'public identity contains no club identity or private fields');
select is((select jsonb_array_length(live_identity->'players') from public.public_event_live_schedule('identity-live')),2,'both opaque identities available publicly');
update public.profiles set active=false where id='a4100000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','a4100000-0000-4000-8000-000000000001',true);
select is((select count(*) from public.my_published_event_schedule_identity('identity-live')),0::bigint,'inactive profile empty');
reset role;
update public.profiles set active=true where id='a4100000-0000-4000-8000-000000000001';
update public.club_members set approval_status='pending' where id='a4200000-0000-4000-8000-000000000001';
select is((select count(*) from public.my_published_event_schedule_identity('identity-live')),0::bigint,'pending membership empty');
update public.club_members set approval_status='approved',active=false where id='a4200000-0000-4000-8000-000000000001';
select is((select count(*) from public.my_published_event_schedule_identity('identity-live')),0::bigint,'inactive member empty');
update public.club_members set active=true where id='a4200000-0000-4000-8000-000000000001';
update public.schedules set is_published=false where id='a4400000-0000-4000-8000-000000000001';
select is((select count(*) from public.my_published_event_schedule_identity('identity-live')),0::bigint,'unpublished empty');
update public.schedules set is_published=true where id='a4400000-0000-4000-8000-000000000001';
update public.tos_events set status='cancelled' where slug='identity-live';
select is((select count(*) from public.my_published_event_schedule_identity('identity-live')),0::bigint,'cancelled empty');
update public.tos_events set status='open' where slug='identity-live';
delete from public.tos_history_round_participants where event_player_id='a4600000-0000-4000-8000-000000000001';
select is((select count(*) from public.my_published_event_schedule_identity('identity-live')),0::bigint,'no schedule participation empty');
insert into public.schedules(id,event_id,title,event_date,created_by,created_by_name,start_time,end_time,match_minutes,courts,players_private,participants_public,schedule_private,schedule_public,statistics_private,diagnostics,is_published)
 select 'a4400000-0000-4000-8000-000000000002',event_id,title,event_date,created_by,created_by_name,start_time,end_time,match_minutes,courts,players_private,participants_public,schedule_private,schedule_public,statistics_private,diagnostics,false
 from public.schedules where id='a4400000-0000-4000-8000-000000000001';
update public.schedules set is_published=false where id='a4400000-0000-4000-8000-000000000001';
update public.schedules set is_published=true where id='a4400000-0000-4000-8000-000000000002';
select set_config('request.jwt.claim.sub','a4100000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.my_published_event_schedule_identity('identity-live')),0::bigint,'stale snapshot cannot match replacement publication');
update public.tos_history_events set source_schedule_id='a4400000-0000-4000-8000-000000000002' where id='a4500000-0000-4000-8000-000000000001';
select is((select schedule_id from public.my_published_event_schedule_identity('identity-live')),'a4400000-0000-4000-8000-000000000002'::uuid,'mapping follows current publication');
select * from finish();
rollback;
