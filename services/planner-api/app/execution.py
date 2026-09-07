"""Bounded execution and process-local, one-use authenticated search receipts.

Restart/expiry deliberately invalidates receipts: callers must generate again.
No player data is embedded in the token, only keyed input/result fingerprints.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import threading
import time

TIME_BUDGETS = {"Snel": 5.0, "Normaal": 9.0, "Uitgebreid": 13.0}
RECEIPT_TTL_SECONDS = 900
MAX_CONSUMED_RECEIPTS = 4096
_KEY = secrets.token_bytes(32)
_used: dict[str, float] = {}
_lock = threading.Lock()


class CheckpointError(ValueError):
    pass


def canonical(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False).encode()


def fingerprint(value: object) -> str:
    return hmac.new(_KEY, canonical(value), hashlib.sha256).hexdigest()


def issue(request: object, result: dict, boundary: list[int]) -> str:
    body = canonical({"v": 1, "input": fingerprint(request), "result": fingerprint(result),
                      "boundary": boundary, "completed": result["diagnostics"]["optimization_completed"],
                      "expires": time.time() + RECEIPT_TTL_SECONDS, "nonce": secrets.token_hex(16)})
    encoded = base64.urlsafe_b64encode(body).rstrip(b"=")
    signature = hmac.new(_KEY, encoded, hashlib.sha256).hexdigest()
    return encoded.decode() + "." + signature


def consume(token: str, request: object) -> dict:
    try:
        if len(token) > 2048:
            raise CheckpointError()
        encoded, signature = token.split(".")
        expected = hmac.new(_KEY, encoded.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise CheckpointError()
        body = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
        if body["v"] != 1 or body["input"] != fingerprint(request) or body["expires"] <= time.time():
            raise CheckpointError()
        # Consume before expensive replay. A failed save/replay requires a new proposal.
        with _lock:
            now = time.time()
            for nonce in [key for key, expiry in _used.items() if expiry <= now]:
                del _used[nonce]
            if body["nonce"] in _used or len(_used) >= MAX_CONSUMED_RECEIPTS:
                raise CheckpointError()
            _used[body["nonce"]] = body["expires"]
        return body
    except (ValueError, KeyError, TypeError, UnicodeError) as error:
        raise CheckpointError() from error
