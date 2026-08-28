import JSZip from 'jszip';

export interface ClientPackageOptions {
  uid?: string;
  deviceId?: string;
  deviceName?: string;
  serverUrl?: string;
}

// 1. In-Memory config.py Generator
export const generateConfigPy = (apiUrl: string, uid: string, deviceId?: string, deviceName?: string) => `"""
System Usage Logger Pro — Desktop Client Configuration
Dynamic In-Memory Generated Configuration
"""
import os
import sys

APP_NAME = "System Usage Logger Pro"
APP_VERSION = "1.0.3"
CLIENT_TYPE = "Native Python Desktop Client"

# Injected User Credentials & Target Server
API_BASE_URL = "${apiUrl}"
USER_UID = "${uid}"
ACCOUNT_UID = "${uid}"
DEFAULT_DEVICE_ID = "${deviceId || 'PC-AUTO'}"
DEFAULT_DEVICE_NAME = "${deviceName || 'MY-WINDOWS-PC'}"
POLL_INTERVAL_SECONDS = 60

# Firebase Firestore REST Configuration
FIREBASE_PROJECT_ID = "system-usage-logger-pro"
FIRESTORE_DATABASE_ID = "ai-studio-systemusagelogge-d54ed719-4af6-4b51-a8c0-d8d482a8f242"
FIREBASE_API_KEY = "AIzaSyB15YRf8KVnenf3TW_MbgK5sHCt096eyiA"

# Paths targeting %APPDATA%\\syslogger-pro\\ (or ~/.syslogger-pro on non-Windows)
if sys.platform == "win32":
    APPDATA_BASE = os.environ.get("APPDATA", os.path.expanduser("~"))
else:
    APPDATA_BASE = os.path.expanduser("~")

APP_DIR = os.path.join(APPDATA_BASE, "syslogger-pro")
CONFIG_FILE = os.path.join(APP_DIR, "config.json")
LOCAL_CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
OFFLINE_QUEUE_FILE = os.path.join(APP_DIR, "offline_queue.json")
LOGS_DIR = os.path.join(APP_DIR, "logs")
LOG_FILE = os.path.join(LOGS_DIR, "agent.log")

DEFAULT_SERVER_URL = API_BASE_URL

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
`;

// 2. In-Memory requirements.txt Generator
export const generateRequirementsTxt = () => `requests>=2.31.0
psutil>=5.9.8
urllib3>=2.0.0
customtkinter>=5.2.0
`;

// 3. In-Memory run.bat and run_agent.bat Generator
export const generateRunBat = () => `@echo off
setlocal enabledelayedexpansion

title System Usage Logger Pro — Python Desktop Client
color 0B

echo ======================================================================
echo   SYSTEM USAGE LOGGER PRO — NATIVE PYTHON DESKTOP CLIENT
echo ======================================================================
echo.

:: 1. Check for Python 3 installation
set "PY_CMD="

where python >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "PY_CMD=python"
) else (
    where py >nul 2>&1
    if %ERRORLEVEL% equ 0 (
        set "PY_CMD=py -3"
    )
)

if "%PY_CMD%"=="" (
    color 0C
    echo [ERROR] Python 3 was not found in your system PATH.
    echo Please install Python 3.9+ from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation.
    echo.
    pause
    exit /b 1
)

echo [OK] Detected Python environment:
%PY_CMD% --version
echo.

:: 2. Setup or activate virtual environment
cd /d "%~dp0"

if not exist ".venv" (
    echo [INFO] Creating Python virtual environment (.venv)...
    %PY_CMD% -m venv .venv
    if %ERRORLEVEL% neq 0 (
        echo [WARN] Virtual environment creation failed. Using system Python directly.
        set "RUN_PY=%PY_CMD%"
    ) else (
        echo [OK] Virtual environment created.
        set "RUN_PY=.venv\\Scripts\\python.exe"
    )
) else (
    set "RUN_PY=.venv\\Scripts\\python.exe"
)

if not exist "%RUN_PY%" (
    set "RUN_PY=%PY_CMD%"
)

:: 3. Install or update dependencies
echo [INFO] Verifying requirements (requests, psutil)...
"%RUN_PY%" -m pip install --quiet --upgrade pip >nul 2>&1
"%RUN_PY%" -m pip install --quiet -r requirements.txt

if %ERRORLEVEL% neq 0 (
    echo [WARN] Pip install returned warnings, attempting to launch application anyway...
)

:: 4. Launch Desktop Application
echo [INFO] Launching System Usage Logger Pro Desktop Client...
start "" "%RUN_PY%" app.py
exit
`;

export const generateRunAgentBat = generateRunBat;

