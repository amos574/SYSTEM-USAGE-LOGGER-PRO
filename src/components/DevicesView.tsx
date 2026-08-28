import React, { useState } from 'react';
import { Device, EventType, UserProfile } from '../types';
import {
  Laptop,
  Download,
  Copy,
  Check,
  Zap,
  Lock,
  Moon,
  Power,
  Play,
  CheckCircle2,
  AlertCircle,
  Terminal,
  ShieldCheck,
  Fingerprint,
} from 'lucide-react';
import { generateWindowsInstallerScript } from '../lib/windowsAgentScript';
import { ingestEventBatch, deregisterAndPurgeDevice } from '../lib/dataService';
import { LiveDeviceSyncVerification } from './LiveDeviceSyncVerification';
import { formatToIST } from '../lib/dateUtils';
import { Trash2 } from 'lucide-react';

interface DevicesViewProps {
  user?: UserProfile;
  uid: string;
  devices: Device[];
  onOpenAgentModal: () => void;
}

export const DevicesView: React.FC<DevicesViewProps> = ({ user, uid, devices, onOpenAgentModal }) => {
  const [copiedScript, setCopiedScript] = useState(false);
  const [selectedSimDevice, setSelectedSimDevice] = useState<string>(devices[0]?.deviceId || 'PC-AUTO');
  const [selectedSimEvent, setSelectedSimEvent] = useState<EventType>('STARTUP');
  const [simulating, setSimulating] = useState(false);
  const [simSuccess, setSimSuccess] = useState<string | null>(null);
  const [deregisteringId, setDeregisteringId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleDeregister = async (deviceId: string, deviceName: string) => {
    if (!window.confirm(`Are you sure you want to uninstall and remove "${deviceName}" (${deviceId})?\n\nThis will permanently delete the device document, system events, and usage sessions from Firestore.`)) {
      return;
    }

    setDeregisteringId(deviceId);
    setActionNotice(null);
    try {
      const res = await deregisterAndPurgeDevice(deviceId, uid);
      if (res.success) {
        setActionNotice({
          type: 'success',
          message: `Device ${deviceName} (${deviceId}) and all historical records purged successfully from Firestore.`
        });
      } else {
        setActionNotice({
          type: 'error',
          message: res.error || 'Failed to deregister device.'
        });
      }
    } catch (err: any) {
      setActionNotice({
        type: 'error',
        message: err.message || 'Error occurred while deregistering device.'
      });
    } finally {
      setDeregisteringId(null);
      setTimeout(() => setActionNotice(null), 5000);
    }
  };

  const sampleScript = generateWindowsInstallerScript({
    uid,
    deviceId: selectedSimDevice || 'PC-AUTO',
    deviceName: devices.find((d) => d.deviceId === selectedSimDevice)?.deviceName || 'PC-WORKSTATION',
    serverUrl: window.location.origin,
  });

  const handleCopyScript = () => {
    navigator.clipboard.writeText(sampleScript);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2500);
  };

  const handleSimulateEvent = async () => {
    setSimulating(true);
    setSimSuccess(null);
    try {
      const devName = devices.find((d) => d.deviceId === selectedSimDevice)?.deviceName || selectedSimDevice;
      const now = new Date().toISOString();
      const eventId = `evt_sim_${Date.now()}`;

      await ingestEventBatch([
        {
          eventId,
          uid,
          deviceId: selectedSimDevice,
          deviceName: devName,
          eventType: selectedSimEvent,
          timestamp: now,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          os: 'Windows 11 x64',
          agentVersion: '1.0.2',
          source: 'WebAgentSimulator',
          syncedAt: now,
        },
      ]);

      setSimSuccess(`Synchronized ${selectedSimEvent} for ${devName} successfully!`);
      setTimeout(() => setSimSuccess(null), 4000);
    } catch (error: any) {
      alert('Simulation error: ' + error.message);
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
            <Laptop className="w-5 h-5 text-blue-600" />
            <span>Monitored Windows Devices</span>
          </h1>
          <p className="text-xs text-slate-500">
            Registered workstations sending automatic system events to Firebase.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={onOpenAgentModal}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg font-bold text-xs shadow-xs transition"
          >
            <Download className="w-4 h-4" />
            <span>Python Desktop Client</span>
          </button>

          <button
            onClick={onOpenAgentModal}
            className="flex items-center space-x-2 bg-slate-100 hover:bg-slate-200 text-slate-800 px-3.5 py-2 rounded-lg font-semibold text-xs border border-slate-300 transition"
          >
            <Terminal className="w-4 h-4 text-slate-600" />
            <span>PowerShell Agent</span>
          </button>
        </div>
      </div>

      {/* Live Device Sync Verification Tool */}
      {user && (
        <LiveDeviceSyncVerification
          user={user}
          devices={devices}
          onOpenAgentModal={onOpenAgentModal}
        />
      )}

      {/* Action Notification Banner */}
      {actionNotice && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center justify-between border ${
            actionNotice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center space-x-2">
            {actionNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-medium">{actionNotice.message}</span>
          </div>
          <button
            onClick={() => setActionNotice(null)}
            className="text-xs opacity-70 hover:opacity-100 font-bold px-1.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* Device List Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800">Registered Workstations ({devices.length})</span>
          <span className="text-[11px] text-slate-400">Read-Only Historical Integrity & Real-Time Sync</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider font-bold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Device Name</th>
                <th className="px-4 py-3">Device ID</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Current State</th>
                <th className="px-4 py-3">OS</th>
                <th className="px-4 py-3">Agent Version</th>
                <th className="px-4 py-3">Last Seen (IST)</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {devices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500 font-medium">
                    No Windows devices connected yet. Install the Windows Agent to connect your computer.
                  </td>
                </tr>
              ) : (
                devices.map((dev) => {
                  const isSimulated = dev.deviceId?.startsWith('dev_verify_') || dev.deviceId?.startsWith('PC-TEST-') || dev.deviceName === 'Verification Test Node';
                  const isTest = dev.deviceId?.startsWith('dev_temp_test_') || dev.currentState === ('TEST' as any);
                  const typeLabel = isSimulated ? 'SIMULATED DEVICE' : isTest ? 'TEST DEVICE' : 'LIVE DEVICE';
                  const isDeregistering = deregisteringId === dev.deviceId;

                  return (
                    <tr key={dev.deviceId} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 font-semibold text-slate-900 flex items-center space-x-2">
                        <Laptop className={`w-4 h-4 shrink-0 ${isSimulated ? 'text-amber-500' : 'text-blue-600'}`} />
                        <span>{dev.deviceName}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-500">{dev.deviceId}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            typeLabel === 'LIVE DEVICE'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : typeLabel === 'TEST DEVICE'
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {typeLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            dev.currentState === 'ACTIVE'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : dev.currentState === 'LOCKED'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : dev.currentState === 'SLEEPING'
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {dev.currentState}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{dev.os}</td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">{dev.agentVersion}</td>
                      <td className="px-4 py-3 text-slate-800 font-medium font-mono text-[11px]">
                        {dev.lastSeen ? formatToIST(dev.lastSeen) : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleDeregister(dev.deviceId, dev.deviceName)}
                          disabled={isDeregistering}
                          className="inline-flex items-center space-x-1 text-[11px] font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2.5 py-1 rounded-lg transition disabled:opacity-50"
                          title="Uninstall and permanently purge device document, sessions, and events from Firestore"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>{isDeregistering ? 'Removing...' : 'Uninstall'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Windows Event Simulator Section */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center space-x-2">
          <Terminal className="w-5 h-5 text-blue-600" />
          <h2 className="text-sm font-bold text-slate-900">Windows Agent Live Event Simulator</h2>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          Test real-time event transmission, session calculation, and dashboard synchronization directly from your browser.
        </p>

        {simSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-xs flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{simSuccess}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Select Target Device</label>
            <select
              value={selectedSimDevice}
              onChange={(e) => setSelectedSimDevice(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-600"
            >
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.deviceName} ({d.deviceId})
                </option>
              ))}
              <option value="PC-001">PC-001 (New Default Workstation)</option>
              <option value="PC-002">PC-002 (Secondary Laptop)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">System Event Type</label>
            <select
              value={selectedSimEvent}
              onChange={(e) => setSelectedSimEvent(e.target.value as EventType)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-600"
            >
              <option value="STARTUP">STARTUP (Cold Boot)</option>
              <option value="UNLOCK">UNLOCK (User Unlocked PC)</option>
              <option value="LOCK">LOCK (User Locked Screen)</option>
              <option value="SLEEP">SLEEP (Entered Power Save)</option>
              <option value="WAKE">WAKE (Resumed from Sleep)</option>
              <option value="SHUTDOWN">SHUTDOWN (Power Off)</option>
              <option value="RESTART">RESTART (Reboot)</option>
              <option value="ACTIVE">ACTIVE (User Activity)</option>
              <option value="IDLE">IDLE (Inactivity Detected)</option>
            </select>
          </div>

          <button
            onClick={handleSimulateEvent}
            disabled={simulating}
            className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium text-xs transition disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{simulating ? 'Transmitting Event...' : 'Transmit System Event'}</span>
          </button>

        </div>
      </div>

    </div>
  );
};
