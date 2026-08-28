import React, { useState } from 'react';
import { SystemEvent, Device, EventType } from '../types';
import { Activity, Laptop, Filter, Search, Shield, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { fetchDeviceDiagnostics } from '../lib/dataService';
import { formatToIST } from '../lib/dateUtils';

interface SystemEventsViewProps {
  events: SystemEvent[];
  devices: Device[];
  userUid?: string;
}

export function formatEventDateTime(timestampStr: string): string {
  return formatToIST(timestampStr);
}

export const SystemEventsView: React.FC<SystemEventsViewProps> = ({ events, devices, userUid }) => {
  const [selectedDevice, setSelectedDevice] = useState<string>('ALL');
  const [selectedEventType, setSelectedEventType] = useState<string>('ALL');
  const [selectedDate, setSelectedDate] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [diagOpen, setDiagOpen] = useState<boolean>(false);
  const [diagData, setDiagData] = useState<any | null>(null);
  const [diagLoading, setDiagLoading] = useState<boolean>(false);

  // Extract unique dates from events
  const uniqueDates = Array.from(
    new Set(
      events.map((e) => {
        const t = e.timestamp || '';
        return t.substring(0, 10);
      }).filter(Boolean)
    )
  ).sort().reverse();

  const filteredEvents = events.filter((e) => {
    if (selectedDevice !== 'ALL' && e.deviceId !== selectedDevice) return false;
    if (selectedEventType !== 'ALL' && e.eventType !== selectedEventType) return false;
    if (selectedDate !== 'ALL' && !e.timestamp.startsWith(selectedDate)) return false;
    if (
      searchQuery &&
      !e.deviceName.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !e.eventType.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !e.eventId.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !e.timestamp.includes(searchQuery)
    ) {
      return false;
    }
    return true;
  });

  const totalPages = Math.ceil(filteredEvents.length / pageSize) || 1;
  const paginatedEvents = filteredEvents.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const runDiagnostics = async () => {
    setDiagLoading(true);
    const targetUid = userUid || events[0]?.uid || '';
    const targetDeviceId = selectedDevice !== 'ALL' ? selectedDevice : (devices[0]?.deviceId || '');
    const data = await fetchDeviceDiagnostics(targetUid, targetDeviceId);
    setDiagData(data);
    setDiagLoading(false);
    setDiagOpen(true);
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
            <Activity className="w-5 h-5 text-blue-600" />
            <span>System Events Log</span>
          </h1>
          <p className="text-xs text-slate-500">
            Chronological audit log of raw Windows system events captured automatically.
          </p>
        </div>
        <button
          onClick={runDiagnostics}
          disabled={diagLoading}
          className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${diagLoading ? 'animate-spin' : ''}`} />
          <span>{diagLoading ? 'Running...' : 'Run Device Event Diagnostics'}</span>
        </button>
      </div>

      {/* Diagnostics Drawer / Modal */}
      {diagOpen && diagData?.report && (
        <div className="bg-slate-950 text-slate-100 rounded-2xl p-5 border border-slate-800 space-y-4 shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Diagnostic Report: diagnoseDeviceEvents({diagData.report.uid}, {diagData.report.deviceId})
              </span>
            </div>
            <button
              onClick={() => setDiagOpen(false)}
              className="text-xs text-slate-400 hover:text-white px-2 py-1 bg-slate-800 rounded"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-900 p-3 rounded-xl">
              <div className="text-[10px] text-slate-400 uppercase font-bold">Total Events</div>
              <div className="text-base font-bold text-emerald-400 mt-0.5">{diagData.report.totalEvents}</div>
            </div>
            <div className="bg-slate-900 p-3 rounded-xl">
              <div className="text-[10px] text-slate-400 uppercase font-bold">Earliest Event</div>
              <div className="text-[11px] font-mono text-slate-300 mt-0.5 truncate">{diagData.report.earliestEvent ? formatEventDateTime(diagData.report.earliestEvent) : 'None'}</div>
            </div>
            <div className="bg-slate-900 p-3 rounded-xl">
              <div className="text-[10px] text-slate-400 uppercase font-bold">Latest Event</div>
              <div className="text-[11px] font-mono text-emerald-300 mt-0.5 truncate">{diagData.report.latestEvent ? formatEventDateTime(diagData.report.latestEvent) : 'None'}</div>
            </div>
            <div className="bg-slate-900 p-3 rounded-xl">
              <div className="text-[10px] text-slate-400 uppercase font-bold">21-08 Event In Firestore</div>
              <div className="text-xs font-bold text-emerald-400 mt-0.5">
                {diagData.report.targetEventSearch?.foundInSystemEvents ? 'FOUND (evt_147b82e9461c4ea9b7ad1ef7450d0c65)' : 'PENDING'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
              <span className="text-slate-400 font-mono">18-08-2026: </span>
              <span className="font-bold text-white">{diagData.report.dateCounts['18-08-2026']} events</span>
            </div>
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
              <span className="text-slate-400 font-mono">19-08-2026: </span>
              <span className="font-bold text-white">{diagData.report.dateCounts['19-08-2026']} events</span>
            </div>
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
              <span className="text-slate-400 font-mono">20-08-2026: </span>
              <span className="font-bold text-white">{diagData.report.dateCounts['20-08-2026']} events</span>
            </div>
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
              <span className="text-slate-400 font-mono">21-08-2026: </span>
              <span className="font-bold text-emerald-400">{diagData.report.dateCounts['21-08-2026']} events</span>
            </div>
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-4 gap-4 shadow-sm">
        
        {/* Device Filter */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Filter by Device</label>
          <select
            value={selectedDevice}
            onChange={(e) => { setSelectedDevice(e.target.value); setCurrentPage(1); }}
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-600"
          >
            <option value="ALL">All Devices ({devices.length})</option>
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.deviceName} ({d.deviceId})
              </option>
            ))}
          </select>
        </div>

        {/* Event Type Filter */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Event Type</label>
          <select
            value={selectedEventType}
            onChange={(e) => { setSelectedEventType(e.target.value); setCurrentPage(1); }}
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-600"
          >
            <option value="ALL">All Event Types</option>
            <option value="STARTUP">STARTUP</option>
            <option value="SHUTDOWN">SHUTDOWN</option>
            <option value="RESTART">RESTART</option>
            <option value="LOCK">LOCK</option>
            <option value="UNLOCK">UNLOCK</option>
            <option value="SLEEP">SLEEP</option>
            <option value="WAKE">WAKE</option>
            <option value="LOGIN">LOGIN</option>
            <option value="LOGOUT">LOGOUT</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="IDLE">IDLE</option>
          </select>
        </div>

        {/* Date Filter */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Filter by Date</label>
          <select
            value={selectedDate}
            onChange={(e) => { setSelectedDate(e.target.value); setCurrentPage(1); }}
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-600"
          >
            <option value="ALL">All Dates ({uniqueDates.length})</option>
            {uniqueDates.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        {/* Search Input */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Search Events</label>
          <div className="relative">
            <input
              type="text"
              placeholder="Search event ID / OS / timestamp..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-600"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>
        </div>

      </div>

      {/* Events Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-slate-800">System Events Stream ({filteredEvents.length} total)</span>
            <span className="text-[11px] text-slate-500 font-medium">
              Showing page {currentPage} of {totalPages}
            </span>
          </div>
          <div className="flex items-center space-x-3">
            <span className="text-[11px] text-slate-500 flex items-center space-x-1">
              <Shield className="w-3 h-3 text-emerald-600 inline" />
              <span>Read-Only / Immutable Security Audit Log</span>
            </span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="bg-slate-50 border border-slate-300 rounded px-2 py-1 text-[11px] text-slate-700"
            >
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider font-bold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Timestamp (IST)</th>
                <th className="px-4 py-3">Event Type</th>
                <th className="px-4 py-3">Device Name</th>
                <th className="px-4 py-3">Device ID</th>
                <th className="px-4 py-3">Event ID</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Agent Version</th>
                <th className="px-4 py-3">Synced At (IST)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {paginatedEvents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500 font-medium">
                    No usage activity recorded yet for selected filter criteria.
                  </td>
                </tr>
              ) : (
                paginatedEvents.map((evt) => (
                  <tr key={evt.eventId} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-semibold text-slate-900 font-mono">
                      {formatEventDateTime(evt.timestamp)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded border ${
                          ['STARTUP', 'WAKE', 'UNLOCK', 'LOGIN', 'ACTIVE'].includes(evt.eventType)
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : ['LOCK', 'SLEEP', 'IDLE'].includes(evt.eventType)
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {evt.eventType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-800 font-medium flex items-center space-x-1.5">
                      <Laptop className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>{evt.deviceName}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">{evt.deviceId}</td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-[10px] truncate max-w-[140px]" title={evt.eventId}>
                      {evt.eventId}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{evt.source || 'WindowsEventWatcher'}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">{evt.agentVersion}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">
                      {evt.syncedAt ? formatEventDateTime(evt.syncedAt) : 'N/A'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Navigation */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-slate-200 flex items-center justify-between text-xs bg-slate-50">
            <span className="text-slate-500">
              Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredEvents.length)} of {filteredEvents.length} events
            </span>
            <div className="flex items-center space-x-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronLeft className="w-3.5 h-3.5 inline mr-1" />
                Previous
              </button>
              <span className="px-2 py-1 font-bold text-slate-700 font-mono">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5 inline ml-1" />
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};