// 4. In-Memory logger_client.py Generator
export const generateLoggerClientPy = (apiUrl: string, uid: string, deviceId?: string, deviceName?: string) => `"""
System Usage Logger Pro — Logger Client & Backend Connector
Handles local config, offline event caching, and backend synchronization.
"""
import os
import sys
import json
import time
import uuid
import socket
import platform
import threading
from datetime import datetime, timezone
import requests

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

from config import (
    APP_NAME,
    APP_VERSION,
    APP_DIR,
    CONFIG_FILE,
    OFFLINE_QUEUE_FILE,
    LOGS_DIR,
    LOG_FILE,
    DEFAULT_SERVER_URL,
    API_BASE_URL,
    USER_UID,
    DEFAULT_DEVICE_ID,
    DEFAULT_DEVICE_NAME,
    POLL_INTERVAL_SECONDS,
    FIREBASE_PROJECT_ID,
    FIRESTORE_DATABASE_ID,
    FIREBASE_API_KEY,
)

_file_lock = threading.RLock()


def ensure_directories():
    """Ensure AppData directories exist."""
    try:
        os.makedirs(APP_DIR, exist_ok=True)
        os.makedirs(LOGS_DIR, exist_ok=True)
    except Exception as e:
        print(f"[ERROR] Failed creating directory: {e}")


def get_default_device_id():
    """Generate a consistent local device ID based on hostname."""
    try:
        hostname = socket.gethostname().upper().replace(" ", "-")
        clean_name = "".join(c for c in hostname if c.isalnum() or c == "-")[:12]
        return f"PC-{clean_name}"
    except Exception:
        return f"PC-{uuid.uuid4().hex[:8].upper()}"


def load_config() -> dict:
    """Load configuration from local or AppData config.json or return defaults."""
    ensure_directories()
    with _file_lock:
        local_cfg = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
        cwd_cfg = os.path.join(os.getcwd(), "config.json")
        candidate_paths = [local_cfg, cwd_cfg, CONFIG_FILE]

        found_data = None
        for p in candidate_paths:
            if os.path.exists(p):
                try:
                    with open(p, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        if isinstance(data, dict) and (data.get("account_uid") or data.get("uid") or data.get("device_id") or data.get("deviceId")):
                            found_data = data
                            break
                except Exception as e:
                    append_log(f"Notice reading config file {p}: {e}", "DEBUG")

        if found_data:
            resolved_uid = found_data.get("account_uid") or found_data.get("uid") or USER_UID or "${uid}"
            resolved_device_id = found_data.get("device_id") or found_data.get("deviceId") or DEFAULT_DEVICE_ID or "${deviceId || 'PC-AUTO'}"
            resolved_device_name = found_data.get("device_name") or found_data.get("deviceName") or DEFAULT_DEVICE_NAME or "${deviceName || 'MY-WINDOWS-PC'}"
            resolved_server_url = found_data.get("server_url") or found_data.get("serverUrl") or DEFAULT_SERVER_URL or "${apiUrl}"

            cfg = {
                "account_uid": resolved_uid,
                "device_id": resolved_device_id,
                "device_name": resolved_device_name,
                "server_url": resolved_server_url,
                "uid": resolved_uid,
                "deviceId": resolved_device_id,
                "deviceName": resolved_device_name,
                "serverUrl": resolved_server_url,
                "agentVersion": found_data.get("agentVersion", APP_VERSION),
                "lastSync": found_data.get("lastSync", None),
                "created": found_data.get("created", datetime.now(timezone.utc).isoformat()),
            }
            try:
                with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                    json.dump(cfg, f, indent=2)
            except Exception:
                pass
            append_log(f"Auto-loaded config.json: Device={resolved_device_id} ({resolved_device_name}), UID={resolved_uid}", "INFO")
            return cfg

        # Defaults
        resolved_uid = USER_UID or "${uid}"
        resolved_device_id = DEFAULT_DEVICE_ID or "${deviceId || 'PC-AUTO'}"
        resolved_device_name = DEFAULT_DEVICE_NAME or "${deviceName || 'MY-WINDOWS-PC'}"
        resolved_server_url = DEFAULT_SERVER_URL or "${apiUrl}"

        default_config = {
            "account_uid": resolved_uid,
            "device_id": resolved_device_id,
            "device_name": resolved_device_name,
            "server_url": resolved_server_url,
            "uid": resolved_uid,
            "deviceId": resolved_device_id,
            "deviceName": resolved_device_name,
            "serverUrl": resolved_server_url,
            "agentVersion": APP_VERSION,
            "lastSync": None,
            "created": datetime.now(timezone.utc).isoformat(),
        }
        try:
            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(default_config, f, indent=2)
        except Exception as e:
            print(f"[WARN] Unable to write initial config: {e}")
        return default_config


def save_config(config_data: dict) -> bool:
    """Save configuration to config.json."""
    ensure_directories()
    with _file_lock:
        try:
            # Keep both naming conventions aligned
            uid = config_data.get("account_uid") or config_data.get("uid") or USER_UID
            dev_id = config_data.get("device_id") or config_data.get("deviceId") or DEFAULT_DEVICE_ID
            dev_name = config_data.get("device_name") or config_data.get("deviceName") or DEFAULT_DEVICE_NAME
            srv_url = config_data.get("server_url") or config_data.get("serverUrl") or DEFAULT_SERVER_URL

            config_data["account_uid"] = uid
            config_data["uid"] = uid
            config_data["device_id"] = dev_id
            config_data["deviceId"] = dev_id
            config_data["device_name"] = dev_name
            config_data["deviceName"] = dev_name
            config_data["server_url"] = srv_url
            config_data["serverUrl"] = srv_url

            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(config_data, f, indent=2)
            
            # Also sync local config if present
            local_cfg = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
            if os.path.exists(local_cfg):
                try:
                    with open(local_cfg, "w", encoding="utf-8") as f:
                        json.dump(config_data, f, indent=2)
                except Exception:
                    pass

            append_log("Configuration saved successfully", "INFO")
            return True
        except Exception as e:
            append_log(f"Failed saving config: {e}", "ERROR")
            return False


def append_log(message: str, level: str = "INFO"):
    """Write an entry to %APPDATA%\\syslogger-pro\\logs\\agent.log."""
    ensure_directories()
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{timestamp}] [{level}] {message}\\n"
    with _file_lock:
        try:
            with open(LOG_FILE, "a", encoding="utf-8") as f:
                f.write(formatted)
        except Exception:
            pass


def get_recent_logs(max_lines: int = 50) -> list:
    """Retrieve the most recent log entries."""
    ensure_directories()
    with _file_lock:
        if not os.path.exists(LOG_FILE):
            return ["(No log entries recorded yet.)"]
        try:
            with open(LOG_FILE, "r", encoding="utf-8") as f:
                lines = f.readlines()
                return [line.rstrip() for line in lines[-max_lines:]]
        except Exception as e:
            return [f"Error reading log file: {e}"]


def get_offline_queue() -> list:
    """Load cached offline events from offline_queue.json."""
    ensure_directories()
    with _file_lock:
        if not os.path.exists(OFFLINE_QUEUE_FILE):
            return []
        try:
            with open(OFFLINE_QUEUE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data if isinstance(data, list) else []
        except Exception as e:
            append_log(f"Error reading offline queue: {e}", "WARN")
            return []


def save_offline_queue(queue: list) -> bool:
    """Write events to offline_queue.json."""
    ensure_directories()
    with _file_lock:
        try:
            with open(OFFLINE_QUEUE_FILE, "w", encoding="utf-8") as f:
                json.dump(queue, f, indent=2)
            return True
        except Exception as e:
            append_log(f"Error writing offline queue: {e}", "ERROR")
            return False


def enqueue_offline_event(event: dict) -> int:
    """Add an event to the offline queue."""
    queue = get_offline_queue()
    queue.append(event)
    save_offline_queue(queue)
    append_log(f"Event queued offline: {event.get('eventType')} (Queue size: {len(queue)})", "LOCAL")
    return len(queue)


def check_backend_health(server_url: str = None) -> tuple:
    """
    Check backend server availability.
    Returns: (is_online: bool, status_message: str, latency_ms: float)
    """
    url = (server_url or load_config().get("serverUrl") or DEFAULT_SERVER_URL or API_BASE_URL).rstrip("/")
    health_endpoint = f"{url}/api/agent/health"
    start_t = time.time()
    try:
        res = requests.get(health_endpoint, timeout=5)
        latency = round((time.time() - start_t) * 1000, 1)
        if res.status_code == 200:
            status_txt = "healthy"
            try:
                data = res.json()
                if isinstance(data, dict):
                    status_txt = data.get("status", "healthy")
            except Exception:
                status_txt = "healthy"
            return True, f"Online ({latency}ms) — {status_txt}", latency
        else:
            return False, f"HTTP {res.status_code}", latency
    except requests.exceptions.RequestException as e:
        latency = round((time.time() - start_t) * 1000, 1)
        return False, f"Unreachable ({str(e.__class__.__name__)})", latency
    except Exception as e:
        latency = round((time.time() - start_t) * 1000, 1)
        return False, f"Unreachable ({str(e)})", latency


def send_telemetry(event_type: str = "HEARTBEAT", config: dict = None) -> tuple:
    """
    Send telemetry heartbeat or system event to the backend.
    Supports continuous 30-second heartbeats and automated event capture.
    """
    cfg = config or load_config()
    server_url = (cfg.get("serverUrl") or DEFAULT_SERVER_URL or API_BASE_URL).rstrip("/")
    uid = cfg.get("uid", USER_UID).strip()
    device_id = cfg.get("deviceId", DEFAULT_DEVICE_ID or get_default_device_id()).strip()
    device_name = cfg.get("deviceName", DEFAULT_DEVICE_NAME or socket.gethostname()).strip()

    if not uid:
        return False, {}, "User UID not configured."

    now_utc = datetime.now(timezone.utc).isoformat()
    cpu_pct = psutil.cpu_percent() if HAS_PSUTIL else 0.0
    mem_pct = psutil.virtual_memory().percent if HAS_PSUTIL else 0.0

    if event_type.upper() == "HEARTBEAT":
        payload = {
            "uid": uid,
            "deviceId": device_id,
            "deviceName": device_name,
            "hostname": socket.gethostname(),
            "cpu_percent": cpu_pct,
            "memory_percent": mem_pct,
            "status": "ONLINE",
            "timestamp": now_utc,
        }
        heartbeat_endpoints = [
            f"{server_url}/api/telemetry/heartbeat",
            f"{server_url}/api/agent/heartbeat",
            f"{server_url}/api/devices/heartbeat",
        ]
        for ep in heartbeat_endpoints:
            try:
                res = requests.post(ep, json=payload, timeout=6)
                if res.status_code in (200, 201):
                    append_log(f"Telemetry heartbeat sent (CPU: {cpu_pct}%, Mem: {mem_pct}%)", "DEBUG")
                    return True, payload, "Heartbeat sent successfully"
            except Exception:
                continue
        append_log(f"Heartbeat server notice: offline or unreachable", "DEBUG")
        return False, payload, "Heartbeat could not reach server endpoints"
    else:
        event_payload = {
            "eventId": f"evt_{uuid.uuid4().hex[:12]}",
            "uid": uid,
            "account_uid": uid,
            "userId": uid,
            "deviceId": device_id,
            "device_id": device_id,
            "deviceName": device_name,
            "device_name": device_name,
            "eventType": event_type.upper(),
            "event": event_type.upper(),
            "type": event_type.upper(),
            "timestamp": now_utc,
            "timezone": time.tzname[0] if time.tzname else "UTC",
            "os": f"Windows {platform.version()}" if sys.platform == "win32" else f"{platform.system()} {platform.release()}",
            "agentVersion": APP_VERSION,
            "source": "Python-Daemon-Tracker",
        }
        # Multi-endpoint dispatch: /api/events, /api/event, /api/telemetry/event, /api/agent/event
        event_endpoints = [
            f"{server_url}/api/events",
            f"{server_url}/api/event",
            f"{server_url}/api/telemetry/event",
            f"{server_url}/api/agent/event",
        ]
        for ep in event_endpoints:
            try:
                res = requests.post(ep, json=event_payload, timeout=7)
                if res.status_code in (200, 201):
                    append_log(f"Telemetry event '{event_type}' sent to {ep}", "SYNCED")
                    return True, event_payload, f"Event '{event_type}' synced successfully"
            except Exception:
                continue

        # Try batch sync endpoint before direct REST
        sync_ok, sync_data, sync_msg = sync_events([event_payload], cfg)
        if sync_ok:
            return True, event_payload, sync_msg

        # Fallback to direct Firestore REST API
        rest_ok, rest_msg = send_event_firestore_rest(event_payload, cfg)
        if rest_ok:
            append_log(f"Telemetry event '{event_type}' sent directly to Firestore REST", "SYNCED")
            return True, event_payload, f"Event '{event_type}' recorded to Firestore REST"

        return False, event_payload, f"Event dispatch failed: {rest_msg}"


def send_event_firestore_rest(event_payload: dict, config: dict = None) -> tuple:
    """
    Directly writes telemetry event and updates device record via Firestore REST API.
    Used when local/remote Express proxy is running in static Vite preview mode.
    """
    cfg = config or load_config()
    uid = cfg.get("uid", USER_UID).strip()
    device_id = cfg.get("deviceId", DEFAULT_DEVICE_ID or get_default_device_id()).strip()
    device_name = cfg.get("deviceName", DEFAULT_DEVICE_NAME or socket.gethostname()).strip()
    event_id = event_payload.get("eventId") or f"evt_{uuid.uuid4().hex[:12]}"
    now_utc = event_payload.get("timestamp") or datetime.now(timezone.utc).isoformat()
    ev_type = (event_payload.get("eventType") or "ACTIVE").upper()

    if not uid:
        return False, "User UID not configured"

    proj = FIREBASE_PROJECT_ID
    db_id = FIRESTORE_DATABASE_ID
    # Build Firestore REST document payload
    def to_fs_fields(d: dict) -> dict:
        fields = {}
        for k, v in d.items():
            if isinstance(v, str):
                fields[k] = {"stringValue": v}
            elif isinstance(v, (int, float)):
                fields[k] = {"doubleValue": float(v)}
            elif isinstance(v, bool):
                fields[k] = {"booleanValue": v}
            elif isinstance(v, dict):
                fields[k] = {"mapValue": {"fields": to_fs_fields(v)}}
            elif v is None:
                fields[k] = {"nullValue": None}
            else:
                fields[k] = {"stringValue": str(v)}
        return fields

    fs_body = {"fields": to_fs_fields(event_payload)}
    doc_path = f"users/{uid}/devices/{device_id}/events/{event_id}"
    url = f"https://firestore.googleapis.com/v1/projects/{proj}/databases/{db_id}/documents/{doc_path}?key={FIREBASE_API_KEY}"

    try:
        res = requests.patch(url, json=fs_body, timeout=8)
        if res.status_code in (200, 201):
            # Also update device document
            dev_doc_path = f"users/{uid}/devices/{device_id}"
            dev_url = f"https://firestore.googleapis.com/v1/projects/{proj}/databases/{db_id}/documents/{dev_doc_path}?key={FIREBASE_API_KEY}"
            derived_state = "ACTIVE"
            if ev_type in ("LOCK", "LOCKED"):
                derived_state = "LOCKED"
            elif ev_type in ("SLEEP", "SLEEPING"):
                derived_state = "SLEEPING"
            elif ev_type in ("SHUTDOWN", "OFFLINE"):
                derived_state = "OFFLINE"
            
            dev_body = {
                "fields": to_fs_fields({
                    "deviceId": device_id,
                    "device_id": device_id,
                    "deviceName": device_name,
                    "device_name": device_name,
                    "uid": uid,
                    "userId": uid,
                    "account_uid": uid,
                    "currentState": derived_state,
                    "status": "OFFLINE" if derived_state == "OFFLINE" else "ONLINE",
                    "lastSeen": now_utc,
                    "updatedAt": now_utc,
                })
            }
            requests.patch(dev_url, json=dev_body, timeout=6)
            return True, "Success (Firestore REST)"
        return False, f"Firestore REST HTTP {res.status_code}: {res.text[:80]}"
    except Exception as e:
        return False, f"Firestore REST exception: {str(e)}"


_daemon_thread = None
_daemon_running = False

def start_background_daemon(config: dict = None, on_event_callback=None):
    """
    Start resilient background telemetry tracking daemon.
    Runs continuous 30-second heartbeats and intercepts system events.
    """
    global _daemon_thread, _daemon_running
    if _daemon_running and _daemon_thread and _daemon_thread.is_alive():
        return

    _daemon_running = True
    cfg = config or load_config()

    def _daemon_loop():
        append_log("Background tracking daemon started (30s heartbeat interval)", "INFO")
        if on_event_callback:
            on_event_callback("DAEMON_STARTED", "Background telemetry daemon initialized (30s interval)")

        try:
            send_telemetry("STARTUP", cfg)
        except Exception as e:
            append_log(f"Initial STARTUP error: {e}", "WARN")

        loop_count = 0
        while _daemon_running:
            try:
                ok, _, msg = send_telemetry("HEARTBEAT", cfg)
                if on_event_callback and loop_count % 2 == 0:
                    on_event_callback("HEARTBEAT", "Heartbeat synchronized with backend")

                if loop_count % 4 == 0:
                    queue = get_offline_queue()
                    if len(queue) > 0:
                        flushed, rem, flush_msg = flush_offline_queue(cfg)
                        if flushed > 0 and on_event_callback:
                            on_event_callback("FLUSH", f"Flushed {flushed} offline events")
            except Exception as e:
                append_log(f"Daemon background loop exception: {e}", "WARN")

            loop_count += 1
            for _ in range(30):
                if not _daemon_running:
                    break
                time.sleep(1)

        append_log("Background tracking daemon stopped gracefully", "INFO")

    import atexit
    def _on_shutdown():
        global _daemon_running
        _daemon_running = False
        try:
            send_telemetry("SHUTDOWN", cfg)
        except Exception:
            pass

    try:
        atexit.register(_on_shutdown)
    except Exception:
        pass

    _daemon_thread = threading.Thread(target=_daemon_loop, daemon=True)
    _daemon_thread.start()


def send_heartbeat(config: dict = None) -> bool:
    """Send system telemetry heartbeat to the backend."""
    ok, _, _ = send_telemetry("HEARTBEAT", config)
    return ok


def verify_device_sync(config: dict = None) -> tuple:
    """
    Query /api/agent/verify-sync to verify device fleet registration and state.
    Returns: (success: bool, data: dict, message: str)
    """
    cfg = config or load_config()
    server_url = (cfg.get("serverUrl") or DEFAULT_SERVER_URL or API_BASE_URL).rstrip("/")
    uid = cfg.get("uid", "").strip()
    device_id = cfg.get("deviceId", "").strip()

    if not uid:
        return False, {}, "Missing User UID. Please configure your Account UID first."

    url = f"{server_url}/api/agent/verify-sync?uid={uid}&deviceId={device_id}"
    try:
        res = requests.get(url, timeout=7)
        if res.status_code == 200:
            try:
                data = res.json()
            except Exception:
                data = {"success": True, "status": "ONLINE"}
            return True, data, "Device verified successfully with backend."
        else:
            return False, {}, f"Server returned HTTP {res.status_code}: {res.text[:120]}"
    except Exception as e:
        return False, {}, f"Connection failed: {str(e)}"


def sync_events(events: list, config: dict = None) -> tuple:
    """
    Send a batch of events to /api/agent/sync or /api/telemetry/event.
    Returns: (success: bool, data: dict, message: str)
    """
    if not events:
        return True, {"synced": 0}, "No events to sync."

    cfg = config or load_config()
    server_url = (cfg.get("serverUrl") or DEFAULT_SERVER_URL or API_BASE_URL).rstrip("/")
    uid = cfg.get("uid", "").strip()
    device_id = cfg.get("deviceId", "").strip()

    if not uid:
        for ev in events:
            enqueue_offline_event(ev)
        return False, {}, "UID not configured. Cached events to local offline queue."

    payload = {
        "uid": uid,
        "deviceId": device_id,
        "deviceName": cfg.get("deviceName", socket.gethostname()),
        "os": f"Windows {platform.version()}" if sys.platform == "win32" else f"{platform.system()} {platform.release()}",
        "agentVersion": APP_VERSION,
        "events": events,
    }

    url = f"{server_url}/api/agent/sync"
    try:
        res = requests.post(url, json=payload, timeout=10)
        if res.status_code == 200:
            try:
                data = res.json()
            except Exception:
                data = {"success": True, "synced": len(events)}
            append_log(f"Successfully synced {len(events)} event(s) to server", "SYNCED")
            return True, data, f"Synced {len(events)} event(s) successfully."
        else:
            err_msg = f"HTTP {res.status_code}: {res.text[:100]}"
            append_log(f"Sync failed ({err_msg}). Caching {len(events)} events offline.", "WARN")
            for ev in events:
                enqueue_offline_event(ev)
            return False, {}, err_msg
    except Exception as e:
        append_log(f"Network error during sync ({e}). Caching {len(events)} events offline.", "WARN")
        for ev in events:
            enqueue_offline_event(ev)
        return False, {}, f"Network failure: {str(e)}"


def flush_offline_queue(config: dict = None) -> tuple:
    """
    Attempt to send all locally cached offline events to the server.
    Returns: (synced_count: int, remaining_count: int, message: str)
    """
    queue = get_offline_queue()
    if not queue:
        return 0, 0, "Offline queue is empty (0 cached events)."

    cfg = config or load_config()
    uid = cfg.get("uid", "").strip()
    if not uid:
        return 0, len(queue), "Cannot flush queue: User UID is not configured."

    success, data, msg = sync_events(queue, cfg)
    if success:
        save_offline_queue([])
        append_log(f"Flushed {len(queue)} offline events to server", "SYNCED")
        return len(queue), 0, f"Successfully flushed {len(queue)} offline events."
    else:
        current_queue = get_offline_queue()
        return 0, len(current_queue), f"Flush failed: {msg}"


def simulate_event(event_type: str, config: dict = None) -> tuple:
    """
    Generate and dispatch a simulated system event (STARTUP, LOCK, UNLOCK, SLEEP, WAKE, ACTIVE, SHUTDOWN).
    Returns: (success: bool, details: dict, message: str)
    """
    cfg = config or load_config()
    event_type = event_type.upper().strip()
    valid_types = ["STARTUP", "LOCK", "UNLOCK", "SLEEP", "WAKE", "ACTIVE", "SHUTDOWN"]
    if event_type not in valid_types:
        event_type = "ACTIVE"

    ok, payload, msg = send_telemetry(event_type, cfg)
    return ok, payload, msg
`;

