-- WEB-10.4A: publication-scoped opaque keys; never expose club/member identity.
-- Snapshot player IDs are random and replaced on republication. They are not
-- source_row_id, member_id or user_id. No data rewrite or table grants.
create function public._published_live_identity(p_schedule_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
    select jsonb_build_object(
        'players', (select coalesce(jsonb_agg(jsonb_build_object(
            'key', player.id, 'name', player.display_name_snapshot
        ) order by player.player_order), '[]'::jsonb)
          from public.tos_history_event_players as player
         where player.history_event_id = history.id),
        'rounds', (select coalesce(jsonb_agg(jsonb_build_object(
            'number', round.round_number, 'starts_at', round.starts_at, 'ends_at', round.ends_at,
            'slots', (select coalesce(jsonb_agg(jsonb_build_object(
                'key', slot.event_player_id, 'state', slot.state,
                'court', match.court_name, 'team', slot.team_no
            ) order by slot.event_player_id), '[]'::jsonb)
              from public.tos_history_round_participants as slot
              left join public.tos_history_matches as match on match.id = slot.match_id
             where slot.history_event_id = history.id and slot.round_id = round.id)
        ) order by round.round_number), '[]'::jsonb)
          from public.tos_history_rounds as round where round.history_event_id = history.id)
    )
      from public.tos_history_events as history
      join public.schedules as schedule on schedule.id = history.source_schedule_id
      join public.tos_events as event on event.id = history.event_id and schedule.event_id = event.id
     where schedule.id = p_schedule_id and schedule.is_published and event.status <> 'cancelled'
       and 1 = (select count(*) from public.schedules as published
                 where published.event_id = event.id and published.is_published);
$$;
revoke all on function public._published_live_identity(uuid) from public, anon, authenticated;

create function public.my_published_event_schedule_identity(p_slug text)
returns table (schedule_id uuid, player_key uuid)
language sql stable security definer set search_path = ''
as $$
    select history.source_schedule_id, player.id
      from public.profiles as profile
      join public.club_members as member on member.id = profile.member_id
      join public.tos_history_event_players as player on player.member_id = member.id
      join public.tos_history_events as history on history.id = player.history_event_id
      join public.tos_events as event on event.id = history.event_id
      join public.schedules as schedule on schedule.id = history.source_schedule_id and schedule.event_id = event.id
     where profile.id = auth.uid() and profile.active
       and member.active and member.approval_status = 'approved'
       and event.slug = p_slug and event.status <> 'cancelled' and schedule.is_published
       and 1 = (select count(*) from public.schedules as published
                 where published.event_id = event.id and published.is_published)
       and exists (select 1 from public.tos_history_round_participants as slot
                    where slot.history_event_id = history.id and slot.event_player_id = player.id);
$$;
revoke all on function public.my_published_event_schedule_identity(text) from public, anon, authenticated;
grant execute on function public.my_published_event_schedule_identity(text) to authenticated;

-- Return type gains exactly one additive, identity-safe JSON column.
drop function public.public_event_live_schedule(text);
create function public.public_event_live_schedule(p_slug text)
returns table (
    id uuid, event_slug text, event_title text, event_sport text,
    event_starts_at timestamptz, event_ends_at timestamptz, event_date date,
    created_by_name text, start_time text, end_time text, courts jsonb,
    participants_public jsonb, schedule_public jsonb, is_published boolean,
    created_at timestamptz, live_identity jsonb
)
language sql stable security definer set search_path = ''
as $$
    select schedule.id, event.slug, event.title, event.sport, event.starts_at, event.ends_at,
           schedule.event_date, schedule.created_by_name, schedule.start_time, schedule.end_time,
           schedule.courts, schedule.participants_public, schedule.schedule_public,
           schedule.is_published, schedule.created_at, public._published_live_identity(schedule.id)
      from public.tos_events as event
      join public.schedules as schedule on schedule.event_id = event.id and schedule.is_published
     where event.slug = p_slug and event.status <> 'cancelled'
     order by schedule.created_at desc, schedule.id desc limit 1;
$$;
revoke all on function public.public_event_live_schedule(text) from public, anon, authenticated;
grant execute on function public.public_event_live_schedule(text) to anon, authenticated;
