begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select col_type_is('public', 'registrations', 'waitlisted_attending_since',
    'timestamp with time zone', 'waitlistcycle gebruikt een server-side timestamp');
select has_table('public', 'waitlist_promotion_notifications',
    'duurzame waitlist-promotion outbox bestaat');
select ok(
    not exists (
        select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = 'waitlist_promotion_notifications'
           and column_name ilike '%email%'
    ),
    'outbox bewaart geen e-mailadres'
);
select ok(
    (select relrowsecurity from pg_class
      where oid = 'public.waitlist_promotion_notifications'::regclass),
    'outbox heeft RLS ingeschakeld'
);
select ok(
    not has_table_privilege('anon', 'public.waitlist_promotion_notifications', 'SELECT')
    and not has_table_privilege('authenticated', 'public.waitlist_promotion_notifications', 'SELECT')
    and not has_table_privilege('service_role', 'public.waitlist_promotion_notifications', 'SELECT'),
    'browserrollen en worker hebben geen directe outboxread'
);
select ok(
    not has_table_privilege('anon', 'public.waitlist_promotion_notifications', 'INSERT,UPDATE,DELETE')
    and not has_table_privilege('authenticated', 'public.waitlist_promotion_notifications', 'INSERT,UPDATE,DELETE')
    and not has_table_privilege('service_role', 'public.waitlist_promotion_notifications', 'INSERT,UPDATE,DELETE'),
    'outbox heeft geen brede writes'
);

select has_function('public', 'claim_waitlist_promotion_notifications', array['integer'],
    'smalle worker claim-RPC bestaat');
select has_function('public', 'waitlist_promotion_delivery_target', array['uuid'],
    'smalle delivery revalidation-RPC bestaat');
select has_function('public', 'complete_waitlist_promotion_notification',
    array['uuid','boolean','text'], 'smalle completion-RPC bestaat');
select ok(
    (select bool_and(prosecdef and proconfig = array['search_path=""']::text[])
       from pg_proc
      where oid in (
          'public._reconcile_waitlist_promotions(uuid)'::regprocedure,
          'public._registrations_reconcile_waitlist_promotions()'::regprocedure,
          'public._events_reconcile_waitlist_promotions()'::regprocedure,
          'public.claim_waitlist_promotion_notifications(integer)'::regprocedure,
          'public.waitlist_promotion_delivery_target(uuid)'::regprocedure,
          'public.complete_waitlist_promotion_notification(uuid,boolean,text)'::regprocedure
      )),
    'alle promotionfuncties zijn SECURITY DEFINER met lege search_path'
);
select ok(
    has_function_privilege('service_role', 'public.claim_waitlist_promotion_notifications(integer)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.waitlist_promotion_delivery_target(uuid)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.complete_waitlist_promotion_notification(uuid,boolean,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.claim_waitlist_promotion_notifications(integer)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.claim_waitlist_promotion_notifications(integer)', 'EXECUTE'),
    'alleen de geïsoleerde worker kan delivery-RPCs uitvoeren'
);
select ok(
    not has_function_privilege('service_role', 'public._reconcile_waitlist_promotions(uuid)', 'EXECUTE'),
    'interne promotionhelper is uitsluitend trigger-owned'
);
select ok(
    exists (select 1 from pg_trigger
      where tgrelid = 'public.registrations'::regclass
        and tgname = 'registrations_reconcile_waitlist_promotions'
        and not tgisinternal)
    and exists (select 1 from pg_trigger
      where tgrelid = 'public.tos_events'::regclass
        and tgname = 'tos_events_reconcile_waitlist_promotions'
        and not tgisinternal),
    'registration- en capacitymutaties delen dezelfde promotionauthority'
);

