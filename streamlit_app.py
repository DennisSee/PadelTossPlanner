"""Streamlit-interface voor de TOS Padelplanner."""

from __future__ import annotations

from datetime import time

import pandas as pd
import streamlit as st

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
        {"Naam": "Dennis", "Ranking": 4, "Meedoen": True},
        {"Naam": "Marieke", "Ranking": 3, "Meedoen": True},
        {"Naam": "Peter", "Ranking": 5, "Meedoen": True},
        {"Naam": "Anita", "Ranking": 2, "Meedoen": True},
        {"Naam": "Bjorn", "Ranking": 3, "Meedoen": True},
        {"Naam": "Jeroen", "Ranking": 4, "Meedoen": True},
        {"Naam": "Jim", "Ranking": 2, "Meedoen": True},
        {"Naam": "Frans", "Ranking": 3, "Meedoen": True},
        {"Naam": "Trever", "Ranking": 5, "Meedoen": True},
        {"Naam": "Niels", "Ranking": 3, "Meedoen": True},
    ]
)

SEARCH_PROFILES = {
    "Snel": {"search_restarts": 4, "beam_width": 8, "candidates_per_state": 45},
    "Normaal": {"search_restarts": 8, "beam_width": 12, "candidates_per_state": 70},
    "Uitgebreid": {"search_restarts": 14, "beam_width": 18, "candidates_per_state": 105},
}


st.set_page_config(
    page_title="TOS Padelplanner",
    page_icon="🎾",
    layout="wide",
)


@st.cache_data(show_spinner=False)
def _generate_cached(
    player_records: tuple[tuple[str, float], ...],
    courts: tuple[str, ...],
    start_hour: int,
    start_minute: int,
    end_hour: int,
    end_minute: int,
    match_minutes: int,
    search_profile: str,
    allow_repeat_partners: bool,
) -> dict[str, object]:
    """Voer dezelfde berekening niet opnieuw uit bij een identieke invoer."""
    players = [Player(name=name, ranking=ranking) for name, ranking in player_records]
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


def _parse_players(data: pd.DataFrame) -> list[Player]:
    required_columns = {"Naam", "Ranking", "Meedoen"}
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
        raise ValueError(f"Deze namen komen dubbel voor: {', '.join(sorted(set(duplicates)))}.")

    return [
        Player(name=row["Naam"], ranking=float(row["Ranking"]))
        for _, row in active.iterrows()
    ]


st.title("🎾 TOS Padelplanner")
st.write(
    "Maak een gebalanceerd padelschema op basis van speeltijd, banen en spelersniveau. "
    "De planner voorkomt standaard dubbele partners en twee rustbeurten achter elkaar."
)

with st.form("planner_form"):
    st.subheader("1. Speeltijden en banen")
    time_col1, time_col2, time_col3 = st.columns(3)
    with time_col1:
        start_time = st.time_input("Starttijd", value=time(20, 0), step=300)
    with time_col2:
        end_time = st.time_input("Eindtijd", value=time(22, 0), step=300)
    with time_col3:
        match_minutes = st.selectbox(
            "Wedstrijdduur",
            options=[15, 20, 25, 30],
            index=1,
            format_func=lambda value: f"{value} minuten",
        )

    selected_courts = st.multiselect(
        "Welke banen zijn beschikbaar?",
        options=COURTS,
        default=COURTS[:2],
        help="Iedere geselecteerde baan heeft per ronde vier spelers nodig.",
    )
    st.caption(
        f"Geselecteerd: {len(selected_courts)} baan/banen — "
        f"{len(selected_courts) * 4} spelers tegelijk op de baan."
    )

    st.subheader("2. Spelers en ranking")
    st.caption(
        "Ranking 1 is beginner en ranking 5 is sterk. Voeg regels toe of zet Meedoen uit."
    )
    edited_players = st.data_editor(
        DEFAULT_PLAYERS,
        num_rows="dynamic",
        hide_index=True,
        width="stretch",
        column_config={
            "Naam": st.column_config.TextColumn("Naam", required=True),
            "Ranking": st.column_config.NumberColumn(
                "Ranking",
                min_value=1,
                max_value=5,
                step=1,
                required=True,
            ),
            "Meedoen": st.column_config.CheckboxColumn("Meedoen", default=True),
        },
        key="players_editor",
    )

    with st.expander("Geavanceerde instellingen"):
        search_profile = st.selectbox(
            "Zoekkwaliteit",
            options=list(SEARCH_PROFILES),
            index=1,
            help="Uitgebreid probeert meer mogelijke schema's, maar rekent langer.",
        )
        allow_repeat_partners = st.checkbox(
            "Dubbele partners toestaan wanneer nodig",
            value=False,
            help="Standaard speelt iedereen iedere wedstrijd met een andere partner.",
        )

    submitted = st.form_submit_button(
        "Schema genereren",
        type="primary",
        width="stretch",
    )

if submitted:
    try:
        players = _parse_players(edited_players)
        if not selected_courts:
            raise ValueError("Selecteer minimaal één baan.")
        required_players = len(selected_courts) * 4
        if len(players) < required_players:
            raise ValueError(
                f"Voor {len(selected_courts)} banen zijn minimaal {required_players} spelers nodig. "
                f"Er doen nu {len(players)} spelers mee."
            )

        player_records = tuple((player.name, player.ranking) for player in players)
        with st.spinner("Schema wordt berekend…"):
            st.session_state["planner_result"] = _generate_cached(
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
    except (ValueError, RuntimeError) as error:
        st.session_state.pop("planner_result", None)
        st.error(str(error))

result = st.session_state.get("planner_result")
if result:
    diagnostics = result["diagnostics"]
    assert isinstance(diagnostics, dict)

    st.divider()
    st.success("Schema gegenereerd.")
    metric1, metric2, metric3, metric4 = st.columns(4)
    metric1.metric("Rondes", diagnostics["rounds"])
    metric2.metric("Banen", diagnostics["courts_used"])
    metric3.metric("Rusters per ronde", diagnostics["rest_count"])
    metric4.metric("Onbenutte tijd", f"{diagnostics['unused_minutes']} min")

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
        type="primary",
        width="stretch",
    )

st.caption(
    "De planner gebruikt een zoekalgoritme: bij lastige combinaties kan een nieuwe berekening "
    "een iets ander, maar eveneens geldig schema opleveren."
)
