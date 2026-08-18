"""Rooktest dat de applicatiemodules samen importeerbaar blijven."""

import importlib


def test_application_modules_import() -> None:
    for module_name in (
        "authorization",
        "database",
        "participant_auth",
        "public_schedule_repository",
        "registration_repository",
        "streamlit_app",
    ):
        assert importlib.import_module(module_name) is not None
