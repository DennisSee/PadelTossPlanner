"""Centraal visueel systeem voor de T.C. Zuid TOS Streamlit-app."""

from __future__ import annotations

from html import escape
from types import MappingProxyType
from typing import Literal


DESIGN_TOKENS = MappingProxyType(
    {
        "club_green": "#0A6951",
        "club_green_dark": "#064A39",
        "club_yellow": "#F6CD22",
        "page_background": "#F4F7F3",
        "surface_background": "#FFFFFF",
        "surface_subtle": "#EEF5F1",
        "text": "#173B31",
        "muted_text": "#5B6E67",
        "border": "#D5E1DC",
        "success": "#167A55",
        "warning": "#956500",
        "danger": "#B42318",
        "focus": "#F6CD22",
        "radius_small": "0.55rem",
        "radius": "0.9rem",
        "radius_large": "1.1rem",
        "shadow": "0 3px 14px rgba(6, 74, 57, 0.08)",
        "space_1": "0.25rem",
        "space_2": "0.5rem",
        "space_3": "0.75rem",
        "space_4": "1rem",
        "space_5": "1.5rem",
        "space_6": "2rem",
    }
)

_CSS_TOKEN_NAMES = {
    "club_green": "--tc-green",
    "club_green_dark": "--tc-green-dark",
    "club_yellow": "--tc-yellow",
    "page_background": "--tc-page",
    "surface_background": "--tc-surface",
    "surface_subtle": "--tc-surface-subtle",
    "text": "--tc-text",
    "muted_text": "--tc-muted",
    "border": "--tc-border",
    "success": "--tc-success",
    "warning": "--tc-warning",
    "danger": "--tc-danger",
    "focus": "--tc-focus",
    "radius_small": "--tc-radius-sm",
    "radius": "--tc-radius",
    "radius_large": "--tc-radius-lg",
    "shadow": "--tc-shadow",
    "space_1": "--tc-space-1",
    "space_2": "--tc-space-2",
    "space_3": "--tc-space-3",
    "space_4": "--tc-space-4",
    "space_5": "--tc-space-5",
    "space_6": "--tc-space-6",
}

BadgeTone = Literal["success", "warning", "danger", "info", "neutral"]
_BADGE_TONES = frozenset({"success", "warning", "danger", "info", "neutral"})
ParticipantEventAccent = Literal[
    "registered", "open", "closed", "cancelled", "neutral"
]
_PARTICIPANT_EVENT_ACCENTS = frozenset(
    {"registered", "open", "closed", "cancelled", "neutral"}
)
_PARTICIPANT_EVENT_STATUSES: dict[str, tuple[str, BadgeTone]] = {
    "draft": ("Concept", "warning"),
    "open": ("Open", "success"),
    "closed": ("Gesloten", "neutral"),
    "cancelled": ("Geannuleerd", "danger"),
}