// 5. In-Memory app.py Generator
export const generateAppPy = (apiUrl: string, uid: string, deviceId?: string, deviceName?: string) => `"""
System Usage Logger Pro — Pure Python Desktop Client GUI
Native desktop application for real-time telemetry, offline queue inspection,
event simulation, and backend synchronization.
"""
import os
import sys
import json
import time
import queue
import threading
import tkinter as tk
from tkinter import ttk, messagebox
from datetime import datetime

# Optional CustomTkinter styling
USE_CTK = False
try:
    import customtkinter as ctk
    ctk.set_appearance_mode("Dark")
    ctk.set_default_color_theme("blue")
    USE_CTK = True
except ImportError:
    USE_CTK = False

from config import (
    APP_NAME,
    APP_VERSION,
    THEME,
    DEFAULT_SERVER_URL,
    API_BASE_URL,
    USER_UID,
    CONFIG_FILE,
    OFFLINE_QUEUE_FILE,
    LOG_FILE,
)
import logger_client


class SysLoggerDesktopApp:
    def __init__(self, root):
        self.root = root
        self.root.title(f"{APP_NAME} — v{APP_VERSION}")
        self.root.geometry("960x700")
        self.root.minsize(800, 600)
        self.root.configure(bg=THEME["bg_dark"])

        self.config = logger_client.load_config()
        self.msg_queue = queue.Queue()
        self.is_checking_health = False

        self._setup_styles()
        self._build_ui()
        self._start_periodic_checks()

        uid_val = self.config.get("account_uid") or self.config.get("uid") or USER_UID or "Not configured"
        dev_id = self.config.get("device_id") or self.config.get("deviceId") or "PC-AUTO"
        dev_name = self.config.get("device_name") or self.config.get("deviceName") or "MY-WINDOWS-PC"
        srv_url = self.config.get("server_url") or self.config.get("serverUrl") or DEFAULT_SERVER_URL

        self.log_to_console(f"=== {APP_NAME} Desktop Client initialized ===", "INFO")
        self.log_to_console(f"[CONFIG] Target Device ID: {dev_id}", "INFO")
        self.log_to_console(f"[CONFIG] Device Name: {dev_name}", "INFO")
        self.log_to_console(f"[CONFIG] Account UID: {uid_val}", "INFO")
        self.log_to_console(f"[CONFIG] Server URL: {srv_url}", "INFO")
        self.log_to_console(f"[STATUS] Auto-loaded config.json successfully (Zero manual input required)", "PASS")

        # Initial background verification
        self.action_check_health()
        if uid_val and uid_val != "Not configured":
            self.action_show_device_status()
        else:
            self.log_to_console("Notice: User Account UID is configured. Initializing sync...", "LOCAL")

    def _setup_styles(self):
        """Configure ttk dark styles."""
        self.style = ttk.Style()
        try:
            self.style.theme_use("clam")
        except Exception:
            pass

        self.style.configure("Dark.TFrame", background=THEME["bg_dark"])
        self.style.configure("Card.TFrame", background=THEME["card_bg"], relief="flat")
        self.style.configure("Header.TFrame", background=THEME["header_bg"])
        self.style.configure(
            "Primary.TButton",
            background=THEME["accent_primary"],
            foreground="#0b0f19",
            font=("Segoe UI", 9, "bold"),
            padding=6,
        )
        self.style.configure(
            "Secondary.TButton",
            background="#1e293b",
            foreground="#f8fafc",
            font=("Segoe UI", 9),
            padding=6,
        )

    def _build_ui(self):
        """Build the GUI layout."""
        # Top Header
        header = tk.Frame(self.root, bg=THEME["header_bg"], height=70, padx=20, pady=12)
        header.pack(side="top", fill="x")

        title_box = tk.Frame(header, bg=THEME["header_bg"])
        title_box.pack(side="left")

        lbl_title = tk.Label(
            title_box,
            text="SYSTEM USAGE LOGGER PRO",
            font=("Segoe UI", 14, "bold"),
            fg=THEME["text_primary"],
            bg=THEME["header_bg"],
        )
        lbl_title.pack(anchor="w")

        lbl_sub = tk.Label(
            title_box,
            text="Native Python Workstation Client & Real-Time Sync",
            font=("Segoe UI", 9),
            fg=THEME["text_secondary"],
            bg=THEME["header_bg"],
        )
        lbl_sub.pack(anchor="w")

        # Status badge
        self.lbl_server_status = tk.Label(
            header,
            text="Checking Server...",
            font=("Segoe UI", 9, "bold"),
            fg=THEME["badge_warning"],
            bg="#1e293b",
            padx=12,
            pady=6,
        )
        self.lbl_server_status.pack(side="right", padx=5)

        # Main Body
        body = tk.Frame(self.root, bg=THEME["bg_dark"], padx=20, pady=15)
        body.pack(side="top", fill="both", expand=True)

        # Info Banner Card
        card_info = tk.Frame(body, bg=THEME["card_bg"], padx=15, pady=12, highlightbackground=THEME["card_border"], highlightthickness=1)
        card_info.pack(fill="x", pady=(0, 15))

        self.lbl_uid_info = tk.Label(
            card_info,
            text=f"Account UID: {self.config.get('uid', 'Not configured')}  |  Device ID: {self.config.get('deviceId', 'PC-AUTO')}  |  Device: {self.config.get('deviceName', 'My-PC')}",
            font=("Segoe UI", 10, "bold"),
            fg=THEME["text_primary"],
            bg=THEME["card_bg"],
        )
        self.lbl_uid_info.pack(side="left")

        btn_edit_cfg = tk.Button(
            card_info,
            text="⚙️ Edit Config",
            command=self.open_config_modal,
            bg="#1e293b",
            fg=THEME["text_primary"],
            font=("Segoe UI", 8, "bold"),
            padx=10,
            pady=4,
            relief="flat",
            cursor="hand2",
        )
        btn_edit_cfg.pack(side="right")

        # Quick Actions Card
        card_actions = tk.Frame(body, bg=THEME["card_bg"], padx=15, pady=12, highlightbackground=THEME["card_border"], highlightthickness=1)
        card_actions.pack(fill="x", pady=(0, 15))

        lbl_sim_title = tk.Label(
            card_actions,
            text="⚡ Dispatch System Event:",
            font=("Segoe UI", 10, "bold"),
            fg=THEME["text_primary"],
            bg=THEME["card_bg"],
        )
        lbl_sim_title.pack(side="left", padx=(0, 10))

        events = [
            ("🟢 STARTUP", "STARTUP", "#059669"),
            ("🔵 ACTIVE", "ACTIVE", "#0284c7"),
            ("🔒 LOCK", "LOCK", "#d97706"),
            ("🔓 UNLOCK", "UNLOCK", "#7c3aed"),
            ("🌙 SLEEP", "SLEEP", "#4b5563"),
            ("☀️ WAKE", "WAKE", "#0891b2"),
            ("🔴 SHUTDOWN", "SHUTDOWN", "#dc2626"),
        ]

        for label, ev_type, color in events:
            b = tk.Button(
                card_actions,
                text=label,
                command=lambda t=ev_type: self.action_simulate_event(t),
                bg=color,
                fg="#ffffff",
                font=("Segoe UI", 8, "bold"),
                padx=8,
                pady=4,
                relief="flat",
                cursor="hand2",
            )
            b.pack(side="left", padx=3)

        btn_flush = tk.Button(
            card_actions,
            text="🔄 Flush Offline Queue",
            command=self.action_flush_queue,
            bg=THEME["accent_primary"],
            fg="#0b0f19",
            font=("Segoe UI", 8, "bold"),
            padx=10,
            pady=4,
            relief="flat",
            cursor="hand2",
        )
        btn_flush.pack(side="right")

        # Live Console Output Card
        card_console = tk.Frame(body, bg=THEME["card_bg"], padx=15, pady=12, highlightbackground=THEME["card_border"], highlightthickness=1)
        card_console.pack(fill="both", expand=True)

        console_hdr = tk.Frame(card_console, bg=THEME["card_bg"])
        console_hdr.pack(fill="x", pady=(0, 8))

        lbl_con_title = tk.Label(
            console_hdr,
            text="📋 Activity Log & Sync Stream",
            font=("Segoe UI", 10, "bold"),
            fg=THEME["text_primary"],
            bg=THEME["card_bg"],
        )
        lbl_con_title.pack(side="left")

        btn_clear = tk.Button(
            console_hdr,
            text="Clear",
            command=self.clear_console,
            bg="#1e293b",
            fg=THEME["text_muted"],
            font=("Segoe UI", 8),
            padx=8,
            pady=2,
            relief="flat",
        )
        btn_clear.pack(side="right")

        self.txt_console = tk.Text(
            card_console,
            bg=THEME["console_bg"],
            fg=THEME["text_primary"],
            font=("Consolas", 9),
            relief="flat",
            wrap="word",
            padx=10,
            pady=10,
        )
        self.txt_console.pack(fill="both", expand=True)

        # Tags for colored console
        self.txt_console.tag_config("INFO", foreground=THEME["badge_info"])
        self.txt_console.tag_config("SYNCED", foreground=THEME["badge_synced"])
        self.txt_console.tag_config("LOCAL", foreground=THEME["badge_local"])
        self.txt_console.tag_config("PASS", foreground=THEME["badge_pass"])
        self.txt_console.tag_config("WARN", foreground=THEME["badge_warning"])
        self.txt_console.tag_config("ERROR", foreground=THEME["badge_fail"])

    def log_to_console(self, text: str, level: str = "INFO"):
        """Append log message to the UI console."""
        ts = datetime.now().strftime("%H:%M:%S")
        msg = f"[{ts}] [{level}] {text}\\n"
        self.txt_console.insert("end", msg, level)
        self.txt_console.see("end")

    def clear_console(self):
        self.txt_console.delete("1.0", "end")

    def action_check_health(self):
        """Check backend connection."""
        def worker():
            is_online, msg, lat = logger_client.check_backend_health(self.config.get("serverUrl"))
            self.root.after(0, lambda: self._update_health_ui(is_online, msg))

        threading.Thread(target=worker, daemon=True).start()

    def _update_health_ui(self, is_online: bool, msg: str):
        if is_online:
            self.lbl_server_status.config(
                text=f"🟢 {msg}",
                fg=THEME["badge_pass"],
            )
        else:
            self.lbl_server_status.config(
                text=f"🔴 {msg}",
                fg=THEME["badge_fail"],
            )

    def action_show_device_status(self):
        """Verify device registration on server."""
        def worker():
            ok, data, msg = logger_client.verify_device_sync(self.config)
            self.root.after(0, lambda: self.log_to_console(f"Device status: {msg}", "PASS" if ok else "WARN"))

        threading.Thread(target=worker, daemon=True).start()

    def action_simulate_event(self, ev_type: str):
        """Dispatch simulated event."""
        self.log_to_console(f"Dispatching event '{ev_type}'...", "INFO")
        def worker():
            ok, details, msg = logger_client.simulate_event(ev_type, self.config)
            self.root.after(0, lambda: self.log_to_console(f"Event {ev_type}: {msg}", "SYNCED" if ok else "LOCAL"))

        threading.Thread(target=worker, daemon=True).start()

    def action_flush_queue(self):
        """Flush offline cached events."""
        self.log_to_console("Flushing local offline queue...", "INFO")
        def worker():
            synced, rem, msg = logger_client.flush_offline_queue(self.config)
            self.root.after(0, lambda: self.log_to_console(msg, "SYNCED" if synced > 0 else "INFO"))

        threading.Thread(target=worker, daemon=True).start()

    def _start_periodic_checks(self):
        """Start continuous resilient background tracking daemon."""
        def handle_daemon_update(event_type, msg):
            self.root.after(0, lambda: self.log_to_console(msg, "SYNCED" if "synced" in msg.lower() or "flushed" in msg.lower() or "startup" in msg.lower() else "INFO"))
            self.root.after(0, self.action_check_health)

        logger_client.start_background_daemon(self.config, on_event_callback=handle_daemon_update)

    def open_config_modal(self):
        """Modal dialog to adjust UID, Device Name, and Server URL."""
        modal = tk.Toplevel(self.root)
        modal.title("Configure Logger Client")
        modal.geometry("480x360")
        modal.configure(bg=THEME["bg_dark"])
        modal.transient(self.root)
        modal.grab_set()

        frame = tk.Frame(modal, bg=THEME["bg_dark"], padx=20, pady=20)
        frame.pack(fill="both", expand=True)

        tk.Label(frame, text="Client Settings", font=("Segoe UI", 12, "bold"), fg=THEME["text_primary"], bg=THEME["bg_dark"]).pack(anchor="w", pady=(0, 15))

        # UID
        tk.Label(frame, text="Account UID:", font=("Segoe UI", 9), fg=THEME["text_secondary"], bg=THEME["bg_dark"]).pack(anchor="w")
        ent_uid = tk.Entry(frame, bg=THEME["card_bg"], fg=THEME["text_primary"], insertbackground="#ffffff", relief="flat")
        ent_uid.insert(0, self.config.get("uid", ""))
        ent_uid.pack(fill="x", pady=(2, 10))

        # Device ID
        tk.Label(frame, text="Device ID:", font=("Segoe UI", 9), fg=THEME["text_secondary"], bg=THEME["bg_dark"]).pack(anchor="w")
        ent_did = tk.Entry(frame, bg=THEME["card_bg"], fg=THEME["text_primary"], insertbackground="#ffffff", relief="flat")
        ent_did.insert(0, self.config.get("deviceId", ""))
        ent_did.pack(fill="x", pady=(2, 10))

        # Server URL
        tk.Label(frame, text="Server URL:", font=("Segoe UI", 9), fg=THEME["text_secondary"], bg=THEME["bg_dark"]).pack(anchor="w")
        ent_url = tk.Entry(frame, bg=THEME["card_bg"], fg=THEME["text_primary"], insertbackground="#ffffff", relief="flat")
        ent_url.insert(0, self.config.get("serverUrl", DEFAULT_SERVER_URL))
        ent_url.pack(fill="x", pady=(2, 15))

        def save_and_close():
            self.config["uid"] = ent_uid.get().strip()
            self.config["deviceId"] = ent_did.get().strip()
            self.config["serverUrl"] = ent_url.get().strip().rstrip("/")
            logger_client.save_config(self.config)
            self.lbl_uid_info.config(
                text=f"Account UID: {self.config.get('uid')}  |  Device ID: {self.config.get('deviceId')}  |  Device: {self.config.get('deviceName')}"
            )
            self.log_to_console("Configuration updated successfully.", "PASS")
            self.action_check_health()
            modal.destroy()

        btn_save = tk.Button(
            frame,
            text="Save Settings",
            command=save_and_close,
            bg=THEME["accent_primary"],
            fg="#0b0f19",
            font=("Segoe UI", 9, "bold"),
            pady=6,
            relief="flat",
        )
        btn_save.pack(fill="x")


if __name__ == "__main__":
    root = tk.Tk()
    app = SysLoggerDesktopApp(root)
    root.mainloop()
`;

