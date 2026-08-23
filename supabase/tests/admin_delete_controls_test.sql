begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Catalog and privilege contract.
select has_function('public','admin_delete_tos_event',array['uuid'],'admin event-delete RPC exists');
select has_function('public','admin_delete_member_account',array['uuid'],'admin member-delete RPC exists');
select ok((select bool_and(prosecdef and proconfig = array['search_path=""']::text[])
  from pg_proc where oid in (
    'public.admin_delete_tos_event(uuid)'::regprocedure,
    'public.admin_delete_member_account(uuid)'::regprocedure
  )), 'delete RPCs are SECURITY DEFINER with empty search_path');
select ok(not has_function_privilege('anon','public.admin_delete_tos_event(uuid)','EXECUTE')
  and not has_function_privilege('anon','public.admin_delete_member_account(uuid)','EXECUTE'),
  'anon cannot execute either delete RPC');
select ok(has_function_privilege('authenticated','public.admin_delete_tos_event(uuid)','EXECUTE')
  and has_function_privilege('authenticated','public.admin_delete_member_account(uuid)','EXECUTE'),
  'authenticated execute is bounded by the database admin guard');
select ok(not has_table_privilege('authenticated','public.tos_events','DELETE')
  and not has_table_privilege('authenticated','public.club_members','DELETE')
  and not has_table_privilege('authenticated','public.registrations','DELETE'),
  'no broad authenticated DELETE grant exists');
select is(pg_get_function_arguments('public.admin_delete_tos_event(uuid)'::regprocedure),
  'p_event_id uuid','event delete accepts only event ID');
select is(pg_get_function_arguments('public.admin_delete_member_account(uuid)'::regprocedure),
  'p_member_id uuid','member delete accepts only member ID');
select ok(position('auth.uid()' in lower(pg_get_functiondef('public.admin_delete_tos_event(uuid)'::regprocedure))) > 0
  and position('actor.role = ''admin''' in lower(pg_get_functiondef('public.admin_delete_tos_event(uuid)'::regprocedure))) > 0,
  'event deletion derives an active admin actor from auth.uid()');
select ok(position('auth.uid()' in lower(pg_get_functiondef('public.admin_delete_member_account(uuid)'::regprocedure))) > 0
  and position('actor.role = ''admin''' in lower(pg_get_functiondef('public.admin_delete_member_account(uuid)'::regprocedure))) > 0,
  'member deletion derives an active admin actor from auth.uid()');
select ok(position('service_role' in lower(pg_get_functiondef('public.admin_delete_member_account(uuid)'::regprocedure))) = 0,
  'member deletion contains no service role path');
select ok((select is_nullable = 'YES' from information_schema.columns
  where table_schema='public' and table_name='tos_events' and column_name='created_by'),
  'event creator snapshot can become null after account deletion');
select ok((select is_nullable = 'YES' from information_schema.columns
  where table_schema='public' and table_name='schedules' and column_name='created_by'),
  'schedule creator snapshot can become null after account deletion');

insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 ('81000000-0000-4000-8000-000000000001','authenticated','authenticated','admin.delete@example.test','{}','{"display_name":"Admin"}',now(),now()),
 ('81000000-0000-4000-8000-000000000002','authenticated','authenticated','planner.delete@example.test','{}','{"display_name":"Planner"}',now(),now()),
 ('81000000-0000-4000-8000-000000000003','authenticated','authenticated','participant.delete@example.test','{}','{"display_name":"Participant"}',now(),now()),
 ('81000000-0000-4000-8000-000000000004','authenticated','authenticated','inactive.delete@example.test','{}','{"display_name":"Inactive"}',now(),now()),
 ('81000000-0000-4000-8000-000000000005','authenticated','authenticated','past.target@example.test','{}','{"display_name":"Past Target"}',now(),now()),
 ('81000000-0000-4000-8000-000000000006','authenticated','authenticated','future.target@example.test','{}','{"display_name":"Future Target"}',now(),now()),
 ('81000000-0000-4000-8000-000000000007','authenticated','authenticated','other.member@example.test','{}','{"display_name":"Other"}',now(),now()),
 ('81000000-0000-4000-8000-000000000008','authenticated','authenticated','planner.target@example.test','{}','{"display_name":"Planner Target"}',now(),now()),
 ('81000000-0000-4000-8000-000000000009','authenticated','authenticated','admin.target@example.test','{}','{"display_name":"Admin Target"}',now(),now());

