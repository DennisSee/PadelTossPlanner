-- WEB-10: transactionele waitlist-promotion outbox.
-- Plaatsing blijft volledig afgeleid uit attending_since, registratie-id en eventcapaciteit.

alter table public.registrations
    add column waitlisted_attending_since timestamptz;

create table public.waitlist_promotion_notifications (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.tos_events(id) on delete cascade,
    registration_id uuid not null references public.registrations(id) on delete cascade,
    member_id uuid not null references public.club_members(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    promotion_attending_since timestamptz not null,
    status text not null default 'pending'
        check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
    attempt_count integer not null default 0 check (attempt_count between 0 and 5),
    available_at timestamptz not null default now(),
    claimed_at timestamptz,
    sent_at timestamptz,
    last_error_code text check (
        last_error_code is null
        or last_error_code in ('provider-temporary', 'provider-rejected', 'configuration')
    ),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (registration_id, promotion_attending_since)
);

create index waitlist_promotion_notifications_pending_idx
    on public.waitlist_promotion_notifications (available_at, created_at, id)
    where status = 'pending';

alter table public.waitlist_promotion_notifications enable row level security;
revoke all privileges on table public.waitlist_promotion_notifications
    from public, anon, authenticated, service_role;

create function public._reconcile_waitlist_promotions(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    event_row public.tos_events%rowtype;
begin
    if p_event_id is null then
        return;
    end if;

    select event.*
      into event_row
      from public.tos_events as event
     where event.id = p_event_id
     for update;
    if not found then
        return;
    end if;

    -- Markeer uitsluitend een attendance-cycle die daadwerkelijk buiten de
    -- capaciteit heeft gestaan. Direct geplaatste inschrijvingen krijgen dit
    -- merkteken nooit.
    with ranked as (
        select registration.id,
               registration.attending_since,
               row_number() over (
                   order by registration.attending_since, registration.id
               ) as position
          from public.registrations as registration
         where registration.event_id = p_event_id
           and registration.response = 'attending'
    )
    update public.registrations as registration
       set waitlisted_attending_since = ranked.attending_since
      from ranked
     where registration.id = ranked.id
       and ranked.position > event_row.max_participants
       and registration.waitlisted_attending_since is distinct from ranked.attending_since;

    if event_row.status = 'cancelled' or event_row.ends_at <= now() then
        return;
    end if;

    -- Een eerder gemarkeerde attendance-cycle die nu binnen capaciteit valt,
    -- is daadwerkelijk gepromoveerd. De unieke sleutel maakt retries veilig.
    with ranked as (
        select registration.*,
               row_number() over (
                   order by registration.attending_since, registration.id
               ) as position
          from public.registrations as registration
         where registration.event_id = p_event_id
           and registration.response = 'attending'
    )
    insert into public.waitlist_promotion_notifications (
        event_id,
        registration_id,
        member_id,
        user_id,
        promotion_attending_since
    )
    select p_event_id,
           ranked.id,
           ranked.member_id,
           ranked.user_id,
           ranked.attending_since
      from ranked
     where ranked.position <= event_row.max_participants
       and ranked.waitlisted_attending_since = ranked.attending_since
       and ranked.waitlisted_attending_since is not null
    on conflict (registration_id, promotion_attending_since) do nothing;
end;
$$;

create function public._registrations_reconcile_waitlist_promotions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform public._reconcile_waitlist_promotions(coalesce(new.event_id, old.event_id));
    if tg_op = 'UPDATE' and new.event_id is distinct from old.event_id then
        perform public._reconcile_waitlist_promotions(old.event_id);
    end if;
    return coalesce(new, old);
end;
$$;

create trigger registrations_reconcile_waitlist_promotions
    after insert or delete or update of response, attending_since, event_id
    on public.registrations
    for each row execute function public._registrations_reconcile_waitlist_promotions();

create function public._events_reconcile_waitlist_promotions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform public._reconcile_waitlist_promotions(new.id);
    return new;
end;
$$;

create trigger tos_events_reconcile_waitlist_promotions
    after update of max_participants on public.tos_events
    for each row
    when (new.max_participants is distinct from old.max_participants)
    execute function public._events_reconcile_waitlist_promotions();

create function public.claim_waitlist_promotion_notifications(p_limit integer default 10)
returns table (notification_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
    if p_limit is null or p_limit not between 1 and 50 then
        raise exception 'Invalid notification claim limit.' using errcode = '22023';
    end if;

    update public.waitlist_promotion_notifications as notification
       set status = 'pending',
           claimed_at = null,
           available_at = now(),
           updated_at = now()
     where notification.status = 'processing'
       and notification.claimed_at < now() - interval '15 minutes'
       and notification.attempt_count < 5;

    update public.waitlist_promotion_notifications as notification
       set status = 'failed',
           claimed_at = null,
           updated_at = now()
     where notification.status = 'processing'
       and notification.claimed_at < now() - interval '15 minutes'
       and notification.attempt_count >= 5;

    return query
    with candidates as (
        select notification.id
          from public.waitlist_promotion_notifications as notification
         where notification.status = 'pending'
           and notification.available_at <= now()
         order by notification.available_at, notification.created_at, notification.id
         for update skip locked
         limit p_limit
    ), claimed as (
        update public.waitlist_promotion_notifications as notification
           set status = 'processing',
               attempt_count = notification.attempt_count + 1,
               claimed_at = now(),
               last_error_code = null,
               updated_at = now()
          from candidates
         where notification.id = candidates.id
        returning notification.id
    )
    select claimed.id from claimed order by claimed.id;
end;
$$;

create function public.waitlist_promotion_delivery_target(p_notification_id uuid)
returns table (
    notification_id uuid,
    recipient_email text,
    event_title text,
    event_slug text,
    event_sport text,
    event_starts_at timestamptz,
    event_ends_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    deliverable boolean;
begin
    select exists (
        select 1
          from public.waitlist_promotion_notifications as notification
          join public.registrations as registration
            on registration.id = notification.registration_id
           and registration.event_id = notification.event_id
           and registration.user_id = notification.user_id
           and registration.member_id = notification.member_id
          join public.tos_events as event on event.id = notification.event_id
          join public.profiles as profile
            on profile.id = notification.user_id
           and profile.member_id = notification.member_id
           and profile.active
          join public.club_members as member
            on member.id = notification.member_id
           and member.active
           and member.approval_status = 'approved'
          join auth.users as account
            on account.id = notification.user_id
           and nullif(btrim(account.email), '') is not null
         where notification.id = p_notification_id
           and notification.status = 'processing'
           and registration.response = 'attending'
           and registration.attending_since = notification.promotion_attending_since
           and registration.waitlisted_attending_since = notification.promotion_attending_since
           and event.status <> 'cancelled'
           and event.ends_at > now()
           and (
               select count(*)
                 from public.registrations as earlier
                where earlier.event_id = registration.event_id
                  and earlier.response = 'attending'
                  and (earlier.attending_since, earlier.id)
                      <= (registration.attending_since, registration.id)
           ) <= event.max_participants
    ) into deliverable;

    if not deliverable then
        update public.waitlist_promotion_notifications as notification
           set status = 'skipped',
               claimed_at = null,
               updated_at = now()
         where notification.id = p_notification_id
           and notification.status = 'processing';
        return;
    end if;

    return query
    select notification.id,
           account.email::text,
           event.title,
           event.slug,
           event.sport,
           event.starts_at,
           event.ends_at
      from public.waitlist_promotion_notifications as notification
      join public.tos_events as event on event.id = notification.event_id
      join auth.users as account on account.id = notification.user_id
     where notification.id = p_notification_id
       and notification.status = 'processing';
end;
$$;

create function public.complete_waitlist_promotion_notification(
    p_notification_id uuid,
    p_success boolean,
    p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    affected integer;
begin
    if p_notification_id is null or p_success is null
       or (not p_success and p_error_code not in (
           'provider-temporary', 'provider-rejected', 'configuration'
       )) then
        raise exception 'Invalid notification result.' using errcode = '22023';
    end if;

    update public.waitlist_promotion_notifications as notification
       set status = case
               when p_success then 'sent'
               when notification.attempt_count >= 5 then 'failed'
               else 'pending'
           end,
           sent_at = case when p_success then now() else null end,
           claimed_at = null,
           available_at = case
               when p_success or notification.attempt_count >= 5
                   then notification.available_at
               else now() + interval '5 minutes'
           end,
           last_error_code = case when p_success then null else p_error_code end,
           updated_at = now()
     where notification.id = p_notification_id
       and notification.status = 'processing';
    get diagnostics affected = row_count;
    return affected = 1;
end;
$$;

revoke all privileges on function public._reconcile_waitlist_promotions(uuid),
    public._registrations_reconcile_waitlist_promotions(),
    public._events_reconcile_waitlist_promotions(),
    public.claim_waitlist_promotion_notifications(integer),
    public.waitlist_promotion_delivery_target(uuid),
    public.complete_waitlist_promotion_notification(uuid,boolean,text)
    from public, anon, authenticated;

revoke all privileges on function public._reconcile_waitlist_promotions(uuid),
    public._registrations_reconcile_waitlist_promotions(),
    public._events_reconcile_waitlist_promotions()
    from service_role;

grant execute on function public.claim_waitlist_promotion_notifications(integer),
    public.waitlist_promotion_delivery_target(uuid),
    public.complete_waitlist_promotion_notification(uuid,boolean,text)
    to service_role;