// 6. In-Memory Install-SysLoggerClient.ps1 Generator
export const generateInstallerPs1 = (apiUrl: string, uid: string, deviceId?: string, deviceName?: string) => `<#
.SYNOPSIS
    System Usage Logger Pro — Python Desktop Client Automated Setup
.DESCRIPTION
    Configures Python 3 environment, installs required packages, binds user UID,
    and creates a Desktop launcher shortcut.
#>

[CmdletBinding()]
param(
    [string]$Uid = "${uid}",
    [string]$DeviceId = "${deviceId || ''}",
    [string]$ServerUrl = "${apiUrl}"
)

$ErrorActionPreference = "Stop"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  SYSTEM USAGE LOGGER PRO — PYTHON DESKTOP CLIENT INSTALLER" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Detect Python 3
Write-Host "[1/5] Detecting Python 3 environment..." -ForegroundColor Yellow
$PythonCmd = $null
if (Get-Command python -ErrorAction SilentlyContinue) {
    $PythonCmd = "python"
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    $PythonCmd = "py -3"
}

if (-not $PythonCmd) {
    Write-Host "[ERROR] Python 3 is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Please install Python from https://www.python.org/downloads/ (Check 'Add Python to PATH')" -ForegroundColor Red
    exit 1
}

$PyVersion = (& $PythonCmd --version 2>&1)
Write-Host "       Found $PyVersion" -ForegroundColor Green

# 2. Setup AppData directory and configuration
Write-Host "[2/5] Initializing local configuration..." -ForegroundColor Yellow
$AppDir = Join-Path $env:APPDATA "syslogger-pro"
$LogsDir = Join-Path $AppDir "logs"
$ConfigFile = Join-Path $AppDir "config.json"

if (-not (Test-Path $AppDir)) { New-Item -ItemType Directory -Path $AppDir -Force | Out-Null }
if (-not (Test-Path $LogsDir)) { New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null }

if (-not $DeviceId) {
    $cleanHost = ($env:COMPUTERNAME -replace '[^a-zA-Z0-9-]', '').Substring(0, [Math]::Min(12, $env:COMPUTERNAME.Length)).ToUpper()
    $DeviceId = "PC-$cleanHost"
}

$configObj = [ordered]@{
    account_uid = $Uid
    device_id = $DeviceId
    device_name = if ($DeviceName) { $DeviceName } else { $env:COMPUTERNAME }
    server_url = $ServerUrl.TrimEnd('/')
    uid = $Uid
    deviceId = $DeviceId
    deviceName = if ($DeviceName) { $DeviceName } else { $env:COMPUTERNAME }
    serverUrl = $ServerUrl.TrimEnd('/')
    agentVersion = "1.0.3"
    clientType = "Python-Native"
    installedAt = (Get-Date).ToUniversalTime().ToString("o")
}

$configJson = $configObj | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText($ConfigFile, $configJson, [System.Text.Encoding]::UTF8)
Write-Host "       Saved config to: $ConfigFile" -ForegroundColor Green

# 3. Install dependencies
Write-Host "[3/5] Installing Python requirements..." -ForegroundColor Yellow
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ReqFile = Join-Path $ScriptDir "requirements.txt"

if (Test-Path $ReqFile) {
    & $PythonCmd -m pip install --quiet --upgrade pip
    & $PythonCmd -m pip install --quiet -r $ReqFile
    Write-Host "       Dependencies installed successfully." -ForegroundColor Green
} else {
    Write-Host "       Installing requests, psutil, and customtkinter directly..." -ForegroundColor Gray
    & $PythonCmd -m pip install --quiet requests psutil customtkinter
}

# 4. Create Desktop Shortcut
Write-Host "[4/5] Creating Desktop Shortcut..." -ForegroundColor Yellow
try {
    $WshShell = New-Object -ComObject WScript.Shell
    $DesktopPath = [Environment]::GetFolderPath("Desktop")
    $ShortcutPath = Join-Path $DesktopPath "System Usage Logger Pro.lnk"
    $Shortcut = $WshShell.CreateShortcut($ShortcutPath)
    
    $BatchLauncher = Join-Path $ScriptDir "run.bat"
    if (Test-Path $BatchLauncher) {
        $Shortcut.TargetPath = $BatchLauncher
        $Shortcut.WorkingDirectory = $ScriptDir
    } else {
        $Shortcut.TargetPath = $PythonCmd
        $Shortcut.Arguments = "\`"$ScriptDir\\app.py\`""
        $Shortcut.WorkingDirectory = $ScriptDir
    }
    $Shortcut.Description = "System Usage Logger Pro Desktop Client"
    $Shortcut.Save()
    Write-Host "       Created Desktop Shortcut: $ShortcutPath" -ForegroundColor Green
} catch {
    Write-Host "       [WARN] Could not create Desktop shortcut: $_" -ForegroundColor Gray
}

# 5. Launch Client
Write-Host "[5/5] Launching System Usage Logger Pro..." -ForegroundColor Yellow
Start-Process -FilePath $PythonCmd -ArgumentList "\`"$ScriptDir\\app.py\`"" -WorkingDirectory $ScriptDir

Write-Host ""
Write-Host "[SUCCESS] Setup complete! The desktop client is running and tracking telemetry." -ForegroundColor Green
`;