insert into public.club_members (id,display_name,approval_status,active) values
 ('82000000-0000-4000-8000-000000000001','Admin','approved',true),
 ('82000000-0000-4000-8000-000000000002','Past Target','approved',true),
 ('82000000-0000-4000-8000-000000000003','Future Target','approved',true),
 ('82000000-0000-4000-8000-000000000004','Other','approved',true),
 ('82000000-0000-4000-8000-000000000005','Unlinked','approved',true),
 ('82000000-0000-4000-8000-000000000006','Planner Target','approved',true),
 ('82000000-0000-4000-8000-000000000007','Admin Target','approved',true);

update public.profiles set
  role = case id
    when '81000000-0000-4000-8000-000000000001' then 'admin'
    when '81000000-0000-4000-8000-000000000002' then 'planner'
    when '81000000-0000-4000-8000-000000000004' then 'admin'
    when '81000000-0000-4000-8000-000000000008' then 'planner'
    when '81000000-0000-4000-8000-000000000009' then 'admin'
    else 'participant' end,
  active = id <> '81000000-0000-4000-8000-000000000004',
  member_id = case id
    when '81000000-0000-4000-8000-000000000001' then '82000000-0000-4000-8000-000000000001'::uuid
    when '81000000-0000-4000-8000-000000000005' then '82000000-0000-4000-8000-000000000002'::uuid
    when '81000000-0000-4000-8000-000000000006' then '82000000-0000-4000-8000-000000000003'::uuid
    when '81000000-0000-4000-8000-000000000007' then '82000000-0000-4000-8000-000000000004'::uuid
    when '81000000-0000-4000-8000-000000000008' then '82000000-0000-4000-8000-000000000006'::uuid
    when '81000000-0000-4000-8000-000000000009' then '82000000-0000-4000-8000-000000000007'::uuid
    else null end
where id::text like '81000000-%';

insert into public.member_sport_profiles(member_id,sport,ranking,active) values
 ('82000000-0000-4000-8000-000000000002','padel',3,true),
 ('82000000-0000-4000-8000-000000000003','padel',4,true);

insert into public.tos_events(id,slug,title,sport,starts_at,ends_at,status,max_participants,created_by) values
 ('83000000-0000-4000-8000-000000000001','delete-event-target','Delete Event','padel',now()-interval '4 days',now()-interval '4 days'+interval '2 hours','closed',24,'81000000-0000-4000-8000-000000000001'),
 ('83000000-0000-4000-8000-000000000002','delete-event-other','Other Event','padel',now()+interval '4 days',now()+interval '4 days 2 hours','open',24,'81000000-0000-4000-8000-000000000005'),
 ('83000000-0000-4000-8000-000000000003','delete-member-past','Past Member Event','padel',now()-interval '3 days',now()-interval '3 days'+interval '2 hours','closed',24,'81000000-0000-4000-8000-000000000005');

insert into public.registrations(id,event_id,user_id,member_id,response,available_from,available_until,source) values
 ('84000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000003','82000000-0000-4000-8000-000000000004','attending',now()-interval '4 days',now()-interval '4 days'+interval '2 hours','admin'),
 ('84000000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000006','82000000-0000-4000-8000-000000000003','attending',now()+interval '4 days',now()+interval '4 days 2 hours','self'),
 ('84000000-0000-4000-8000-000000000003','83000000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000005','82000000-0000-4000-8000-000000000002','attending',now()-interval '3 days',now()-interval '3 days'+interval '2 hours','self');

