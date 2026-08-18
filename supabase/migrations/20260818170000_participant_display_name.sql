-- Narrowly scoped self-service voor één consistente zichtbare deelnemersnaam.
-- De authenticated gebruiker kiest alleen de nieuwe tekst; auth.uid() bepaalt
-- zowel het profiel als het reeds gekoppelde clublid.

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
    profile_role text;
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

    -- Serialiseer naamwijzigingen met onboarding of een gelijktijdige wijziging.
    select profile.member_id,
           profile.role,
           profile.active
    into linked_member_id,
         profile_role,
         profile_active
    from public.profiles as profile
    where profile.id = actor_id
    for update;

    if not found or not profile_active or profile_role <> 'participant' then
        raise exception 'Alleen een actief participant-account kan de eigen naam wijzigen.'
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
grant execute on function public.update_my_display_name(text)
    to authenticated;