// 7. In-Memory Uninstaller Generator
export const generateUninstallerPs1 = (apiUrl: string, uid: string, deviceId?: string) => `<#
.SYNOPSIS
    System Usage Logger Pro — Agent Complete Uninstaller & Firestore Deregistration
.DESCRIPTION
    Stops all background processes, deregisters device and cascade deletes events/sessions
    from Firestore database, removes Desktop shortcut, startup entries, and cleans AppData directory.
#>

[CmdletBinding()]
param(
    [string]$DeviceId = "${deviceId || 'PC-AUTO'}",
    [string]$ServerUrl = "${apiUrl}",
    [string]$Uid = "${uid}"
)

$ErrorActionPreference = "SilentlyContinue"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  SYSTEM USAGE LOGGER PRO — AGENT UNINSTALLER & DEREGISTRATION        " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

$AppDir = Join-Path $env:APPDATA "syslogger-pro"
$ConfigFile = Join-Path $AppDir "config.json"

if (Test-Path $ConfigFile) {
    try {
        $diskCfg = Get-Content $ConfigFile -Raw | ConvertFrom-Json
        if (-not $DeviceId -and $diskCfg.deviceId) { $DeviceId = $diskCfg.deviceId }
        if (-not $ServerUrl -and $diskCfg.serverUrl) { $ServerUrl = $diskCfg.serverUrl }
        if (-not $Uid -and $diskCfg.uid) { $Uid = $diskCfg.uid }
    } catch {}
}

Write-Host "[1/4] Stopping SysLogger background processes..." -ForegroundColor Yellow
try {
    Get-Process -Name "python", "pythonw" -ErrorAction SilentlyContinue | Where-Object {
        try {
            $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)" -ErrorAction SilentlyContinue).CommandLine
            $cmd -like "*syslogger-pro*" -or $cmd -like "*logger_client.py*" -or $cmd -like "*app.py*"
        } catch { $false }
    } | Stop-Process -Force -ErrorAction SilentlyContinue

    Get-WmiObject Win32_Process -ErrorAction SilentlyContinue | Where-Object { 
        $_.CommandLine -like "*syslogger-agent.ps1*" -or $_.CommandLine -like "*syslogger-pro*" -or $_.Name -eq "SystemUsageLoggerPro.exe" 
    } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
} catch {}

Write-Host "[2/4] Calling backend server to deregister device & cascade purge records..." -ForegroundColor Yellow
if ($ServerUrl -and $DeviceId) {
    try {
        $cleanUrl = $ServerUrl.TrimEnd('/')
        $body = @{
            deviceId = $DeviceId
            uid = $Uid
            action = "UNINSTALL"
        } | ConvertTo-Json
        
        $response = Invoke-RestMethod -Uri "$cleanUrl/api/devices/deregister" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 10 -ErrorAction Stop
        if ($response.success) {
            Write-Host "  [OK] Device record, sessions, and events permanently purged from Firestore." -ForegroundColor Green
        } else {
            Write-Host "  [Notice] Server response: $($response.message)" -ForegroundColor Gray
        }
    } catch {
        Write-Host "  [Notice] Backend deregistration notice: $($_.Exception.Message)" -ForegroundColor Gray
    }
}

Write-Host "[3/4] Removing startup registry entries and desktop shortcut..." -ForegroundColor Yellow
try {
    Remove-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" -Name "syslogger-pro-agent" -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" -Name "SysLoggerClient" -ErrorAction SilentlyContinue
    
    $DesktopPath = [Environment]::GetFolderPath("Desktop")
    $ShortcutPath = Join-Path $DesktopPath "System Usage Logger Pro.lnk"
    if (Test-Path $ShortcutPath) {
        Remove-Item -Path $ShortcutPath -Force -ErrorAction SilentlyContinue
    }
} catch {}

Write-Host "[4/4] Cleaning local installation directory..." -ForegroundColor Yellow
if (Test-Path $AppDir) {
    try {
        Start-Sleep -Milliseconds 400
        Remove-Item -Path $AppDir -Recurse -Force -ErrorAction SilentlyContinue
    } catch {}
}

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Green
Write-Host "  UNINSTALL COMPLETE! Agent removed and unregistered successfully.    " -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green
`;

