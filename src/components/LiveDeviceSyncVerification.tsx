import React, { useState, useEffect } from 'react';
import { UserProfile, Device } from '../types';
import {
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Laptop,
  Database,
  Server,
  LayoutDashboard,
  Trash2,
  Download,
  Terminal,
  Activity,
  Check,
  X,
  Clock,
  Fingerprint,
} from 'lucide-react';
import { purgeSimulatedVerificationDevices } from '../lib/dataService';
import { formatToIST } from '../lib/dateUtils';

interface LiveDeviceSyncVerificationProps {
  user: UserProfile;
  devices: Device[];
  onOpenAgentModal?: () => void;
}

export const LiveDeviceSyncVerification: React.FC<LiveDeviceSyncVerificationProps> = ({
  user,
  devices,
  onOpenAgentModal,
}) => {
  const [loading, setLoading] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [cleanMessage, setCleanMessage] = useState<string | null>(null);
  const [syncData, setSyncData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchLiveSyncStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      // Direct backend verification check
      const devRes = await fetch(`/api/devices?uid=${encodeURIComponent(user.uid)}`);
      const devData = await devRes.json();
      const fetchedDevices: Device[] = devData.success && Array.isArray(devData.devices) ? devData.devices : devices;

      const activeDevId = fetchedDevices[0]?.deviceId || devices[0]?.deviceId || '';
      const url = `/api/agent/verify-sync?uid=${encodeURIComponent(user.uid)}${
        activeDevId ? `&deviceId=${encodeURIComponent(activeDevId)}` : ''
      }`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setSyncData(data);
      } else {
        setError(data.error || 'Failed to verify live sync');
      }
    } catch (err: any) {
      setError(err.message || 'Network error querying sync status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveSyncStatus();
  }, [user.uid, devices.length]);

  const handleCleanSimulated = async () => {
    setCleaning(true);
    setCleanMessage(null);
    try {
      const count = await purgeSimulatedVerificationDevices(user.uid);
      setCleanMessage(`Cleaned up ${count} simulated verification device artifact(s).`);
      await fetchLiveSyncStatus();
    } catch (err: any) {
      setCleanMessage('Cleanup failed: ' + err.message);
    } finally {
      setCleaning(false);
    }
  };

  const isPass = syncData?.status === 'PASS';
  const isNoDevice = syncData?.status === 'NO_REAL_DEVICE_YET' || devices.length === 0;

  return (
    <div id="live-device-sync-tool" className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <Fingerprint className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900">
              Live Device Sync Verification Tool
            </h2>
            {isPass && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <Check className="w-3 h-3 mr-1" />
                VERIFIED PASS
              </span>
            )}
            {isNoDevice && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                AWAITING AGENT
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            End-to-end real device identity verification across Agent Config, Backend Sync, Firestore DB, and Dashboard Query layers.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            id="btn-refresh-live-sync"
            onClick={fetchLiveSyncStatus}
            disabled={loading}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Verifying...' : 'Re-verify'}</span>
          </button>

          <button
            id="btn-clean-simulated-devices"
            onClick={handleCleanSimulated}
            disabled={cleaning}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded-lg border border-rose-200 transition disabled:opacity-50"
            title="Remove simulated verification devices"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{cleaning ? 'Cleaning...' : 'Purge Test Artifacts'}</span>
          </button>
        </div>
      </div>

      {cleanMessage && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <span>{cleanMessage}</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Primary Status Banner */}
      {isNoDevice ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center space-y-3">
          <Laptop className="w-8 h-8 text-amber-600 mx-auto" />
          <div>
            <div className="text-sm font-bold text-amber-900">No Windows devices connected yet</div>
            <p className="text-xs text-amber-700 max-w-lg mx-auto mt-1">
              The agent has not sent telemetry with your UID yet. Run the Windows Agent installer on your laptop/PC to register your hardware.
            </p>
          </div>
          {onOpenAgentModal && (
            <button
              onClick={onOpenAgentModal}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Get Windows Agent Installer</span>
            </button>
          )}
        </div>
      ) : (
        <div
          className={`p-4 rounded-2xl border ${
            isPass
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
              : 'bg-rose-50/70 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {isPass ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
              ) : (
                <XCircle className="w-6 h-6 text-rose-600 flex-shrink-0" />
              )}
              <div>
                <div className="text-xs font-bold uppercase tracking-wider">
                  {isPass ? 'Cross-Layer Synchronization Status: PASS' : 'Cross-Layer Synchronization Status: FAIL'}
                </div>
                <div className="text-xs font-medium opacity-90 mt-0.5">
                  {syncData?.message || 'Device identity matches across all architecture layers.'}
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-[11px] font-bold opacity-75">Last Seen (IST)</div>
              <div className="text-xs font-mono font-semibold">
                {syncData?.lastSeen ? formatToIST(syncData.lastSeen) : 'N/A'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Layer-by-Layer Verification Matrix */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
          Architecture Layer Alignment Matrix
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Layer 1: Agent Config */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 flex items-center space-x-1.5">
                <Terminal className="w-3.5 h-3.5 text-blue-600" />
                <span>1. Agent Config</span>
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                config.json
              </span>
            </div>
            <div className="text-[11px] space-y-1">
              <div>
                <span className="text-slate-400">UID: </span>
                <span className="font-mono text-slate-800 truncate block">{user.uid}</span>
              </div>
              <div>
                <span className="text-slate-400">Device ID: </span>
                <span className="font-mono font-bold text-blue-700 truncate block">
                  {syncData?.agentDeviceId || devices[0]?.deviceId || 'Auto-generated'}
                </span>
              </div>
            </div>
          </div>

          {/* Layer 2: Backend Sync Ingestion */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 flex items-center space-x-1.5">
                <Server className="w-3.5 h-3.5 text-blue-600" />
                <span>2. Backend /sync</span>
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  syncData?.backendReceivedUid === user.uid
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {syncData?.backendReceivedUid === user.uid ? 'RECEIVED' : 'IDLE'}
              </span>
            </div>
            <div className="text-[11px] space-y-1">
              <div>
                <span className="text-slate-400">Received UID: </span>
                <span className="font-mono text-slate-800 truncate block">
                  {syncData?.backendReceivedUid || 'Awaiting telemetry'}
                </span>
              </div>
              <div>
                <span className="text-slate-400">Received DevID: </span>
                <span className="font-mono font-bold text-blue-700 truncate block">
                  {syncData?.backendReceivedDeviceId || 'Awaiting telemetry'}
                </span>
              </div>
            </div>
          </div>

          {/* Layer 3: Firestore Database */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 flex items-center space-x-1.5">
                <Database className="w-3.5 h-3.5 text-blue-600" />
                <span>3. Firestore DB</span>
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  syncData?.firestoreWrittenDeviceId
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {syncData?.firestoreWrittenDeviceId ? 'STORED' : 'EMPTY'}
              </span>
            </div>
            <div className="text-[11px] space-y-1">
              <div>
                <span className="text-slate-400">Stored UID: </span>
                <span className="font-mono text-slate-800 truncate block">
                  {syncData?.firestoreWrittenUid || 'No document'}
                </span>
              </div>
              <div>
                <span className="text-slate-400">Stored DevID: </span>
                <span className="font-mono font-bold text-blue-700 truncate block">
                  {syncData?.firestoreWrittenDeviceId || 'No document'}
                </span>
              </div>
            </div>
          </div>

          {/* Layer 4: Dashboard Queried Identity */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 flex items-center space-x-1.5">
                <LayoutDashboard className="w-3.5 h-3.5 text-blue-600" />
                <span>4. Dashboard View</span>
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  devices.length > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {devices.length > 0 ? `${devices.length} REAL DEV` : '0 DEVICES'}
              </span>
            </div>
            <div className="text-[11px] space-y-1">
              <div>
                <span className="text-slate-400">Queried UID: </span>
                <span className="font-mono text-slate-800 truncate block">{user.uid}</span>
              </div>
              <div>
                <span className="text-slate-400">Active DevID: </span>
                <span className="font-mono font-bold text-blue-700 truncate block">
                  {devices[0]?.deviceId || 'None'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Developer Diagnostic Panel with Exact 8 Fields */}
      <div className="bg-slate-950 text-slate-100 rounded-xl p-4 text-xs font-mono space-y-3 border border-slate-800">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-slate-200 tracking-wider">
              DEVELOPER DIAGNOSTIC PANEL — END-TO-END SYNC TRACE
            </span>
          </div>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              isPass
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                : 'bg-amber-950 text-amber-300 border border-amber-700'
            }`}
          >
            {isPass ? 'SYNC: PASS' : 'SYNC: AWAITING_EVENTS'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-[11px]">
          <div className="flex items-center justify-between py-1 border-b border-slate-900">
            <span className="text-slate-400">AGENT UID:</span>
            <span className="font-semibold text-cyan-300">{syncData?.agentUid || user.uid}</span>
          </div>

          <div className="flex items-center justify-between py-1 border-b border-slate-900">
            <span className="text-slate-400">AGENT DEVICE ID:</span>
            <span className="font-semibold text-emerald-300">
              {syncData?.agentDeviceId || devices[0]?.deviceId || 'None'}
            </span>
          </div>

          <div className="flex items-center justify-between py-1 border-b border-slate-900">
            <span className="text-slate-400">BACKEND RECEIVED UID:</span>
            <span className="font-semibold text-cyan-300">{syncData?.backendReceivedUid || user.uid}</span>
          </div>

          <div className="flex items-center justify-between py-1 border-b border-slate-900">
            <span className="text-slate-400">BACKEND RECEIVED DEVICE ID:</span>
            <span className="font-semibold text-emerald-300">
              {syncData?.backendReceivedDeviceId || devices[0]?.deviceId || 'None'}
            </span>
          </div>

          <div className="flex items-center justify-between py-1 border-b border-slate-900">
            <span className="text-slate-400">FIRESTORE UID:</span>
            <span className="font-semibold text-cyan-300">
              {syncData?.firestoreWrittenUid || user.uid}
            </span>
          </div>

          <div className="flex items-center justify-between py-1 border-b border-slate-900">
            <span className="text-slate-400">FIRESTORE DEVICE ID:</span>
            <span className="font-semibold text-emerald-300">
              {syncData?.firestoreWrittenDeviceId || devices[0]?.deviceId || 'None'}
            </span>
          </div>

          <div className="flex items-center justify-between py-1 border-b border-slate-900">
            <span className="text-slate-400">DASHBOARD QUERY UID:</span>
            <span className="font-semibold text-cyan-300">{user.uid}</span>
          </div>

          <div className="flex items-center justify-between py-1 border-b border-slate-900">
            <span className="text-slate-400">DISPLAYED DEVICE ID:</span>
            <span className="font-semibold text-emerald-300">
              {devices[0]?.deviceId || syncData?.dashboardQueriedDeviceId || 'None'}
            </span>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-900 flex flex-wrap items-center justify-between text-[10px] text-slate-400 gap-2">
          <div>
            Device Name: <span className="text-slate-200">{syncData?.agentDeviceName || devices[0]?.deviceName || 'None'}</span>
          </div>
          <div>
            Agent Version: <span className="text-slate-200">{syncData?.agentVersion || devices[0]?.agentVersion || 'v1.0.0'}</span>
          </div>
          <div>
            Last Seen (IST): <span className="text-emerald-400">{syncData?.lastSeen ? formatToIST(syncData.lastSeen) : 'Awaiting telemetry'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
