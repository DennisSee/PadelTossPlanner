"""Streamlit-webapp voor de TOS Padelplanner met accounts en opslag."""

from __future__ import annotations

import base64
from datetime import date, datetime, time
from pathlib import Path
from html import escape
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
    page_title="TC Zuid TOS",
    page_icon="🎾",
    layout="wide",
    initial_sidebar_state="collapsed",
)


def _inject_responsive_styles() -> None:
    """Compacte, mobielvriendelijke vormgeving voor de publieke pagina."""
    st.markdown(
        """
        <style>
        :root {
            --tc-green: #0a6951;
            --tc-green-dark: #07503f;
            --tc-yellow: #fdd424;
            --tc-lime: #dff04a;
            --tc-soft-green: #eef8f4;
            --tc-soft-yellow: #fff8d7;
            --tos-border: rgba(10, 105, 81, 0.18);
            --tos-muted: rgba(30, 46, 42, 0.66);
            --tos-card: #f7faf8;
            --tos-accent: var(--tc-green);
        }

        .block-container {
            max-width: 1180px;
            padding-top: 4.75rem !important;
            padding-bottom: 2.5rem;
        }

        [data-testid="stToolbarActions"],
        [data-testid="stStatusWidget"] {
            display: none !important;
        }

        .tos-brand-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.8rem;
            margin: 0.05rem 0 0.9rem;
            padding: 0.15rem 0;
        }

        .tos-brand-title {
            color: var(--tc-green-dark);
            font-size: clamp(1.55rem, 4vw, 2.25rem);
            line-height: 1.08;
            font-weight: 800;
            letter-spacing: -0.025em;
        }

        .tos-brand-logo {
            width: clamp(3.25rem, 9vw, 4.6rem);
            height: clamp(3.25rem, 9vw, 4.6rem);
            object-fit: contain;
            flex: 0 0 auto;
            border-radius: 0.55rem;
            box-shadow: 0 2px 8px rgba(7, 80, 63, 0.10);
        }

        .tos-event-title {
            font-size: clamp(1.3rem, 3.3vw, 1.85rem);
            line-height: 1.15;
            font-weight: 700;
            margin: 0.1rem 0 0.7rem;
        }

        .tos-event-meta {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 0.6rem;
            margin-bottom: 1rem;
        }

        .tos-meta-item {
            border: 1px solid var(--tos-border);
            border-top: 3px solid var(--tc-green);
            border-radius: 0.8rem;
            padding: 0.62rem 0.75rem 0.68rem;
            background: #ffffff;
            min-width: 0;
            box-shadow: 0 1px 3px rgba(7, 80, 63, 0.04);
        }

        .tos-meta-label {
            color: var(--tos-muted);
            font-size: 0.78rem;
            margin-bottom: 0.1rem;
        }

        .tos-meta-value {
            font-weight: 700;
            font-size: 1.03rem;
            line-height: 1.25;
            overflow-wrap: anywhere;
        }

        .tos-section-title {
            font-size: clamp(1.2rem, 3vw, 1.55rem);
            font-weight: 750;
            margin: 1rem 0 0.55rem;
        }

        .tos-schedule-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(285px, 1fr));
            gap: 0.75rem;
            margin-top: 0.65rem;
        }

        .tos-round-card,
        .tos-personal-card {
            border: 1px solid var(--tos-border);
            border-radius: 0.9rem;
            background: white;
            overflow: hidden;
            box-shadow: 0 2px 7px rgba(7, 80, 63, 0.06);
        }

        .tos-personal-card.tos-card-playing {
            border-left: 5px solid var(--tc-green);
            box-shadow: 0 3px 12px rgba(10, 105, 81, 0.12);
        }

        .tos-personal-card.tos-card-rest {
            border-left: 5px solid #a9b2af;
        }

        .tos-personal-card.tos-card-away {
            border-left: 5px solid var(--tc-yellow);
        }

        .tos-card-head {
            display: flex;
            justify-content: space-between;
            gap: 0.5rem;
            align-items: center;
            padding: 0.65rem 0.8rem;
            background: linear-gradient(90deg, var(--tc-soft-green), #ffffff 72%);
            border-bottom: 1px solid var(--tos-border);
        }

        .tos-round-label {
            font-weight: 750;
            font-size: 0.96rem;
        }

        .tos-time-label {
            color: var(--tos-muted);
            font-size: 0.86rem;
            white-space: nowrap;
        }

        .tos-match-row {
            padding: 0.72rem 0.8rem;
            border-bottom: 1px solid rgba(49, 51, 63, 0.09);
        }

        .tos-match-row:last-child {
            border-bottom: 0;
        }

        .tos-court,
        .tos-personal-court {
            display: inline-flex;
            align-items: center;
            color: var(--tc-green-dark);
            background: rgba(253, 212, 36, 0.23);
            border: 1px solid rgba(10, 105, 81, 0.16);
            border-radius: 999px;
            padding: 0.18rem 0.5rem;
            font-weight: 750;
            font-size: 0.76rem;
            line-height: 1.2;
            margin-bottom: 0.34rem;
        }

        .tos-matchup {
            font-size: 0.96rem;
            line-height: 1.35;
            overflow-wrap: anywhere;
        }

        .tos-vs {
            color: var(--tos-muted);
            font-size: 0.77rem;
            font-weight: 700;
            text-transform: uppercase;
            margin: 0 0.25rem;
        }

        .tos-round-footer {
            padding: 0.55rem 0.8rem;
            background: rgba(247, 248, 252, 0.72);
            color: var(--tos-muted);
            font-size: 0.78rem;
            line-height: 1.35;
            border-top: 1px solid rgba(49, 51, 63, 0.08);
        }

        .tos-status {
            display: inline-block;
            border-radius: 999px;
            padding: 0.18rem 0.52rem;
            font-size: 0.76rem;
            font-weight: 750;
            white-space: nowrap;
        }

        .tos-status-playing {
            background: var(--tc-lime);
            color: var(--tc-green-dark);
            border: 1px solid rgba(10, 105, 81, 0.22);
        }
        .tos-status-rest {
            background: #eef1f0;
            color: #4f5d58;
            border: 1px solid #d5dcda;
        }
        .tos-status-away {
            background: var(--tc-soft-yellow);
            color: #765f00;
            border: 1px solid rgba(253, 212, 36, 0.65);
        }

        .tos-round-footer {
            display: flex;
            flex-wrap: wrap;
            gap: 0.35rem;
        }

        .tos-footer-chip {
            display: inline-block;
            border-radius: 999px;
            padding: 0.18rem 0.48rem;
            font-size: 0.75rem;
            line-height: 1.25;
        }

        .tos-footer-rest {
            background: #eef1f0;
            color: #4f5d58;
        }

        .tos-footer-away {
            background: var(--tc-soft-yellow);
            color: #765f00;
        }

        .tos-personal-body {
            padding: 0.75rem 0.8rem;
        }


        .tos-name-chips {
            display: flex;
            flex-wrap: wrap;
            gap: 0.35rem;
            padding: 0.15rem 0 0.35rem;
        }

        .tos-name-chip {
            border: 1px solid var(--tos-border);
            border-radius: 999px;
            padding: 0.22rem 0.52rem;
            background: var(--tos-card);
            font-size: 0.82rem;
        }

        @media (max-width: 700px) {
            .block-container {
                padding: 5.5rem 0.72rem 2.25rem !important;
            }

            h1 {
                font-size: 1.85rem !important;
                line-height: 1.08 !important;
                margin-bottom: 0.45rem !important;
            }

            h2 {
                font-size: 1.35rem !important;
                line-height: 1.15 !important;
                margin-top: 0.8rem !important;
                margin-bottom: 0.45rem !important;
            }

            h3 {
                font-size: 1.12rem !important;
            }

            p, label, [data-testid="stMarkdownContainer"] {
                line-height: 1.35;
            }

            .tos-brand-header {
                margin-bottom: 0.7rem;
            }

            .tos-brand-title {
                font-size: 1.62rem;
            }

            .tos-brand-logo {
                width: 3.25rem;
                height: 3.25rem;
            }

            .tos-event-meta {
                gap: 0.38rem;
            }

            .tos-meta-item {
                padding: 0.52rem 0.48rem;
                border-radius: 0.65rem;
            }

            .tos-meta-label {
                font-size: 0.68rem;
            }

            .tos-meta-value {
                font-size: 0.88rem;
            }

            .tos-schedule-grid {
                grid-template-columns: 1fr;
                gap: 0.58rem;
            }

            .tos-card-head {
                padding: 0.55rem 0.65rem;
            }

            .tos-match-row,
            .tos-personal-body {
                padding: 0.62rem 0.65rem;
            }

            .tos-round-footer {
                padding: 0.48rem 0.65rem;
            }

            [data-testid="stSelectbox"] {
                margin-bottom: 0.15rem;
            }

            [data-testid="stSelectbox"] label p {
                font-size: 0.88rem !important;
                font-weight: 650;
            }

            [data-testid="stExpander"] details summary {
                padding-top: 0.55rem;
                padding-bottom: 0.55rem;
            }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


@st.cache_data(show_spinner=False)
def _club_logo_data_uri() -> str:
    """Lees het lokale clublogo als data-URI voor de openbare header."""
    logo_path = Path(__file__).resolve().parent / "assets" / "tc-zuid-logo.png"
    if not logo_path.exists():
        return ""
    encoded = base64.b64encode(logo_path.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _public_brand_header_html() -> str:
    logo_uri = _club_logo_data_uri()
    logo_html = (
        f'<img class="tos-brand-logo" src="{logo_uri}" '
        'alt="Logo Tennisclub Zuid Doetinchem">'
        if logo_uri
        else ""
    )
    return (
        '<header class="tos-brand-header">'
        '<div class="tos-brand-title">T.C. Zuid TOS Avond</div>'
        f'{logo_html}'
        '</header>'
    )


def _public_meta_html(event_date: date, start_time: object, end_time: object, court_count: object) -> str:
    items = (
        ("Datum", event_date.strftime("%d-%m-%Y")),
        ("Tijd", f"{start_time or ''}–{end_time or ''}"),
        ("Banen", str(court_count)),
    )
    cards = "".join(
        f'<div class="tos-meta-item"><div class="tos-meta-label">{escape(label)}</div>'
        f'<div class="tos-meta-value">{escape(value)}</div></div>'
        for label, value in items
    )
    return f'<div class="tos-event-meta">{cards}</div>'


def _participant_chips_html(names: list[str]) -> str:
    chips = "".join(
        f'<span class="tos-name-chip">{escape(name)}</span>' for name in names
    )
    return f'<div class="tos-name-chips">{chips}</div>'


def _normalise_public_text(value: object) -> str:
    text = str(value or "").strip()
    return "" if text.casefold() in {"niemand", "none", "nan"} else text


def _public_schedule_cards_html(rows: list[dict[str, object]]) -> str:
    grouped: dict[tuple[str, str], list[dict[str, object]]] = {}
    for row in rows:
        key = (str(row.get("Ronde", "")), str(row.get("Tijd", "")))
        grouped.setdefault(key, []).append(row)

    cards: list[str] = []
    for (round_number, round_time), round_rows in grouped.items():
        match_rows = []
        for row in round_rows:
            court = escape(str(row.get("Baan", "")))
            team1 = escape(str(row.get("Team 1", "")))
            team2 = escape(str(row.get("Team 2", "")))
            match_rows.append(
                '<div class="tos-match-row">'
                f'<div class="tos-court">{court}</div>'
                f'<div class="tos-matchup">{team1}<span class="tos-vs">vs</span>{team2}</div>'
                '</div>'
            )

        first = round_rows[0] if round_rows else {}
        rest = _normalise_public_text(first.get("Rust"))
        unavailable = _normalise_public_text(first.get("Nog niet aanwezig"))
        footer_bits = []
        if rest:
            footer_bits.append(
                f'<span class="tos-footer-chip tos-footer-rest">Rust: {escape(rest)}</span>'
            )
        if unavailable:
            footer_bits.append(
                '<span class="tos-footer-chip tos-footer-away">'
                f'Nog niet aanwezig: {escape(unavailable)}</span>'
            )
        footer = (
            f'<div class="tos-round-footer">{"".join(footer_bits)}</div>'
            if footer_bits
            else ""
        )
        cards.append(
            '<article class="tos-round-card">'
            '<div class="tos-card-head">'
            f'<span class="tos-round-label">Ronde {escape(round_number)}</span>'
            f'<span class="tos-time-label">{escape(round_time)}</span>'
            '</div>'
            f'{"".join(match_rows)}{footer}'
            '</article>'
        )
    return f'<div class="tos-schedule-grid">{"".join(cards)}</div>'


def _personal_schedule_cards_html(rows: list[dict[str, object]]) -> str:
    cards: list[str] = []
    for row in rows:
        status = str(row.get("Status") or "")
        if status == "Spelen":
            status_class = "tos-status-playing"
            card_class = "tos-card-playing"
            body = (
                f'<div class="tos-personal-court">{escape(str(row.get("Baan", "")))}</div>'
                f'<div class="tos-matchup">{escape(str(row.get("Team 1", "")))}'
                f'<span class="tos-vs">vs</span>{escape(str(row.get("Team 2", "")))}</div>'
            )
        elif status == "Rust":
            status_class = "tos-status-rest"
            card_class = "tos-card-rest"
            body = '<div class="tos-matchup">Deze ronde heb je rust.</div>'
        else:
            status_class = "tos-status-away"
            card_class = "tos-card-away"
            body = '<div class="tos-matchup">Je bent deze ronde nog niet beschikbaar.</div>'

        cards.append(
            f'<article class="tos-personal-card {card_class}">'
            '<div class="tos-card-head">'
            f'<span class="tos-round-label">Ronde {escape(str(row.get("Ronde", "")))}</span>'
            f'<span class="tos-time-label">{escape(str(row.get("Tijd", "")))}</span>'
            '</div>'
            '<div class="tos-personal-body">'
            f'<span class="tos-status {status_class}">{escape(status)}</span>'
            f'<div style="height:0.45rem"></div>{body}'
            '</div>'
            '</article>'
        )
    return f'<div class="tos-schedule-grid">{"".join(cards)}</div>'


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
    level_mix: int,
    team_difference_tolerance: float,
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
        level_mix=level_mix,
        team_difference_tolerance=team_difference_tolerance,
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
    """Maak de editorinhoud uit de exact opgeslagen spelerslijst.

    Alleen wanneer er nog helemaal geen gedeeld concept bestaat (``records is None``)
    tonen we de voorbeeldspelers. Een bewust leeg opgeslagen JSON-array mag nooit de
    standaardlijst opnieuw activeren.
    """
    columns = ["Naam", "Ranking", "Meedoen", "Vanaf tijd"]

    if records is None:
        return DEFAULT_PLAYERS.copy()
    if not isinstance(records, list):
        return DEFAULT_PLAYERS.copy()
    if len(records) == 0:
        return pd.DataFrame(columns=columns)

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
    return frame[columns]


def _player_editor_key(user_id: str, draft: Mapping[str, Any]) -> str:
    """Geef iedere opgeslagen revisie een nieuwe Streamlit-widgetstatus.

    Zonder revisie in de sleutel kan ``st.data_editor`` lokale, verwijderde of oude
    rijen blijven combineren met een nieuw DataFrame uit Supabase.
    """
    database_revision = str(draft.get("updated_at") or "nieuw")
    local_revision = int(st.session_state.get("club_draft_revision", 0))
    safe_revision = (
        database_revision.replace(":", "-")
        .replace("+", "-")
        .replace(".", "-")
        .replace(" ", "-")
    )
    return f"players_editor_{user_id}_{safe_revision}_{local_revision}"


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
        "level_mix",
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
        if user:
            st.header("Account")
            st.write(f"Ingelogd als **{user.display_name}**")
            st.caption("Beheerder" if user.is_admin else "Planner")
            if st.button("Uitloggen", width="stretch"):
                st.session_state.clear()
                st.rerun()
            return

        # Houd het openbare scherm rustig: de zijbalk start ingeklapt en de
        # inlogvelden staan daarbinnen nog achter een compacte uitklapper.
        login_error = st.session_state.pop("login_error", None)
        with st.expander(
            "Inloggen als planner",
            expanded=bool(login_error),
            icon="🔐",
        ):
            if login_error:
                st.error(str(login_error))

            with st.form("login_form"):
                email = st.text_input("E-mailadres")
                password = st.text_input("Wachtwoord", type="password")
                submitted = st.form_submit_button("Inloggen", width="stretch")

            if submitted:
                try:
                    st.session_state["auth_user"] = store.sign_in(email, password)
                    st.session_state.pop("planner_result", None)
                    # Na een succesvolle login direct naar de planner navigeren.
                    st.session_state["navigation_page"] = "Planner"
                    st.session_state["login_success"] = True
                    st.rerun()
                except AuthenticationError as exc:
                    st.session_state["login_error"] = str(exc)
                    st.rerun()
                except Exception:
                    st.session_state["login_error"] = (
                        "Inloggen is tijdelijk niet gelukt."
                    )
                    st.rerun()


def _render_public_page(store: SupabaseStore) -> None:
    st.markdown(_public_brand_header_html(), unsafe_allow_html=True)
    try:
        schedule = store.latest_public_schedule()
    except Exception:
        st.error("Het openbare schema kon niet worden geladen.")
        return

    if not schedule:
        st.info("Er is nog geen gepubliceerd schema.")
        return

    event_date = _parse_date(schedule.get("event_date"), date.today())
    courts = schedule.get("courts") or []
    court_count: object = len(courts) if isinstance(courts, list) else "-"
    st.markdown(
        _public_meta_html(
            event_date,
            schedule.get("start_time", ""),
            schedule.get("end_time", ""),
            court_count,
        ),
        unsafe_allow_html=True,
    )

    participants = schedule.get("participants_public") or []
    participant_names = (
        sorted([str(name) for name in participants], key=str.casefold)
        if isinstance(participants, list)
        else []
    )
    rows = schedule.get("schedule_public") or []

    st.markdown('<div class="tos-section-title">Jouw wedstrijden</div>', unsafe_allow_html=True)
    selected_player = st.selectbox(
        "Kies je naam",
        options=["Iedereen", *participant_names],
        help="Kies je naam om direct alleen jouw wedstrijden, rust en afwezigheid te zien.",
        key=f"public_player_filter_{schedule.get('id', 'latest')}",
    )

    if isinstance(rows, list) and rows:
        if selected_player == "Iedereen":
            st.caption("Alle wedstrijden per ronde")
            st.markdown(_public_schedule_cards_html(rows), unsafe_allow_html=True)
        else:
            personal_rows = _personal_schedule_rows(rows, selected_player)
            if personal_rows:
                st.markdown(
                    _personal_schedule_cards_html(personal_rows),
                    unsafe_allow_html=True,
                )
            else:
                st.info("Voor deze speler zijn geen rondes gevonden.")
    else:
        st.info("Het gepubliceerde schema bevat nog geen wedstrijden.")

    if participant_names:
        with st.expander(f"Deelnemers ({len(participant_names)})", expanded=False):
            st.markdown(
                _participant_chips_html(participant_names),
                unsafe_allow_html=True,
            )

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
    level_mix: int,
    team_difference_tolerance: float,
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
        "level_mix": int(level_mix),
        "team_difference_tolerance": float(team_difference_tolerance),
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
    st.caption(
        f"Niveaumix: **{int(diagnostics.get('level_mix', 50))}/100** · "
        f"toegestaan teamverschil: **{float(diagnostics.get('team_difference_tolerance', 0.5)):.1f}** — "
        "binnen deze marge geldt een wedstrijd als voldoende in balans."
    )
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

    flash_message = st.session_state.pop("planner_flash_message", None)
    if flash_message:
        st.success(str(flash_message))

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
    try:
        default_level_mix = int(draft.get("level_mix", 50))
    except (TypeError, ValueError):
        default_level_mix = 50
    default_level_mix = max(0, min(100, default_level_mix))
    try:
        default_team_tolerance = float(draft.get("team_difference_tolerance", 0.5))
    except (TypeError, ValueError):
        default_team_tolerance = 0.5
    default_team_tolerance = max(0.0, min(1.5, default_team_tolerance))
    # Zorg dat oudere of handmatig opgeslagen waarden netjes op een halve stap landen.
    default_team_tolerance = round(default_team_tolerance * 2) / 2
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
            key=_player_editor_key(user.id, draft),
        )

        with st.expander("Geavanceerde instellingen"):
            search_profile = st.selectbox(
                "Zoekkwaliteit",
                options=list(SEARCH_PROFILES),
                index=list(SEARCH_PROFILES).index(default_profile),
            )
            level_mix = st.slider(
                "Variatie in niveaus",
                min_value=0,
                max_value=100,
                value=default_level_mix,
                step=10,
                help=(
                    "0 groepeert spelers zoveel mogelijk met vergelijkbare niveaus. "
                    "100 maakt bewust meer gemengde banen, bijvoorbeeld 5+3 tegen "
                    "5+3 of 5+3 tegen 4+4. De planner blijft de gemiddelde "
                    "teamsterkte zo gelijk mogelijk houden."
                ),
            )
            st.caption(
                "0 = niveaus bij elkaar · 50 = gebalanceerde mix · "
                "100 = veel niveauvariatie"
            )
            team_difference_tolerance = st.slider(
                "Tolerantie voor teamverschil",
                min_value=0.0,
                max_value=1.5,
                value=default_team_tolerance,
                step=0.5,
                help=(
                    "Verschillen in gemiddelde teamsterkte tot en met deze waarde "
                    "krijgen geen strafpunten. Bij 0,5 zijn bijvoorbeeld 4,0 tegen "
                    "4,5 en 3,0 tegen 3,5 gewoon acceptabel. 0,0 is zeer strikt; "
                    "1,0 of 1,5 geeft duidelijk meer vrijheid."
                ),
            )
            st.caption(
                "Aanbevolen: 0,5 · 0,0 = exact gelijk · 1,0–1,5 = losser"
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
            level_mix,
            team_difference_tolerance,
            allow_repeat_partners,
        )
        try:
            saved_draft = store.save_club_draft(
                user.id,
                user.display_name,
                payload,
            )
            # Maak van het opgeslagen record onmiddellijk de enige bron van waarheid.
            # Een hogere revisie forceert daarnaast een schone data-editor bij de volgende run.
            st.session_state["club_draft"] = saved_draft
            st.session_state["club_draft_revision"] = (
                int(st.session_state.get("club_draft_revision", 0)) + 1
            )
            if save_input:
                st.session_state["planner_flash_message"] = (
                    "De gedeelde spelerslijst en instellingen zijn opgeslagen voor alle planners."
                )
                st.rerun()
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
                    level_mix=level_mix,
                    team_difference_tolerance=team_difference_tolerance,
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


def _format_saved_at(value: Any) -> str:
    """Maak een Supabase-tijdstempel leesbaar zonder tijdzone-aannames."""
    raw = str(value or "").strip()
    if not raw:
        return "Onbekend tijdstip"
    normalized = raw.replace("T", " ").replace("Z", "")
    # Bewaar seconden zodat twee schema's uit dezelfde minuut onderscheidbaar zijn.
    return normalized[:19]


def _saved_schedule_label(item: Mapping[str, Any]) -> str:
    status = "Openbaar" if item.get("is_published") else "Privé"
    saved_at = _format_saved_at(item.get("created_at"))
    schedule_id = str(item.get("id") or "")
    short_id = schedule_id[:8] if schedule_id else "zonder-id"
    return (
        f"{saved_at} · {item.get('event_date', '')} · "
        f"{item.get('title', 'Schema')} · {item.get('created_by_name', '')} · "
        f"{status} · {short_id}"
    )


def _render_saved_page(store: SupabaseStore, user: AuthenticatedUser) -> None:
    st.header("Opgeslagen schema's")
    st.caption(
        "Alle ingelogde planners kunnen alle clubschema's bekijken. Alleen de maker "
        "van een schema of een beheerder kan de openbare publicatie aanpassen."
    )
    try:
        schedules = store.list_schedule_summaries(user.id, user.is_admin)
    except Exception:
        st.error("De opgeslagen schema's konden niet worden geladen.")
        return

    if not schedules:
        st.info("Er zijn nog geen schema's opgeslagen.")
        return

    show_only_mine = st.checkbox("Toon alleen mijn schema's", value=False)
    visible_schedules = (
        [item for item in schedules if str(item.get("created_by")) == user.id]
        if show_only_mine
        else schedules
    )
    if not visible_schedules:
        st.info("Je hebt zelf nog geen schema's opgeslagen.")
        return

    overview = pd.DataFrame(
        [
            {
                "Naam": item.get("title"),
                "Datum": item.get("event_date"),
                "Gemaakt door": item.get("created_by_name"),
                "Openbaar": "Ja" if item.get("is_published") else "Nee",
                "Opgeslagen": _format_saved_at(item.get("created_at")),
                "Nr.": str(item.get("id") or "")[:8],
            }
            for item in visible_schedules
        ]
    )
    st.dataframe(overview, hide_index=True, width="stretch")

    schedule_ids = [str(item["id"]) for item in visible_schedules]
    labels = {str(item["id"]): _saved_schedule_label(item) for item in visible_schedules}
    selected_id = st.selectbox(
        "Schema bekijken",
        options=schedule_ids,
        format_func=lambda schedule_id: labels[schedule_id],
        key="saved_schedule_selector",
    )

    try:
        selected = store.get_schedule(selected_id)
    except Exception:
        selected = None
    if not selected:
        st.error("Dit schema kon niet worden geladen.")
        return

    status_text = "Openbaar" if selected.get("is_published") else "Privé"
    meta1, meta2, meta3, meta4 = st.columns(4)
    meta1.metric("Datum", str(selected.get("event_date") or "—"))
    meta2.metric("Gemaakt door", str(selected.get("created_by_name") or "—"))
    meta3.metric("Status", status_text)
    meta4.metric("Opgeslagen", _format_saved_at(selected.get("created_at")))

    st.subheader(str(selected.get("title") or "Schema"))
    private_rows = selected.get("schedule_private") or []
    if isinstance(private_rows, list):
        st.dataframe(pd.DataFrame(private_rows), hide_index=True, width="stretch")

    players = selected.get("players_private") or []
    with st.expander("Spelers en rankings"):
        if isinstance(players, list):
            st.dataframe(pd.DataFrame(players), hide_index=True, width="stretch")

    is_published = bool(selected.get("is_published"))
    is_owner = str(selected.get("created_by") or "") == user.id
    can_manage_publication = user.is_admin or is_owner
    if can_manage_publication:
        action_label = (
            "Openbare publicatie intrekken" if is_published else "Openbaar publiceren"
        )
        if st.button(
            action_label,
            type="primary" if not is_published else "secondary",
            key=f"publication_action_{selected_id}",
        ):
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
    else:
        st.info(
            "Je kunt dit schema bekijken. Alleen de maker of een beheerder kan de "
            "openbare publicatie aanpassen."
        )

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
    _inject_responsive_styles()

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

    if user and st.session_state.pop("login_success", False):
        st.toast(f"Ingelogd als {user.display_name}", icon="✅")

    with st.sidebar:
        if user:
            options = ["Openbaar schema", "Planner", "Opgeslagen schema's"]
            if user.is_admin:
                options.append("Gebruikersbeheer")
            current_page = st.session_state.get("navigation_page")
            if current_page not in options:
                st.session_state["navigation_page"] = "Openbaar schema"
            page = st.radio("Navigatie", options, key="navigation_page")
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