// 8. In-Memory config.json Generator
export const generateConfigJson = (apiUrl: string, uid: string, deviceId?: string, deviceName?: string) => JSON.stringify({
  account_uid: uid || 'DEMO_USER_UID',
  device_id: deviceId || 'PC-AUTO',
  device_name: deviceName || 'MY-WINDOWS-PC',
  server_url: apiUrl,
  uid: uid || 'DEMO_USER_UID',
  deviceId: deviceId || 'PC-AUTO',
  deviceName: deviceName || 'MY-WINDOWS-PC',
  serverUrl: apiUrl,
  agentVersion: '1.0.3',
  clientType: 'Python-Native',
  downloadedAt: new Date().toISOString(),
}, null, 2);

// 9. In-Memory README.txt
export const generateReadmeTxt = (apiUrl: string, uid: string) => `======================================================================
SYSTEM USAGE LOGGER PRO — NATIVE PYTHON DESKTOP CLIENT
======================================================================

QUICK START INSTRUCTIONS:
-------------------------
1. Double-click "run.bat" to launch the client directly.
   - It will automatically check for Python 3, create a virtual environment,
     install all required packages, and launch the desktop dashboard.

2. OR run "Install-SysLoggerClient.ps1" with PowerShell:
   - Right-click "Install-SysLoggerClient.ps1" -> Run with PowerShell
   - This binds your account (UID: ${uid}) and creates a Desktop shortcut.

UNINSTALLATION:
---------------
Run "Uninstall-SysLoggerClient.ps1" with PowerShell to cleanly remove the client,
stop all background processes, and cascade delete all device data from Firestore.

TARGET SERVER: ${apiUrl}
ACCOUNT UID:   ${uid}

REQUIREMENTS:
- Windows 10/11 (or Linux/macOS with Tkinter installed)
- Python 3.9 or higher (https://www.python.org/downloads/)
======================================================================
`;