def design_system_stylesheet() -> str:
    """Lever één globale stylesheet op; component-CSS gebruikt dezelfde tokens."""
    token_lines = "\n".join(
        f"            {_CSS_TOKEN_NAMES[name]}: {value};"
        for name, value in DESIGN_TOKENS.items()
    )
    return (
        '<style id="tc-zuid-design-system">\n'
        "        :root {\n"
        f"{token_lines}\n"
        "            --tc-soft-green: #EAF6F0;\n"
        "            --tc-soft-yellow: #FFF7CF;\n"
        "            --tos-border: var(--tc-border);\n"
        "            --tos-muted: var(--tc-muted);\n"
        "            --tos-card: var(--tc-surface);\n"
        "            --tos-accent: var(--tc-green);\n"
        "        }\n"
        """

        html, body, [data-testid="stAppViewContainer"], .stApp {
            background: var(--tc-page);
            color: var(--tc-text);
        }

        [data-testid="stAppViewBlockContainer"],
        .block-container {
            width: min(100%, 1180px);
            max-width: 1180px;
            padding: 3.05rem 1.25rem 2.5rem !important;
        }

        [data-testid="stHeader"] {
            height: 2.75rem !important;
            min-height: 2.75rem !important;
            background: color-mix(in srgb, var(--tc-page) 94%, transparent) !important;
            border-bottom: 1px solid color-mix(in srgb, var(--tc-border) 72%, transparent);
            backdrop-filter: blur(8px);
        }

        [data-testid="stDecoration"] {
            display: none !important;
        }

        [data-testid="stSidebarCollapsedControl"] {
            top: 0.18rem !important;
            left: 0.42rem !important;
        }

        [data-testid="stSidebarCollapsedControl"] button {
            width: 2.35rem !important;
            height: 2.35rem !important;
            min-height: 2.35rem !important;
            border: 1px solid var(--tc-border) !important;
            border-radius: var(--tc-radius-sm) !important;
            background: var(--tc-surface) !important;
            box-shadow: 0 2px 8px rgba(6, 74, 57, 0.08);
        }

        [data-testid="stToolbarActions"],
        [data-testid="stStatusWidget"] {
            display: none !important;
        }

        h1, h2, h3, h4 {
            color: var(--tc-green-dark);
            letter-spacing: -0.018em;
        }

        h1 {
            font-size: clamp(1.75rem, 3vw, 2.25rem) !important;
            line-height: 1.08 !important;
            margin: 0.3rem 0 0.65rem !important;
        }

        h2 {
            font-size: clamp(1.3rem, 2.2vw, 1.6rem) !important;
            line-height: 1.15 !important;
            margin: 1.2rem 0 0.55rem !important;
        }

        h3 {
            font-size: clamp(1.08rem, 1.8vw, 1.28rem) !important;
            line-height: 1.2 !important;
            margin: 0.95rem 0 0.45rem !important;
        }

        p, li, label, [data-testid="stCaptionContainer"] {
            line-height: 1.45;
        }

        [data-testid="stCaptionContainer"],
        .tos-muted {
            color: var(--tc-muted) !important;
        }

        .tos-app-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: var(--tc-space-3);
            min-height: 3.35rem;
            margin: 0 0 var(--tc-space-3);
            padding: 0.35rem 0 0.55rem;
            border-bottom: 1px solid var(--tc-border);
        }

        .tos-app-brand {
            display: flex;
            align-items: center;
            gap: 0.7rem;
            min-width: 0;
        }

        .tos-app-logo {
            width: 2.7rem;
            height: 2.7rem;
            object-fit: contain;
            flex: 0 0 auto;
            border-radius: 0.65rem;
            background: var(--tc-surface);
            box-shadow: 0 2px 8px rgba(6, 74, 57, 0.09);
        }

        .tos-app-title {
            color: var(--tc-green-dark);
            font-size: clamp(1.25rem, 2.4vw, 1.65rem);
            line-height: 1.05;
            font-weight: 800;
            letter-spacing: -0.025em;
        }

        .tos-app-page-title {
            margin-top: 0.2rem;
            color: var(--tc-muted);
            font-size: 0.82rem;
            font-weight: 650;
            line-height: 1.2;
        }

        .tos-surface,
        [data-testid="stVerticalBlockBorderWrapper"],
        [data-testid="stForm"],
        [data-testid="stExpander"] details {
            background: var(--tc-surface);
            border-color: var(--tc-border) !important;
            border-radius: var(--tc-radius) !important;
            box-shadow: var(--tc-shadow);
        }

        [data-testid="stVerticalBlockBorderWrapper"] {
            padding: 0.9rem !important;
        }

        [data-testid="stForm"] {
            padding: 1rem !important;
        }

        [data-testid="stForm"] > div,
        [data-testid="stVerticalBlock"] {
            gap: 0.7rem;
        }

        [data-testid="stTextInput"] input,
        [data-testid="stNumberInput"] input,
        [data-testid="stDateInput"] input,
        [data-testid="stTimeInput"] input,
        [data-testid="stSelectbox"] > div > div,
        [data-testid="stMultiSelect"] > div > div {
            min-height: 2.65rem;
            border-color: var(--tc-border) !important;
            border-radius: var(--tc-radius-sm) !important;
            background: var(--tc-surface) !important;
        }

        input:focus-visible,
        textarea:focus-visible,
        button:focus-visible,
        [role="button"]:focus-visible,
        [tabindex]:focus-visible {
            outline: 3px solid color-mix(in srgb, var(--tc-focus) 72%, white) !important;
            outline-offset: 2px !important;
        }

        [data-testid^="stBaseButton-"] {
            min-height: 2.7rem;
            border-radius: var(--tc-radius-sm) !important;
            padding-inline: 1rem !important;
            font-weight: 700 !important;
            transition: background-color 120ms ease, border-color 120ms ease,
                box-shadow 120ms ease, transform 120ms ease;
        }

        [data-testid="stBaseButton-primary"],
        button[kind="primary"] {
            color: white !important;
            background: var(--tc-green) !important;
            border-color: var(--tc-green) !important;
            box-shadow: 0 3px 10px rgba(10, 105, 81, 0.18);
        }

        [data-testid="stBaseButton-primary"]:hover,
        button[kind="primary"]:hover {
            background: var(--tc-green-dark) !important;
            border-color: var(--tc-green-dark) !important;
        }

        [data-testid="stBaseButton-secondary"],
        button[kind="secondary"] {
            color: var(--tc-green-dark) !important;
            background: var(--tc-surface) !important;
            border-color: var(--tc-border) !important;
        }

        [data-testid="stBaseButton-secondary"]:hover,
        button[kind="secondary"]:hover {
            color: var(--tc-green-dark) !important;
            background: var(--tc-surface-subtle) !important;
            border-color: var(--tc-green) !important;
        }

        [data-testid="stBaseButton-tertiary"],
        button[kind="tertiary"] {
            min-height: 2.35rem;
            color: var(--tc-green) !important;
            background: transparent !important;
            border-color: transparent !important;
            box-shadow: none !important;
        }

        [class*="st-key-danger_"] button {
            color: white !important;
            background: var(--tc-danger) !important;
            border-color: var(--tc-danger) !important;
        }

        [data-testid="stAlert"] {
            border-radius: var(--tc-radius-sm);
            border: 1px solid var(--tc-border);
            box-shadow: 0 2px 8px rgba(6, 74, 57, 0.05);
        }

        .tos-badge {
            display: inline-flex;
            align-items: center;
            min-height: 1.65rem;
            padding: 0.2rem 0.58rem;
            border: 1px solid transparent;
            border-radius: 999px;
            font-size: 0.78rem;
            line-height: 1.15;
            font-weight: 750;
            white-space: nowrap;
        }

        .tos-badge--success {
            color: #0A573E;
            background: #E5F5ED;
            border-color: #B7DDCB;
        }

        .tos-badge--warning {
            color: #694700;
            background: #FFF5C2;
            border-color: #E8CF67;
        }

        .tos-badge--danger {
            color: #842016;
            background: #FDEBE9;
            border-color: #EEC5C0;
        }

        .tos-badge--info {
            color: #145A77;
            background: #E7F3F8;
            border-color: #BCD8E3;
        }

        .tos-badge--neutral {
            color: #465851;
            background: #EDF1EF;
            border-color: #D1DBD7;
        }

        .tos-participant-event {
            margin: -0.08rem 0 0.35rem;
            padding: 0.72rem 0.78rem;
            border-left: 4px solid var(--tc-border);
            border-radius: var(--tc-radius-sm);
            background: var(--tc-surface-subtle);
        }

        .tos-participant-event--registered {
            border-left-color: var(--tc-success);
            background: var(--tc-soft-green);
        }

        .tos-participant-event--open {
            border-left-color: var(--tc-yellow);
            background: var(--tc-soft-yellow);
        }

        .tos-participant-event--closed {
            border-left-color: #91A19B;
            background: #F0F3F2;
        }

        .tos-participant-event--cancelled {
            border-left-color: var(--tc-danger);
            background: #FDF0EE;
        }

        .tos-participant-badge-row,
        .tos-participant-personal-status {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 0.35rem;
        }

        .tos-participant-event-title {
            margin: 0.46rem 0 0.15rem;
            color: var(--tc-green-dark);
            font-size: 1.12rem;
            line-height: 1.22;
            font-weight: 800;
            overflow-wrap: anywhere;
        }

        .tos-participant-event-meta,
        .tos-participant-deadline,
        .tos-participant-attendees {
            color: var(--tc-muted);
            font-size: 0.84rem;
            line-height: 1.4;
        }

        .tos-participant-personal-status {
            margin: 0.45rem 0 0.5rem;
        }

        .tos-participant-deadline {
            margin: 0.08rem 0 0.5rem;
        }

        .tos-participant-social-meta {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 0.42rem;
            margin: 0.35rem 0 0.15rem;
        }

        .tos-participant-attendees {
            margin: 0.12rem 0 0.52rem;
            overflow-wrap: anywhere;
        }

        [data-testid="stSidebar"] {
            background: #E9F2ED;
            border-right: 1px solid var(--tc-border);
        }

        [data-testid="stSidebarContent"] {
            padding: 1rem 0.8rem 1.25rem;
        }

        .tos-sidebar-account {
            margin: 0 0 0.75rem;
            padding: 0.85rem;
            background: var(--tc-surface);
            border: 1px solid var(--tc-border);
            border-radius: var(--tc-radius);
            box-shadow: 0 2px 9px rgba(6, 74, 57, 0.06);
        }

        .tos-sidebar-account-label {
            color: var(--tc-muted);
            font-size: 0.72rem;
            font-weight: 750;
            letter-spacing: 0.06em;
            text-transform: uppercase;
        }

        .tos-sidebar-account-name {
            margin: 0.25rem 0 0.45rem;
            color: var(--tc-green-dark);
            font-size: 1rem;
            font-weight: 750;
            overflow-wrap: anywhere;
        }

        [data-testid="stSidebar"] [data-testid="stRadio"] > label {
            margin: 0.35rem 0 0.4rem;
            color: var(--tc-muted);
            font-size: 0.75rem;
            font-weight: 750;
            letter-spacing: 0.05em;
            text-transform: uppercase;
        }

        [data-testid="stSidebar"] [role="radiogroup"] {
            gap: 0.28rem;
        }

        [data-testid="stSidebar"] label[data-baseweb="radio"] {
            width: 100%;
            min-height: 2.65rem;
            margin: 0;
            padding: 0.6rem 0.7rem;
            border: 1px solid transparent;
            border-radius: var(--tc-radius-sm);
            background: transparent;
            transition: background-color 120ms ease, border-color 120ms ease;
        }

        [data-testid="stSidebar"] label[data-baseweb="radio"] > div:first-child {
            display: none;
        }

        [data-testid="stSidebar"] label[data-baseweb="radio"]:hover {
            background: color-mix(in srgb, var(--tc-surface) 68%, transparent);
            border-color: var(--tc-border);
        }

        [data-testid="stSidebar"] label[data-baseweb="radio"]:has(input:checked) {
            color: white;
            background: var(--tc-green);
            border-color: var(--tc-green);
            box-shadow: 0 3px 9px rgba(10, 105, 81, 0.16);
        }

        [data-testid="stSidebar"] label[data-baseweb="radio"]:has(input:checked) p {
            color: white !important;
            font-weight: 750 !important;
        }

        [data-testid="stSidebar"] label[data-baseweb="radio"]:focus-within {
            outline: 3px solid color-mix(in srgb, var(--tc-focus) 72%, white);
            outline-offset: 2px;
        }

        [data-testid="stDataFrame"],
        [data-testid="stDataEditor"] {
            border: 1px solid var(--tc-border);
            border-radius: var(--tc-radius-sm);
            overflow: auto;
            background: var(--tc-surface);
        }

        @media (max-width: 1100px) {
            [data-testid="stAppViewBlockContainer"],
            .block-container {
                width: 100%;
                padding-inline: 1rem !important;
            }
        }

        @media (max-width: 700px) {
            [data-testid="stAppViewBlockContainer"],
            .block-container {
                padding: 2.62rem 0.72rem 1.85rem !important;
            }

            [data-testid="stHeader"] {
                height: 2.45rem !important;
                min-height: 2.45rem !important;
            }

            [data-testid="stSidebarCollapsedControl"] {
                top: 0.1rem !important;
            }

            [data-testid="stSidebarCollapsedControl"] button {
                width: 2.2rem !important;
                height: 2.2rem !important;
                min-height: 2.2rem !important;
            }

            h1 {
                font-size: 1.72rem !important;
                margin-top: 0.15rem !important;
            }

            h2 {
                font-size: 1.28rem !important;
                margin-top: 1rem !important;
            }

            h3 {
                font-size: 1.08rem !important;
            }

            .tos-app-header {
                min-height: 2.7rem;
                margin-bottom: 0.35rem;
                padding: 0.08rem 0 0.28rem;
            }

            .tos-app-logo {
                width: 2.35rem;
                height: 2.35rem;
            }

            .tos-app-title {
                font-size: 1.28rem;
            }

            .tos-app-page-title {
                font-size: 0.76rem;
            }

            [data-testid="stVerticalBlockBorderWrapper"],
            [data-testid="stForm"] {
                padding: 0.78rem !important;
            }

            [data-testid^="stBaseButton-"] {
                min-height: 2.85rem;
            }

            .tos-participant-event {
                padding: 0.64rem 0.68rem;
            }

            .tos-participant-event-title {
                margin-top: 0.38rem;
                font-size: 1.05rem;
            }

            .tos-badge {
                min-height: 1.52rem;
                padding: 0.16rem 0.5rem;
                font-size: 0.74rem;
            }
        }

        @media (max-width: 430px) {
            [data-testid="stAppViewBlockContainer"],
            .block-container {
                padding: 2.55rem 0.62rem 1.75rem !important;
            }

            .tos-app-brand {
                gap: 0.55rem;
            }

            .tos-app-title {
                font-size: 1.2rem;
            }

            [data-testid="stHorizontalBlock"] {
                gap: 0.55rem;
            }
        }
        </style>
        """
    )


