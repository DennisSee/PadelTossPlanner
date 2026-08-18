-- Veilige participantreads voor Mijn TOS en de sociale deelnemersnamenlijst.
-- De bestaande registrations-RLS blijft ongewijzigd: gebruikers lezen uitsluitend
-- hun eigen registratierijen. Namen van andere deelnemers zijn alleen bereikbaar
-- via de nauw begrensde RPC onderaan deze migration.

create or replace function public.participant_has_registration_for_event(
    p_event_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select auth.uid() is not null
       and exists (
           select 1
           from public.registrations as registration
           where registration.event_id = p_event_id
             and registration.user_id = auth.uid()
       );
$$;

revoke all privileges on function public.participant_has_registration_for_event(uuid)
    from public, anon, authenticated;
grant execute on function public.participant_has_registration_for_event(uuid)
    to authenticated;

create policy tos_events_select_own_registration
on public.tos_events
for select
to authenticated
using (public.participant_has_registration_for_event(id));

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
          where viewer.id = auth.uid()
            and viewer.active
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
