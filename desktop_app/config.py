"""
System Usage Logger Pro — Desktop Client Configuration
"""
import os
import sys

APP_NAME = "System Usage Logger Pro"
APP_VERSION = "1.0.3"
CLIENT_TYPE = "Native Python Desktop Client"

# Paths targeting %APPDATA%\syslogger-pro\ (or ~/.syslogger-pro on non-Windows)
if sys.platform == "win32":
    APPDATA_BASE = os.environ.get("APPDATA", os.path.expanduser("~"))
else:
    APPDATA_BASE = os.path.expanduser("~")

APP_DIR = os.path.join(APPDATA_BASE, "syslogger-pro")
CONFIG_FILE = os.path.join(APP_DIR, "config.json")
OFFLINE_QUEUE_FILE = os.path.join(APP_DIR, "offline_queue.json")
LOGS_DIR = os.path.join(APP_DIR, "logs")
LOG_FILE = os.path.join(LOGS_DIR, "agent.log")

# Default Production Server URL
DEFAULT_SERVER_URL = "https://ais-pre-425pifb7xfy75tn3xngn3f-590412783680.asia-east1.run.app"

# Theme Colors (Slate / Dark Palette)
THEME = {
    "bg_dark": "#0b0f19",
    "card_bg": "#151e2e",
    "card_border": "#273549",
    "header_bg": "#111827",
    "console_bg": "#070a10",
    "text_primary": "#f8fafc",
    "text_secondary": "#94a3b8",
    "text_muted": "#64748b",
    "accent_primary": "#38bdf8",     # Sky blue
    "accent_hover": "#0284c7",
    "badge_pass": "#34d399",        # Emerald green
    "badge_fail": "#f87171",        # Rose red
    "badge_warning": "#fbbf24",     # Amber yellow
    "badge_info": "#60a5fa",        # Light blue
    "badge_synced": "#a78bfa",      # Violet
    "badge_local": "#fb923c",       # Orange
}
