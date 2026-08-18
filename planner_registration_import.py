"""Pure preview- en merge-adapter van TOS-registraties naar plannerinvoer."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time
from typing import Mapping, Sequence
from zoneinfo import ZoneInfo


LOCAL_TIMEZONE = ZoneInfo("Europe/Amsterdam")
PLANNER_FIELDS = ("Naam", "Ranking", "Meedoen", "Vanaf tijd", "Tot tijd")
IMPORT_METADATA_FIELDS = (
    "member_id",
    "user_id",
    "registration_id",
    "registration_updated_at",
    "source_event_id",
)

STATUS_ADD = "Klaar voor import (toevoegen)"
STATUS_UPDATE = "Klaar voor import (bijwerken)"
STATUS_UNCHANGED = "Klaar voor import (ongewijzigd)"
STATUS_DECLINED = "Niet aangemeld / declined"
STATUS_APPROVAL = "Approval ontbreekt"
STATUS_MEMBER_INACTIVE = "Lid inactief"
STATUS_PADEL_INACTIVE = "Padelprofiel inactief"
STATUS_RANKING_MISSING = "Ranking ontbreekt"
STATUS_NAME_MISSING = "Naam ontbreekt"
STATUS_AVAILABILITY_INVALID = "Beschikbaarheid ongeldig"
STATUS_IDENTITY_CONFLICT = "Identityconflict"
STATUS_LEGACY_NAME_CONFLICT = "Naamconflict met handmatige regel"


class PlannerRegistrationImportError(ValueError):
    """De event- of registratiegegevens kunnen niet veilig worden geïmporteerd."""


@dataclass(frozen=True)
class ImportCandidate:
    registration_id: str
    member_id: str
    user_id: str
    display_name: str
    response: str
    approval_status: str
    member_active: bool
    padel_profile_active: bool
    padel_ranking: int | None
    available_from: time | None
    available_until: time | None
    status: str
    reason: str
    planner_row: Mapping[str, object] | None = None

    @property
    def importable(self) -> bool:
        return self.status in {STATUS_ADD, STATUS_UPDATE, STATUS_UNCHANGED}


@dataclass(frozen=True)
class ImportPreview:
    event_id: str
    candidates: tuple[ImportCandidate, ...]

    @property
    def attending_count(self) -> int:
        return sum(candidate.response == "attending" for candidate in self.candidates)

    @property
    def ready_count(self) -> int:
        return sum(candidate.importable for candidate in self.candidates)

    @property
    def blocked_count(self) -> int:
        return sum(
            candidate.response == "attending" and not candidate.importable
            for candidate in self.candidates
        )

    @property
    def declined_count(self) -> int:
        return sum(candidate.response == "declined" for candidate in self.candidates)


@dataclass(frozen=True)
class MergeResult:
    rows: tuple[dict[str, object], ...]
    added: int
    updated: int
    unchanged: int
    skipped: tuple[tuple[str, str], ...]


def _timestamp(value: object, field_name: str) -> datetime:
    text = str(value or "").strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        raise PlannerRegistrationImportError(
            f"{field_name} bevat geen geldige timestamptz."
        ) from None
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise PlannerRegistrationImportError(
            f"{field_name} moet een tijdzone bevatten."
        )
    return parsed


def _ranking(value: object) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        ranking = int(value)
    except (TypeError, ValueError):
        return None
    return ranking if ranking in {1, 2, 3, 4, 5} and str(value) == str(ranking) else None


def _normalized_name(value: object) -> str:
    return " ".join(str(value or "").strip().casefold().split())


def _candidate_row(
    event: Mapping[str, object],
    registration: Mapping[str, object],
    event_start: datetime,
    event_end: datetime,
) -> tuple[dict[str, object] | None, time | None, time | None, str | None]:
    try:
        available_from = _timestamp(
            registration.get("available_from"),
            "Beschikbaar vanaf",
        )
        available_until = _timestamp(
            registration.get("available_until"),
            "Beschikbaar tot",
        )
    except PlannerRegistrationImportError as exc:
        return None, None, None, str(exc)

    if (
        available_from < event_start
        or available_until > event_end
        or available_until <= available_from
    ):
        return (
            None,
            None,
            None,
            "Beschikbaarheid valt buiten de eventtijden.",
        )

    local_from = available_from.astimezone(LOCAL_TIMEZONE)
    local_until = available_until.astimezone(LOCAL_TIMEZONE)
    planner_from = (
        None if available_from == event_start else local_from.time().replace(tzinfo=None)
    )
    planner_until = (
        None if available_until == event_end else local_until.time().replace(tzinfo=None)
    )
    ranking = _ranking(registration.get("padel_ranking"))
    row: dict[str, object] = {
        "Naam": str(registration.get("display_name") or "").strip(),
        "Ranking": ranking,
        "Meedoen": True,
        "Vanaf tijd": planner_from.strftime("%H:%M") if planner_from else None,
        "Tot tijd": planner_until.strftime("%H:%M") if planner_until else None,
        "member_id": str(registration.get("member_id") or ""),
        "user_id": str(registration.get("user_id") or ""),
        "registration_id": str(registration.get("id") or ""),
        "registration_updated_at": str(registration.get("updated_at") or ""),
        "source_event_id": str(event.get("id") or ""),
    }
    return row, planner_from, planner_until, None


def build_registration_import_preview(
    event: Mapping[str, object],
    registrations: Sequence[Mapping[str, object]],
    current_rows: Sequence[Mapping[str, object]] = (),
) -> ImportPreview:
    """Classificeer registraties en bepaal add/update zonder de draft te wijzigen."""
    if str(event.get("sport") or "").lower() != "padel":
        raise PlannerRegistrationImportError(
            "Alleen padel-events kunnen naar de huidige planner worden geïmporteerd."
        )
    event_id = str(event.get("id") or "").strip()
    if not event_id:
        raise PlannerRegistrationImportError("Het event mist een id.")
    event_start = _timestamp(event.get("starts_at"), "Eventstart")
    event_end = _timestamp(event.get("ends_at"), "Eventeinde")
    if event_end <= event_start:
        raise PlannerRegistrationImportError("De eventtijden zijn ongeldig.")

    rows_by_member: dict[str, list[Mapping[str, object]]] = {}
    rows_by_name: dict[str, list[Mapping[str, object]]] = {}
    for row in current_rows:
        member_id = str(row.get("member_id") or "").strip()
        if member_id:
            rows_by_member.setdefault(member_id, []).append(row)
        name = _normalized_name(row.get("Naam"))
        if name:
            rows_by_name.setdefault(name, []).append(row)

    candidates: list[ImportCandidate] = []
    for registration in registrations:
        registration_id = str(registration.get("id") or "")
        member_id = str(registration.get("member_id") or "")
        user_id = str(registration.get("user_id") or "")
        display_name = str(registration.get("display_name") or "").strip()
        response = str(registration.get("response") or "")
        approval = str(registration.get("approval_status") or "")
        member_active = bool(registration.get("member_active"))
        padel_profile_active = bool(registration.get("padel_profile_active"))
        padel_ranking = _ranking(registration.get("padel_ranking"))
        existing_member_rows = rows_by_member.get(member_id, []) if member_id else []

        def blocked(
            status: str,
            reason: str,
            available_from: time | None = None,
            available_until: time | None = None,
        ) -> ImportCandidate:
            return ImportCandidate(
                registration_id,
                member_id,
                user_id,
                display_name,
                response,
                approval,
                member_active,
                padel_profile_active,
                padel_ranking,
                available_from,
                available_until,
                status,
                reason,
            )

        if response != "attending":
            reason = "Niet aangemeld; bestaande plannerregels blijven behouden."
            candidates.append(blocked(STATUS_DECLINED, reason))
            continue
        row, available_from, available_until, availability_error = _candidate_row(
            event,
            registration,
            event_start,
            event_end,
        )
        if row is None:
            candidates.append(
                blocked(
                    STATUS_AVAILABILITY_INVALID,
                    availability_error or "Beschikbaarheid is ongeldig.",
                )
            )
            continue
        if approval != "approved":
            candidates.append(
                blocked(
                    STATUS_APPROVAL,
                    f"Approval-status is {approval or 'onbekend'}.",
                    available_from,
                    available_until,
                )
            )
            continue
        if not member_active:
            candidates.append(
                blocked(
                    STATUS_MEMBER_INACTIVE,
                    "Het clublid is inactief.",
                    available_from,
                    available_until,
                )
            )
            continue
        if not padel_profile_active:
            candidates.append(
                blocked(
                    STATUS_PADEL_INACTIVE,
                    "Het padelprofiel ontbreekt of is inactief.",
                    available_from,
                    available_until,
                )
            )
            continue
        if padel_ranking is None:
            candidates.append(
                blocked(
                    STATUS_RANKING_MISSING,
                    "Padelranking 1–5 ontbreekt.",
                    available_from,
                    available_until,
                )
            )
            continue
        if not display_name:
            candidates.append(
                blocked(
                    STATUS_NAME_MISSING,
                    "De weergavenaam ontbreekt.",
                    available_from,
                    available_until,
                )
            )
            continue
        if not member_id or not registration_id or not user_id:
            candidates.append(
                blocked(
                    STATUS_IDENTITY_CONFLICT,
                    "Stabiele registratie-identiteit ontbreekt.",
                    available_from,
                    available_until,
                )
            )
            continue
        if len(existing_member_rows) > 1:
            candidates.append(
                blocked(
                    STATUS_IDENTITY_CONFLICT,
                    "De plannerlijst bevat dezelfde member_id meer dan eenmaal.",
                    available_from,
                    available_until,
                )
            )
            continue
        if not existing_member_rows and rows_by_name.get(_normalized_name(display_name)):
            candidates.append(
                blocked(
                    STATUS_LEGACY_NAME_CONFLICT,
                    "Een bestaande regel heeft dezelfde naam maar geen betrouwbare identitymatch.",
                    available_from,
                    available_until,
                )
            )
            continue

        if existing_member_rows:
            existing = existing_member_rows[0]
            comparable_fields = (*PLANNER_FIELDS, *IMPORT_METADATA_FIELDS)
            unchanged = all(existing.get(field) == row.get(field) for field in comparable_fields)
            status = STATUS_UNCHANGED if unchanged else STATUS_UPDATE
            reason = (
                "De gekoppelde plannerregel is al actueel."
                if unchanged
                else "De gekoppelde plannerregel wordt bij expliciete import bijgewerkt."
            )
        else:
            status = STATUS_ADD
            reason = "Deze deelnemer wordt als gekoppelde plannerregel toegevoegd."
        candidates.append(
            ImportCandidate(
                registration_id,
                member_id,
                user_id,
                display_name,
                response,
                approval,
                member_active,
                padel_profile_active,
                padel_ranking,
                available_from,
                available_until,
                status,
                reason,
                row,
            )
        )
    return ImportPreview(event_id=event_id, candidates=tuple(candidates))


def merge_registration_import(
    current_rows: Sequence[Mapping[str, object]],
    preview: ImportPreview,
) -> MergeResult:
    """Voeg/update alleen preview-goedgekeurde identityregels; verwijder nooit rijen."""
    merged = [dict(row) for row in current_rows]
    member_indexes: dict[str, list[int]] = {}
    for index, row in enumerate(merged):
        member_id = str(row.get("member_id") or "").strip()
        if member_id:
            member_indexes.setdefault(member_id, []).append(index)

    added = updated = unchanged = 0
    skipped: list[tuple[str, str]] = []
    for candidate in preview.candidates:
        if not candidate.importable or candidate.planner_row is None:
            skipped.append((candidate.display_name, candidate.reason))
            continue
        indexes = member_indexes.get(candidate.member_id, [])
        if len(indexes) > 1:
            skipped.append(
                (candidate.display_name, "Dubbele member_id in de huidige plannerlijst.")
            )
            continue
        if indexes:
            index = indexes[0]
            if candidate.status == STATUS_UNCHANGED:
                unchanged += 1
                continue
            merged[index].update(candidate.planner_row)
            updated += 1
        else:
            merged.append(dict(candidate.planner_row))
            member_indexes[candidate.member_id] = [len(merged) - 1]
            added += 1
    return MergeResult(
        rows=tuple(merged),
        added=added,
        updated=updated,
        unchanged=unchanged,
        skipped=tuple(skipped),
    )
