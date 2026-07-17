"""Streamlit-webapp voor de TOS Padelplanner met accounts en opslag."""

from __future__ import annotations

from datetime import date, datetime, time
from typing import Any, Mapping

import pandas as pd
import streamlit as st

from database import (
    AuthenticatedUser,
    AuthenticationError,
    ConfigurationError,
    SupabaseConfig,
    SupabaseStore,
    config_from_secrets,
)
from excel_export import build_excel_bytes
from planner import (
    Player,
    PlannerSettings,
    generate_schedule,
    player_statistics,
    schedule_rows,
)


COURTS = [
    "Kremer Baan",
    "ZGA/F&F Baan",
    "PlaySeat Baan",
    "Seppworks/Bax Baan",
]

DEFAULT_PLAYERS = pd.DataFrame(
    [
        {"Naam": "Dennis", "Ranking": 4, "Meedoen": True, "Vanaf tijd": None},
        {"Naam": "Marieke", "Ranking": 3, "Meedoen": True, "Vanaf tijd": None},
        {"Naam": "Peter", "Ranking": 5, "Meedoen": True, "Vanaf tijd": None},
        {"Naam": "Anita", "Ranking": 2, "Meedoen": True, "Vanaf tijd": None},
        {"Naam": "Bjorn", "Ranking": 3, "Meedoen": True, "Vanaf tijd": None},
        {"Naam": "Jeroen", "Ranking": 4, "Meedoen": True, "Vanaf tijd": None},
        {"Naam": "Jim", "Ranking": 2, "Meedoen": True, "Vanaf tijd": None},
        {"Naam": "Frans", "Ranking": 3, "Meedoen": True, "Vanaf tijd": None},
        {"Naam": "Trever", "Ranking": 5, "Meedoen": True, "Vanaf tijd": None},
        {"Naam": "Niels", "Ranking": 3, "Meedoen": True, "Vanaf tijd": None},
    ]
)

SEARCH_PROFILES = {
    "Snel": {"search_restarts": 4, "beam_width": 8, "candidates_per_state": 45},
    "Normaal": {"search_restarts": 8, "beam_width": 12, "candidates_per_state": 70},
    "Uitgebreid": {
        "search_restarts": 14,
        "beam_width": 18,
        "candidates_per_state": 105,
    },
}

PUBLIC_COLUMNS = ["Ronde", "Tijd", "Baan", "Team 1", "Team 2", "Rust", "Nog niet aanwezig"]
PRIVATE_LEVEL_COLUMNS = ["Niveau T1", "Niveau T2", "Teamverschil"]


st.set_page_config(
    page_title="TOS Padelplanner",
    page_icon="🎾",
    layout="wide",
)


@st.cache_resource(show_spinner=False)
def _get_store(config: SupabaseConfig) -> SupabaseStore:
    return SupabaseStore(config)


@st.cache_data(show_spinner=False)
def _generate_cached(
    player_records: tuple[tuple[str, float, str], ...],
    courts: tuple[str, ...],
    start_hour: int,
    start_minute: int,
    end_hour: int,
    end_minute: int,
    match_minutes: int,
    search_profile: str,
    allow_repeat_partners: bool,
) -> dict[str, object]:
    """Voer dezelfde berekening niet opnieuw uit bij identieke invoer."""
    players = [
        Player(
            name=name,
            ranking=ranking,
            available_from=_parse_optional_time(available_from),
        )
        for name, ranking, available_from in player_records
    ]
    profile = SEARCH_PROFILES[search_profile]
    settings = PlannerSettings(
        start_time=time(start_hour, start_minute),
        end_time=time(end_hour, end_minute),
        match_minutes=match_minutes,
        allow_repeat_partners=allow_repeat_partners,
        **profile,
    )
    rounds, diagnostics = generate_schedule(players, list(courts), settings)
    rows = schedule_rows(rounds, list(courts), players, settings)
    stats = player_statistics(rounds, players, diagnostics)
    excel = build_excel_bytes(settings, players, list(courts), rounds, diagnostics)
    return {
        "schedule": rows,
        "statistics": stats,
        "diagnostics": diagnostics,
        "excel": excel,
    }


