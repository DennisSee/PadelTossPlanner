"""Planningslogica voor de TOS Padelplanner.

Deze module bevat geen Streamlit- of Excel-code. Daardoor kan dezelfde planner
later ook vanuit een API, command-line-tool of andere interface worden gebruikt.
"""

from __future__ import annotations

import itertools
import math
import random
import statistics
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Iterable, Sequence


@dataclass(frozen=True)
class Player:
    name: str
    ranking: float
    # Leeg/None betekent dat de speler vanaf de starttijd aanwezig is.
    available_from: time | None = None


@dataclass(frozen=True)
class Match:
    team1: tuple[str, str]
    team2: tuple[str, str]
    quality_penalty: float


@dataclass(frozen=True)
class RoundPlan:
    matches: tuple[Match, ...]
    # Vrijwillige rust nadat een speler aanwezig is.
    rest: tuple[str, ...]
    # Spelers die bij de start van deze ronde nog niet aanwezig zijn.
    unavailable: tuple[str, ...] = tuple()


@dataclass(frozen=True)
class PlannerSettings:
    start_time: time
    end_time: time
    match_minutes: int
    search_restarts: int = 10
    beam_width: int = 12
    candidates_per_state: int = 70
    allow_repeat_partners: bool = False
    random_seed: int = 2026


@dataclass
class SearchState:
    rounds: list[RoundPlan] = field(default_factory=list)
    partner_counts: Counter[tuple[str, str]] = field(default_factory=Counter)
    opponent_counts: Counter[tuple[str, str]] = field(default_factory=Counter)
    play_counts: Counter[str] = field(default_factory=Counter)
    rest_counts: Counter[str] = field(default_factory=Counter)
    previous_rest: frozenset[str] = field(default_factory=frozenset)
    score: float = 0.0


def pair_key(a: str, b: str) -> tuple[str, str]:
    return tuple(sorted((a, b)))


