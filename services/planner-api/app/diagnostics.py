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
MAX_DIAGNOSTIC_PROBES = 4
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
    elif error.code == "CONSECUTIVE_REST_IMPOSSIBLE":
        diagnostic = FailureDiagnostic(
            code="REST_DISTRIBUTION_IMPOSSIBLE",
            severity="blocking",
            message="De regel tegen twee opeenvolgende rustbeurten is met deze spelers en banen niet uitvoerbaar.",
            suggested_change="Selecteer meer banen of gebruik minder spelers.",
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
    """Probeer maximaal vier geïsoleerde relaxaties, zonder input te muteren."""
    probes: list[tuple[PlannerSettings, FailureDiagnostic]] = []
    if settings.level_mix < 100:
        probes.append((
            replace(settings, level_mix=100),
            FailureDiagnostic(
                code="LEVEL_MIX_TOO_RESTRICTIVE",
                severity="likely",
                message="Met een hogere niveaumix vond de planner wel een geldig schema.",
                suggested_change=f"Verhoog Niveaumix van {settings.level_mix} naar 100.",
                setting="level_mix",
                current_value=settings.level_mix,
                suggested_value=100,
            ),
        ))
    if settings.team_difference_tolerance < 1.5:
        probes.append((
            replace(settings, team_difference_tolerance=1.5),
            FailureDiagnostic(
                code="TEAM_TOLERANCE_TOO_RESTRICTIVE",
                severity="likely",
                message="Met ruimere teamtolerantie vond de planner wel een geldig schema.",
                suggested_change=(
                    f"Verhoog Teamtolerantie van {settings.team_difference_tolerance:g} naar 1,5."
                ),
                setting="team_difference_tolerance",
                current_value=settings.team_difference_tolerance,
                suggested_value=1.5,
            ),
        ))
    if not settings.allow_repeat_partners:
        probes.append((
            replace(settings, allow_repeat_partners=True),
            FailureDiagnostic(
                code="REPEAT_PARTNERS_REQUIRED",
                severity="likely",
                message="Met herhaalde partners toegestaan vond de planner wel een geldig schema.",
                suggested_change="Sta herhaalde partners toe.",
                setting="allow_repeat_partners",
                current_value=False,
                suggested_value=True,
            ),
        ))
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

    likely: list[FailureDiagnostic] = []
    probes_run = 0
    for probe_settings, diagnostic in probes[:MAX_DIAGNOSTIC_PROBES]:
        if likely and diagnostic.code == "SEARCH_BUDGET_TOO_SMALL":
            break
        probes_run += 1
        if _probe_succeeds(generator, players, courts, probe_settings):
            likely.append(diagnostic)
            if len(likely) >= MAX_LIKELY_DIAGNOSTICS:
                break

    if not likely:
        likely.append(FailureDiagnostic(
            code="COMBINED_OR_SEARCH_LIMIT",
            severity="unknown",
            message="Met één eenvoudige aanpassing kon nog geen geldig schema worden gevonden.",
            suggested_change="Controleer beschikbaarheid, baanselectie en balansinstellingen en wijzig één instelling tegelijk.",
        ))
    return GenerationFailure(
        code="NO_VALID_SCHEDULE",
        summary="Geen geldig schema gevonden.",
        diagnostics=tuple(likely),
        probes_run=probes_run,
    )
