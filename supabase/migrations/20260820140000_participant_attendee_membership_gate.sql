-- Beperk de sociale deelnemersnamenlijst tot accounts met een geldige
-- participant-membership. profiles.role blijft uitsluitend de staff-as bepalen.

create or replace function public.participant_event_attendee_names(p_event_id uuid)
returns table (display_name text)
language sql
stable
security definer
set search_path = ''
as $$
    select member.display_name
    from public.registrations as registration
    join public.club_members as member
      on member.id = registration.member_id
    where auth.uid() is not null
      and registration.event_id = p_event_id
      and registration.response = 'attending'
      and member.active
      and member.approval_status = 'approved'
      and exists (
          select 1
          from public.profiles as viewer
          join public.club_members as viewer_member
            on viewer_member.id = viewer.member_id
          where viewer.id = auth.uid()
            and viewer.active
            and viewer_member.active
            and viewer_member.approval_status = 'approved'
      )
      and exists (
          select 1
          from public.tos_events as event
          where event.id = registration.event_id
            and event.status = 'open'
            and event.ends_at >= now()
      )
    order by lower(member.display_name), member.display_name, member.id;
$$;

revoke all privileges on function public.participant_event_attendee_names(uuid)
    from public, anon, authenticated;
grant execute on function public.participant_event_attendee_names(uuid)
    to authenticated;