insert into public.tos_event_planner_drafts(event_id,players,selected_courts,revision,updated_by,updated_by_name) values
 ('83000000-0000-4000-8000-000000000001','[]','[]',1,'81000000-0000-4000-8000-000000000001','Admin'),
 ('83000000-0000-4000-8000-000000000003',
  '[{"row_id":"85000000-0000-4000-8000-000000000001","name":"Past Target","ranking":3,"included":true,"available_from":"20:00","available_until":"22:00","member_id":"82000000-0000-4000-8000-000000000002","user_id":"81000000-0000-4000-8000-000000000005","registration_id":"84000000-0000-4000-8000-000000000003","registration_updated_at":"2026-08-22T10:00:00Z"}]',
  '[]',1,'81000000-0000-4000-8000-000000000001','Admin');

insert into public.schedules(id,event_id,title,event_date,created_by,created_by_name,start_time,end_time,match_minutes,courts,players_private,participants_public,schedule_private,schedule_public,statistics_private,diagnostics,is_published,generation_seed,planner_draft_revision) values
 ('86000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','Delete Event',current_date-4,'81000000-0000-4000-8000-000000000001','Admin','20:00','22:00',20,'[]','[]','[]','[]','[]','[]','{}',true,1,1),
 ('86000000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000003','Past Member Event',current_date-3,'81000000-0000-4000-8000-000000000005','Past Target','20:00','22:00',20,'[]',
  '[{"row_id":"85000000-0000-4000-8000-000000000001","name":"Past Target","ranking":3,"included":true,"member_id":"82000000-0000-4000-8000-000000000002","user_id":"81000000-0000-4000-8000-000000000005","registration_id":"84000000-0000-4000-8000-000000000003","registration_updated_at":"2026-08-22T10:00:00Z"}]',
  '["Past Target"]','[]','[]','[]','{}',true,1,1);

insert into public.tos_history_events(id,event_id,source_schedule_id,title_snapshot,sport,starts_at,ends_at) values
 ('87000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','86000000-0000-4000-8000-000000000001','Delete Event','padel',now()-interval '4 days',now()-interval '4 days'+interval '2 hours'),
 ('87000000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000003','86000000-0000-4000-8000-000000000002','Past Member Event','padel',now()-interval '3 days',now()-interval '3 days'+interval '2 hours');
insert into public.tos_history_event_players(id,history_event_id,source_row_id,member_id,display_name_snapshot,player_order) values
 ('88000000-0000-4000-8000-000000000001','87000000-0000-4000-8000-000000000002','85000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000002','Past Target',1),
 ('88000000-0000-4000-8000-000000000002','87000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000001','Admin',1),
 ('88000000-0000-4000-8000-000000000003','87000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000003','82000000-0000-4000-8000-000000000003','Future Target',2),
 ('88000000-0000-4000-8000-000000000004','87000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000004','82000000-0000-4000-8000-000000000004','Other',3),
 ('88000000-0000-4000-8000-000000000005','87000000-0000-4000-8000-000000000002','85000000-0000-4000-8000-000000000005','82000000-0000-4000-8000-000000000001','Admin',2),
 ('88000000-0000-4000-8000-000000000006','87000000-0000-4000-8000-000000000002','85000000-0000-4000-8000-000000000006','82000000-0000-4000-8000-000000000004','Other',3);
insert into public.tos_history_rounds(id,history_event_id,round_number,starts_at,ends_at) values
 ('89000000-0000-4000-8000-000000000001','87000000-0000-4000-8000-000000000001',1,now()-interval '4 days',now()-interval '4 days'+interval '20 minutes'),
 ('89000000-0000-4000-8000-000000000002','87000000-0000-4000-8000-000000000002',1,now()-interval '3 days',now()-interval '3 days'+interval '20 minutes');
insert into public.tos_history_matches(id,history_event_id,round_id,match_index,court_name) values
 ('8a000000-0000-4000-8000-000000000001','87000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001',1,'Kremer Baan'),
 ('8a000000-0000-4000-8000-000000000002','87000000-0000-4000-8000-000000000002','89000000-0000-4000-8000-000000000002',1,'Kremer Baan');
