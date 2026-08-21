begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(72);

-- Cataloguscontract: bestaande participantreads blijven staan en alleen de
-- drie gerichte staffpolicies komen erbij.
select ok(
    (select relrowsecurity from pg_class where oid = 'public.tos_events'::regclass),
    'RLS staat aan op tos_events'
);
select ok(
    exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'tos_events'
          and policyname = 'tos_events_select_open'
          and cmd = 'SELECT'
    ),
    'bestaande open-eventpolicy blijft bestaan'
);
select ok(
    exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'tos_events'
          and policyname = 'tos_events_select_own_registration'
          and cmd = 'SELECT'
    ),
    'bestaande own-registration-eventpolicy blijft bestaan'
);
select ok(
    exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'tos_events'
          and policyname = 'tos_events_select_staff'
          and cmd = 'SELECT'
          and roles = array['authenticated']::name[]
    ),
    'staff SELECT-policy bestaat alleen voor authenticated'
);
select ok(
    exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'tos_events'
          and policyname = 'tos_events_insert_staff'
          and cmd = 'INSERT'
          and roles = array['authenticated']::name[]
    ),
    'staff INSERT-policy bestaat alleen voor authenticated'
);
select ok(
    exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'tos_events'
          and policyname = 'tos_events_update_staff'
          and cmd = 'UPDATE'
          and roles = array['authenticated']::name[]
          and qual is not null
          and with_check is not null
    ),
    'staff UPDATE-policy heeft USING en WITH CHECK'
);
select ok(
    not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'tos_events'
          and cmd = 'DELETE'
          and 'authenticated' = any(roles)
    ),
    'authenticated heeft geen DELETE-policy op tos_events'
);
select ok(
    not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'tos_events'
          and policyname in (
              'tos_events_select_staff',
              'tos_events_insert_staff',
              'tos_events_update_staff'
          )
          and lower(coalesce(qual, '') || ' ' || coalesce(with_check, ''))
              ~ 'member_id|club_members|approval_status'
    ),
    'staffpolicies bevatten geen membershippredicate'
);
select ok(
    (
        select bool_and(
            lower(coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%profile.active%'
            and lower(coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%planner%'
            and lower(coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%admin%'
            and lower(coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%auth.uid%'
        )
        from pg_policies
        where schemaname = 'public'
          and tablename = 'tos_events'
          and policyname in (
              'tos_events_select_staff',
              'tos_events_insert_staff',
              'tos_events_update_staff'
          )
    ),
    'iedere staffpolicy gebruikt actieve planner/admin plus auth.uid()'
);
select ok(
    (
        select lower(with_check) like '%created_by%auth.uid%'
        from pg_policies
        where schemaname = 'public'
          and tablename = 'tos_events'
          and policyname = 'tos_events_insert_staff'
    ),
    'INSERT-policy bindt created_by aan auth.uid()'
);
select is(
    (
        select pg_get_expr(attribute.adbin, attribute.adrelid)
        from pg_attrdef as attribute
        join pg_attribute as column_definition
          on column_definition.attrelid = attribute.adrelid
         and column_definition.attnum = attribute.adnum
        where attribute.adrelid = 'public.tos_events'::regclass
          and column_definition.attname = 'created_by'
    ),
    'auth.uid()',
    'created_by-default wordt database-side uit auth.uid() bepaald'
);

select is(
    (
        select to_jsonb(array_agg(column_name::text order by column_name))
        from information_schema.column_privileges
        where table_schema = 'public'
          and table_name = 'tos_events'
          and grantee = 'authenticated'
          and privilege_type = 'SELECT'
    ),
    '["ends_at", "id", "max_participants", "signup_deadline", "slug", "sport", "starts_at", "status", "title"]'::jsonb,
    'authenticated SELECT blijft exact de veilige eventprojectie inclusief capaciteit'
);
select is(
    (
        select to_jsonb(array_agg(column_name::text order by column_name))
        from information_schema.column_privileges
        where table_schema = 'public'
          and table_name = 'tos_events'
          and grantee = 'authenticated'
          and privilege_type = 'INSERT'
    ),
    '["ends_at", "max_participants", "signup_deadline", "slug", "sport", "starts_at", "status", "title"]'::jsonb,
    'authenticated INSERT is exact tot de acht eventvelden inclusief capaciteit beperkt'
);
select is(
    (
        select to_jsonb(array_agg(column_name::text order by column_name))
        from information_schema.column_privileges
        where table_schema = 'public'
          and table_name = 'tos_events'
          and grantee = 'authenticated'
          and privilege_type = 'UPDATE'
    ),
    '["max_participants", "signup_deadline", "status", "title"]'::jsonb,
    'authenticated UPDATE is exact tot titel, deadline, status en capaciteit beperkt'
);
select ok(
    not has_table_privilege('authenticated', 'public.tos_events', 'DELETE'),
    'authenticated heeft geen DELETE op tos_events'
);
select ok(
    not has_table_privilege('authenticated', 'public.tos_events', 'TRUNCATE'),
    'authenticated heeft geen TRUNCATE op tos_events'
);
select ok(
    has_table_privilege('service_role', 'public.tos_events', 'SELECT')
    and has_table_privilege('service_role', 'public.tos_events', 'INSERT')
    and has_table_privilege('service_role', 'public.tos_events', 'UPDATE')
    and has_table_privilege('service_role', 'public.tos_events', 'DELETE'),
    'bestaande service_role-eventrechten blijven intact'
);
select is(
    (
        select to_jsonb(array_agg(conname::text order by conname))
        from pg_constraint
        where conrelid = 'public.tos_events'::regclass
          and conname like 'tos_events_%_check'
    ),
    '["tos_events_max_participants_check", "tos_events_signup_deadline_check", "tos_events_slug_check", "tos_events_sport_check", "tos_events_status_check", "tos_events_time_range_check", "tos_events_title_check"]'::jsonb,
    'alle bestaande eventconstraints plus de capaciteitsconstraint blijven intact'
);
select ok(
    exists (
        select 1
        from pg_trigger
        where tgrelid = 'public.tos_events'::regclass
          and tgname = 'tos_events_set_updated_at'
          and not tgisinternal
    ),
    'bestaande updated_at-trigger blijft intact'
);

-- Testidentiteiten: staff heeft bewust geen member_id. De participant heeft
-- wel een approved membership om aan te tonen dat dit geen staffrechten geeft.
insert into auth.users (
    id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
    (
        '5a000000-0000-4000-8000-000000000001',
        'authenticated', 'authenticated', 'staff-planner@example.test',
        '{}'::jsonb, '{"display_name":"Staff Planner"}'::jsonb, now(), now()
    ),
    (
        '5a000000-0000-4000-8000-000000000002',
        'authenticated', 'authenticated', 'staff-admin@example.test',
        '{}'::jsonb, '{"display_name":"Staff Admin"}'::jsonb, now(), now()
    ),
    (
        '5a000000-0000-4000-8000-000000000003',
        'authenticated', 'authenticated', 'staff-participant@example.test',
        '{}'::jsonb, '{"display_name":"Staff Participant"}'::jsonb, now(), now()
    ),
    (
        '5a000000-0000-4000-8000-000000000004',
        'authenticated', 'authenticated', 'inactive-planner@example.test',
        '{}'::jsonb, '{"display_name":"Inactive Planner"}'::jsonb, now(), now()
    ),
    (
        '5a000000-0000-4000-8000-000000000005',
        'authenticated', 'authenticated', 'inactive-admin@example.test',
        '{}'::jsonb, '{"display_name":"Inactive Admin"}'::jsonb, now(), now()
    );

update public.profiles
set role = case id
        when '5a000000-0000-4000-8000-000000000001'::uuid then 'planner'
        when '5a000000-0000-4000-8000-000000000002'::uuid then 'admin'
        when '5a000000-0000-4000-8000-000000000004'::uuid then 'planner'
        when '5a000000-0000-4000-8000-000000000005'::uuid then 'admin'
        else 'participant'
    end,
    active = id not in (
        '5a000000-0000-4000-8000-000000000004'::uuid,
        '5a000000-0000-4000-8000-000000000005'::uuid
    )
where id between
    '5a000000-0000-4000-8000-000000000001'::uuid
    and '5a000000-0000-4000-8000-000000000005'::uuid;

insert into public.club_members (id, display_name, approval_status, active)
values (
    '5b000000-0000-4000-8000-000000000003',
    'Staff Participant',
    'approved',
    true
);
update public.profiles
set member_id = '5b000000-0000-4000-8000-000000000003'
where id = '5a000000-0000-4000-8000-000000000003';

insert into public.tos_events (
    id, slug, title, sport, starts_at, ends_at, signup_deadline, status, created_by
)
values
    (
        '5c000000-0000-4000-8000-000000000001',
        'staff-security-draft', 'Staff Security Draft', 'padel',
        '2099-01-10 20:00:00+00', '2099-01-10 22:00:00+00',
        '2099-01-09 20:00:00+00', 'draft',
        '5a000000-0000-4000-8000-000000000001'
    ),
    (
        '5c000000-0000-4000-8000-000000000002',
        'staff-security-open', 'Staff Security Open', 'padel',
        '2099-02-10 20:00:00+00', '2099-02-10 22:00:00+00',
        '2099-02-09 20:00:00+00', 'open',
        '5a000000-0000-4000-8000-000000000001'
    ),
    (
        '5c000000-0000-4000-8000-000000000003',
        'staff-security-closed', 'Staff Security Closed', 'tennis',
        '2099-03-10 20:00:00+00', '2099-03-10 22:00:00+00',
        '2099-03-09 20:00:00+00', 'closed',
        '5a000000-0000-4000-8000-000000000002'
    ),
    (
        '5c000000-0000-4000-8000-000000000004',
        'staff-security-cancelled', 'Staff Security Cancelled', 'tennis',
        '2099-04-10 20:00:00+00', '2099-04-10 22:00:00+00',
        '2099-04-09 20:00:00+00', 'cancelled',
        '5a000000-0000-4000-8000-000000000002'
    );

insert into public.registrations (
    event_id, user_id, member_id, response, available_from, available_until, source
)
values (
    '5c000000-0000-4000-8000-000000000003',
    '5a000000-0000-4000-8000-000000000003',
    '5b000000-0000-4000-8000-000000000003',
    'attending',
    '2099-03-10 20:00:00+00',
    '2099-03-10 22:00:00+00',
    'admin'
);

select is(
    (
        select count(*)
        from public.profiles
        where id in (
            '5a000000-0000-4000-8000-000000000001',
            '5a000000-0000-4000-8000-000000000002'
        )
          and member_id is null
    ),
    2::bigint,
    'planner en admin hebben voor staff-eventbeheer geen membership'
);

-- Actieve planner en admin lezen alle statussen en maken beide sporten aan.
set local role authenticated;
select set_config('request.jwt.claim.sub', '5a000000-0000-4000-8000-000000000001', true);
select results_eq(
    $sql$
        select status
        from public.tos_events
        where slug like 'staff-security-%'
        order by status
    $sql$,
    $sql$ values ('cancelled'::text), ('closed'::text), ('draft'::text), ('open'::text) $sql$,
    'actieve planner zonder membership leest alle eventstatussen'
);
select lives_ok(
    $sql$
        insert into public.tos_events (
            slug, title, sport, starts_at, ends_at, signup_deadline, status
        ) values (
            'staff-planner-padel', 'Planner Padel', 'padel',
            '2099-05-10 20:00:00+00', '2099-05-10 22:00:00+00',
            '2099-05-09 20:00:00+00', 'draft'
        )
    $sql$,
    'actieve planner maakt zonder created_by een padel-event aan'
);
select lives_ok(
    $sql$
        insert into public.tos_events (
            slug, title, sport, starts_at, ends_at, signup_deadline, status
        ) values (
            'staff-planner-tennis', 'Planner Tennis', 'tennis',
            '2099-06-10 20:00:00+00', '2099-06-10 22:00:00+00',
            '2099-06-09 20:00:00+00', 'open'
        )
    $sql$,
    'actieve planner maakt zonder membership een tennis-event aan'
);

select set_config('request.jwt.claim.sub', '5a000000-0000-4000-8000-000000000002', true);
select results_eq(
    $sql$
        select status
        from public.tos_events
        where slug like 'staff-security-%'
        order by status
    $sql$,
    $sql$ values ('cancelled'::text), ('closed'::text), ('draft'::text), ('open'::text) $sql$,
    'actieve admin zonder membership leest alle eventstatussen'
);
select lives_ok(
    $sql$
        insert into public.tos_events (
            slug, title, sport, starts_at, ends_at, signup_deadline, status
        ) values (
            'staff-admin-padel', 'Admin Padel', 'padel',
            '2099-07-10 20:00:00+00', '2099-07-10 22:00:00+00',
            '2099-07-09 20:00:00+00', 'closed'
        )
    $sql$,
    'actieve admin maakt zonder created_by een padel-event aan'
);
select lives_ok(
    $sql$
        insert into public.tos_events (
            slug, title, sport, starts_at, ends_at, signup_deadline, status
        ) values (
            'staff-admin-tennis', 'Admin Tennis', 'tennis',
            '2099-08-10 20:00:00+00', '2099-08-10 22:00:00+00',
            '2099-08-09 20:00:00+00', 'cancelled'
        )
    $sql$,
    'actieve admin maakt zonder membership een tennis-event aan'
);
select set_config('request.jwt.claim.sub', '', true);
reset role;

select results_eq(
    $sql$
        select slug, created_by::text
        from public.tos_events
        where slug in (
            'staff-planner-padel', 'staff-planner-tennis',
            'staff-admin-padel', 'staff-admin-tennis'
        )
        order by slug
    $sql$,
    $sql$
        values
            ('staff-admin-padel'::text, '5a000000-0000-4000-8000-000000000002'::text),
            ('staff-admin-tennis'::text, '5a000000-0000-4000-8000-000000000002'::text),
            ('staff-planner-padel'::text, '5a000000-0000-4000-8000-000000000001'::text),
            ('staff-planner-tennis'::text, '5a000000-0000-4000-8000-000000000001'::text)
    $sql$,
    'created_by is voor planner en admin exact hun JWT auth.uid()'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '5a000000-0000-4000-8000-000000000001', true);
select lives_ok(
    $sql$update public.tos_events set title = 'Planner wijzigde Admin' where slug = 'staff-admin-padel'$sql$,
    'planner kan de titel van ieder event wijzigen'
);
select lives_ok(
    $sql$update public.tos_events set signup_deadline = '2099-07-08 20:00:00+00' where slug = 'staff-admin-padel'$sql$,
    'planner kan de deadline van ieder event wijzigen'
);
select lives_ok(
    $sql$update public.tos_events set status = 'open' where slug = 'staff-admin-padel'$sql$,
    'planner kan iedere geldige status instellen'
);
select set_config('request.jwt.claim.sub', '5a000000-0000-4000-8000-000000000002', true);
select lives_ok(
    $sql$update public.tos_events set title = 'Admin wijzigde Planner' where slug = 'staff-planner-padel'$sql$,
    'admin kan de titel van ieder event wijzigen'
);
select lives_ok(
    $sql$update public.tos_events set signup_deadline = '2099-05-08 20:00:00+00' where slug = 'staff-planner-padel'$sql$,
    'admin kan de deadline van ieder event wijzigen'
);
select lives_ok(
    $sql$update public.tos_events set status = 'cancelled' where slug = 'staff-planner-padel'$sql$,
    'admin kan iedere geldige status instellen'
);

-- Creator en overige immutable velden zijn niet schrijfbaar met de JWT.
select throws_ok(
    $sql$
        insert into public.tos_events (
            slug, title, sport, starts_at, ends_at, status, created_by
        ) values (
            'forged-creator', 'Forged Creator', 'padel',
            '2099-09-10 20:00:00+00', '2099-09-10 22:00:00+00', 'draft',
            '5a000000-0000-4000-8000-000000000001'
        )
    $sql$,
    '42501',
    null,
    'authenticated kan created_by niet in de INSERT opnemen'
);
select throws_ok(
    $sql$update public.tos_events set slug = 'changed-slug' where slug = 'staff-admin-tennis'$sql$,
    '42501', null, 'authenticated kan slug niet wijzigen'
);
select throws_ok(
    $sql$update public.tos_events set sport = 'padel' where slug = 'staff-admin-tennis'$sql$,
    '42501', null, 'authenticated kan sport niet wijzigen'
);
select throws_ok(
    $sql$update public.tos_events set starts_at = '2099-08-10 19:00:00+00' where slug = 'staff-admin-tennis'$sql$,
    '42501', null, 'authenticated kan starts_at niet wijzigen'
);
select throws_ok(
    $sql$update public.tos_events set ends_at = '2099-08-10 23:00:00+00' where slug = 'staff-admin-tennis'$sql$,
    '42501', null, 'authenticated kan ends_at niet wijzigen'
);
select throws_ok(
    $sql$update public.tos_events set created_by = '5a000000-0000-4000-8000-000000000001' where slug = 'staff-admin-tennis'$sql$,
    '42501', null, 'authenticated kan created_by niet wijzigen'
);
select throws_ok(
    $sql$delete from public.tos_events where slug = 'staff-admin-tennis'$sql$,
    '42501', null, 'actieve staff kan events niet verwijderen'
);
select set_config('request.jwt.claim.sub', '', true);
reset role;
select is(
    (select count(*) from public.tos_events where slug = 'staff-admin-tennis'),
    1::bigint,
    'event blijft na de geweigerde DELETE bestaan'
);

-- Participant: membership geeft bestaande participantreads, nooit staffwrites.
set local role authenticated;
select set_config('request.jwt.claim.sub', '5a000000-0000-4000-8000-000000000003', true);
select is(
    (select count(*) from public.tos_events where slug = 'staff-security-open'),
    1::bigint,
    'participant leest het open event via de bestaande policy'
);
select is(
    (select count(*) from public.tos_events where slug = 'staff-security-draft'),
    0::bigint,
    'participant leest geen draft-event zonder registratie'
);
select is(
    (select count(*) from public.tos_events where slug = 'staff-security-closed'),
    1::bigint,
    'participant leest closed event met eigen registratie via bestaand contract'
);
select is(
    (select count(*) from public.tos_events where slug = 'staff-security-cancelled'),
    0::bigint,
    'participant leest geen cancelled event zonder registratie'
);
select throws_ok(
    $sql$
        insert into public.tos_events (
            slug, title, sport, starts_at, ends_at, status
        ) values (
            'participant-forbidden', 'Participant Forbidden', 'padel',
            '2099-10-10 20:00:00+00', '2099-10-10 22:00:00+00', 'open'
        )
    $sql$,
    '42501', null, 'participant kan geen event aanmaken'
);
select results_eq(
    $sql$
        update public.tos_events
        set title = 'Participant wijzigde open'
        where slug = 'staff-security-open'
        returning 1
    $sql$,
    $sql$select 1 where false$sql$,
    'participant kan zichtbaar open event niet wijzigen'
);
select results_eq(
    $sql$
        update public.tos_events
        set status = 'open'
        where slug = 'staff-security-closed'
        returning 1
    $sql$,
    $sql$select 1 where false$sql$,
    'own-registration-read geeft geen staffupdate op closed event'
);
select throws_ok(
    $sql$delete from public.tos_events where slug = 'staff-security-open'$sql$,
    '42501', null, 'participant kan geen event verwijderen'
);
select set_config('request.jwt.claim.sub', '', true);
reset role;
select is(
    (select title from public.tos_events where slug = 'staff-security-open'),
    'Staff Security Open',
    'participant heeft het open event niet gewijzigd'
);
select is(
    (select status from public.tos_events where slug = 'staff-security-closed'),
    'closed',
    'participant heeft het closed event niet gewijzigd'
);

-- Inactieve staff houdt alleen de publieke open-read en krijgt geen staffwrite.
set local role authenticated;
select set_config('request.jwt.claim.sub', '5a000000-0000-4000-8000-000000000004', true);
select results_eq(
    $sql$
        select slug
        from public.tos_events
        where slug like 'staff-security-%'
        order by slug
    $sql$,
    $sql$ values ('staff-security-open'::text) $sql$,
    'inactieve planner ziet uitsluitend het publieke open event'
);
select throws_ok(
    $sql$
        insert into public.tos_events (
            slug, title, sport, starts_at, ends_at, status
        ) values (
            'inactive-planner-forbidden', 'Inactive Planner', 'padel',
            '2099-11-10 20:00:00+00', '2099-11-10 22:00:00+00', 'draft'
        )
    $sql$,
    '42501', null, 'inactieve planner kan geen event aanmaken'
);
select results_eq(
    $sql$
        update public.tos_events
        set title = 'Inactive Planner wijziging'
        where slug = 'staff-security-open'
        returning 1
    $sql$,
    $sql$select 1 where false$sql$,
    'inactieve planner kan publiek open event niet wijzigen'
);

select set_config('request.jwt.claim.sub', '5a000000-0000-4000-8000-000000000005', true);
select results_eq(
    $sql$
        select slug
        from public.tos_events
        where slug like 'staff-security-%'
        order by slug
    $sql$,
    $sql$ values ('staff-security-open'::text) $sql$,
    'inactieve admin ziet uitsluitend het publieke open event'
);
select throws_ok(
    $sql$
        insert into public.tos_events (
            slug, title, sport, starts_at, ends_at, status
        ) values (
            'inactive-admin-forbidden', 'Inactive Admin', 'tennis',
            '2099-12-10 20:00:00+00', '2099-12-10 22:00:00+00', 'draft'
        )
    $sql$,
    '42501', null, 'inactieve admin kan geen event aanmaken'
);
select results_eq(
    $sql$
        update public.tos_events
        set status = 'closed'
        where slug = 'staff-security-open'
        returning 1
    $sql$,
    $sql$select 1 where false$sql$,
    'inactieve admin kan publiek open event niet wijzigen'
);
select set_config('request.jwt.claim.sub', '', true);
reset role;

-- Bestaande constraints blijven de creategrenzen bepalen.
set local role authenticated;
select set_config('request.jwt.claim.sub', '5a000000-0000-4000-8000-000000000001', true);
select throws_ok(
    $sql$insert into public.tos_events (slug,title,sport,starts_at,ends_at,status) values ('Bad Slug','Bad Slug','padel','2099-01-01 20:00+00','2099-01-01 22:00+00','draft')$sql$,
    '23514', null, 'ongeldige slug blijft geweigerd'
);
select throws_ok(
    $sql$insert into public.tos_events (slug,title,sport,starts_at,ends_at,status) values ('empty-title',' ','padel','2099-01-01 20:00+00','2099-01-01 22:00+00','draft')$sql$,
    '23514', null, 'lege titel blijft geweigerd'
);
select throws_ok(
    $sql$insert into public.tos_events (slug,title,sport,starts_at,ends_at,status) values ('long-title',repeat('x',161),'padel','2099-01-01 20:00+00','2099-01-01 22:00+00','draft')$sql$,
    '23514', null, 'te lange titel blijft geweigerd'
);
select throws_ok(
    $sql$insert into public.tos_events (slug,title,sport,starts_at,ends_at,status) values ('bad-sport','Bad Sport','squash','2099-01-01 20:00+00','2099-01-01 22:00+00','draft')$sql$,
    '23514', null, 'ongeldige sport blijft geweigerd'
);
select throws_ok(
    $sql$insert into public.tos_events (slug,title,sport,starts_at,ends_at,status) values ('bad-time','Bad Time','padel','2099-01-01 22:00+00','2099-01-01 20:00+00','draft')$sql$,
    '23514', null, 'eindtijd voor start blijft geweigerd'
);
select throws_ok(
    $sql$insert into public.tos_events (slug,title,sport,starts_at,ends_at,signup_deadline,status) values ('bad-deadline','Bad Deadline','padel','2099-01-01 20:00+00','2099-01-01 22:00+00','2099-01-01 21:00+00','draft')$sql$,
    '23514', null, 'deadline na start blijft geweigerd'
);
select throws_ok(
    $sql$insert into public.tos_events (slug,title,sport,starts_at,ends_at,status) values ('bad-status','Bad Status','padel','2099-01-01 20:00+00','2099-01-01 22:00+00','archived')$sql$,
    '23514', null, 'ongeldige status blijft geweigerd'
);
select set_config('request.jwt.claim.sub', '', true);
reset role;

-- Geen privilege-uitbreiding buiten tos_events.
select ok(
    not has_table_privilege('authenticated', 'public.registrations', 'DELETE')
    and not has_table_privilege('authenticated', 'public.registrations', 'TRUNCATE'),
    'registrations krijgt geen brede verwijderrechten'
);
select ok(
    not has_table_privilege('authenticated', 'public.member_sport_profiles', 'SELECT')
    and not has_table_privilege('authenticated', 'public.member_sport_profiles', 'UPDATE'),
    'member_sport_profiles blijft afgeschermd'
);
select ok(
    not has_table_privilege('authenticated', 'public.club_members', 'UPDATE'),
    'club_members krijgt geen brede UPDATE'
);
select ok(
    not has_table_privilege('authenticated', 'public.club_settings', 'SELECT')
    and not has_table_privilege('authenticated', 'public.club_settings', 'INSERT')
    and not has_table_privilege('authenticated', 'public.club_settings', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.club_settings', 'DELETE'),
    'club_settings blijft afgeschermd'
);
select ok(
    not has_table_privilege('authenticated', 'public.club_drafts', 'INSERT')
    and not has_table_privilege('authenticated', 'public.club_drafts', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.club_drafts', 'DELETE'),
    'club_drafts krijgt geen authenticated writes'
);
select ok(
    not has_table_privilege('authenticated', 'public.planner_drafts', 'INSERT')
    and not has_table_privilege('authenticated', 'public.planner_drafts', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.planner_drafts', 'DELETE'),
    'planner_drafts krijgt geen authenticated writes'
);
select ok(
    not has_table_privilege('authenticated', 'public.schedules', 'INSERT')
    and not has_table_privilege('authenticated', 'public.schedules', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.schedules', 'DELETE'),
    'schedules krijgt geen authenticated writes'
);
select ok(
    not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'),
    'profiles krijgt geen brede UPDATE'
);

select * from finish();
rollback;