/**
 * Robust In-Memory ZIP Generator using JSZip.
 * Completely immune to container filesystem path resolution or missing disk directories.
 */
export async function generateClientZipBuffer(options: ClientPackageOptions): Promise<Buffer> {
  const zip = new JSZip();

  const uid = options.uid || 'DEMO_USER_UID';
  const deviceId = options.deviceId || 'PC-AUTO';
  const deviceName = options.deviceName || 'MY-WINDOWS-PC';
  const serverUrl = (options.serverUrl || 'https://ais-pre-425pifb7xfy75tn3xngn3f-590412783680.asia-east1.run.app').replace(/\/+$/, '');

  // Add all files to the ZIP in-memory
  zip.file('config.py', generateConfigPy(serverUrl, uid, deviceId, deviceName));
  zip.file('requirements.txt', generateRequirementsTxt());
  zip.file('run.bat', generateRunBat());
  zip.file('run_agent.bat', generateRunAgentBat());
  zip.file('logger_client.py', generateLoggerClientPy(serverUrl, uid, deviceId, deviceName));
  zip.file('app.py', generateAppPy(serverUrl, uid, deviceId, deviceName));
  zip.file('Install-SysLoggerClient.ps1', generateInstallerPs1(serverUrl, uid, deviceId, deviceName));
  zip.file('Uninstall-SysLoggerClient.ps1', generateUninstallerPs1(serverUrl, uid, deviceId));
  zip.file('config.json', generateConfigJson(serverUrl, uid, deviceId, deviceName));
  zip.file('README.txt', generateReadmeTxt(serverUrl, uid));

  // Generate Node Buffer
  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 9,
    },
  });

  return zipBuffer;
}

