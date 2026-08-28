import React, { useState } from 'react';
import { Device, SystemEvent, UsageSession, Report, UserProfile } from '../types';
import {
  Laptop,
  Activity,
  Clock,
  CheckCircle2,
  AlertCircle,
  Download,
  Power,
  Lock,
  Moon,
  Zap,
  ArrowRight,
  Fingerprint,
  HardDrive,
  Cloud,
  Mail,
  Send,
} from 'lucide-react';
import { LiveDeviceSyncVerification } from './LiveDeviceSyncVerification';
import { formatTimeToIST, formatDateToIST } from '../lib/dateUtils';

interface DashboardViewProps {
  user?: UserProfile;
  devices: Device[];
  events: SystemEvent[];
  sessions: UsageSession[];
  reports: Report[];
  onNavigateTab: (tab: string) => void;
  onOpenAgentModal: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  devices,
  events,
  sessions,
  reports,
  onNavigateTab,
  onOpenAgentModal,
}) => {
  const [showSyncVerification, setShowSyncVerification] = useState(true);
  const totalDevices = devices.length;
  const onlineDevices = devices.filter((d) => d.isOnline).length;
  const offlineDevices = totalDevices - onlineDevices;

  // Calculate Today's Usage
  const todayStr = new Date().toISOString().substring(0, 10);
  const todaySessions = sessions.filter((s) => s.date === todayStr);
  const todayUsageMinutes = todaySessions.reduce((acc, s) => acc + s.durationMinutes, 0);
  const todayUsageHours = (todayUsageMinutes / 60).toFixed(1);

  const activeSessionsCount = devices.filter((d) => d.currentState === 'ACTIVE').length;

  const latestReport = reports[0];

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Quick Install Action */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 lg:p-7 text-slate-900 shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] items-center gap-6 lg:gap-8">
          
          {/* Left / Main Content */}
          <div className="space-y-2">
            <div className="inline-flex items-center space-x-2 bg-blue-50 border border-blue-200/60 px-3 py-1 rounded-full w-fit">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse shrink-0"></span>
              <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider whitespace-nowrap">
                Automated Background Monitoring
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              INSTALL WINDOWS AGENT
            </h1>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-2xl">
              Install the System Usage Logger Pro Agent on your Windows computer to automatically record system usage.
            </p>

            <div className="text-[11px] text-slate-500 font-medium pt-1">
              After downloading, open the installer from your Downloads folder and complete the installation.
            </div>
          </div>

          {/* Right / Download Action Buttons */}
          <div className="flex flex-col gap-2.5 w-full sm:w-auto lg:w-[290px] shrink-0">
            <div className="relative">
              <button
                id="btn-quick-install-python"
                onClick={onOpenAgentModal}
                className="w-full h-11 px-4 flex items-center justify-between bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-sm transition"
              >
                <div className="flex items-center space-x-2">
                  <Download className="w-4 h-4 shrink-0" />
                  <span>Download Python Client (.ZIP)</span>
                </div>
                <span className="bg-blue-500/80 text-white text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase">
                  Native GUI
                </span>
              </button>
            </div>

            <div className="relative">
              <button
                id="btn-quick-install-ps1"
                onClick={onOpenAgentModal}
                className="w-full h-11 px-4 flex items-center justify-between bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl font-semibold text-xs border border-slate-300 transition"
              >
                <div className="flex items-center space-x-2">
                  <Download className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>PowerShell Agent (.PS1)</span>
                </div>
                <span className="bg-slate-200 text-slate-600 text-[9px] px-1.5 py-0.5 rounded font-medium uppercase">
                  Background
                </span>
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        
        {/* Total Devices */}
        <div id="card-total-devices" className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Total Devices</span>
            <Laptop className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{totalDevices}</div>
          <div className="text-[11px] text-slate-500 font-medium">Registered Workstations</div>
        </div>

        {/* Online Devices */}
        <div id="card-online-devices" className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Online Devices</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-600">{onlineDevices}</div>
          <div className="text-[11px] text-slate-500 font-medium">Actively Transmitting</div>
        </div>

        {/* Offline Devices */}
        <div id="card-offline-devices" className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Offline Devices</span>
            <AlertCircle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600">{offlineDevices}</div>
          <div className="text-[11px] text-slate-500 font-medium">Shutdown / Disconnected</div>
        </div>

        {/* Today's Usage */}
        <div id="card-today-usage" className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Today's Usage</span>
            <Clock className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{todayUsageHours} <span className="text-xs font-normal text-slate-400">hrs</span></div>
          <div className="text-[11px] text-slate-500 font-medium">{todayUsageMinutes} Total Minutes</div>
        </div>

        {/* Active Sessions */}
        <div id="card-active-sessions" className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Active Sessions</span>
            <Zap className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-blue-600">{activeSessionsCount}</div>
          <div className="text-[11px] text-slate-500 font-medium">Live User Activity</div>
        </div>

      </div>

      {/* Real-time Devices Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
            <Laptop className="w-4 h-4 text-blue-600" />
            <span>Monitored Devices Status</span>
          </h2>
          <button
            onClick={() => onNavigateTab('devices')}
            className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center space-x-1"
          >
            <span>View All Devices</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Toggle Live Device Sync Tool */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center space-x-2">
            <Fingerprint className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-bold text-slate-800">Live Device Synchronization Status</span>
          </div>
          <button
            id="toggle-live-sync-verification"
            onClick={() => setShowSyncVerification(!showSyncVerification)}
            className="text-xs text-blue-600 hover:text-blue-700 font-semibold"
          >
            {showSyncVerification ? 'Hide Verification Tool' : 'Show Sync Verification Tool'}
          </button>
        </div>

        {/* Live Device Sync Verification Tool */}
        {showSyncVerification && user && (
          <LiveDeviceSyncVerification
            user={user}
            devices={devices}
            onOpenAgentModal={onOpenAgentModal}
          />
        )}

        {devices.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3 shadow-sm">
            <Laptop className="w-10 h-10 text-slate-400 mx-auto" />
            <div className="text-slate-800 font-bold text-sm">No Windows devices connected yet</div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Download and run the Windows Agent installer on your computer to connect your device and begin automated usage monitoring.
            </p>
            <button
              onClick={onOpenAgentModal}
              className="inline-flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-4 py-2.5 rounded-lg transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Get Agent Installer</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {devices.map((dev) => {
              const getStateBadge = (state: string) => {
                switch (state) {
                  case 'ACTIVE':
                    return <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"><Zap className="w-3 h-3" /> ACTIVE</span>;
                  case 'LOCKED':
                    return <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"><Lock className="w-3 h-3" /> LOCKED</span>;
                  case 'SLEEPING':
                    return <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"><Moon className="w-3 h-3" /> SLEEPING</span>;
                  default:
                    return <span className="bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"><Power className="w-3 h-3" /> OFFLINE</span>;
                }
              };

              return (
                <div key={dev.deviceId} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 hover:border-slate-300 transition shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-sm text-slate-900 flex items-center space-x-2">
                      <Laptop className="w-4 h-4 text-blue-600" />
                      <span>{dev.deviceName}</span>
                    </div>
                    {getStateBadge(dev.currentState)}
                  </div>

                  <div className="text-xs text-slate-500 space-y-1.5 pt-1">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Device ID:</span>
                      <span className="font-mono text-slate-700 font-medium">{dev.deviceId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">OS:</span>
                      <span className="text-slate-700">{dev.os}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Agent Version:</span>
                      <span className="text-slate-700">{dev.agentVersion}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Last Seen (IST):</span>
                      <span className="text-slate-900 font-semibold">{dev.lastSeen ? formatTimeToIST(dev.lastSeen) : 'N/A'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Two Column Layout: Recent Events & Latest Report + Google Drive */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Recent Events Stream (Dark contrast card feature as per reference theme) */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center space-x-2">
              <Activity className="w-4 h-4 text-blue-400" />
              <span>Real-Time Event Stream</span>
            </h2>
            <button
              onClick={() => onNavigateTab('events')}
              className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
            >
              View Full Timeline
            </button>
          </div>

          {events.length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-500 font-medium">No usage activity recorded yet.</div>
          ) : (
            <div className="space-y-2">
              {events.slice(0, 7).map((evt) => (
                <div key={evt.eventId} className="flex items-center justify-between bg-slate-800/80 p-3 rounded-xl border border-slate-700/60 text-xs">
                  <div className="flex items-center space-x-3">
                    <span className="font-bold text-blue-300 bg-blue-950 px-2 py-0.5 rounded border border-blue-800/60 text-[11px]">
                      {evt.eventType}
                    </span>
                    <span className="text-slate-200 font-medium">{evt.deviceName}</span>
                  </div>
                  <div className="text-slate-400 text-[11px] font-mono">
                    {formatTimeToIST(evt.timestamp)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column: Google Drive, Gmail & Reports Stack */}
        <div className="space-y-6">
          {/* Gmail Integration Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 text-slate-900 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Mail className="w-4 h-4 text-rose-600" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Gmail Workspace</span>
              </div>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                REST API v1
              </span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Direct Email Delivery</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Send monthly telemetry reports & alerts directly from your authentic Gmail address.
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('gmail')}
              className="w-full flex items-center justify-center space-x-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs py-2.5 rounded-xl border border-rose-200 transition"
            >
              <Send className="w-4 h-4" />
              <span>Open Gmail Hub</span>
            </button>
          </div>

          {/* Google Drive Cloud Integration Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 text-slate-900 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <HardDrive className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Google Drive</span>
              </div>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                Workspace
              </span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Cloud Storage & Backups</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Directly sync audit logs and reports into your personal Google Drive folder.
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('google-drive')}
              className="w-full flex items-center justify-center space-x-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs py-2.5 rounded-xl border border-blue-200 transition"
            >
              <Cloud className="w-4 h-4" />
              <span>Open Google Drive Hub</span>
            </button>
          </div>

          {/* Latest Monthly Report Overview */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 text-slate-900 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <span>Monthly Reports</span>
              </h2>
              <button
                onClick={() => onNavigateTab('reports')}
                className="text-xs text-blue-600 hover:text-blue-700 font-semibold"
              >
                View All
              </button>
            </div>

            {latestReport ? (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                <div className="text-xs font-bold text-slate-900">{latestReport.period}</div>
                <div className="text-[11px] text-slate-500 space-y-0.5">
                  <div>Recipient: <span className="text-slate-800 font-medium">{latestReport.recipientEmail}</span></div>
                  <div>Generated: <span className="text-slate-800 font-medium">{formatDateToIST(latestReport.generatedAt)}</span></div>
                  <div>Status: <span className="font-bold text-emerald-600">{latestReport.emailStatus}</span></div>
                </div>
                <button
                  onClick={() => onNavigateTab('reports')}
                  className="w-full text-center bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium py-1.5 rounded-lg transition mt-2"
                >
                  Download PDF / Excel
                </button>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center space-y-2">
                <div className="text-xs text-slate-500">No monthly report generated yet</div>
                <button
                  onClick={() => onNavigateTab('reports')}
                  className="text-xs text-blue-600 hover:text-blue-700 font-semibold"
                >
                  Generate First Report →
                </button>
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};