insert into public.tos_history_round_participants(history_event_id,round_id,event_player_id,state,match_id,team_no,slot_no) values
 ('87000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000002','playing','8a000000-0000-4000-8000-000000000001',1,1),
 ('87000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000003','playing','8a000000-0000-4000-8000-000000000001',1,2),
 ('87000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000004','playing','8a000000-0000-4000-8000-000000000001',2,1),
 ('87000000-0000-4000-8000-000000000002','89000000-0000-4000-8000-000000000002','88000000-0000-4000-8000-000000000001','playing','8a000000-0000-4000-8000-000000000002',1,1),
 ('87000000-0000-4000-8000-000000000002','89000000-0000-4000-8000-000000000002','88000000-0000-4000-8000-000000000005','playing','8a000000-0000-4000-8000-000000000002',1,2),
 ('87000000-0000-4000-8000-000000000002','89000000-0000-4000-8000-000000000002','88000000-0000-4000-8000-000000000006','playing','8a000000-0000-4000-8000-000000000002',2,1);
insert into public.member_contact_requests(member_a_id,member_b_id,requester_member_id,recipient_member_id,status,responded_at) values
 ('82000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000003','82000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000003','accepted',now()),
 ('82000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000004','82000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000004','accepted',now()),
 ('82000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000004','82000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000004','accepted',now());

set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.admin_delete_tos_event('83000000-0000-4000-8000-000000000001')$$,
 '42501','Admin authorization required.','planner cannot delete an event');
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.admin_delete_member_account('82000000-0000-4000-8000-000000000002')$$,
 '42501','Admin authorization required.','participant cannot delete a member');
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000004',true);
select throws_ok($$select public.admin_delete_tos_event('83000000-0000-4000-8000-000000000001')$$,
 '42501','Admin authorization required.','inactive admin cannot delete an event');

select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.admin_delete_tos_event('83000000-0000-4000-8000-000000000099')$$,
 'P0002','TOS event not found.','invalid event target fails safely');
select throws_ok($$select public.admin_delete_member_account('82000000-0000-4000-8000-000000000099')$$,
 'P0002','Club member not found.','invalid member target fails safely');
select throws_ok($$select public.admin_delete_member_account('82000000-0000-4000-8000-000000000001')$$,
 '42501','An admin cannot delete their own account.','admin self-delete is blocked database-side');
select throws_ok($$select public.admin_delete_member_account('82000000-0000-4000-8000-000000000003')$$,
 '55000','Club member still participates in an active TOS event.','future attending registration blocks member deletion');
select is((select count(*) from public.my_accepted_history_contact('82000000-0000-4000-8000-000000000003')),1::bigint,
  'accepted contact with history only in target event is visible before deletion');
select is((select count(*) from public.my_accepted_history_contact('82000000-0000-4000-8000-000000000004')),1::bigint,
  'accepted contact with additional retained history is visible before deletion');
select is(public.admin_delete_tos_event('83000000-0000-4000-8000-000000000001'),true,'active admin deletes one TOS event');
reset role;

select is((select count(*) from public.tos_events where id='83000000-0000-4000-8000-000000000001'),0::bigint,'event row is deleted');
select is((select count(*) from public.registrations where event_id='83000000-0000-4000-8000-000000000001'),0::bigint,'event registrations are deleted');
select is((select count(*) from public.tos_event_planner_drafts where event_id='83000000-0000-4000-8000-000000000001'),0::bigint,'event planner draft is deleted');
select is((select count(*) from public.schedules where event_id='83000000-0000-4000-8000-000000000001'),0::bigint,'event schedules are deleted');
select is((select count(*) from public.tos_history_events where event_id='83000000-0000-4000-8000-000000000001'),0::bigint,'event history is deleted');
select is((select count(*) from public.tos_events where id='83000000-0000-4000-8000-000000000002'),1::bigint,'other event remains intact');
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
select is((select count(*) from public.my_accepted_history_contact('82000000-0000-4000-8000-000000000003')),0::bigint,
  'contact disclosure disappears when deleted event was the only shared history');