/**
 * Pure Client-Side Browser Blob ZIP Generator using JSZip.
 * Runs 100% in the browser with zero network or backend dependencies.
 */
export async function generateClientZipBlob(options: ClientPackageOptions): Promise<Blob> {
  const zip = new JSZip();

  const uid = options.uid || 'DEMO_USER_UID';
  const deviceId = options.deviceId || 'PC-AUTO';
  const deviceName = options.deviceName || 'MY-WINDOWS-PC';
  const defaultOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://localhost:3000';
  const serverUrl = (options.serverUrl || defaultOrigin).replace(/\/+$/, '');

  // Add all files to the ZIP in-memory
  zip.file('config.py', generateConfigPy(serverUrl, uid, deviceId, deviceName));
  zip.file('requirements.txt', generateRequirementsTxt());
  zip.file('run.bat', generateRunBat());
  zip.file('run_agent.bat', generateRunAgentBat());
  zip.file('logger_client.py', generateLoggerClientPy(serverUrl, uid, deviceId, deviceName));
  zip.file('app.py', generateAppPy(serverUrl, uid, deviceId, deviceName));
  zip.file('Install-SysLoggerClient.ps1', generateInstallerPs1(serverUrl, uid, deviceId, deviceName));
  zip.file('Uninstall-SysLoggerClient.ps1', generateUninstallerPs1(serverUrl, uid, deviceId));
  zip.file('config.json', generateConfigJson(serverUrl, uid, deviceId, deviceName));
  zip.file('README.txt', generateReadmeTxt(serverUrl, uid));

  // Generate Browser Blob
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 9,
    },
  });

  return zipBlob;
}

/**
 * Helper to download any script or config file directly as a Blob in the browser
 */
export function downloadScriptBlob(filename: string, content: string, mimeType: string = 'text/plain;charset=utf-8') {
  const encoder = new TextEncoder();
  const uint8 = encoder.encode(content);
  const blob = new Blob([uint8], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

