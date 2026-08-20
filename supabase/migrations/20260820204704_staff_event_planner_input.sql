-- WEB-5B0: event-scoped plannerinput voor actieve planner-/adminaccounts.
-- De SECURITY DEFINER-functie voorkomt brede staff-SELECT-grants op de
-- onderliggende registrations-, members- en sportprofieltabel.

create function public.staff_event_planner_input(p_event_id uuid)
returns table (
    registration_id uuid,
    user_id uuid,
    member_id uuid,
    response text,
    available_from timestamptz,
    available_until timestamptz,
    registration_updated_at timestamptz,
    display_name text,
    approval_status text,
    member_active boolean,
    sport_profile_active boolean,
    ranking smallint
)
language sql
stable
security definer
set search_path = ''
as $$
    select registration.id,
           registration.user_id,
           registration.member_id,
           registration.response,
           registration.available_from,
           registration.available_until,
           registration.updated_at,
           member.display_name,
           member.approval_status,
           member.active,
           coalesce(sport_profile.active, false),
           sport_profile.ranking
    from public.tos_events as event
    join public.registrations as registration
      on registration.event_id = event.id
    join public.club_members as member
      on member.id = registration.member_id
    left join public.member_sport_profiles as sport_profile
      on sport_profile.member_id = registration.member_id
     and sport_profile.sport = event.sport
    where event.id = p_event_id
      and exists (
          select 1
          from public.profiles as viewer
          where viewer.id = auth.uid()
            and viewer.active
            and viewer.role in ('planner', 'admin')
      )
    order by registration.created_at asc,
             registration.id asc;
$$;

revoke all privileges on function public.staff_event_planner_input(uuid)
    from public, anon, authenticated;
grant execute on function public.staff_event_planner_input(uuid)
    to authenticated;
