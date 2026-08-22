begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select is(
    pg_get_function_result('public.staff_member_directory()'::regprocedure),
    'TABLE(member_id uuid, display_name text, login_email text, approval_status text, member_active boolean, account_linked boolean, padel_profile_active boolean, padel_ranking smallint, tennis_profile_active boolean, tennis_ranking smallint)',
    'staffdirectory voegt uitsluitend nullable login-email aan het bestaande readmodel toe'
);
select ok(
    (select procedure.prosecdef
       and procedure.provolatile = 's'
       and procedure.proconfig = array['search_path=""']::text[]
     from pg_proc as procedure
     where procedure.oid = 'public.staff_member_directory()'::regprocedure),
    'staffdirectory blijft STABLE SECURITY DEFINER met lege search_path'
);
select ok(
    has_function_privilege('authenticated', 'public.staff_member_directory()', 'EXECUTE')
    and not has_function_privilege('anon', 'public.staff_member_directory()', 'EXECUTE'),
    'alleen authenticated heeft execute; staffcontrole blijft in de functie'
);
select ok(
    not has_table_privilege('authenticated', 'auth.users', 'SELECT')
    and not has_table_privilege('anon', 'auth.users', 'SELECT'),
    'de emailprojectie voegt geen brede auth.users SELECT-grant toe'
);
select ok(
    position('viewer.role' in lower(pg_get_functiondef('public.staff_member_directory()'::regprocedure))) > 0
    and position('linked_user.email' in lower(pg_get_functiondef('public.staff_member_directory()'::regprocedure))) > 0
    and position('viewer.member_id' in lower(pg_get_functiondef('public.staff_member_directory()'::regprocedure))) = 0,
    'staffcapability blijft role-based en membership-vrij; email komt uit gekoppelde auth-user'
);

insert into auth.users (
    id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
    ('a6220000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'planner@example.test', '{}', '{"display_name":"Planner"}', now(), now()),
    ('a6220000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'admin@example.test', '{}', '{"display_name":"Admin"}', now(), now()),
    ('a6220000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'participant@example.test', '{}', '{"display_name":"Participant"}', now(), now()),
    ('a6220000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'inactive@example.test', '{}', '{"display_name":"Inactive"}', now(), now()),
    ('a6220000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'joyce.one@example.test', '{}', '{"display_name":"Joyce Walta"}', now(), now()),
    ('a6220000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'joyce.two@example.test', '{}', '{"display_name":"Joyce Walta"}', now(), now());

insert into public.club_members (id, display_name, approval_status, active)
values
    ('b6220000-0000-4000-8000-000000000001', 'Joyce Walta', 'approved', true),
    ('b6220000-0000-4000-8000-000000000002', 'Joyce Walta', 'approved', true),
    ('b6220000-0000-4000-8000-000000000003', 'Los clublid', 'pending', true);

update public.profiles
set role = case id
        when 'a6220000-0000-4000-8000-000000000001'::uuid then 'planner'
        when 'a6220000-0000-4000-8000-000000000002'::uuid then 'admin'
        when 'a6220000-0000-4000-8000-000000000004'::uuid then 'planner'
        else 'participant'
    end,
    active = id <> 'a6220000-0000-4000-8000-000000000004'::uuid,
    member_id = case id
        when 'a6220000-0000-4000-8000-000000000005'::uuid then 'b6220000-0000-4000-8000-000000000001'::uuid
        when 'a6220000-0000-4000-8000-000000000006'::uuid then 'b6220000-0000-4000-8000-000000000002'::uuid
        else null
    end
where id::text like 'a6220000-%';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a6220000-0000-4000-8000-000000000001', true);
select results_eq(
    $$select display_name, login_email, account_linked
      from public.staff_member_directory()
      order by login_email nulls last$$,
    $$values
      ('Joyce Walta'::text, 'joyce.one@example.test'::text, true),
      ('Joyce Walta'::text, 'joyce.two@example.test'::text, true),
      ('Los clublid'::text, null::text, false)$$,
    'planner zonder membership onderscheidt dubbele namen via login-email en krijgt een veilige fallback'
);

select set_config('request.jwt.claim.sub', 'a6220000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.staff_member_directory()), 3::bigint,
    'admin zonder membership heeft dezelfde smalle staffdirectory');

select set_config('request.jwt.claim.sub', 'a6220000-0000-4000-8000-000000000003', true);
select is((select count(*) from public.staff_member_directory()), 0::bigint,
    'participant krijgt geen member- of emailresultaten');

select set_config('request.jwt.claim.sub', 'a6220000-0000-4000-8000-000000000004', true);
select is((select count(*) from public.staff_member_directory()), 0::bigint,
    'inactieve planner krijgt geen member- of emailresultaten');

reset role;
set local role anon;
select throws_ok(
    $$select * from public.staff_member_directory()$$,
    '42501', null,
    'anon kan de staffdirectory niet uitvoeren'
);
reset role;

select * from finish();
rollback;