insert into auth.users (
    id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
    ('a1000000-0000-4000-8000-000000000001','authenticated','authenticated','one@example.test','{}','{"display_name":"One"}',now(),now()),
    ('a1000000-0000-4000-8000-000000000002','authenticated','authenticated','two@example.test','{}','{"display_name":"Two"}',now(),now()),
    ('a1000000-0000-4000-8000-000000000003','authenticated','authenticated','three@example.test','{}','{"display_name":"Three"}',now(),now()),
    ('a1000000-0000-4000-8000-000000000004','authenticated','authenticated','four@example.test','{}','{"display_name":"Four"}',now(),now()),
    ('a1000000-0000-4000-8000-000000000005','authenticated','authenticated','five@example.test','{}','{"display_name":"Five"}',now(),now());

insert into public.club_members (id, display_name, approval_status, active) values
    ('b1000000-0000-4000-8000-000000000001','One','approved',true),
    ('b1000000-0000-4000-8000-000000000002','Two','approved',true),
    ('b1000000-0000-4000-8000-000000000003','Three','approved',true),
    ('b1000000-0000-4000-8000-000000000004','Four','approved',true),
    ('b1000000-0000-4000-8000-000000000005','Five','approved',true);

update public.profiles as profile
   set member_id = ('b1000000-0000-4000-8000-' || right(profile.id::text, 12))::uuid
 where profile.id::text like 'a1000000-%';

insert into public.tos_events (
    id, slug, title, sport, starts_at, ends_at, signup_deadline, status, max_participants
) values
    ('c1000000-0000-4000-8000-000000000001','web10-decline','Decline promotion','padel',now()+interval '10 days',now()+interval '10 days 2 hours',now()+interval '9 days','open',2),
    ('c1000000-0000-4000-8000-000000000002','web10-capacity','Capacity promotion','tennis',now()+interval '11 days',now()+interval '11 days 2 hours',now()+interval '10 days','open',1),
    ('c1000000-0000-4000-8000-000000000003','web10-cancelled','Cancelled','padel',now()+interval '12 days',now()+interval '12 days 2 hours',now()+interval '11 days','open',1),
    ('c1000000-0000-4000-8000-000000000004','web10-ended','Ended','padel',now()-interval '2 days',now()-interval '2 days'+interval '2 hours',null,'closed',1),
    ('c1000000-0000-4000-8000-000000000005','web10-delete','Delete promotion','padel',now()+interval '13 days',now()+interval '13 days 2 hours',now()+interval '12 days','open',1),
    ('c1000000-0000-4000-8000-000000000006','web10-waitlist-delete','Waitlist delete','tennis',now()+interval '14 days',now()+interval '14 days 2 hours',now()+interval '13 days','open',1);

insert into public.registrations (
    id,event_id,user_id,member_id,response,available_from,available_until,source
) values
    ('d1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','attending',now()+interval '10 days',now()+interval '10 days 2 hours','admin'),
    ('d1000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002','attending',now()+interval '10 days',now()+interval '10 days 2 hours','admin'),
    ('d1000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000003','attending',now()+interval '10 days',now()+interval '10 days 2 hours','admin');

select is((select count(*) from public.waitlist_promotion_notifications), 0::bigint,
    'direct placement en waitlist signup sturen geen promotion notification');
select ok((select waitlisted_attending_since = attending_since from public.registrations
    where id='d1000000-0000-4000-8000-000000000003'),
    'de registration buiten capaciteit bewaart haar waitlistcycle');

update public.registrations set response='declined', available_from=null, available_until=null
 where id='d1000000-0000-4000-8000-000000000001';
select is((select count(*) from public.waitlist_promotion_notifications
    where registration_id='d1000000-0000-4000-8000-000000000003'), 1::bigint,
    'decline van een geplaatste participant maakt exact één outboxrow');
select is((select count(*) from public.waitlist_promotion_notifications
    where event_id='c1000000-0000-4000-8000-000000000002'), 0::bigint,
    'promotion reconciliation blijft strikt event-scoped');
select is((select count(distinct registration_id::text || promotion_attending_since::text)
    from public.waitlist_promotion_notifications),
    (select count(*) from public.waitlist_promotion_notifications),
    'outbox is idempotent per registration attendance-cycle');

select public._reconcile_waitlist_promotions('c1000000-0000-4000-8000-000000000001');
select is((select count(*) from public.waitlist_promotion_notifications
    where registration_id='d1000000-0000-4000-8000-000000000003'), 1::bigint,
    'herhaalde reconciliation maakt geen duplicate notification');

insert into public.registrations (
    id,event_id,user_id,member_id,response,available_from,available_until,source
) values
    ('d1000000-0000-4000-8000-000000000011','c1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','attending',now()+interval '11 days',now()+interval '11 days 2 hours','admin'),
    ('d1000000-0000-4000-8000-000000000012','c1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002','attending',now()+interval '11 days',now()+interval '11 days 2 hours','admin'),
    ('d1000000-0000-4000-8000-000000000013','c1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000003','attending',now()+interval '11 days',now()+interval '11 days 2 hours','admin');
update public.tos_events set max_participants=3
 where id='c1000000-0000-4000-8000-000000000002';
select is((select count(*) from public.waitlist_promotion_notifications
    where event_id='c1000000-0000-4000-8000-000000000002'), 2::bigint,
    'capacity increase enqueuet iedere nieuw geplaatste waitlistregistration');
update public.tos_events set max_participants=1
 where id='c1000000-0000-4000-8000-000000000002';
select is((select count(*) from public.waitlist_promotion_notifications
    where event_id='c1000000-0000-4000-8000-000000000002'), 2::bigint,
    'capacity decrease maakt geen nieuwe notification');

insert into public.registrations (
    id,event_id,user_id,member_id,response,available_from,available_until,source
) values
    ('d1000000-0000-4000-8000-000000000021','c1000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','attending',now()+interval '12 days',now()+interval '12 days 2 hours','admin'),
    ('d1000000-0000-4000-8000-000000000022','c1000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002','attending',now()+interval '12 days',now()+interval '12 days 2 hours','admin');
update public.tos_events set status='cancelled'
 where id='c1000000-0000-4000-8000-000000000003';
update public.registrations set response='declined', available_from=null, available_until=null
 where id='d1000000-0000-4000-8000-000000000021';
select is((select count(*) from public.waitlist_promotion_notifications
    where event_id='c1000000-0000-4000-8000-000000000003'), 0::bigint,
    'cancelled event enqueuet geen promotionmail');

insert into public.registrations (
    id,event_id,user_id,member_id,response,available_from,available_until,source
) values
    ('d1000000-0000-4000-8000-000000000031','c1000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','attending',now()-interval '2 days',now()-interval '2 days'+interval '2 hours','admin'),
    ('d1000000-0000-4000-8000-000000000032','c1000000-0000-4000-8000-000000000004','a1000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002','attending',now()-interval '2 days',now()-interval '2 days'+interval '2 hours','admin');
update public.registrations set response='declined', available_from=null, available_until=null
 where id='d1000000-0000-4000-8000-000000000031';
select is((select count(*) from public.waitlist_promotion_notifications
    where event_id='c1000000-0000-4000-8000-000000000004'), 0::bigint,
    'ended event enqueuet geen promotionmail');

insert into public.registrations (
    id,event_id,user_id,member_id,response,available_from,available_until,source
) values
    ('d1000000-0000-4000-8000-000000000041','c1000000-0000-4000-8000-000000000005','a1000000-0000-4000-8000-000000000004','b1000000-0000-4000-8000-000000000004','attending',now()+interval '13 days',now()+interval '13 days 2 hours','admin'),
    ('d1000000-0000-4000-8000-000000000042','c1000000-0000-4000-8000-000000000005','a1000000-0000-4000-8000-000000000005','b1000000-0000-4000-8000-000000000005','attending',now()+interval '13 days',now()+interval '13 days 2 hours','admin');
delete from public.registrations where member_id='b1000000-0000-4000-8000-000000000004';
delete from public.club_members where id='b1000000-0000-4000-8000-000000000004';
select is((select count(*) from public.waitlist_promotion_notifications
    where registration_id='d1000000-0000-4000-8000-000000000042'), 1::bigint,
    'verwijdering van een geplaatst memberaccount promoveert de volgende veilig');

insert into public.registrations (
    id,event_id,user_id,member_id,response,available_from,available_until,source
) values
    ('d1000000-0000-4000-8000-000000000051','c1000000-0000-4000-8000-000000000006','a1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','attending',now()+interval '14 days',now()+interval '14 days 2 hours','admin'),
    ('d1000000-0000-4000-8000-000000000052','c1000000-0000-4000-8000-000000000006','a1000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002','attending',now()+interval '14 days',now()+interval '14 days 2 hours','admin');
delete from public.registrations where id='d1000000-0000-4000-8000-000000000052';
select is((select count(*) from public.waitlist_promotion_notifications
    where event_id='c1000000-0000-4000-8000-000000000006'), 0::bigint,
    'verwijdering van een waitlistmember maakt geen onterechte promotionmail');

select set_config(
    'web10.stale_notification_id',
    (select id::text from public.waitlist_promotion_notifications
      where registration_id='d1000000-0000-4000-8000-000000000003'),
    true
);
select set_config(
    'web10.deliverable_notification_id',
    (select id::text from public.waitlist_promotion_notifications
      where registration_id='d1000000-0000-4000-8000-000000000042'),
    true
);

set local role service_role;
select is((select count(*) from public.claim_waitlist_promotion_notifications(10)), 4::bigint,
    'worker claimt de vier deliverable promotionnotifications atomair');
reset role;

update public.registrations set response='declined', available_from=null, available_until=null
 where id='d1000000-0000-4000-8000-000000000003';
set local role service_role;
select is((select count(*) from public.waitlist_promotion_delivery_target(
    current_setting('web10.stale_notification_id')::uuid)), 0::bigint,
    'delivery revalidation skipt een inmiddels afgemelde recipient');
reset role;
select is((select status from public.waitlist_promotion_notifications
    where registration_id='d1000000-0000-4000-8000-000000000003'), 'skipped',
    'stale promotion wordt expliciet skipped');

set local role service_role;
select ok((select count(*) = 1 from public.waitlist_promotion_delivery_target(
    current_setting('web10.deliverable_notification_id')::uuid)),
    'deliverytarget geeft één actuele recipient terug');
select is(public.complete_waitlist_promotion_notification(
    current_setting('web10.deliverable_notification_id')::uuid, true, null), true,
    'worker markeert een geclaimde notification als sent');
reset role;
select is((select status from public.waitlist_promotion_notifications
    where registration_id='d1000000-0000-4000-8000-000000000042'), 'sent',
    'sentstatus blijft server-side bewaard');

update public.registrations
   set response='attending',
       attending_since=now()+interval '1 minute',
       available_from=now()+interval '10 days',
       available_until=now()+interval '10 days 2 hours'
 where id='d1000000-0000-4000-8000-000000000003';
update public.tos_events set max_participants=1
 where id='c1000000-0000-4000-8000-000000000001';
update public.tos_events set max_participants=2
 where id='c1000000-0000-4000-8000-000000000001';
select is((select count(*) from public.waitlist_promotion_notifications
    where registration_id='d1000000-0000-4000-8000-000000000003'), 2::bigint,
    're-attend met nieuwe attending_since kan één nieuwe promotioncycle opleveren');

select * from finish();
rollback;