def _time_from_value(value: Any) -> time:
    """Converteer Streamlit-, pandas- en ISO-tijdwaarden naar datetime.time.

    Streamlit kan een waarde uit een TimeColumn bijvoorbeeld teruggeven als
    ``21:00:00.000``. ``time.fromisoformat`` ondersteunt zowel HH:MM,
    HH:MM:SS als fracties van seconden.
    """
    if isinstance(value, datetime):
        return value.time().replace(tzinfo=None)
    if isinstance(value, time):
        return value.replace(tzinfo=None)

    text = str(value).strip()
    try:
        return time.fromisoformat(text).replace(tzinfo=None)
    except ValueError:
        pass

    # Sommige pandas-/Excelwaarden bevatten ook een datumdeel.
    try:
        return datetime.fromisoformat(text).time().replace(tzinfo=None)
    except ValueError as exc:
        raise ValueError(f"Ongeldige tijd: {text}.") from exc


def _parse_time(value: Any, fallback: time) -> time:
    try:
        return _time_from_value(value)
    except (TypeError, ValueError):
        return fallback


def _parse_optional_time(value: Any) -> time | None:
    if value is None or value is pd.NaT:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass

    text = str(value).strip()
    if not text or text.casefold() in {"none", "nat", "nan", "vanaf start"}:
        return None

    try:
        return _time_from_value(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Ongeldige vanaf-tijd: {text}.") from exc


def _parse_date(value: Any, fallback: date) -> date:
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError):
        return fallback


def _players_dataframe(records: Any) -> pd.DataFrame:
    if not isinstance(records, list) or not records:
        return DEFAULT_PLAYERS.copy()
    frame = pd.DataFrame(records)
    for column, default in (
        ("Naam", ""),
        ("Ranking", 3),
        ("Meedoen", True),
        ("Vanaf tijd", None),
    ):
        if column not in frame.columns:
            frame[column] = default
    frame["Vanaf tijd"] = frame["Vanaf tijd"].map(_parse_optional_time)
    return frame[["Naam", "Ranking", "Meedoen", "Vanaf tijd"]]


def _serialize_editor_rows(data: pd.DataFrame) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for _, row in data.iterrows():
        name = str(row.get("Naam") or "").strip()
        if not name:
            continue
        ranking_value = pd.to_numeric(row.get("Ranking"), errors="coerce")
        ranking = None if pd.isna(ranking_value) else int(ranking_value)
        available_from = _parse_optional_time(row.get("Vanaf tijd"))
        rows.append(
            {
                "Naam": name,
                "Ranking": ranking,
                "Meedoen": bool(row.get("Meedoen", False)),
                "Vanaf tijd": (
                    available_from.strftime("%H:%M") if available_from else None
                ),
            }
        )
    return rows


def _parse_players(data: pd.DataFrame) -> list[Player]:
    required_columns = {"Naam", "Ranking", "Meedoen", "Vanaf tijd"}
    if not required_columns.issubset(data.columns):
        raise ValueError("De spelerstabel mist één of meer verplichte kolommen.")

    active = data[data["Meedoen"].fillna(False)].copy()
    active["Naam"] = active["Naam"].fillna("").astype(str).str.strip()
    active = active[active["Naam"] != ""]
    active["Ranking"] = pd.to_numeric(active["Ranking"], errors="coerce")

    if active.empty:
        raise ValueError("Voer minimaal vier actieve spelers in.")
    if active["Ranking"].isna().any():
        invalid_names = ", ".join(active.loc[active["Ranking"].isna(), "Naam"].tolist())
        raise ValueError(f"Vul een geldige ranking in voor: {invalid_names}.")
    if not active["Ranking"].between(1, 5).all():
        raise ValueError("Rankings moeten tussen 1 en 5 liggen.")

    normalized_names = active["Naam"].str.casefold()
    duplicates = active.loc[normalized_names.duplicated(keep=False), "Naam"].tolist()
    if duplicates:
        raise ValueError(
            f"Deze namen komen dubbel voor: {', '.join(sorted(set(duplicates)))}."
        )

    players: list[Player] = []
    for _, row in active.iterrows():
        players.append(
            Player(
                name=str(row["Naam"]),
                ranking=float(row["Ranking"]),
                available_from=_parse_optional_time(row.get("Vanaf tijd")),
            )
        )
    return players


