-- WEB-5A0: staff-eventbeheer via de eigen authenticated JWT en RLS.
-- Membership blijft uitsluitend participantrechten bepalen; een actief
-- planner-/adminprofiel is de volledige staffpredicate.

alter table public.tos_events
    alter column created_by set default auth.uid();

grant insert (
    slug,
    title,
    sport,
    starts_at,
    ends_at,
    signup_deadline,
    status
)
on table public.tos_events to authenticated;

grant update (
    title,
    signup_deadline,
    status
)
on table public.tos_events to authenticated;

create policy tos_events_select_staff
on public.tos_events
for select
to authenticated
using (
    exists (
        select 1
        from public.profiles as profile
        where profile.id = (select auth.uid())
          and profile.active
          and profile.role in ('planner', 'admin')
    )
);

create policy tos_events_insert_staff
on public.tos_events
for insert
to authenticated
with check (
    created_by = (select auth.uid())
    and exists (
        select 1
        from public.profiles as profile
        where profile.id = (select auth.uid())
          and profile.active
          and profile.role in ('planner', 'admin')
    )
);

create policy tos_events_update_staff
on public.tos_events
for update
to authenticated
using (
    exists (
        select 1
        from public.profiles as profile
        where profile.id = (select auth.uid())
          and profile.active
          and profile.role in ('planner', 'admin')
    )
)
with check (
    exists (
        select 1
        from public.profiles as profile
        where profile.id = (select auth.uid())
          and profile.active
          and profile.role in ('planner', 'admin')
    )
);
