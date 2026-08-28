"""
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

from config import (
    APP_NAME,
    APP_VERSION,
    APP_DIR,
    CONFIG_FILE,
    OFFLINE_QUEUE_FILE,
    LOGS_DIR,
    LOG_FILE,
    DEFAULT_SERVER_URL,
)

_file_lock = threading.Lock()


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
    """Load configuration from config.json or return defaults."""
    ensure_directories()
    with _file_lock:
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        # Ensure essential keys
                        if not data.get("serverUrl"):
                            data["serverUrl"] = DEFAULT_SERVER_URL
                        if not data.get("deviceId"):
                            data["deviceId"] = get_default_device_id()
                        if not data.get("deviceName"):
                            data["deviceName"] = socket.gethostname()
                        return data
            except Exception as e:
                append_log(f"Failed loading config.json: {e}", "WARN")

        # Defaults
        default_config = {
            "uid": "",
            "deviceId": get_default_device_id(),
            "deviceName": socket.gethostname(),
            "serverUrl": DEFAULT_SERVER_URL,
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
            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(config_data, f, indent=2)
            append_log("Configuration saved successfully", "INFO")
            return True
        except Exception as e:
            append_log(f"Failed saving config: {e}", "ERROR")
            return False


def append_log(message: str, level: str = "INFO"):
    """Write an entry to %APPDATA%\\syslogger-pro\\logs\\agent.log."""
    ensure_directories()
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{timestamp}] [{level}] {message}\n"
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
    url = (server_url or load_config().get("serverUrl") or DEFAULT_SERVER_URL).rstrip("/")
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
    server_url = (cfg.get("serverUrl") or DEFAULT_SERVER_URL).rstrip("/")
    uid = cfg.get("uid", "").strip()
    device_id = cfg.get("deviceId", get_default_device_id()).strip()
    device_name = cfg.get("deviceName", socket.gethostname()).strip()

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
        try:
            res = requests.post(f"{server_url}/api/telemetry/heartbeat", json=payload, timeout=6)
            if res.status_code == 200:
                append_log(f"Telemetry heartbeat sent (CPU: {cpu_pct}%, Mem: {mem_pct}%)", "DEBUG")
                return True, payload, "Heartbeat sent successfully"
            res_alt = requests.post(f"{server_url}/api/agent/heartbeat", json=payload, timeout=6)
            return res_alt.status_code == 200, payload, "Heartbeat sent via fallback"
        except Exception as e:
            append_log(f"Heartbeat notice: {e}", "DEBUG")
            return False, payload, str(e)
    else:
        event_payload = {
            "eventId": f"evt_{uuid.uuid4().hex[:12]}",
            "uid": uid,
            "deviceId": device_id,
            "deviceName": device_name,
            "eventType": event_type.upper(),
            "timestamp": now_utc,
            "timezone": time.tzname[0] if time.tzname else "UTC",
            "os": f"Windows {platform.version()}" if sys.platform == "win32" else f"{platform.system()} {platform.release()}",
            "agentVersion": APP_VERSION,
            "source": "Python-Daemon-Tracker",
        }
        try:
            res = requests.post(f"{server_url}/api/telemetry/event", json=event_payload, timeout=8)
            if res.status_code == 200:
                append_log(f"Telemetry event '{event_type}' sent to server", "SYNCED")
                return True, event_payload, f"Event '{event_type}' synced"
        except Exception:
            pass
        return sync_events([event_payload], cfg)


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
    server_url = (cfg.get("serverUrl") or DEFAULT_SERVER_URL).rstrip("/")
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


def get_onboarding_status(config: dict = None) -> tuple:
    """
    Query /api/onboarding/status for trial and account details.
    Returns: (success: bool, data: dict, message: str)
    """
    cfg = config or load_config()
    server_url = (cfg.get("serverUrl") or DEFAULT_SERVER_URL).rstrip("/")
    uid = cfg.get("uid", "").strip()

    if not uid:
        return False, {}, "Missing User UID. Please configure your Account UID."

    url = f"{server_url}/api/onboarding/status?uid={uid}"
    try:
        res = requests.get(url, timeout=7)
        if res.status_code == 200:
            try:
                data = res.json()
            except Exception:
                data = {"success": True}
            return True, data, "Retrieved onboarding & trial details."
        else:
            return False, {}, f"Server returned HTTP {res.status_code}: {res.text[:120]}"
    except Exception as e:
        return False, {}, f"Connection failed: {str(e)}"


def sync_events(events: list, config: dict = None) -> tuple:
    """
    Send a batch of events to /api/agent/sync.
    Returns: (success: bool, data: dict, message: str)
    """
    if not events:
        return True, {"synced": 0}, "No events to sync."

    cfg = config or load_config()
    server_url = (cfg.get("serverUrl") or DEFAULT_SERVER_URL).rstrip("/")
    uid = cfg.get("uid", "").strip()
    device_id = cfg.get("deviceId", "").strip()

    if not uid:
        # Cache offline if no UID is present yet
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
        # Events were re-enqueued by sync_events on failure, so remove duplicates
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

    now_utc = datetime.now(timezone.utc).isoformat()
    tz_name = time.tzname[0] if time.tzname else "UTC"

    event_payload = {
        "eventId": f"evt_{uuid.uuid4().hex[:12]}",
        "uid": cfg.get("uid", ""),
        "deviceId": cfg.get("deviceId", get_default_device_id()),
        "deviceName": cfg.get("deviceName", socket.gethostname()),
        "eventType": event_type,
        "timestamp": now_utc,
        "timezone": tz_name,
        "os": f"Windows {platform.version()}" if sys.platform == "win32" else f"{platform.system()} {platform.release()}",
        "agentVersion": APP_VERSION,
        "source": "Python-Desktop-Client",
    }

    # Attempt online sync
    success, data, msg = sync_events([event_payload], cfg)
    return success, event_payload, msg


def deregister_device(config: dict = None) -> tuple:
    """
    Calls the backend API to permanently deregister the device and cascade purge all Firestore documents.
    Returns: (success: bool, message: str)
    """
    cfg = config or load_config()
    server_url = cfg.get("serverUrl", "").rstrip("/")
    device_id = cfg.get("deviceId", get_default_device_id())
    uid = cfg.get("uid", "")

    if not server_url:
        return False, "Missing serverUrl in configuration."

    endpoint = f"{server_url}/api/devices/deregister"
    payload = {
        "deviceId": device_id,
        "uid": uid,
        "action": "UNINSTALL"
    }

    try:
        append_log(f"Calling backend deregister & cascade purge for device {device_id}...", "WARN")
        resp = requests.post(endpoint, json=payload, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            msg = data.get("message", f"Device {device_id} and all history permanently deleted from Firestore.")
            append_log(msg, "UNINSTALLED")
            return True, msg
        else:
            err_msg = f"Server returned error code {resp.status_code}: {resp.text}"
            append_log(err_msg, "ERROR")
            return False, err_msg
    except Exception as e:
        err_msg = f"Failed to reach server for deregistration: {e}"
        append_log(err_msg, "ERROR")
        return False, err_msg