def app_header_html(
    logo_data_uri: str,
    *,
    page_title: str | None = None,
) -> str:
    """Compacte, herbruikbare header voor publieke en beheerde pagina's."""
    safe_logo = (
        escape(logo_data_uri, quote=True)
        if str(logo_data_uri).startswith("data:image/")
        else ""
    )
    logo = (
        f'<img class="tos-app-logo" src="{safe_logo}" '
        'alt="Logo Tennisclub Zuid Doetinchem">'
        if safe_logo
        else ""
    )
    context = (
        f'<div class="tos-app-page-title">{escape(page_title)}</div>'
        if page_title
        else ""
    )
    return (
        '<header class="tos-app-header">'
        '<div class="tos-app-brand">'
        f"{logo}"
        '<div><div class="tos-app-title">T.C. Zuid TOS</div>'
        f"{context}</div>"
        "</div>"
        "</header>"
    )


def status_badge_html(label: str, tone: BadgeTone = "neutral") -> str:
    if tone not in _BADGE_TONES:
        raise ValueError("Ongeldige badgekleur.")
    return (
        f'<span class="tos-badge tos-badge--{tone}">'
        f"{escape(str(label))}</span>"
    )


def participant_event_header_html(
    *,
    sport: str,
    title: str,
    metadata: str,
    status: object,
    accent: ParticipantEventAccent = "neutral",
) -> str:
    """Compacte eventhiërarchie met semantische badges en statusaccent."""
    if accent not in _PARTICIPANT_EVENT_ACCENTS:
        raise ValueError("Ongeldig eventaccent.")
    status_label, status_tone = _PARTICIPANT_EVENT_STATUSES.get(
        str(status or "").strip().lower(),
        ("Status onbekend", "neutral"),
    )
    return (
        f'<section class="tos-participant-event tos-participant-event--{accent}">'
        '<div class="tos-participant-badge-row">'
        f'{status_badge_html(str(sport).upper(), "info")}'
        f'{status_badge_html(status_label, status_tone)}'
        "</div>"
        f'<div class="tos-participant-event-title">{escape(str(title))}</div>'
        f'<div class="tos-participant-event-meta">{escape(str(metadata))}</div>'
        "</section>"
    )


