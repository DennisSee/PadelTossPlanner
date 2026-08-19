-- AUTH-2: membership staat los van het staffniveau in profiles.role.
-- Beide RPC's blijven uitsluitend aan auth.uid() gebonden en wijzigen role nooit.

create or replace function public.self_onboard_member(p_display_name text)
returns table (
    member_id uuid,
    display_name text,
    approval_status text,
    active boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor_id uuid := auth.uid();
    normalized_display_name text := btrim(coalesce(p_display_name, ''));
    profile_member_id uuid;
    profile_active boolean;
    approval_required boolean;
    new_approval_status text;
    new_member_id uuid;
    updated_profile_count integer;
begin
    if actor_id is null then
        raise exception 'Authenticatie is vereist voor self-onboarding.'
            using errcode = '42501';
    end if;

    if length(normalized_display_name) < 1
       or length(normalized_display_name) > 120 then
        raise exception 'De weergavenaam moet tussen 1 en 120 tekens bevatten.'
            using errcode = '22023';
    end if;

    -- Serialiseer twee gelijktijdige verzoeken voor hetzelfde Auth-account.
    select profile.member_id,
           profile.active
    into profile_member_id,
         profile_active
    from public.profiles as profile
    where profile.id = actor_id
    for update;

    if not found or not profile_active then
        raise exception 'Alleen een actief account kan zichzelf onboarden.'
            using errcode = '42501';
    end if;

    if profile_member_id is not null then
        raise exception 'Dit account is al aan een clublid gekoppeld.'
            using errcode = '23505';
    end if;

    select settings.require_member_approval
    into approval_required
    from public.club_settings as settings
    where settings.id = 'club';

    if not found then
        raise exception 'De onboardinginstelling ontbreekt.'
            using errcode = '55000';
    end if;

    new_approval_status := case
        when approval_required then 'pending'
        else 'approved'
    end;

    insert into public.club_members (
        display_name,
        approval_status,
        active
    )
    values (
        normalized_display_name,
        new_approval_status,
        true
    )
    returning id into new_member_id;

    update public.profiles as target_profile
    set member_id = new_member_id
    where target_profile.id = actor_id
      and target_profile.member_id is null;

    get diagnostics updated_profile_count = row_count;
    if updated_profile_count <> 1 then
        raise exception 'De ledenkoppeling kon niet veilig worden opgeslagen.'
            using errcode = '40001';
    end if;

    return query
    select member.id,
           member.display_name,
           member.approval_status,
           member.active
    from public.club_members as member
    where member.id = new_member_id;
end;
$$;

revoke all privileges on function public.self_onboard_member(text)
    from public, anon, authenticated;
grant execute on function public.self_onboard_member(text) to authenticated;

create or replace function public.update_my_display_name(new_display_name text)
returns table (
    profile_id uuid,
    member_id uuid,
    display_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    actor_id uuid := auth.uid();
    normalized_display_name text := btrim(coalesce(new_display_name, ''));
    linked_member_id uuid;
    profile_active boolean;
    updated_member_count integer;
begin
    if actor_id is null then
        raise exception 'Authenticatie is vereist om de eigen naam te wijzigen.'
            using errcode = '42501';
    end if;

    if length(normalized_display_name) < 1
       or length(normalized_display_name) > 120
       or normalized_display_name ~ '[[:cntrl:]]' then
        raise exception 'De naam moet 1 tot en met 120 geldige tekens bevatten.'
            using errcode = '22023';
    end if;

    select profile.member_id,
           profile.active
    into linked_member_id,
         profile_active
    from public.profiles as profile
    where profile.id = actor_id
    for update;

    if not found or not profile_active then
        raise exception 'Alleen een actief account kan de eigen naam wijzigen.'
            using errcode = '42501';
    end if;

    if linked_member_id is null then
        raise exception 'Maak eerst je eigen clubprofiel aan.'
            using errcode = '55000';
    end if;

    update public.club_members as member
    set display_name = normalized_display_name
    where member.id = linked_member_id;

    get diagnostics updated_member_count = row_count;
    if updated_member_count <> 1 then
        raise exception 'De gekoppelde clublidnaam kon niet veilig worden gewijzigd.'
            using errcode = '55000';
    end if;

    update public.profiles as profile
    set display_name = normalized_display_name
    where profile.id = actor_id
      and profile.member_id = linked_member_id;

    return query
    select profile.id,
           profile.member_id,
           profile.display_name
    from public.profiles as profile
    where profile.id = actor_id;
end;
$$;

revoke all privileges on function public.update_my_display_name(text)
    from public, anon, authenticated;
grant execute on function public.update_my_display_name(text) to authenticated;
