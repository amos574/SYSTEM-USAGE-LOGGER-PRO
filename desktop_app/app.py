"""
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

# Try importing customtkinter, fallback to modern styled standard tkinter
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

        self.log_to_console(
            f"=== {APP_NAME} Desktop Client initialized ===", "INFO"
        )
        self.log_to_console(
            f"Config loaded from: {CONFIG_FILE}", "INFO"
        )
        self.log_to_console(
            f"Target Server: {self.config.get('serverUrl')}", "INFO"
        )

        # Initial background verification
        self.action_check_health()
        if self.config.get("uid"):
            self.action_show_device_status()
        else:
            self.log_to_console(
                "Notice: User Account UID is not configured yet. Click 'Edit UID / Device' to bind your account.",
                "LOCAL",
            )

    def _setup_styles(self):
        """Configure ttk dark styles."""
        self.style = ttk.Style()
        try:
            self.style.theme_use("clam")
        except Exception:
            pass

        self.style.configure(
            "Dark.TFrame",
            background=THEME["bg_dark"],
        )
        self.style.configure(
            "Card.TFrame",
            background=THEME["card_bg"],
            relief="flat",
        )
        self.style.configure(
            "Header.TFrame",
            background=THEME["header_bg"],
        )
        self.style.configure(
            "Primary.TButton",
            background=THEME["accent_primary"],
            foreground="#0b0f19",
            font=("Segoe UI", 9, "bold"),
            padding=6,
        )
        self.style.configure(
            "Secondary.TButton",
            background=THEME["card_border"],
            foreground=THEME["text_primary"],
            font=("Segoe UI", 9),
            padding=6,
        )

    def _build_ui(self):
        """Assemble main desktop UI layout."""
        # Top Header Bar
        header_frame = tk.Frame(
            self.root, bg=THEME["header_bg"], height=70, padx=16, pady=10
        )
        header_frame.pack(side="top", fill="x")

        title_label = tk.Label(
            header_frame,
            text=f"📊  {APP_NAME}",
            font=("Segoe UI", 13, "bold"),
            bg=THEME["header_bg"],
            fg=THEME["text_primary"],
        )
        title_label.pack(side="left")

        ver_label = tk.Label(
            header_frame,
            text=f"v{APP_VERSION} (Python Native)",
            font=("Segoe UI", 9),
            bg=THEME["header_bg"],
            fg=THEME["text_muted"],
            padx=6,
        )
        ver_label.pack(side="left")

        # Health status indicator in header
        self.status_badge = tk.Label(
            header_frame,
            text="Checking Backend...",
            font=("Segoe UI", 9, "bold"),
            bg=THEME["card_border"],
            fg=THEME["text_secondary"],
            padx=10,
            pady=3,
        )
        self.status_badge.pack(side="right", padx=6)

        refresh_btn = tk.Button(
            header_frame,
            text="🔄 Re-Check",
            font=("Segoe UI", 9),
            bg=THEME["card_border"],
            fg=THEME["text_primary"],
            activebackground=THEME["accent_hover"],
            activeforeground="#ffffff",
            relief="flat",
            command=self.action_check_health,
            padx=8,
            pady=2,
            cursor="hand2",
        )
        refresh_btn.pack(side="right", padx=6)

        # Status Summary Bar (UID, Device, Queue)
        summary_frame = tk.Frame(
            self.root, bg=THEME["card_bg"], padx=16, pady=8, highlightbackground=THEME["card_border"], highlightthickness=1
        )
        summary_frame.pack(side="top", fill="x", padx=12, pady=8)

        # UID Label
        self.uid_display = tk.Label(
            summary_frame,
            text=f"User UID: {self.config.get('uid') or '(Not Configured)'}",
            font=("Segoe UI", 9, "bold" if self.config.get("uid") else "normal"),
            bg=THEME["card_bg"],
            fg=THEME["accent_primary"] if self.config.get("uid") else THEME["badge_warning"],
        )
        self.uid_display.pack(side="left", padx=(0, 16))

        # Device ID Label
        self.device_display = tk.Label(
            summary_frame,
            text=f"Device: {self.config.get('deviceId', 'PC-AUTO')} ({self.config.get('deviceName', 'Workstation')})",
            font=("Segoe UI", 9),
            bg=THEME["card_bg"],
            fg=THEME["text_secondary"],
        )
        self.device_display.pack(side="left", padx=8)

        # Offline Queue Badge
        self.queue_display = tk.Label(
            summary_frame,
            text="Offline Queue: 0 events",
            font=("Segoe UI", 9),
            bg=THEME["card_bg"],
            fg=THEME["text_muted"],
        )
        self.queue_display.pack(side="left", padx=12)

        # Config / Edit Button
        edit_cfg_btn = tk.Button(
            summary_frame,
            text="⚙️ Edit UID / Settings",
            font=("Segoe UI", 8),
            bg=THEME["card_border"],
            fg=THEME["text_primary"],
            relief="flat",
            command=self._open_config_dialog,
            cursor="hand2",
            padx=8,
            pady=2,
        )
        edit_cfg_btn.pack(side="right")

        # Main Split Content Frame
        main_content = tk.Frame(self.root, bg=THEME["bg_dark"], padx=12, pady=4)
        main_content.pack(side="top", fill="both", expand=True)

        # Left Panel: Action Command Center
        left_panel = tk.Frame(
            main_content, bg=THEME["card_bg"], width=300, padx=12, pady=12, highlightbackground=THEME["card_border"], highlightthickness=1
        )
        left_panel.pack(side="left", fill="y", padx=(0, 8))

        actions_title = tk.Label(
            left_panel,
            text="COMMAND CENTER",
            font=("Segoe UI", 10, "bold"),
            bg=THEME["card_bg"],
            fg=THEME["text_muted"],
        )
        actions_title.pack(anchor="w", pady=(0, 10))

        # Command Buttons
        self._create_action_btn(
            left_panel,
            "🔍 Show Device Status",
            "Queries live Firestore device registration & last state",
            self.action_show_device_status,
        )

        self._create_action_btn(
            left_panel,
            "📋 Account & Trial Status",
            "Queries 7-day Pro trial info & reports status",
            self.action_account_status,
        )

        self._create_action_btn(
            left_panel,
            "📦 Check Offline Queue",
            "Inspects %APPDATA%\\syslogger-pro\\offline_queue.json",
            self.action_check_offline_queue,
        )

        self._create_action_btn(
            left_panel,
            "🚀 Flush Offline Queue",
            "Sends all locally cached events to /api/agent/sync",
            self.action_flush_queue,
        )

        self._create_action_btn(
            left_panel,
            "📄 View Agent Logs",
            "Reads recent entries from %APPDATA%\\syslogger-pro\\logs\\agent.log",
            self.action_view_logs,
        )

        self._create_action_btn(
            left_panel,
            "🗑️ Uninstall & Deregister",
            "Deregisters device and cascade purges all sessions/events from Firestore",
            self.action_uninstall_agent,
        )

        # Event Simulation Section
        sim_sep = tk.Frame(left_panel, bg=THEME["card_border"], height=1)
        sim_sep.pack(fill="x", pady=12)

        sim_title = tk.Label(
            left_panel,
            text="SIMULATE SYSTEM EVENT",
            font=("Segoe UI", 9, "bold"),
            bg=THEME["card_bg"],
            fg=THEME["text_muted"],
        )
        sim_title.pack(anchor="w", pady=(0, 6))

        # Quick event simulation buttons grid
        event_btn_frame = tk.Frame(left_panel, bg=THEME["card_bg"])
        event_btn_frame.pack(fill="x", pady=4)

        events_grid = [
            ("STARTUP", THEME["badge_pass"]),
            ("ACTIVE", THEME["badge_info"]),
            ("LOCK", THEME["badge_warning"]),
            ("UNLOCK", THEME["badge_pass"]),
            ("SLEEP", THEME["badge_muted"] if "badge_muted" in THEME else THEME["text_muted"]),
            ("WAKE", THEME["badge_info"]),
            ("SHUTDOWN", THEME["badge_fail"]),
        ]

        for i, (ev_type, color) in enumerate(events_grid):
            btn = tk.Button(
                event_btn_frame,
                text=ev_type,
                font=("Segoe UI", 8, "bold"),
                bg=THEME["card_border"],
                fg=color,
                activebackground=THEME["header_bg"],
                activeforeground="#ffffff",
                relief="flat",
                cursor="hand2",
                command=lambda t=ev_type: self.action_simulate_event(t),
                padx=6,
                pady=4,
            )
            row = i // 2
            col = i % 2
            btn.grid(row=row, column=col, sticky="ew", padx=2, pady=2)
            event_btn_frame.grid_columnconfigure(col, weight=1)

        # Right Panel: Output Console
        right_panel = tk.Frame(
            main_content, bg=THEME["card_bg"], padx=12, pady=12, highlightbackground=THEME["card_border"], highlightthickness=1
        )
        right_panel.pack(side="right", fill="both", expand=True)

        console_header = tk.Frame(right_panel, bg=THEME["card_bg"])
        console_header.pack(fill="x", pady=(0, 6))

        console_title = tk.Label(
            console_header,
            text="LIVE TELEMETRY & EVENT CONSOLE",
            font=("Segoe UI", 10, "bold"),
            bg=THEME["card_bg"],
            fg=THEME["text_muted"],
        )
        console_title.pack(side="left")

        clear_btn = tk.Button(
            console_header,
            text="🧹 Clear",
            font=("Segoe UI", 8),
            bg=THEME["card_border"],
            fg=THEME["text_secondary"],
            relief="flat",
            command=self._clear_console,
            cursor="hand2",
            padx=6,
            pady=1,
        )
        clear_btn.pack(side="right", padx=4)

        copy_btn = tk.Button(
            console_header,
            text="📋 Copy to Clipboard",
            font=("Segoe UI", 8),
            bg=THEME["card_border"],
            fg=THEME["text_secondary"],
            relief="flat",
            command=self._copy_console_to_clipboard,
            cursor="hand2",
            padx=6,
            pady=1,
        )
        copy_btn.pack(side="right", padx=4)

        # Console Text Box
        console_container = tk.Frame(right_panel, bg=THEME["console_bg"])
        console_container.pack(fill="both", expand=True)

        self.console_text = tk.Text(
            console_container,
            bg=THEME["console_bg"],
            fg=THEME["text_primary"],
            font=("Consolas", 9),
            wrap="word",
            relief="flat",
            padx=8,
            pady=8,
        )
        scrollbar = tk.Scrollbar(console_container, command=self.console_text.yview)
        self.console_text.configure(yscrollcommand=scrollbar.set)

        scrollbar.pack(side="right", fill="y")
        self.console_text.pack(side="left", fill="both", expand=True)

        # Configure color tags in Text widget
        self.console_text.tag_config("PASS", foreground=THEME["badge_pass"])
        self.console_text.tag_config("FAIL", foreground=THEME["badge_fail"])
        self.console_text.tag_config("WARN", foreground=THEME["badge_warning"])
        self.console_text.tag_config("INFO", foreground=THEME["badge_info"])
        self.console_text.tag_config("SYNCED", foreground=THEME["badge_synced"])
        self.console_text.tag_config("LOCAL", foreground=THEME["badge_local"])
        self.console_text.tag_config("MUTED", foreground=THEME["text_muted"])
        self.console_text.tag_config("BOLD", font=("Consolas", 9, "bold"))

    def _create_action_btn(self, parent, text, desc, command):
        """Helper to create attractive command buttons."""
        frame = tk.Frame(parent, bg=THEME["card_bg"])
        frame.pack(fill="x", pady=3)

        btn = tk.Button(
            frame,
            text=text,
            font=("Segoe UI", 9, "bold"),
            bg=THEME["card_border"],
            fg=THEME["text_primary"],
            activebackground=THEME["accent_hover"],
            activeforeground="#ffffff",
            relief="flat",
            anchor="w",
            padx=10,
            pady=6,
            cursor="hand2",
            command=command,
        )
        btn.pack(fill="x")

    def _start_periodic_checks(self):
        """Start background daemon tracking and periodic UI updates."""
        def handle_daemon_update(event_type, msg):
            self.msg_queue.put(("LOG", msg, "SYNCED" if "synced" in msg.lower() or "flushed" in msg.lower() or "startup" in msg.lower() else "INFO"))

        logger_client.start_background_daemon(self.config, on_event_callback=handle_daemon_update)

        def ui_tick():
            self._update_queue_badge()
            self._process_message_queue()
            self.root.after(3000, ui_tick)

        self.root.after(1000, ui_tick)

    def _process_message_queue(self):
        """Drain async worker thread log messages to UI."""
        while not self.msg_queue.empty():
            try:
                msg_type, content, tag = self.msg_queue.get_nowait()
                if msg_type == "LOG":
                    self._append_console_raw(content, tag)
                elif msg_type == "STATUS":
                    self._update_status_badge(content, tag)
            except queue.Empty:
                break

    def _update_queue_badge(self):
        """Update offline queue count display."""
        try:
            q = logger_client.get_offline_queue()
            count = len(q)
            if count > 0:
                self.queue_display.config(
                    text=f"Offline Queue: {count} event(s) ⚠️",
                    fg=THEME["badge_local"],
                )
            else:
                self.queue_display.config(
                    text="Offline Queue: 0 events (Synced)",
                    fg=THEME["text_muted"],
                )
        except Exception:
            pass

    def _update_status_badge(self, text, is_online):
        """Update the top right connection status badge."""
        if is_online:
            self.status_badge.config(
                text=f"🟢 {text}",
                bg="#064e3b",
                fg=THEME["badge_pass"],
            )
        else:
            self.status_badge.config(
                text=f"🔴 {text}",
                bg="#7f1d1d",
                fg=THEME["badge_fail"],
            )

    def log_to_console(self, text: str, tag: str = "INFO"):
        """Thread-safe logging to the UI console."""
        timestamp = datetime.now().strftime("%H:%M:%S")
        formatted = f"[{timestamp}] [{tag}] {text}\n"
        self.msg_queue.put(("LOG", formatted, tag))

    def _append_console_raw(self, formatted: str, tag: str):
        """Insert text into Tkinter Text widget."""
        self.console_text.insert(tk.END, formatted, (tag,))
        self.console_text.see(tk.END)

    def _clear_console(self):
        """Clear all console output."""
        self.console_text.delete("1.0", tk.END)

    def _copy_console_to_clipboard(self):
        """Copy current console content to system clipboard."""
        try:
            content = self.console_text.get("1.0", tk.END)
            self.root.clipboard_clear()
            self.root.clipboard_append(content)
            self.log_to_console("Console output copied to clipboard.", "INFO")
        except Exception as e:
            self.log_to_console(f"Failed copying to clipboard: {e}", "FAIL")

    # =========================================================================
    # ASYNCHRONOUS USER ACTIONS
    # =========================================================================

    def action_check_health(self):
        """Check backend health on background thread."""
        def worker():
            self.msg_queue.put(("STATUS", "Checking...", "WARN"))
            online, msg, latency = logger_client.check_backend_health(
                self.config.get("serverUrl")
            )
            self.msg_queue.put(("STATUS", "Online" if online else "Offline", online))
            if online:
                self.log_to_console(f"Backend Health: {msg}", "PASS")
            else:
                self.log_to_console(f"Backend Health: {msg}", "FAIL")

        threading.Thread(target=worker, daemon=True).start()

    def action_show_device_status(self):
        """Query /api/agent/verify-sync for live fleet info."""
        def worker():
            self.log_to_console("Querying device registration from server...", "INFO")
            success, data, msg = logger_client.verify_device_sync(self.config)
            if success:
                self.log_to_console(f"Device Verified: {msg}", "PASS")
                self.log_to_console(
                    f"Payload Response: {json.dumps(data, indent=2)}", "INFO"
                )
            else:
                self.log_to_console(f"Device Verification: {msg}", "FAIL")

        threading.Thread(target=worker, daemon=True).start()

    def action_account_status(self):
        """Query /api/onboarding/status for trial & onboarding info."""
        def worker():
            self.log_to_console("Querying account & 7-day Pro trial status...", "INFO")
            success, data, msg = logger_client.get_onboarding_status(self.config)
            if success:
                st = data.get("status", {})
                self.log_to_console(
                    f"Account UID: {st.get('uid')} | Trial: {st.get('trialStatus')} ({st.get('trialDaysRemaining')}d remaining)",
                    "PASS",
                )
                self.log_to_console(
                    f"Welcome Email: {st.get('welcomeEmailStatus')} | Sample Reports: {'Generated' if st.get('trialReportGenerated') else 'Pending'}",
                    "INFO",
                )
            else:
                self.log_to_console(f"Account Status Failed: {msg}", "FAIL")

        threading.Thread(target=worker, daemon=True).start()

    def action_check_offline_queue(self):
        """Read and inspect offline_queue.json."""
        def worker():
            q = logger_client.get_offline_queue()
            self.log_to_console(
                f"Offline Queue File: {OFFLINE_QUEUE_FILE}", "INFO"
            )
            self.log_to_console(
                f"Cached Event Count: {len(q)}", "LOCAL" if q else "PASS"
            )
            if q:
                for i, ev in enumerate(q[-5:]):
                    self.log_to_console(
                        f"  [{i+1}] {ev.get('eventType')} @ {ev.get('timestamp')} (ID: {ev.get('eventId')})",
                        "LOCAL",
                    )
                if len(q) > 5:
                    self.log_to_console(
                        f"  ... and {len(q) - 5} older event(s) in queue.", "LOCAL"
                    )

        threading.Thread(target=worker, daemon=True).start()

    def action_flush_queue(self):
        """Flush offline queue to backend."""
        def worker():
            self.log_to_console("Flushing offline queue to backend...", "INFO")
            synced, rem, msg = logger_client.flush_offline_queue(self.config)
            if synced > 0:
                self.log_to_console(f"Queue Flush Result: {msg}", "SYNCED")
            elif rem == 0:
                self.log_to_console(msg, "INFO")
            else:
                self.log_to_console(f"Queue Flush: {msg}", "FAIL")
            self._update_queue_badge()

        threading.Thread(target=worker, daemon=True).start()

    def action_view_logs(self):
        """Read recent agent log entries."""
        def worker():
            self.log_to_console(f"Reading logs from: {LOG_FILE}", "INFO")
            lines = logger_client.get_recent_logs(20)
            for line in lines:
                self.log_to_console(line, "MUTED")

        threading.Thread(target=worker, daemon=True).start()

    def action_simulate_event(self, event_type: str):
        """Simulate and dispatch a system event."""
        def worker():
            self.log_to_console(
                f"Dispatching simulated [{event_type}] event...", "INFO"
            )
            success, payload, msg = logger_client.simulate_event(
                event_type, self.config
            )
            if success:
                self.log_to_console(
                    f"[{event_type}] Event Synced to Server: {msg}", "SYNCED"
                )
            else:
                self.log_to_console(
                    f"[{event_type}] Event Cached to Local Queue: {msg}", "LOCAL"
                )
            self._update_queue_badge()

        threading.Thread(target=worker, daemon=True).start()

    def action_uninstall_agent(self):
        """Deregister device from backend Firestore database and initiate uninstallation."""
        device_id = self.config.get("deviceId", "Unknown")
        confirm = messagebox.askyesno(
            "Confirm Uninstallation & Deregistration",
            f"Are you sure you want to uninstall this agent and delete device '{device_id}'?\n\n"
            "This will cascade delete the device document, usage sessions, and system events from Firestore.",
            parent=self.root
        )
        if not confirm:
            return

        def worker():
            self.log_to_console("Initiating device deregistration and cascade purge...", "WARN")
            success, msg = logger_client.deregister_device(self.config)
            if success:
                self.log_to_console(f"Uninstallation Success: {msg}", "PASS")
                messagebox.showinfo("Deregistration Complete", f"Device {device_id} successfully uninstalled and purged from Firestore.\n\nYou may now close this application.", parent=self.root)
            else:
                self.log_to_console(f"Deregistration Notice: {msg}", "FAIL")
                messagebox.showwarning("Deregistration Notice", f"{msg}", parent=self.root)

        threading.Thread(target=worker, daemon=True).start()

    # =========================================================================
    # CONFIGURATION DIALOG
    # =========================================================================

    def _open_config_dialog(self):
        """Open modal dialog to update UID, Device ID, and Server URL."""
        dlg = tk.Toplevel(self.root)
        dlg.title("Configure Agent & Account Bindings")
        dlg.geometry("520x400")
        dlg.configure(bg=THEME["bg_dark"])
        dlg.transient(self.root)
        dlg.grab_set()

        frame = tk.Frame(dlg, bg=THEME["bg_dark"], padx=20, pady=20)
        frame.pack(fill="both", expand=True)

        tk.Label(
            frame,
            text="Account & Device Settings",
            font=("Segoe UI", 12, "bold"),
            bg=THEME["bg_dark"],
            fg=THEME["text_primary"],
        ).pack(anchor="w", pady=(0, 12))

        # UID Field
        tk.Label(
            frame,
            text="User Account UID (from Web Dashboard):",
            font=("Segoe UI", 9, "bold"),
            bg=THEME["bg_dark"],
            fg=THEME["text_secondary"],
        ).pack(anchor="w", pady=(4, 2))

        uid_var = tk.StringVar(value=self.config.get("uid", ""))
        uid_entry = tk.Entry(
            frame,
            textvariable=uid_var,
            font=("Segoe UI", 9),
            bg=THEME["card_bg"],
            fg=THEME["text_primary"],
            insertbackground="#ffffff",
            relief="flat",
            highlightthickness=1,
            highlightbackground=THEME["card_border"],
        )
        uid_entry.pack(fill="x", pady=(0, 8), ipady=4)

        # Device ID Field
        tk.Label(
            frame,
            text="Device ID:",
            font=("Segoe UI", 9, "bold"),
            bg=THEME["bg_dark"],
            fg=THEME["text_secondary"],
        ).pack(anchor="w", pady=(4, 2))

        dev_var = tk.StringVar(value=self.config.get("deviceId", ""))
        dev_entry = tk.Entry(
            frame,
            textvariable=dev_var,
            font=("Segoe UI", 9),
            bg=THEME["card_bg"],
            fg=THEME["text_primary"],
            insertbackground="#ffffff",
            relief="flat",
            highlightthickness=1,
            highlightbackground=THEME["card_border"],
        )
        dev_entry.pack(fill="x", pady=(0, 8), ipady=4)

        # Server URL Field
        tk.Label(
            frame,
            text="Server URL (HTTPS):",
            font=("Segoe UI", 9, "bold"),
            bg=THEME["bg_dark"],
            fg=THEME["text_secondary"],
        ).pack(anchor="w", pady=(4, 2))

        srv_var = tk.StringVar(
            value=self.config.get("serverUrl", DEFAULT_SERVER_URL)
        )
        srv_entry = tk.Entry(
            frame,
            textvariable=srv_var,
            font=("Segoe UI", 9),
            bg=THEME["card_bg"],
            fg=THEME["text_primary"],
            insertbackground="#ffffff",
            relief="flat",
            highlightthickness=1,
            highlightbackground=THEME["card_border"],
        )
        srv_entry.pack(fill="x", pady=(0, 16), ipady=4)

        btn_frame = tk.Frame(frame, bg=THEME["bg_dark"])
        btn_frame.pack(fill="x", side="bottom")

        def save_and_close():
            new_uid = uid_var.get().strip()
            new_dev = dev_var.get().strip()
            new_srv = srv_var.get().strip() or DEFAULT_SERVER_URL

            self.config["uid"] = new_uid
            self.config["deviceId"] = new_dev
            self.config["serverUrl"] = new_srv

            if logger_client.save_config(self.config):
                self.uid_display.config(
                    text=f"User UID: {new_uid or '(Not Configured)'}",
                    fg=THEME["accent_primary"] if new_uid else THEME["badge_warning"],
                )
                self.device_display.config(
                    text=f"Device: {new_dev} ({self.config.get('deviceName', 'Workstation')})"
                )
                self.log_to_console(
                    f"Configuration updated: UID={new_uid}, Device={new_dev}",
                    "PASS",
                )
                dlg.destroy()
                self.action_check_health()
            else:
                messagebox.showerror("Error", "Failed to save configuration file.")

        tk.Button(
            btn_frame,
            text="Cancel",
            font=("Segoe UI", 9),
            bg=THEME["card_border"],
            fg=THEME["text_primary"],
            relief="flat",
            command=dlg.destroy,
            cursor="hand2",
            padx=12,
            pady=4,
        ).pack(side="right", padx=6)

        tk.Button(
            btn_frame,
            text="💾 Save Configuration",
            font=("Segoe UI", 9, "bold"),
            bg=THEME["accent_primary"],
            fg="#0b0f19",
            relief="flat",
            command=save_and_close,
            cursor="hand2",
            padx=12,
            pady=4,
        ).pack(side="right", padx=6)


def main():
    root = tk.Tk()
    app = SysLoggerDesktopApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
