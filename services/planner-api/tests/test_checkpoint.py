from copy import deepcopy
from dataclasses import replace
import json
import pytest
from app import main, execution
from planner import generate_schedule as engine, SearchDeadlineReached


def payload():
    return dict(players=[dict(name=f"P{i:02}",ranking=r,available_from="20:00",available_until="22:00")
                         for i,r in enumerate([5,3,3,1,4,4,3,3,4,2,4,2])],
                courts=["Kremer","ZGA/F&F","PlaySeat"],start_time="20:00",end_time="22:00",
                match_minutes=20,rest_minutes=5,search_profile="Uitgebreid",allow_repeat_partners=True,
                level_mix=100,tolerance=1.0,generation_seed=2026,checkpoint_context="a"*64)


@pytest.fixture(autouse=True)
def fast_engine(monkeypatch):
    # Real search/replay, smaller deterministic work caps for non-timing security tests.
    def run(players,courts,settings,**kwargs):
        return engine(players,courts,replace(settings,search_restarts=2,beam_width=3,candidates_per_state=8),**kwargs)
    monkeypatch.setattr(main,"generate_schedule",run)


def call(value):
    response=main.generate(main.GenerateRequest.model_validate(value))
    return response.status_code,json.loads(response.body)


def test_exact_result_replay_once_and_no_schedule_in_token():
    value=payload();status,proposal=call(value)
    assert status==200
    token=proposal.pop("checkpoint")
    assert all(name not in token for name in ["Kremer","ranking","players"])
    status,saved=call(value|{"checkpoint":token})
    assert status==200 and saved==proposal
    assert call(value|{"checkpoint":token})==(409,{"error":"INVALID_CHECKPOINT"})


@pytest.mark.parametrize("change", ["context","seed","profile","settings","courts","players","token"])
def test_mismatched_input_or_tampering_is_rejected(change):
    value=payload();_,proposal=call(value)
    changed=deepcopy(value);changed["checkpoint"]=proposal["checkpoint"]
    if change=="context":changed["checkpoint_context"]="b"*64
    if change=="seed":changed["generation_seed"]+=1
    if change=="profile":changed["search_profile"]="Normaal"
    if change=="settings":changed["level_mix"]=99
    if change=="courts":changed["courts"][0]="Andere baan"
    if change=="players":changed["players"][0]["ranking"]=4
    if change=="token":changed["checkpoint"]="x"+changed["checkpoint"][1:]
    assert call(changed)==(409,{"error":"INVALID_CHECKPOINT"})


def test_expiry_and_result_mismatch_fail_closed(monkeypatch):
    value=payload();_,proposal=call(value)
    monkeypatch.setattr(execution.time,"time",lambda:10**12)
    assert call(value|{"checkpoint":proposal["checkpoint"]})[0]==409


def test_different_reconstructed_result_is_not_returned(monkeypatch):
    value=payload();_,proposal=call(value)
    original=main.schedule_rows
    def different(*args):
        rows=original(*args);rows[0]["Team 1"]="Different"
        return rows
    monkeypatch.setattr(main,"schedule_rows",different)
    assert call(value|{"checkpoint":proposal["checkpoint"]})[0]==409


def test_deadline_is_not_no_solution_and_no_probes(monkeypatch):
    def timeout(*args,**kwargs):raise SearchDeadlineReached()
    monkeypatch.setattr(main,"generate_schedule",timeout)
    assert call(payload())==(504,{"error":"SEARCH_DEADLINE_REACHED"})


def test_process_restart_key_invalidates_checkpoint(monkeypatch):
    value=payload();_,proposal=call(value)
    monkeypatch.setattr(execution,"_KEY",b"different-process-key"*2)
    assert call(value|{"checkpoint":proposal["checkpoint"]})==(409,{"error":"INVALID_CHECKPOINT"})
