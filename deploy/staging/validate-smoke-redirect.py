#!/usr/bin/env python3
"""Validate a protected-route redirect without printing its possibly sensitive value."""

from __future__ import annotations

import sys
from urllib.parse import parse_qsl, urlsplit


def normalized_origin(url: str) -> tuple[str, str, int] | None:
    parsed = urlsplit(url)
    if parsed.scheme.lower() != "https" or not parsed.hostname:
        return None
    if parsed.username is not None or parsed.password is not None:
        return None
    return parsed.scheme.lower(), parsed.hostname.lower(), parsed.port or 443


def is_safe_login_redirect(base_url: str, location: str, expected_path: str) -> bool:
    if not location or any(ord(character) < 0x20 or ord(character) == 0x7F for character in location):
        return False
    if not expected_path.startswith("/") or expected_path.startswith("//"):
        return False

    base_origin = normalized_origin(base_url)
    if base_origin is None or location.startswith("//"):
        return False

    parsed = urlsplit(location)
    if parsed.scheme or parsed.netloc:
        if normalized_origin(location) != base_origin:
            return False
    elif not location.startswith("/"):
        return False

    if parsed.path != "/login" or parsed.fragment:
        return False

    query = parse_qsl(
        parsed.query,
        keep_blank_values=True,
        strict_parsing=True,
        max_num_fields=8,
    )
    return query == [("next", expected_path)]


def main() -> int:
    if len(sys.argv) != 3:
        return 1
    try:
        location = sys.stdin.buffer.read().decode("utf-8", errors="strict")
        return 0 if is_safe_login_redirect(sys.argv[1], location, sys.argv[2]) else 1
    except (UnicodeDecodeError, ValueError):
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