def calculate_rounds(settings: PlannerSettings) -> tuple[int, int]:
    """Geef het aantal volledige rondes en het aantal onbenutte minuten terug."""
    base_date = date(2000, 1, 1)
    start_dt = datetime.combine(base_date, settings.start_time)
    end_dt = datetime.combine(base_date, settings.end_time)
    if end_dt <= start_dt:
        end_dt += timedelta(days=1)

    total_minutes = int((end_dt - start_dt).total_seconds() // 60)
    if settings.match_minutes <= 0:
        raise ValueError("Wedstrijdduur moet groter dan nul zijn.")

    rounds = total_minutes // settings.match_minutes
    unused_minutes = total_minutes % settings.match_minutes
    if rounds < 1:
        raise ValueError("De beschikbare tijd is korter dan één wedstrijdduur.")
    return rounds, unused_minutes


def round_times(settings: PlannerSettings, round_index: int) -> tuple[datetime, datetime]:
    base_date = date(2000, 1, 1)
    start = datetime.combine(base_date, settings.start_time) + timedelta(
        minutes=round_index * settings.match_minutes
    )
    return start, start + timedelta(minutes=settings.match_minutes)


def _fairness_penalty(counts: Counter[str], names: Sequence[str], weight: float) -> float:
    values = [counts[name] for name in names]
    if not values:
        return 0.0
    spread = max(values) - min(values)
    average = statistics.mean(values)
    variance = statistics.mean((value - average) ** 2 for value in values)
    return weight * spread + 2.0 * variance


def _match_penalty(
    team1: tuple[str, str],
    team2: tuple[str, str],
    ranks: dict[str, float],
    partner_counts: Counter[tuple[str, str]],
    opponent_counts: Counter[tuple[str, str]],
    allow_repeat_partners: bool,
) -> float:
    repeat_partners = sum(partner_counts[pair_key(*team)] for team in (team1, team2))
    if repeat_partners and not allow_repeat_partners:
        return math.inf

    team1_ranks = [ranks[name] for name in team1]
    team2_ranks = [ranks[name] for name in team2]
    all_ranks = team1_ranks + team2_ranks

    team_difference = abs(statistics.mean(team1_ranks) - statistics.mean(team2_ranks))
    court_spread = max(all_ranks) - min(all_ranks)
    teammate_gaps = [
        abs(team1_ranks[0] - team1_ranks[1]),
        abs(team2_ranks[0] - team2_ranks[1]),
    ]
    extreme_gap = sum(max(0.0, gap - 2.0) for gap in teammate_gaps)
    repeated_opponents = sum(
        opponent_counts[pair_key(player1, player2)]
        for player1 in team1
        for player2 in team2
    )

    # Teamgelijkheid weegt het zwaarst. Daarna beperken we de spreiding op de
    # baan. Een beetje niveauverschil binnen een team is toegestaan, maar zeer
    # grote verschillen worden extra bestraft.
    return (
        15.0 * team_difference
        + 3.2 * court_spread
        + 1.2 * sum(teammate_gaps)
        + 8.0 * extreme_gap
        + 2.0 * repeated_opponents
        + 100.0 * repeat_partners
    )


def _best_match_for_group(
    group: Sequence[str],
    ranks: dict[str, float],
    state: SearchState,
    settings: PlannerSettings,
    rng: random.Random,
) -> Match | None:
    a, b, c, d = group
    pairings = (
        ((a, b), (c, d)),
        ((a, c), (b, d)),
        ((a, d), (b, c)),
    )

    candidates: list[tuple[float, Match]] = []
    for raw_team1, raw_team2 in pairings:
        team1 = tuple(sorted(raw_team1))
        team2 = tuple(sorted(raw_team2))
        penalty = _match_penalty(
            team1,
            team2,
            ranks,
            state.partner_counts,
            state.opponent_counts,
            settings.allow_repeat_partners,
        )
        if math.isinf(penalty):
            continue
        match = Match(team1=team1, team2=team2, quality_penalty=penalty)
        candidates.append((penalty + rng.random() * 0.35, match))

    if not candidates:
        return None
    return min(candidates, key=lambda item: item[0])[1]


def _make_groups(
    active: Sequence[str],
    ranks: dict[str, float],
    rng: random.Random,
    strategy: int,
) -> list[list[str]]:
    names = list(active)

    if strategy < 65:
        # Meestal groeperen we spelers op ongeveer gelijk niveau. De jitter zorgt
        # voor voldoende afwisseling tussen aangrenzende niveaus.
        jitter = 0.75 if strategy < 40 else 1.25
        names.sort(key=lambda name: (ranks[name] + rng.uniform(-jitter, jitter), rng.random()))
    elif strategy < 88:
        # Sorteer eerst en wissel daarna spelers tussen aangrenzende groepen.
        names.sort(key=lambda name: (ranks[name], rng.random()))
        for index in range(0, len(names) - 4, 4):
            if rng.random() < 0.8:
                left = index + rng.randrange(4)
                right = index + 4 + rng.randrange(min(4, len(names) - index - 4))
                names[left], names[right] = names[right], names[left]
    else:
        # Een volledig willekeurige indeling helpt om uit lokale doodlopende
        # situaties met partnerrestricties te ontsnappen.
        rng.shuffle(names)

    return [names[index : index + 4] for index in range(0, len(names), 4)]


def _candidate_matches(
    active: Sequence[str],
    ranks: dict[str, float],
    state: SearchState,
    settings: PlannerSettings,
    rng: random.Random,
) -> tuple[tuple[Match, ...], float] | None:
    groups = _make_groups(active, ranks, rng, rng.randrange(100))
    matches: list[Match] = []

    for group in groups:
        match = _best_match_for_group(group, ranks, state, settings, rng)
        if match is None:
            return None
        matches.append(match)

    signature = tuple(
        sorted((tuple(sorted(match.team1)), tuple(sorted(match.team2))) for match in matches)
    )
    if len(signature) != len(set(signature)):
        return None

    return tuple(matches), sum(match.quality_penalty for match in matches)


def _count_deviation_penalty(
    counts: Counter[str],
    targets: dict[str, float],
    names: Sequence[str],
    weight: float,
) -> float:
    """Bestraf afwijkingen van de eerlijke, beschikbaarheidsafhankelijke doelen."""
    differences = [counts[name] - targets.get(name, 0.0) for name in names]
    if not differences:
        return 0.0
    squared = sum(value * value for value in differences)
    spread = max(differences) - min(differences)
    return weight * squared + 2.5 * spread


def _time_offset_minutes(start_time: time, value: time) -> int:
    """Aantal minuten vanaf starttijd, met ondersteuning voor over-middernacht."""
    base_date = date(2000, 1, 1)
    start_dt = datetime.combine(base_date, start_time)
    value_dt = datetime.combine(base_date, value)
    if value_dt < start_dt:
        value_dt += timedelta(days=1)
    return int((value_dt - start_dt).total_seconds() // 60)


def _availability_context(
    players: Sequence[Player],
    settings: PlannerSettings,
    round_count: int,
) -> tuple[
    list[tuple[str, ...]],
    list[tuple[str, ...]],
    dict[str, int],
    dict[str, int],
]:
    """Bereken aanwezigheid per ronde.

    Een speler wordt beschikbaar in de eerste ronde waarvan de starttijd gelijk aan
    of later dan ``available_from`` is. Verplichte afwezigheid telt niet als rust.
    """
    names = [player.name for player in players]
    latest_round_start = (round_count - 1) * settings.match_minutes
    availability_offset: dict[str, int] = {}

    for player in players:
        available_time = player.available_from or settings.start_time
        offset = _time_offset_minutes(settings.start_time, available_time)
        if offset > latest_round_start:
            raise ValueError(
                f"De vanaf-tijd van {player.name} ({available_time:%H:%M}) ligt na "
                "de start van de laatste speelronde."
            )
        availability_offset[player.name] = offset

    available_by_round: list[tuple[str, ...]] = []
    unavailable_by_round: list[tuple[str, ...]] = []
    availability_rounds = {name: 0 for name in names}
    unavailable_counts = {name: 0 for name in names}

    for round_index in range(round_count):
        round_offset = round_index * settings.match_minutes
        available = tuple(
            name for name in names if availability_offset[name] <= round_offset
        )
        available_set = set(available)
        unavailable = tuple(name for name in names if name not in available_set)
        available_by_round.append(available)
        unavailable_by_round.append(unavailable)

        for name in available:
            availability_rounds[name] += 1
        for name in unavailable:
            unavailable_counts[name] += 1

    return (
        available_by_round,
        unavailable_by_round,
        availability_rounds,
        unavailable_counts,
    )

def _build_fairness_targets(
    available_by_round: Sequence[Sequence[str]],
    active_slots: int,
    names: Sequence[str],
) -> tuple[list[dict[str, float]], list[dict[str, float]]]:
    cumulative_play = {name: 0.0 for name in names}
    cumulative_rest = {name: 0.0 for name in names}
    play_targets: list[dict[str, float]] = []
    rest_targets: list[dict[str, float]] = []

    for available in available_by_round:
        count = len(available)
        if count:
            play_share = active_slots / count
            rest_share = max(0, count - active_slots) / count
            for name in available:
                cumulative_play[name] += play_share
                cumulative_rest[name] += rest_share
        play_targets.append(cumulative_play.copy())
        rest_targets.append(cumulative_rest.copy())
    return play_targets, rest_targets


def _rest_options(
    available_names: Sequence[str],
    rest_count: int,
    state: SearchState,
    all_names: Sequence[str],
    target_play: dict[str, float],
    target_rest: dict[str, float],
    rng: random.Random,
    limit: int,
) -> list[tuple[str, ...]]:
    if rest_count == 0:
        return [tuple()]

    # Alleen echte rust telt voor de regel 'niet twee rondes achter elkaar'.
    eligible = [name for name in available_names if name not in state.previous_rest]
    if len(eligible) < rest_count:
        return []

    total = math.comb(len(eligible), rest_count)
    if total <= 500:
        combinations: Iterable[tuple[str, ...]] = itertools.combinations(eligible, rest_count)
    else:
        sampled: set[tuple[str, ...]] = set()
        target = min(600, total)
        while len(sampled) < target:
            sampled.add(tuple(sorted(rng.sample(eligible, rest_count))))
        combinations = sampled

    scored: list[tuple[float, tuple[str, ...]]] = []
    for resters in combinations:
        rest_set = set(resters)
        projected_play = state.play_counts.copy()
        projected_rest = state.rest_counts.copy()
        for name in available_names:
            if name in rest_set:
                projected_rest[name] += 1
            else:
                projected_play[name] += 1

        score = (
            _count_deviation_penalty(projected_play, target_play, all_names, 11.0)
            + _count_deviation_penalty(projected_rest, target_rest, all_names, 8.0)
            + rng.random() * 0.5
        )
        scored.append((score, tuple(sorted(resters))))

    scored.sort(key=lambda item: item[0])
    best = [resters for _, resters in scored[:limit]]
    if len(scored) > limit and limit > 1:
        pool_end = min(len(scored), max(limit + 1, limit * 4))
        best[-1] = rng.choice(scored[limit:pool_end])[1]
    return best


def _extend_state(
    state: SearchState,
    matches: tuple[Match, ...],
    resters: tuple[str, ...],
    unavailable: tuple[str, ...],
    available_names: Sequence[str],
    all_names: Sequence[str],
    target_play: dict[str, float],
    target_rest: dict[str, float],
    arrangement_score: float,
) -> SearchState:
    new_state = SearchState(
        rounds=state.rounds.copy(),
        partner_counts=state.partner_counts.copy(),
        opponent_counts=state.opponent_counts.copy(),
        play_counts=state.play_counts.copy(),
        rest_counts=state.rest_counts.copy(),
        previous_rest=frozenset(resters),
        score=state.score + arrangement_score,
    )
    new_state.rounds.append(
        RoundPlan(matches=matches, rest=resters, unavailable=unavailable)
    )

    rest_set = set(resters)
    for name in available_names:
        if name in rest_set:
            new_state.rest_counts[name] += 1
        else:
            new_state.play_counts[name] += 1

    for match in matches:
        new_state.partner_counts[pair_key(*match.team1)] += 1
        new_state.partner_counts[pair_key(*match.team2)] += 1
        for player1 in match.team1:
            for player2 in match.team2:
                new_state.opponent_counts[pair_key(player1, player2)] += 1

    new_state.score += _count_deviation_penalty(
        new_state.play_counts, target_play, all_names, 3.5
    )
    new_state.score += _count_deviation_penalty(
        new_state.rest_counts, target_rest, all_names, 2.5
    )
    return new_state


def _state_signature(state: SearchState, names: Sequence[str]) -> tuple[object, ...]:
    return (
        tuple(sorted(state.partner_counts.items())),
        tuple(state.play_counts[name] for name in names),
        tuple(state.rest_counts[name] for name in names),
        tuple(sorted(state.previous_rest)),
    )


def _final_score(
    state: SearchState,
    names: Sequence[str],
    target_play: dict[str, float],
    target_rest: dict[str, float],
) -> float:
    return (
        state.score
        + _count_deviation_penalty(state.play_counts, target_play, names, 30.0)
        + _count_deviation_penalty(state.rest_counts, target_rest, names, 22.0)
    )


def generate_schedule(
    players: Sequence[Player],
    courts: Sequence[str],
    settings: PlannerSettings,
) -> tuple[list[RoundPlan], dict[str, object]]:
    """Genereer een schema met optionele aankomsttijden per speler."""
    if len(players) < 4:
        raise ValueError("Minimaal vier spelers zijn nodig.")
    if not courts:
        raise ValueError("Selecteer minimaal één baan.")

    names = [player.name.strip() for player in players]
    if any(not name for name in names):
        raise ValueError("Iedere speler moet een naam hebben.")
    if len({name.casefold() for name in names}) != len(names):
        raise ValueError("Spelernamen moeten uniek zijn.")
    if any(not 1 <= player.ranking <= 5 for player in players):
        raise ValueError("Iedere ranking moet tussen 1 en 5 liggen.")

    active_slots = len(courts) * 4
    if len(players) < active_slots:
        raise ValueError(
            f"Voor {len(courts)} banen zijn minimaal {active_slots} spelers nodig. "
            f"Er zijn nu {len(players)} spelers ingevoerd."
        )

    ranks = {player.name: float(player.ranking) for player in players}
    rounds, unused_minutes = calculate_rounds(settings)
    (
        available_by_round,
        unavailable_by_round,
        availability_rounds,
        unavailable_counts,
    ) = _availability_context(players, settings, rounds)

    for round_index, available in enumerate(available_by_round):
        if len(available) < active_slots:
            start, _ = round_times(settings, round_index)
            shortage = active_slots - len(available)
            raise ValueError(
                f"Om {start:%H:%M} zijn slechts {len(available)} spelers aanwezig, "
                f"maar voor {len(courts)} banen zijn er {active_slots} nodig. "
                f"Er ontbreken {shortage} speler(s). Pas een vanaf-tijd aan of selecteer minder banen."
            )

    play_targets, rest_targets = _build_fairness_targets(
        available_by_round, active_slots, names
    )
    rest_counts_per_round = [len(available) - active_slots for available in available_by_round]

    # Een snelle haalbaarheidscontrole voor de regel zonder opeenvolgende echte rust.
    for round_index in range(1, rounds):
        previous_rest = rest_counts_per_round[round_index - 1]
        current_rest = rest_counts_per_round[round_index]
        available_count = len(available_by_round[round_index])
        if previous_rest + current_rest > available_count:
            start, _ = round_times(settings, round_index)
            raise ValueError(
                f"Rond {start:%H:%M} kan de regel 'niet twee echte rustbeurten achter elkaar' "
                "niet worden gehaald. Selecteer meer banen of gebruik minder spelers."
            )

    best_state: SearchState | None = None
    best_score = math.inf

    for restart in range(settings.search_restarts):
        rng = random.Random(settings.random_seed + restart * 7919)
        states = [SearchState()]

        for round_index in range(rounds):
            next_states: list[SearchState] = []
            available_names = available_by_round[round_index]
            unavailable = unavailable_by_round[round_index]
            rest_count = rest_counts_per_round[round_index]
            target_play = play_targets[round_index]
            target_rest = rest_targets[round_index]

            for state in states:
                rest_limit = min(10, max(1, settings.candidates_per_state // 10))
                rest_options = _rest_options(
                    available_names,
                    rest_count,
                    state,
                    names,
                    target_play,
                    target_rest,
                    rng,
                    rest_limit,
                )
                if not rest_options:
                    continue

                samples_per_rest = max(6, settings.candidates_per_state // len(rest_options))
                seen_rounds: set[tuple[object, ...]] = set()
                for resters in rest_options:
                    rest_set = set(resters)
                    active = [name for name in available_names if name not in rest_set]
                    for _ in range(samples_per_rest):
                        candidate = _candidate_matches(active, ranks, state, settings, rng)
                        if candidate is None:
                            continue
                        matches, arrangement_score = candidate
                        signature = (
                            resters,
                            tuple(
                                sorted(
                                    (tuple(sorted(match.team1)), tuple(sorted(match.team2)))
                                    for match in matches
                                )
                            ),
                        )
                        if signature in seen_rounds:
                            continue
                        seen_rounds.add(signature)
                        next_states.append(
                            _extend_state(
                                state,
                                matches,
                                resters,
                                unavailable,
                                available_names,
                                names,
                                target_play,
                                target_rest,
                                arrangement_score,
                            )
                        )

            if not next_states:
                states = []
                break

            rng.shuffle(next_states)
            next_states.sort(key=lambda candidate: candidate.score)
            states = []
            seen_states: set[tuple[object, ...]] = set()
            for candidate in next_states:
                signature = _state_signature(candidate, names)
                if signature in seen_states:
                    continue
                seen_states.add(signature)
                states.append(candidate)
                if len(states) >= settings.beam_width:
                    break

        for state in states:
            score = _final_score(state, names, play_targets[-1], rest_targets[-1])
            if score < best_score:
                best_score = score
                best_state = state

    if best_state is None:
        raise RuntimeError(
            "Geen geldig schema gevonden. Probeer 'Uitgebreid zoeken', sta dubbele partners toe, "
            "verkort de avond of pas het aantal spelers, aankomsttijden of banen aan."
        )

    late_players = [
        player.name
        for player in players
        if player.available_from is not None
        and _time_offset_minutes(settings.start_time, player.available_from) > 0
    ]
    rest_min = min(rest_counts_per_round) if rest_counts_per_round else 0
    rest_max = max(rest_counts_per_round) if rest_counts_per_round else 0
    rest_display: int | str = rest_min if rest_min == rest_max else f"{rest_min}–{rest_max}"

    diagnostics: dict[str, object] = {
        "rounds": rounds,
        "unused_minutes": unused_minutes,
        "courts_used": len(courts),
        "active_slots": active_slots,
        "rest_count": rest_display,
        "rest_counts_per_round": rest_counts_per_round,
        "score": round(best_score, 2),
        "play_counts": dict(best_state.play_counts),
        "rest_counts": dict(best_state.rest_counts),
        "unavailable_counts": unavailable_counts,
        "availability_rounds": availability_rounds,
        "target_play_counts": play_targets[-1],
        "partner_counts": dict(best_state.partner_counts),
        "opponent_counts": dict(best_state.opponent_counts),
        "late_players": late_players,
    }
    return best_state.rounds, diagnostics

def schedule_rows(
    rounds: Sequence[RoundPlan],
    courts: Sequence[str],
    players: Sequence[Player],
    settings: PlannerSettings,
) -> list[dict[str, object]]:
    """Maak tabelrijen voor Streamlit en Excel."""
    ranks = {player.name: float(player.ranking) for player in players}
    rows: list[dict[str, object]] = []

    for round_index, round_plan in enumerate(rounds):
        start, end = round_times(settings, round_index)
        matches = list(round_plan.matches)
        shift = round_index % len(courts)
        rotated_courts = list(courts[shift:]) + list(courts[:shift])
        matches.sort(
            key=lambda match: statistics.mean(
                ranks[name] for name in (*match.team1, *match.team2)
            ),
            reverse=True,
        )

        for court, match in zip(rotated_courts, matches):
            team1_level = statistics.mean(ranks[name] for name in match.team1)
            team2_level = statistics.mean(ranks[name] for name in match.team2)
            rows.append(
                {
                    "Ronde": round_index + 1,
                    "Tijd": f"{start:%H:%M} - {end:%H:%M}",
                    "Baan": court,
                    "Team 1": " & ".join(match.team1),
                    "Niveau T1": round(team1_level, 1),
                    "Team 2": " & ".join(match.team2),
                    "Niveau T2": round(team2_level, 1),
                    "Teamverschil": round(abs(team1_level - team2_level), 1),
                    "Rust": ", ".join(round_plan.rest) if round_plan.rest else "Niemand",
                    "Nog niet aanwezig": (
                        ", ".join(round_plan.unavailable)
                        if round_plan.unavailable
                        else "Niemand"
                    ),
                }
            )
    return rows


def player_statistics(
    rounds: Sequence[RoundPlan],
    players: Sequence[Player],
    diagnostics: dict[str, object],
) -> list[dict[str, object]]:
    partners: dict[str, set[str]] = {player.name: set() for player in players}
    opponents: dict[str, set[str]] = {player.name: set() for player in players}

    for round_plan in rounds:
        for match in round_plan.matches:
            partners[match.team1[0]].add(match.team1[1])
            partners[match.team1[1]].add(match.team1[0])
            partners[match.team2[0]].add(match.team2[1])
            partners[match.team2[1]].add(match.team2[0])
            for name in match.team1:
                opponents[name].update(match.team2)
            for name in match.team2:
                opponents[name].update(match.team1)

    play_counts = diagnostics["play_counts"]
    rest_counts = diagnostics["rest_counts"]
    unavailable_counts = diagnostics.get("unavailable_counts", {})
    availability_rounds = diagnostics.get("availability_rounds", {})
    assert isinstance(play_counts, dict)
    assert isinstance(rest_counts, dict)
    assert isinstance(unavailable_counts, dict)
    assert isinstance(availability_rounds, dict)

    result: list[dict[str, object]] = []
    for player in sorted(players, key=lambda item: (-item.ranking, item.name.casefold())):
        available_label = (
            player.available_from.strftime("%H:%M")
            if player.available_from is not None
            else "Vanaf start"
        )
        result.append(
            {
                "Speler": player.name,
                "Ranking": player.ranking,
                "Beschikbaar vanaf": available_label,
                "Wedstrijden": int(play_counts.get(player.name, 0)),
                "Rustbeurten": int(rest_counts.get(player.name, 0)),
                "Nog niet aanwezig": int(unavailable_counts.get(player.name, 0)),
                "Beschikbare rondes": int(availability_rounds.get(player.name, 0)),
                "Unieke partners": len(partners[player.name]),
                "Unieke tegenstanders": len(opponents[player.name]),
                "Partners": ", ".join(sorted(partners[player.name])),
            }
        )
    return result