select is((select count(*) from public.my_accepted_history_contact('82000000-0000-4000-8000-000000000004')),1::bigint,
  'contact disclosure remains when another shared history event exists');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
select is(public.admin_delete_member_account('82000000-0000-4000-8000-000000000002'),true,'active admin deletes linked past member/account');
reset role;
select is((select count(*) from auth.users where id='81000000-0000-4000-8000-000000000005'),0::bigint,'linked Auth user is actually deleted');
select is((select count(*) from public.profiles where id='81000000-0000-4000-8000-000000000005'),0::bigint,'linked profile is cascade-deleted');
select is((select count(*) from public.club_members where id='82000000-0000-4000-8000-000000000002'),0::bigint,'club member is deleted');
select is((select count(*) from public.member_sport_profiles where member_id='82000000-0000-4000-8000-000000000002'),0::bigint,'sport profile is deleted');
select is((select count(*) from public.registrations where member_id='82000000-0000-4000-8000-000000000002'),0::bigint,'past registrations are deleted');
select is((select count(*) from public.member_contact_requests where member_a_id='82000000-0000-4000-8000-000000000002' or member_b_id='82000000-0000-4000-8000-000000000002'),0::bigint,'contact consent rows are deleted');
select is((select member_id from public.tos_history_event_players where id='88000000-0000-4000-8000-000000000001'),null::uuid,'history stable member identity is cleared');
select is((select display_name_snapshot from public.tos_history_event_players where id='88000000-0000-4000-8000-000000000001'),'Past Target','history display snapshot remains');
select is((select created_by from public.tos_events where id='83000000-0000-4000-8000-000000000003'),null::uuid,'past event owned by deleted account remains with null creator');
select is((select created_by from public.schedules where id='86000000-0000-4000-8000-000000000002'),null::uuid,'past schedule owned by deleted account remains with null creator');
select ok(position('Past Target' in (select players::text from public.tos_event_planner_drafts where event_id='83000000-0000-4000-8000-000000000003')) > 0
  and position('82000000-0000-4000-8000-000000000002' in (select players::text from public.tos_event_planner_drafts where event_id='83000000-0000-4000-8000-000000000003')) = 0
  and position('81000000-0000-4000-8000-000000000005' in (select players::text from public.tos_event_planner_drafts where event_id='83000000-0000-4000-8000-000000000003')) = 0,
  'past planner snapshot keeps name but loses stable deleted identities');
select ok(position('Past Target' in (select players_private::text from public.schedules where id='86000000-0000-4000-8000-000000000002')) > 0
  and position('82000000-0000-4000-8000-000000000002' in (select players_private::text from public.schedules where id='86000000-0000-4000-8000-000000000002')) = 0,
  'past private schedule keeps name but loses stable member identity');

set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
select is(public.admin_delete_member_account('82000000-0000-4000-8000-000000000005'),true,'unlinked member can also be deleted');
select is(public.admin_delete_member_account('82000000-0000-4000-8000-000000000006'),true,'active admin can delete another planner account');
select is(public.admin_delete_member_account('82000000-0000-4000-8000-000000000007'),true,'active admin can delete another admin account');
reset role;
select is((select count(*) from public.club_members where id='82000000-0000-4000-8000-000000000005'),0::bigint,'unlinked member is gone');
select is((select count(*) from auth.users where id='81000000-0000-4000-8000-000000000006'),1::bigint,'blocked future member account remains intact');
select is((select count(*) from auth.users where id in ('81000000-0000-4000-8000-000000000008','81000000-0000-4000-8000-000000000009')),0::bigint,'linked planner and admin targets are actually deleted');
select is((select count(*) from public.club_members where id='82000000-0000-4000-8000-000000000004'),1::bigint,'unrelated member remains intact');

select * from finish();
rollback;