def _public_schedule_rows(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    return [{column: row.get(column, "") for column in PUBLIC_COLUMNS} for row in rows]


def _cell_names(value: object, separator: str) -> set[str]:
    text = str(value or "").strip()
    if not text or text.casefold() == "niemand":
        return set()
    return {part.strip().casefold() for part in text.split(separator) if part.strip()}


def _personal_schedule_rows(
    rows: list[dict[str, object]],
    player_name: str,
) -> list[dict[str, object]]:
    """Maak één overzichtsregel per ronde voor de gekozen speler."""
    player_key = player_name.strip().casefold()
    grouped: dict[tuple[object, object], list[dict[str, object]]] = {}
    for row in rows:
        key = (row.get("Ronde"), row.get("Tijd"))
        grouped.setdefault(key, []).append(row)

    result: list[dict[str, object]] = []
    for (round_number, round_time), round_rows in grouped.items():
        playing_row: dict[str, object] | None = None
        for row in round_rows:
            team1 = _cell_names(row.get("Team 1"), " & ")
            team2 = _cell_names(row.get("Team 2"), " & ")
            if player_key in team1 or player_key in team2:
                playing_row = row
                break

        if playing_row is not None:
            result.append(
                {
                    "Ronde": round_number,
                    "Tijd": round_time,
                    "Status": "Spelen",
                    "Baan": playing_row.get("Baan", ""),
                    "Team 1": playing_row.get("Team 1", ""),
                    "Team 2": playing_row.get("Team 2", ""),
                }
            )
            continue

        unavailable_names = (
            _cell_names(round_rows[0].get("Nog niet aanwezig"), ",")
            if round_rows
            else set()
        )
        if player_key in unavailable_names:
            result.append(
                {
                    "Ronde": round_number,
                    "Tijd": round_time,
                    "Status": "Nog niet aanwezig",
                    "Baan": "—",
                    "Team 1": "—",
                    "Team 2": "—",
                }
            )
            continue

        rest_names = _cell_names(round_rows[0].get("Rust"), ",") if round_rows else set()
        if player_key in rest_names:
            result.append(
                {
                    "Ronde": round_number,
                    "Tijd": round_time,
                    "Status": "Rust",
                    "Baan": "—",
                    "Team 1": "—",
                    "Team 2": "—",
                }
            )

    return result


def _diagnostics_for_storage(diagnostics: Mapping[str, object]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key in (
        "rounds",
        "unused_minutes",
        "courts_used",
        "active_slots",
        "rest_count",
        "score",
    ):
        result[key] = diagnostics.get(key)
    for key in (
        "play_counts",
        "rest_counts",
        "unavailable_counts",
        "availability_rounds",
    ):
        counts = diagnostics.get(key)
        if isinstance(counts, dict):
            result[key] = {str(name): int(count) for name, count in counts.items()}
    rest_by_round = diagnostics.get("rest_counts_per_round")
    if isinstance(rest_by_round, list):
        result["rest_counts_per_round"] = [int(value) for value in rest_by_round]
    late_players = diagnostics.get("late_players")
    if isinstance(late_players, list):
        result["late_players"] = [str(name) for name in late_players]
    return result


def _current_user() -> AuthenticatedUser | None:
    user = st.session_state.get("auth_user")
    return user if isinstance(user, AuthenticatedUser) else None


def _render_login(store: SupabaseStore) -> None:
    user = _current_user()
    with st.sidebar:
        st.header("Account")
        if user:
            st.write(f"Ingelogd als **{user.display_name}**")
            st.caption("Beheerder" if user.is_admin else "Planner")
            if st.button("Uitloggen", width="stretch"):
                st.session_state.clear()
                st.rerun()
            return

        with st.form("login_form"):
            email = st.text_input("E-mailadres")
            password = st.text_input("Wachtwoord", type="password")
            submitted = st.form_submit_button("Inloggen", width="stretch")
        if submitted:
            try:
                st.session_state["auth_user"] = store.sign_in(email, password)
                st.session_state.pop("planner_result", None)
                st.rerun()
            except AuthenticationError as exc:
                st.error(str(exc))
            except Exception:
                st.error("Inloggen is tijdelijk niet gelukt.")


def _render_public_page(store: SupabaseStore) -> None:
    st.header("Actueel padelschema")
    try:
        schedule = store.latest_public_schedule()
    except Exception:
        st.error("Het openbare schema kon niet worden geladen.")
        return

    if not schedule:
        st.info("Er is nog geen gepubliceerd schema.")
        return

    event_date = _parse_date(schedule.get("event_date"), date.today())
    st.subheader(str(schedule.get("title") or "Padelavond"))
    info1, info2, info3 = st.columns(3)
    info1.metric("Datum", event_date.strftime("%d-%m-%Y"))
    info2.metric(
        "Tijd",
        f"{schedule.get('start_time', '')} - {schedule.get('end_time', '')}",
    )
    courts = schedule.get("courts") or []
    info3.metric("Banen", len(courts) if isinstance(courts, list) else "-")

    st.subheader("Deelnemers")
    participants = schedule.get("participants_public") or []
    participant_names = (
        sorted([str(name) for name in participants], key=str.casefold)
        if isinstance(participants, list)
        else []
    )
    if participant_names:
        st.write(" · ".join(participant_names))

    st.subheader("Wedstrijdschema")
    rows = schedule.get("schedule_public") or []
    if isinstance(rows, list) and rows:
        selected_player = st.selectbox(
            "Toon het persoonlijke schema van",
            options=["Iedereen", *participant_names],
            help="Kies je naam om alleen je eigen wedstrijden en rustbeurten te zien.",
            key=f"public_player_filter_{schedule.get('id', 'latest')}",
        )
        if selected_player == "Iedereen":
            public_df = pd.DataFrame(rows)
            columns = [column for column in PUBLIC_COLUMNS if column in public_df.columns]
            st.dataframe(public_df[columns], hide_index=True, width="stretch")
        else:
            personal_rows = _personal_schedule_rows(rows, selected_player)
            st.caption(f"Persoonlijk overzicht voor **{selected_player}**")
            if personal_rows:
                st.dataframe(
                    pd.DataFrame(personal_rows),
                    hide_index=True,
                    width="stretch",
                )
            else:
                st.info("Voor deze speler zijn geen rondes gevonden.")
    else:
        st.info("Het gepubliceerde schema bevat nog geen wedstrijden.")

    creator = schedule.get("created_by_name")
    created_at = str(schedule.get("created_at") or "").replace("T", " ")[:16]
    if creator or created_at:
        st.caption(f"Gepubliceerd door {creator or 'beheerder'} · {created_at}")


def _load_club_draft(store: SupabaseStore) -> dict[str, Any]:
    cache_key = "club_draft"
    if cache_key not in st.session_state:
        try:
            st.session_state[cache_key] = store.load_club_draft() or {}
        except Exception as exc:
            st.session_state[cache_key] = {}
            if "club_drafts" in str(exc):
                st.error(
                    "De tabel voor gedeelde invoer ontbreekt nog. Voer eerst "
                    "supabase_migration_shared_draft.sql uit in Supabase."
                )
            else:
                st.warning(
                    "De gedeelde invoer kon niet worden geladen; "
                    "standaardwaarden worden gebruikt."
                )
    draft = st.session_state[cache_key]
    return draft if isinstance(draft, dict) else {}


def _draft_payload(
    event_title: str,
    event_date: date,
    start_time: time,
    end_time: time,
    match_minutes: int,
    selected_courts: list[str],
    edited_players: pd.DataFrame,
    search_profile: str,
    allow_repeat_partners: bool,
) -> dict[str, object]:
    return {
        "event_title": event_title.strip() or "TOS Padelavond",
        "event_date": event_date.isoformat(),
        "start_time": start_time.strftime("%H:%M"),
        "end_time": end_time.strftime("%H:%M"),
        "match_minutes": int(match_minutes),
        "selected_courts": list(selected_courts),
        "players": _serialize_editor_rows(edited_players),
        "search_profile": search_profile,
        "allow_repeat_partners": bool(allow_repeat_partners),
    }


def _render_private_result(store: SupabaseStore, user: AuthenticatedUser) -> None:
    result = st.session_state.get("planner_result")
    if not isinstance(result, dict) or result.get("owner_id") != user.id:
        return

    diagnostics = result["diagnostics"]
    assert isinstance(diagnostics, dict)

    st.divider()
    st.success("Schema gegenereerd. De gedeelde invoer is voor alle planners opgeslagen.")
    metric1, metric2, metric3, metric4 = st.columns(4)
    metric1.metric("Rondes", diagnostics["rounds"])
    metric2.metric("Banen", diagnostics["courts_used"])
    metric3.metric("Rusters per ronde", diagnostics["rest_count"])
    metric4.metric("Onbenutte tijd", f"{diagnostics['unused_minutes']} min")
    late_players = diagnostics.get("late_players")
    if isinstance(late_players, list) and late_players:
        st.info(
            "Later aanwezig: " + ", ".join(str(name) for name in late_players) + ". "
            "Afwezigheid vóór hun vanaf-tijd telt niet als een echte rustbeurt."
        )

    schema_tab, stats_tab = st.tabs(["Wedstrijdschema", "Spelerstatistiek"])
    with schema_tab:
        schedule_df = pd.DataFrame(result["schedule"])
        st.dataframe(
            schedule_df,
            hide_index=True,
            width="stretch",
            column_config={
                "Ronde": st.column_config.NumberColumn(width="small"),
                "Niveau T1": st.column_config.NumberColumn(format="%.1f"),
                "Niveau T2": st.column_config.NumberColumn(format="%.1f"),
                "Teamverschil": st.column_config.NumberColumn(format="%.1f"),
            },
        )

    with stats_tab:
        stats_df = pd.DataFrame(result["statistics"])
        st.dataframe(stats_df, hide_index=True, width="stretch")

    st.download_button(
        "Download schema als Excel",
        data=result["excel"],
        file_name="tos_padelschema.xlsx",
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        width="stretch",
    )

    with st.container(border=True):
        st.subheader("Schema opslaan")
        st.caption(
            "Een gepubliceerd schema wordt direct zichtbaar op de openbare pagina, "
            "zonder rankings en niveaukolommen."
        )
        publish = st.checkbox("Direct openbaar publiceren", value=True)
        if st.button("Schema opslaan", type="primary", width="stretch"):
            metadata = result["metadata"]
            players = result["players"]
            assert isinstance(metadata, dict)
            assert isinstance(players, list)
            payload = {
                "title": metadata["event_title"],
                "event_date": metadata["event_date"],
                "created_by": user.id,
                "created_by_name": user.display_name,
                "start_time": metadata["start_time"],
                "end_time": metadata["end_time"],
                "match_minutes": metadata["match_minutes"],
                "courts": metadata["selected_courts"],
                "players_private": players,
                "participants_public": sorted(
                    [str(player["name"]) for player in players], key=str.casefold
                ),
                "schedule_private": result["schedule"],
                "schedule_public": _public_schedule_rows(result["schedule"]),
                "statistics_private": result["statistics"],
                "diagnostics": _diagnostics_for_storage(diagnostics),
                "is_published": publish,
            }
            try:
                saved = store.save_schedule(payload)
                st.session_state["last_saved_schedule_id"] = saved.get("id")
                st.success(
                    "Schema opgeslagen en gepubliceerd."
                    if publish
                    else "Schema privé opgeslagen."
                )
            except Exception:
                st.error("Het schema kon niet worden opgeslagen.")


def _render_planner_page(store: SupabaseStore, user: AuthenticatedUser) -> None:
    st.header("Nieuw schema maken")
    st.write(
        "De invoer is gedeeld met alle planners. De laatst opgeslagen spelerslijst en "
        "instellingen worden voor iedere planner geladen."
    )

    toolbar1, toolbar2 = st.columns([1, 3])
    with toolbar1:
        if st.button("Gedeelde invoer opnieuw laden", width="stretch"):
            st.session_state.pop("club_draft", None)
            st.session_state["club_draft_revision"] = (
                int(st.session_state.get("club_draft_revision", 0)) + 1
            )
            st.rerun()

    draft = _load_club_draft(store)
    updated_by = str(draft.get("updated_by_name") or "")
    updated_at = str(draft.get("updated_at") or "").replace("T", " ")[:16]
    with toolbar2:
        if updated_by or updated_at:
            st.caption(
                f"Laatst opgeslagen door {updated_by or 'een planner'}"
                f" · {updated_at or 'tijd onbekend'}"
            )
    default_title = str(draft.get("event_title") or "TOS Padelavond")
    default_date = _parse_date(draft.get("event_date"), date.today())
    default_start = _parse_time(draft.get("start_time"), time(20, 0))
    default_end = _parse_time(draft.get("end_time"), time(22, 0))
    default_match = int(draft.get("match_minutes") or 20)
    if default_match not in [15, 20, 25, 30]:
        default_match = 20
    draft_courts = draft.get("selected_courts")
    default_courts = (
        [court for court in draft_courts if court in COURTS]
        if isinstance(draft_courts, list)
        else COURTS[:2]
    )
    default_profile = str(draft.get("search_profile") or "Normaal")
    if default_profile not in SEARCH_PROFILES:
        default_profile = "Normaal"
    default_repeat = bool(draft.get("allow_repeat_partners", False))
    draft_players = _players_dataframe(draft.get("players"))

    with st.form(f"planner_form_{user.id}"):
        st.subheader("1. Avond, speeltijden en banen")
        title_col, date_col = st.columns([2, 1])
        with title_col:
            event_title = st.text_input("Naam van de avond", value=default_title)
        with date_col:
            event_date = st.date_input("Datum", value=default_date)

        time_col1, time_col2, time_col3 = st.columns(3)
        with time_col1:
            start_time = st.time_input("Starttijd", value=default_start, step=300)
        with time_col2:
            end_time = st.time_input("Eindtijd", value=default_end, step=300)
        with time_col3:
            match_minutes = st.selectbox(
                "Wedstrijdduur",
                options=[15, 20, 25, 30],
                index=[15, 20, 25, 30].index(default_match),
                format_func=lambda value: f"{value} minuten",
            )

        selected_courts = st.multiselect(
            "Welke banen zijn beschikbaar?",
            options=COURTS,
            default=default_courts,
            help="Iedere geselecteerde baan heeft per ronde vier spelers nodig.",
        )
        st.caption(
            f"Geselecteerd: {len(selected_courts)} baan/banen — "
            f"{len(selected_courts) * 4} spelers tegelijk op de baan."
        )

        st.subheader("2. Spelers en ranking")
        st.caption(
            "Rankings zijn alleen zichtbaar voor ingelogde planners en beheerders. "
            "Laat Vanaf tijd leeg wanneer iemand vanaf de start aanwezig is."
        )
        edited_players = st.data_editor(
            draft_players,
            num_rows="dynamic",
            hide_index=True,
            width="stretch",
            column_config={
                "Naam": st.column_config.TextColumn("Naam", required=True),
                "Ranking": st.column_config.NumberColumn(
                    "Ranking", min_value=1, max_value=5, step=1, required=True
                ),
                "Meedoen": st.column_config.CheckboxColumn("Meedoen", default=True),
                "Vanaf tijd": st.column_config.TimeColumn(
                    "Vanaf tijd",
                    help=(
                        "Optioneel. De speler doet mee vanaf de eerste ronde die op of "
                        "na deze tijd begint. Leeg betekent vanaf de starttijd."
                    ),
                    required=False,
                    min_value=start_time if end_time > start_time else None,
                    max_value=end_time if end_time > start_time else None,
                    format="HH:mm",
                    step=300,
                ),
            },
            key=(
                f"players_editor_{user.id}_"
                f"{int(st.session_state.get('club_draft_revision', 0))}"
            ),
        )

        with st.expander("Geavanceerde instellingen"):
            search_profile = st.selectbox(
                "Zoekkwaliteit",
                options=list(SEARCH_PROFILES),
                index=list(SEARCH_PROFILES).index(default_profile),
            )
            allow_repeat_partners = st.checkbox(
                "Dubbele partners toestaan wanneer nodig",
                value=default_repeat,
            )

        button1, button2 = st.columns(2)
        with button1:
            save_input = st.form_submit_button("Alleen invoer opslaan", width="stretch")
        with button2:
            generate = st.form_submit_button(
                "Schema genereren", type="primary", width="stretch"
            )

    if save_input or generate:
        payload = _draft_payload(
            event_title,
            event_date,
            start_time,
            end_time,
            match_minutes,
            selected_courts,
            edited_players,
            search_profile,
            allow_repeat_partners,
        )
        try:
            saved_draft = store.save_club_draft(
                user.id,
                user.display_name,
                payload,
            )
            st.session_state["club_draft"] = saved_draft
            if save_input:
                st.success(
                    "De gedeelde spelerslijst en instellingen zijn opgeslagen voor alle planners."
                )
        except Exception:
            st.error("De gedeelde invoer kon niet worden opgeslagen.")
            if save_input:
                return

    if generate:
        try:
            players = _parse_players(edited_players)
            if not selected_courts:
                raise ValueError("Selecteer minimaal één baan.")
            required_players = len(selected_courts) * 4
            if len(players) < required_players:
                raise ValueError(
                    f"Voor {len(selected_courts)} banen zijn minimaal {required_players} "
                    f"spelers nodig. Er doen nu {len(players)} spelers mee."
                )

            player_records = tuple(
                (
                    player.name,
                    player.ranking,
                    player.available_from.strftime("%H:%M")
                    if player.available_from
                    else "",
                )
                for player in players
            )
            with st.spinner("Schema wordt berekend…"):
                generated = _generate_cached(
                    player_records=player_records,
                    courts=tuple(selected_courts),
                    start_hour=start_time.hour,
                    start_minute=start_time.minute,
                    end_hour=end_time.hour,
                    end_minute=end_time.minute,
                    match_minutes=match_minutes,
                    search_profile=search_profile,
                    allow_repeat_partners=allow_repeat_partners,
                )
            st.session_state["planner_result"] = {
                **generated,
                "owner_id": user.id,
                "players": [
                    {
                        "name": player.name,
                        "ranking": player.ranking,
                        "available_from": (
                            player.available_from.strftime("%H:%M")
                            if player.available_from
                            else None
                        ),
                    }
                    for player in players
                ],
                "metadata": payload,
            }
        except (ValueError, RuntimeError) as exc:
            st.session_state.pop("planner_result", None)
            st.error(str(exc))

    _render_private_result(store, user)


def _render_saved_page(store: SupabaseStore, user: AuthenticatedUser) -> None:
    st.header("Opgeslagen schema's")
    try:
        schedules = store.list_schedule_summaries(user.id, user.is_admin)
    except Exception:
        st.error("De opgeslagen schema's konden niet worden geladen.")
        return

    if not schedules:
        st.info("Er zijn nog geen schema's opgeslagen.")
        return

    overview = pd.DataFrame(
        [
            {
                "Naam": item.get("title"),
                "Datum": item.get("event_date"),
                "Gemaakt door": item.get("created_by_name"),
                "Openbaar": "Ja" if item.get("is_published") else "Nee",
                "Opgeslagen": str(item.get("created_at") or "").replace("T", " ")[:16],
            }
            for item in schedules
        ]
    )
    st.dataframe(overview, hide_index=True, width="stretch")

    labels = {
        str(item["id"]): (
            f"{item.get('event_date', '')} — {item.get('title', 'Schema')}"
            f" — {item.get('created_by_name', '')}"
        )
        for item in schedules
    }
    selected_id = st.selectbox(
        "Schema bekijken",
        options=list(labels),
        format_func=lambda schedule_id: labels[schedule_id],
    )

    try:
        selected = store.get_schedule(selected_id)
    except Exception:
        selected = None
    if not selected:
        st.error("Dit schema kon niet worden geladen.")
        return

    st.subheader(str(selected.get("title") or "Schema"))
    private_rows = selected.get("schedule_private") or []
    if isinstance(private_rows, list):
        st.dataframe(pd.DataFrame(private_rows), hide_index=True, width="stretch")

    players = selected.get("players_private") or []
    with st.expander("Spelers en rankings"):
        if isinstance(players, list):
            st.dataframe(pd.DataFrame(players), hide_index=True, width="stretch")

    is_published = bool(selected.get("is_published"))
    action_label = "Openbare publicatie intrekken" if is_published else "Openbaar publiceren"
    if st.button(action_label, type="primary" if not is_published else "secondary"):
        try:
            store.set_schedule_published(
                selected_id,
                not is_published,
                user.id,
                user.is_admin,
            )
            st.success("Publicatiestatus aangepast.")
            st.rerun()
        except Exception:
            st.error("De publicatiestatus kon niet worden aangepast.")


def _render_user_management(store: SupabaseStore, user: AuthenticatedUser) -> None:
    if not user.is_admin:
        st.error("Alleen beheerders hebben toegang tot gebruikersbeheer.")
        return

    st.header("Gebruikersbeheer")
    st.caption(
        "Planners kunnen schema's genereren en opslaan. Beheerders kunnen daarnaast "
        "accounts beheren en alle opgeslagen schema's bekijken."
    )

    with st.form("create_user_form", clear_on_submit=True):
        col1, col2 = st.columns(2)
        with col1:
            display_name = st.text_input("Naam")
            email = st.text_input("E-mailadres")
        with col2:
            role_label = st.selectbox("Rol", ["Planner", "Beheerder"])
            password = st.text_input("Tijdelijk wachtwoord", type="password")
        create = st.form_submit_button("Gebruiker aanmaken", type="primary")

    if create:
        try:
            store.create_user(
                email=email,
                password=password,
                display_name=display_name,
                role="admin" if role_label == "Beheerder" else "planner",
            )
            st.success("Gebruiker aangemaakt. Deel het tijdelijke wachtwoord veilig.")
        except ValueError as exc:
            st.error(str(exc))
        except Exception as exc:
            message = str(exc)
            if "already" in message.lower() or "registered" in message.lower():
                st.error("Voor dit e-mailadres bestaat al een account.")
            else:
                st.error("De gebruiker kon niet worden aangemaakt.")

    try:
        profiles = store.list_profiles()
    except Exception:
        st.error("De gebruikerslijst kon niet worden geladen.")
        return

    st.subheader("Bestaande gebruikers")
    profile_df = pd.DataFrame(
        [
            {
                "Naam": profile.get("display_name"),
                "E-mail": profile.get("email"),
                "Rol": "Beheerder" if profile.get("role") == "admin" else "Planner",
                "Actief": "Ja" if profile.get("active") else "Nee",
            }
            for profile in profiles
        ]
    )
    st.dataframe(profile_df, hide_index=True, width="stretch")

    manageable = [profile for profile in profiles if str(profile.get("id")) != user.id]
    if manageable:
        profile_labels = {
            str(profile["id"]): (
                f"{profile.get('display_name')} ({profile.get('email')})"
            )
            for profile in manageable
        }
        selected_profile_id = st.selectbox(
            "Account activeren of deactiveren",
            options=list(profile_labels),
            format_func=lambda profile_id: profile_labels[profile_id],
        )
        selected_profile = next(
            profile
            for profile in manageable
            if str(profile["id"]) == selected_profile_id
        )
        active = bool(selected_profile.get("active"))
        action = "Deactiveren" if active else "Activeren"
        if st.button(action):
            try:
                store.set_profile_active(selected_profile_id, not active)
                st.success("Accountstatus aangepast.")
                st.rerun()
            except Exception:
                st.error("De accountstatus kon niet worden aangepast.")


def main() -> None:
    st.title("🎾 TOS Padelplanner")

    try:
        config = config_from_secrets(st.secrets)
        store = _get_store(config)
    except ConfigurationError as exc:
        st.error(str(exc))
        st.code(
            """[supabase]\nurl = \"https://JOUW-PROJECT.supabase.co\"\npublishable_key = \"sb_publishable_...\"\nsecret_key = \"sb_secret_...\"""",
            language="toml",
        )
        st.stop()

    _render_login(store)
    user = _current_user()

    with st.sidebar:
        if user:
            options = ["Openbaar schema", "Planner", "Opgeslagen schema's"]
            if user.is_admin:
                options.append("Gebruikersbeheer")
            page = st.radio("Navigatie", options)
        else:
            page = "Openbaar schema"
            st.info("Bezoekers zien alleen deelnemers en het gepubliceerde schema.")

    if page == "Openbaar schema":
        _render_public_page(store)
    elif page == "Planner" and user:
        _render_planner_page(store, user)
    elif page == "Opgeslagen schema's" and user:
        _render_saved_page(store, user)
    elif page == "Gebruikersbeheer" and user:
        _render_user_management(store, user)

    st.caption(
        "Rankings, niveaus en spelersstatistieken zijn uitsluitend zichtbaar na inloggen."
    )


if __name__ == "__main__":
    main()
