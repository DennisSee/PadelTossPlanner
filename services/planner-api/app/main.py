from __future__ import annotations

from datetime import time
from typing import Annotated, Any, Literal

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from planner import PlannerInputError, Player, PlannerSettings, generate_schedule, player_statistics, schedule_rows

from .diagnostics import SEARCH_PROFILES, diagnose_search_failure, input_failure

app = FastAPI(
    title="T.C. Zuid TOS planner API",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

class GeneratePlayer(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)
    name: Annotated[str, Field(min_length=1, max_length=120)]
    ranking: Annotated[int, Field(ge=1, le=5)]
    available_from: Annotated[str, Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")]
    available_until: Annotated[str, Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")]

    @field_validator("name")
    @classmethod
    def safe_name(cls, value: str) -> str:
        if any(ord(character) < 32 or ord(character) == 127 for character in value):
            raise ValueError("invalid name")
        return value


class GenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    players: Annotated[list[GeneratePlayer], Field(min_length=4, max_length=160)]
    courts: Annotated[list[str], Field(min_length=1, max_length=12)]
    start_time: Annotated[str, Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")]
    end_time: Annotated[str, Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")]
    match_minutes: Literal[15, 20, 25, 30]
    rest_minutes: Annotated[int, Field(ge=0, le=30)]
    search_profile: Literal["Snel", "Normaal", "Uitgebreid"]
    allow_repeat_partners: bool
    level_mix: Annotated[int, Field(ge=0, le=100)]
    tolerance: Annotated[float, Field(ge=0, le=1.5)]
    generation_seed: Annotated[int, Field(ge=0, le=9_223_372_036_854_775_807)]

    @model_validator(mode="after")
    def validate_collections(self) -> "GenerateRequest":
        if len(set(self.courts)) != len(self.courts) or any(
            not court.strip() or len(court.strip()) > 80 or court != court.strip()
            or any(ord(character) < 32 or ord(character) == 127 for character in court)
            for court in self.courts
        ):
            raise ValueError("invalid courts")
        names = [player.name.casefold() for player in self.players]
        if len(set(names)) != len(names):
            raise ValueError("duplicate names")
        return self


def clock(value: str) -> time:
    hours, minutes = value.split(":")
    return time(int(hours), int(minutes))


def json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            (" | ".join(str(part) for part in key) if isinstance(key, tuple) else str(key)): json_safe(item)
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple, set)):
        return [json_safe(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


@app.exception_handler(RequestValidationError)
async def request_validation_error(_request: Request, _error: RequestValidationError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"error": "invalid-input"})


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "planner-api"}


@app.post("/generate")
def generate(payload: GenerateRequest) -> JSONResponse:
    restarts, beam_width, candidates = SEARCH_PROFILES[payload.search_profile]
    players = [
        Player(name=item.name, ranking=item.ranking, available_from=clock(item.available_from), available_until=clock(item.available_until))
        for item in payload.players
    ]
    settings = PlannerSettings(
        start_time=clock(payload.start_time), end_time=clock(payload.end_time),
        match_minutes=payload.match_minutes, rest_minutes=payload.rest_minutes,
        search_restarts=restarts, beam_width=beam_width, candidates_per_state=candidates,
        allow_repeat_partners=payload.allow_repeat_partners, level_mix=payload.level_mix,
        team_difference_tolerance=payload.tolerance, random_seed=payload.generation_seed,
    )
    try:
        rounds, diagnostics = generate_schedule(players, payload.courts, settings)
        return JSONResponse(status_code=200, content={
            "seed": payload.generation_seed,
            "schedule": schedule_rows(rounds, payload.courts, players, settings),
            "statistics": player_statistics(rounds, players, diagnostics),
            "diagnostics": json_safe(diagnostics),
        })
    except PlannerInputError as error:
        return JSONResponse(status_code=422, content=input_failure(error).json())
    except RuntimeError:
        try:
            failure = diagnose_search_failure(
                players, payload.courts, settings, payload.search_profile
            )
        except Exception:
            return JSONResponse(status_code=500, content={"error": "temporarily-unavailable"})
        return JSONResponse(status_code=422, content=failure.json())
    except Exception:
        return JSONResponse(status_code=500, content={"error": "temporarily-unavailable"})
