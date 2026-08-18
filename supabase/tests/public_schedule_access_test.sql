begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(31);

insert into auth.users (
    id,
    aud,
    role,
    email,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
)
values (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    'authenticated',
    'authenticated',
    'schedule-owner@example.test',
    '{}'::jsonb,
    '{"display_name":"Schedule Owner"}'::jsonb,
    now(),
    now()
);

insert into public.schedules (
    id,
    title,
    event_date,
    created_by,
    created_by_name,
    start_time,
    end_time,
    match_minutes,
    courts,
    players_private,
    participants_public,
    schedule_private,
    schedule_public,
    statistics_private,
    diagnostics,
    is_published
)
values
    (
        '11111111-1111-4111-8111-111111111111',
        'Gepubliceerd',
        current_date,
        'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        'Schedule Owner',
        '20:00',
        '22:00',
        20,
        '["Baan 1"]'::jsonb,
        '[{"name":"Private Published"}]'::jsonb,
        '["Public Player"]'::jsonb,
        '[{"private":true}]'::jsonb,
        '[{"public":true}]'::jsonb,
        '[{"private":true}]'::jsonb,
        '{"private":true}'::jsonb,
        true
    ),
    (
        '22222222-2222-4222-8222-222222222222',
        'Niet gepubliceerd',
        current_date + 1,
        'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        'Schedule Owner',
        '20:00',
        '22:00',
        20,
        '["Baan 1"]'::jsonb,
        '[{"name":"Private Unpublished"}]'::jsonb,
        '["Hidden Player"]'::jsonb,
        '[{"private":true}]'::jsonb,
        '[{"public":false}]'::jsonb,
        '[{"private":true}]'::jsonb,
        '{"private":true}'::jsonb,
        false
    );

select ok(
    (select relrowsecurity from pg_class where oid = 'public.schedules'::regclass),
    'RLS blijft ingeschakeld op schedules'
);

select policies_are(
    'public',
    'schedules',
    array['schedules_select_published'],
    'alleen de bedoelde openbare SELECT-policy bestaat'
);

select set_config('request.jwt.claim.sub', '', true);
set local role anon;

select is(
    (select count(*) from public.schedules where id = '11111111-1111-4111-8111-111111111111'),
    1::bigint,
    'anon kan een gepubliceerd schema lezen'
);
select is(
    (select count(*) from public.schedules where id = '22222222-2222-4222-8222-222222222222'),
    0::bigint,
    'anon kan een niet-gepubliceerd schema niet lezen'
);
select throws_ok(
    $$select players_private from public.schedules$$,
    '42501',
    null,
    'anon kan players_private niet lezen'
);
select throws_ok(
    $$select schedule_private from public.schedules$$,
    '42501',
    null,
    'anon kan schedule_private niet lezen'
);
select throws_ok(
    $$select statistics_private from public.schedules$$,
    '42501',
    null,
    'anon kan statistics_private niet lezen'
);
select throws_ok(
    $$select diagnostics from public.schedules$$,
    '42501',
    null,
    'anon kan diagnostics niet lezen'
);

reset role;
select set_config(
    'request.jwt.claim.sub',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    true
);
set local role authenticated;

select is(
    (select count(*) from public.schedules where id = '11111111-1111-4111-8111-111111111111'),
    1::bigint,
    'authenticated kan een gepubliceerd schema lezen'
);
select is(
    (select count(*) from public.schedules where id = '22222222-2222-4222-8222-222222222222'),
    0::bigint,
    'authenticated kan een niet-gepubliceerd schema niet lezen'
);
select throws_ok(
    $$select diagnostics from public.schedules$$,
    '42501',
    null,
    'authenticated kan diagnostics niet lezen'
);
select throws_ok(
    $$select players_private from public.schedules$$,
    '42501',
    null,
    'authenticated kan players_private niet lezen'
);
select throws_ok(
    $$select schedule_private from public.schedules$$,
    '42501',
    null,
    'authenticated kan schedule_private niet lezen'
);
select throws_ok(
    $$select statistics_private from public.schedules$$,
    '42501',
    null,
    'authenticated kan statistics_private niet lezen'
);
select throws_ok(
    $$select title from public.schedules$$,
    '42501',
    null,
    'authenticated kan een niet-benodigde openbare kolom niet lezen'
);

reset role;

select ok(
    not has_table_privilege('anon', 'public.schedules', 'INSERT'),
    'anon heeft geen INSERT op schedules'
);
select ok(
    not has_table_privilege('anon', 'public.schedules', 'UPDATE'),
    'anon heeft geen UPDATE op schedules'
);
select ok(
    not has_table_privilege('anon', 'public.schedules', 'DELETE'),
    'anon heeft geen DELETE op schedules'
);
select ok(
    not has_table_privilege('anon', 'public.schedules', 'TRUNCATE'),
    'anon heeft geen TRUNCATE op schedules'
);
select ok(
    not has_table_privilege('authenticated', 'public.schedules', 'INSERT'),
    'authenticated heeft geen INSERT op schedules'
);
select ok(
    not has_table_privilege('authenticated', 'public.schedules', 'UPDATE'),
    'authenticated heeft geen UPDATE op schedules'
);
select ok(
    not has_table_privilege('authenticated', 'public.schedules', 'DELETE'),
    'authenticated heeft geen DELETE op schedules'
);
select ok(
    not has_table_privilege('authenticated', 'public.schedules', 'TRUNCATE'),
    'authenticated heeft geen TRUNCATE op schedules'
);
select is(
    (
        select count(*)
        from information_schema.column_privileges
        where table_schema = 'public'
          and table_name = 'schedules'
          and grantee = 'anon'
          and privilege_type in ('INSERT', 'UPDATE')
    ),
    0::bigint,
    'anon heeft ook geen kolomgebonden INSERT- of UPDATE-rechten'
);
select is(
    (
        select count(*)
        from information_schema.column_privileges
        where table_schema = 'public'
          and table_name = 'schedules'
          and grantee = 'authenticated'
          and privilege_type in ('INSERT', 'UPDATE')
    ),
    0::bigint,
    'authenticated heeft ook geen kolomgebonden INSERT- of UPDATE-rechten'
);

select ok(
    has_column_privilege('service_role', 'public.schedules', 'players_private', 'SELECT'),
    'service_role behoudt private schedule-read'
);
select ok(
    has_table_privilege('service_role', 'public.schedules', 'INSERT'),
    'service_role behoudt INSERT'
);
select ok(
    has_table_privilege('service_role', 'public.schedules', 'UPDATE'),
    'service_role behoudt UPDATE'
);
select ok(
    has_table_privilege('service_role', 'public.schedules', 'DELETE'),
    'service_role behoudt DELETE'
);

select is(
    (
        select count(*)
        from information_schema.column_privileges
        where table_schema = 'public'
          and table_name = 'schedules'
          and grantee = 'anon'
          and privilege_type = 'SELECT'
    ),
    10::bigint,
    'anon heeft SELECT op exact tien openbare kolommen'
);
select is(
    (
        select count(*)
        from information_schema.column_privileges
        where table_schema = 'public'
          and table_name = 'schedules'
          and grantee = 'authenticated'
          and privilege_type = 'SELECT'
    ),
    10::bigint,
    'authenticated heeft SELECT op exact tien openbare kolommen'
);

select * from finish();
rollback;
