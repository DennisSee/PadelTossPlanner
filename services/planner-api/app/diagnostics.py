"""Begrensde, read-only diagnose rond een mislukte plannergeneratie."""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Callable, Sequence

from planner import PlannerInputError, PlannerSettings, Player, RoundPlan, generate_schedule


SEARCH_PROFILES = {
    "Snel": (4, 8, 45),
    "Normaal": (8, 12, 70),
    "Uitgebreid": (14, 18, 105),
}
MAX_DIAGNOSTIC_PROBES = 2
MAX_LIKELY_DIAGNOSTICS = 2

SettingValue = str | int | float | bool | None
Generator = Callable[
    [Sequence[Player], Sequence[str], PlannerSettings],
    tuple[list[RoundPlan], dict[str, object]],
]


@dataclass(frozen=True)
class FailureDiagnostic:
    code: str
    severity: str
    message: str
    suggested_change: str
    setting: str | None = None
    current_value: SettingValue = None
    suggested_value: SettingValue = None

    def json(self) -> dict[str, SettingValue]:
        return {
            "code": self.code,
            "severity": self.severity,
            "message": self.message,
            "suggested_change": self.suggested_change,
            "setting": self.setting,
            "current_value": self.current_value,
            "suggested_value": self.suggested_value,
        }


@dataclass(frozen=True)
class GenerationFailure:
    code: str
    summary: str
    diagnostics: tuple[FailureDiagnostic, ...]
    probes_run: int = 0

    def json(self) -> dict[str, object]:
        return {
            "error": self.code,
            "summary": self.summary,
            "diagnostics": [item.json() for item in self.diagnostics],
            "probes_run": self.probes_run,
        }


def _number(details: dict[str, object], key: str) -> int:
    value = details.get(key)
    return value if isinstance(value, int) and not isinstance(value, bool) else 0


def input_failure(error: PlannerInputError) -> GenerationFailure:
    details = error.details
    if error.code == "INSUFFICIENT_PLAYERS":
        available = _number(details, "available_players")
        required = _number(details, "required_players")
        diagnostic = FailureDiagnostic(
            code="INSUFFICIENT_PLAYERS",
            severity="blocking",
            message=f"Er zijn {available} spelers beschikbaar, terwijl deze opzet er minimaal {required} nodig heeft.",
            suggested_change="Voeg spelers toe of selecteer minder banen.",
        )
    elif error.code == "ROUND_PLAYER_SHORTAGE":
        available = _number(details, "available_players")
        required = _number(details, "required_players")
        clock = details.get("round_time") if isinstance(details.get("round_time"), str) else "een speelronde"
        diagnostic = FailureDiagnostic(
            code="AVAILABILITY_SHORTAGE",
            severity="blocking",
            message=f"Om {clock} zijn {available} spelers volledig beschikbaar; voor de geselecteerde banen zijn er {required} nodig.",
            suggested_change="Pas beschikbaarheid aan of selecteer minder banen.",
        )
    elif error.code in {"NO_COMPLETE_ROUND", "AVAILABILITY_OUTSIDE_SESSION", "INVALID_AVAILABILITY_WINDOW"}:
        affected = _number(details, "affected_players")
        diagnostic = FailureDiagnostic(
            code="INVALID_AVAILABILITY",
            severity="blocking",
            message=(
                f"{affected} speler(s) hebben geen volledige speelronde binnen hun beschikbaarheid."
                if affected
                else "Minstens één beschikbaarheidsvenster past niet binnen de TOS-avond."
            ),
            suggested_change="Controleer Vanaf, Tot, wedstrijdduur en pauze.",
        )
    elif error.code == "SESSION_TOO_SHORT":
        diagnostic = FailureDiagnostic(
            code="SESSION_TOO_SHORT",
            severity="blocking",
            message="De TOS-avond is korter dan één volledige wedstrijdronde.",
            suggested_change="Verkort de wedstrijdduur of verruim de eventtijd.",
        )
    elif error.code == "NO_COURTS":
        diagnostic = FailureDiagnostic(
            code="NO_COURTS",
            severity="blocking",
            message="Er is geen baan geselecteerd.",
            suggested_change="Selecteer minimaal één actieve baan.",
        )
    else:
        diagnostic = FailureDiagnostic(
            code="INVALID_CONFIGURATION",
            severity="blocking",
            message="Een onderdeel van de plannerinvoer is ongeldig.",
            suggested_change="Controleer spelers, niveaus, tijden, banen en instellingen.",
        )
    return GenerationFailure(
        code="INVALID_PLANNER_INPUT",
        summary="De huidige plannerinvoer is niet uitvoerbaar.",
        diagnostics=(diagnostic,),
    )


def _probe_succeeds(
    generator: Generator,
    players: Sequence[Player],
    courts: Sequence[str],
    settings: PlannerSettings,
) -> bool:
    try:
        generator(players, courts, settings)
        return True
    except (PlannerInputError, RuntimeError):
        return False


def diagnose_search_failure(
    players: Sequence[Player],
    courts: Sequence[str],
    settings: PlannerSettings,
    search_profile: str,
    generator: Generator = generate_schedule,
) -> GenerationFailure:
    """Onderscheid een uitgeput zoekbudget van structurele invoerfouten."""
    probes: list[tuple[PlannerSettings, FailureDiagnostic]] = []
    extended = SEARCH_PROFILES["Uitgebreid"]
    if search_profile != "Uitgebreid":
        probes.append((
            replace(
                settings,
                search_restarts=extended[0],
                beam_width=extended[1],
                candidates_per_state=extended[2],
            ),
            FailureDiagnostic(
                code="SEARCH_BUDGET_TOO_SMALL",
                severity="likely",
                message="Met het uitgebreide zoekbudget vond de planner wel een geldig schema.",
                suggested_change=f"Verhoog Zoekprofiel van {search_profile} naar Uitgebreid.",
                setting="search_profile",
                current_value=search_profile,
                suggested_value="Uitgebreid",
            ),
        ))
    probes.append((
        replace(settings, random_seed=settings.random_seed + 104_729),
        FailureDiagnostic(
            code="DIFFERENT_SEED_MAY_HELP",
            severity="likely",
            message="Met dezelfde instellingen en een nieuwe indelingseed vond de planner wel een schema.",
            suggested_change="Genereer opnieuw om een andere geldige indeling te proberen.",
            setting=None,
            current_value=None,
            suggested_value=None,
        ),
    ))

    likely: list[FailureDiagnostic] = []
    probes_run = 0
    for probe_settings, diagnostic in probes[:MAX_DIAGNOSTIC_PROBES]:
        probes_run += 1
        if _probe_succeeds(generator, players, courts, probe_settings):
            likely.append(diagnostic)
            if len(likely) >= MAX_LIKELY_DIAGNOSTICS:
                break

    if not likely:
        likely.append(FailureDiagnostic(
            code="SEARCH_BUDGET_EXHAUSTED",
            severity="unknown",
            message="De invoer lijkt structureel speelbaar, maar de zoekruimte leverde binnen het beschikbare budget geen schema op.",
            suggested_change="Gebruik het zoekprofiel Uitgebreid of genereer opnieuw met een nieuwe indelingseed.",
        ))
    return GenerationFailure(
        code="NO_VALID_SCHEDULE",
        summary="Geen geldig schema gevonden.",
        diagnostics=tuple(likely),
        probes_run=probes_run,
    )