def participant_registration_status_html(
    response: object,
    availability: str | None = None,
) -> str:
    """Eigen deelname en optionele beschikbaarheid als compacte statusregel."""
    attending = str(response or "") == "attending"
    label = "✓ Aangemeld" if attending else "Ik doe niet mee"
    tone: BadgeTone = "success" if attending else "neutral"
    availability_badge = (
        status_badge_html(availability, "neutral")
        if attending and availability
        else ""
    )
    return (
        '<div class="tos-participant-personal-status">'
        f"{status_badge_html(label, tone)}{availability_badge}"
        "</div>"
    )


def participant_count_html(count: int) -> str:
    """Sociaal deelnemersaantal zonder private deelnemerinformatie."""
    if count < 0:
        raise ValueError("Het deelnemersaantal kan niet negatief zijn.")
    label = f"{count} deelnemer{'s' if count != 1 else ''}"
    return (
        '<div class="tos-participant-social-meta">'
        f'{status_badge_html(label, "neutral")}'
        "</div>"
    )


def participant_deadline_html(label: str) -> str:
    return f'<div class="tos-participant-deadline">{escape(str(label))}</div>'


def participant_attendee_names_html(names_preview: str) -> str:
    return (
        '<div class="tos-participant-attendees">'
        f"{escape(str(names_preview))}</div>"
    )


def sidebar_account_html(
    display_name: str,
    role_label: str,
) -> str:
    return (
        '<section class="tos-sidebar-account">'
        '<div class="tos-sidebar-account-label">Account</div>'
        f'<div class="tos-sidebar-account-name">{escape(display_name)}</div>'
        f'{status_badge_html(role_label, "neutral")}'
        "</section>"
    )
