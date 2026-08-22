drop function public.staff_member_directory();

create function public.staff_member_directory()
returns table (
    member_id uuid,
    display_name text,
    login_email text,
    approval_status text,
    member_active boolean,
    account_linked boolean,
    padel_profile_active boolean,
    padel_ranking smallint,
    tennis_profile_active boolean,
    tennis_ranking smallint
)
language sql
stable
security definer
set search_path = ''
as $$
    select member.id,
           member.display_name,
           linked_user.email::text,
           member.approval_status,
           member.active,
           linked_profile.id is not null,
           coalesce(padel.active, false),
           padel.ranking,
           coalesce(tennis.active, false),
           tennis.ranking
    from public.club_members as member
    left join public.profiles as linked_profile
      on linked_profile.member_id = member.id
    left join auth.users as linked_user
      on linked_user.id = linked_profile.id
    left join public.member_sport_profiles as padel
      on padel.member_id = member.id and padel.sport = 'padel'
    left join public.member_sport_profiles as tennis
      on tennis.member_id = member.id and tennis.sport = 'tennis'
    where exists (
        select 1
        from public.profiles as viewer
        where viewer.id = auth.uid()
          and viewer.active
          and viewer.role in ('planner', 'admin')
    )
    order by lower(member.display_name),
             member.display_name,
             lower(linked_user.email::text) nulls last,
             member.id;
$$;

revoke all privileges on function public.staff_member_directory()
    from public, anon, authenticated;

grant execute on function public.staff_member_directory()
    to authenticated;
