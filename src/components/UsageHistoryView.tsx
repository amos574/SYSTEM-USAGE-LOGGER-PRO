import React, { useState, useEffect, useMemo } from 'react';
import { UsageSession, Device, SystemEvent, UserProfile } from '../types';
import { Clock, Calendar, Laptop, Search, RefreshCw, Activity, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { recalculateSessionsForUser } from '../lib/dataService';
import { computeSessionsFromEvents } from '../services/sessionCalculator';
import { formatTimeToIST, formatToIST } from '../lib/dateUtils';

interface UsageHistoryViewProps {
  user?: UserProfile | null;
  sessions: UsageSession[];
  devices: Device[];
  events?: SystemEvent[];
}

export const UsageHistoryView: React.FC<UsageHistoryViewProps> = ({
  user,
  sessions,
  devices,
  events = [],
}) => {
  const [selectedDevice, setSelectedDevice] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [isRecalculating, setIsRecalculating] = useState<boolean>(false);
  const [recalcStatus, setRecalcStatus] = useState<string>('');
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(Date.now());

  // 1-second dynamic clock tick to keep ongoing active sessions updated live
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  // Filter real events (excluding simulated test node artifacts)
  const realEvents = useMemo(() => {
    return events.filter((e) => {
      if (!e || !e.deviceId) return false;
      const devId = String(e.deviceId);
      const devName = String(e.deviceName || '');
      return (
        !devId.startsWith('dev_verify_') &&
        !devId.startsWith('dev_temp_test_') &&
        devName !== 'Verification Test Node' &&
        devName !== 'Temp Permission Check'
      );
    });
  }, [events]);

  // Helper to determine if an open session is genuinely ongoing or timed out
  const isSessionGenuinelyOngoing = (sess: UsageSession | null | undefined): boolean => {
    if (!sess) return false;
    if (sess.endTime || sess.status === 'COMPLETED' || sess.status === 'LOCKED' || sess.status === 'SLEEPING' || sess.status === 'OFFLINE_TIMEOUT') {
      return false;
    }
    const lastActiveTime = sess.lastHeartbeat || sess.updatedAt || sess.startTime;
    const lastActiveMs = new Date(lastActiveTime).getTime();
    const timeSinceLastActiveMs = currentTimeMs - lastActiveMs;
    if (timeSinceLastActiveMs > 5 * 60 * 1000) {
      return false;
    }
    const dev = devices.find((d) => d.deviceId === sess.deviceId);
    if (dev) {
      const devLastSeenMs = dev.lastSeen ? new Date(dev.lastSeen).getTime() : 0;
      const isRecent = currentTimeMs - devLastSeenMs <= 3 * 60 * 1000;
      if (!dev.isOnline && !isRecent) {
        return false;
      }
    }
    return true;
  };

  // Compute or merge sessions with live ongoing time calculation & 5-minute timeout clamping
  const computedSessions = useMemo(() => {
    if (realEvents.length > 0) {
      return computeSessionsFromEvents(realEvents, currentTimeMs);
    }
    return sessions
      .filter((s) => {
        if (!s || !s.deviceId) return false;
        const devId = String(s.deviceId);
        const devName = String(s.deviceName || '');
        return (
          !devId.startsWith('dev_verify_') &&
          !devId.startsWith('dev_temp_test_') &&
          devName !== 'Verification Test Node'
        );
      })
      .map((s) => {
        if (!s.endTime || s.status === 'ACTIVE') {
          const startMs = new Date(s.startTime).getTime();
          const lastHb = s.lastHeartbeat || s.updatedAt || s.startTime;
          const lastHbMs = new Date(lastHb).getTime();
          const gapMs = currentTimeMs - lastHbMs;

          if (gapMs > 5 * 60 * 1000) {
            const endMs = (startMs === lastHbMs) ? startMs + 60000 : lastHbMs;
            const durMins = Math.max(1, Math.round((endMs - startMs) / 60000));
            const endIso = new Date(endMs).toISOString();
            return {
              ...s,
              endTime: endIso,
              shutdownTime: endIso,
              durationMinutes: durMins,
              durationMins: durMins,
              durationHours: Number((durMins / 60).toFixed(2)),
              activeMinutes: Math.max(1, Math.min(durMins, s.activeMinutes || durMins)),
              status: 'OFFLINE_TIMEOUT',
            };
          } else {
            const liveDurMins = Math.max(1, Math.round((currentTimeMs - startMs) / 60000));
            return {
              ...s,
              endTime: null,
              shutdownTime: null,
              durationMinutes: liveDurMins,
              durationMins: liveDurMins,
              durationHours: Number((liveDurMins / 60).toFixed(2)),
              activeMinutes: liveDurMins,
              status: 'ACTIVE',
            };
          }
        }
        return s;
      });
  }, [realEvents, sessions, currentTimeMs]);

  // Latest event and session for developer diagnostics
  const sortedEvents = useMemo(() => {
    return realEvents.slice().sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [realEvents]);
  const latestEvent = sortedEvents[0] || null;

  const sortedSessions = useMemo(() => {
    return computedSessions.slice().sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );
  }, [computedSessions]);
  const latestSession = sortedSessions[0] || null;

  // Filter sessions according to UI selection
  const filteredSessions = useMemo(() => {
    return computedSessions.filter((s) => {
      if (selectedDevice !== 'ALL' && s.deviceId !== selectedDevice && s.deviceName !== selectedDevice) {
        return false;
      }
      if (selectedMonth !== 'ALL' && !s.date.startsWith(selectedMonth)) {
        return false;
      }
      if (
        searchQuery &&
        !s.deviceName.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !s.deviceId.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !s.date.includes(searchQuery)
      ) {
        return false;
      }
      return true;
    });
  }, [computedSessions, selectedDevice, selectedMonth, searchQuery]);

  const totalDurationMinutes = filteredSessions.reduce((acc, s) => acc + s.durationMinutes, 0);
  const totalActiveMinutes = filteredSessions.reduce((acc, s) => acc + s.activeMinutes, 0);
  const totalLockMinutes = filteredSessions.reduce((acc, s) => acc + s.lockMinutes, 0);
  const totalSleepMinutes = filteredSessions.reduce((acc, s) => acc + (s.sleepMinutes || 0), 0);

  const handleRecalculate = async () => {
    if (!user?.uid) return;
    setIsRecalculating(true);
    setRecalcStatus('Recalculating sessions from live system events...');
    try {
      // Trigger server recalculation first
      await fetch('/api/agent/recalculate-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user.uid }),
      });
      // Also update client side cache
      await recalculateSessionsForUser(user.uid);
      setRecalcStatus('Sessions successfully derived and updated!');
      setTimeout(() => setRecalcStatus(''), 4000);
    } catch (err: any) {
      setRecalcStatus('Recalculation error: ' + (err.message || 'Unknown'));
    } finally {
      setIsRecalculating(false);
    }
  };

  const currentYearMonth = new Date().toISOString().substring(0, 7);

  const isLatestOngoing = isSessionGenuinelyOngoing(latestSession);

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
            <Clock className="w-5 h-5 text-blue-600" />
            <span>Usage History & Sessions</span>
          </h1>
          <p className="text-xs text-slate-500">
            Calculated computer sessions derived automatically from live system event state transitions (STARTUP, ACTIVE, LOCK, UNLOCK, SLEEP, WAKE, SHUTDOWN).
          </p>
        </div>
        <button
          id="btn-recalculate-sessions"
          onClick={handleRecalculate}
          disabled={isRecalculating}
          className="inline-flex items-center space-x-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRecalculating ? 'animate-spin' : ''}`} />
          <span>{isRecalculating ? 'Deriving Sessions...' : 'Recalculate Sessions'}</span>
        </button>
      </div>

      {recalcStatus && (
        <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
          <span>{recalcStatus}</span>
        </div>
      )}

      {/* Developer Diagnostic Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 text-white shadow-md">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-white tracking-wide uppercase">
              Event-to-Session Calculation Diagnostics
            </span>
          </div>
          <span className="text-[10px] bg-slate-800 text-slate-300 font-mono px-2 py-0.5 rounded">
            Live Device Trace
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          
          {/* LIVE EVENT COUNT */}
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">LIVE EVENT COUNT</div>
            <div className="text-base font-bold text-white font-mono mt-0.5">{realEvents.length}</div>
          </div>

          {/* LAST EVENT TYPE */}
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">LAST EVENT TYPE</div>
            <div className="text-base font-bold text-emerald-400 font-mono mt-0.5">
              {latestEvent?.eventType || 'N/A'}
            </div>
          </div>

          {/* LAST EVENT TIMESTAMP */}
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">LAST EVENT TIMESTAMP (IST)</div>
            <div className="text-[11px] font-medium text-slate-300 font-mono truncate mt-0.5" title={latestEvent?.timestamp || 'N/A'}>
              {latestEvent?.timestamp ? formatTimeToIST(latestEvent.timestamp) : 'N/A'}
            </div>
          </div>

          {/* LAST EVENT DEVICE ID */}
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">LAST EVENT DEVICE ID</div>
            <div className="text-base font-bold text-blue-400 font-mono mt-0.5">
              {latestEvent?.deviceId || 'N/A'}
            </div>
          </div>

          {/* SESSION COUNT */}
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">SESSION COUNT</div>
            <div className="text-base font-bold text-amber-400 font-mono mt-0.5">{computedSessions.length}</div>
          </div>

          {/* LAST SESSION START */}
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">LAST SESSION START (IST)</div>
            <div className="text-[11px] font-medium text-slate-300 font-mono truncate mt-0.5">
              {latestSession?.startTime ? formatTimeToIST(latestSession.startTime) : 'N/A'}
            </div>
          </div>

          {/* LAST SESSION END */}
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">LAST SESSION END (IST)</div>
            <div className="text-[11px] font-medium font-mono truncate mt-0.5">
              {isLatestOngoing ? (
                <span className="text-emerald-400 font-bold inline-flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block mr-1"></span>
                  Ongoing
                </span>
              ) : latestSession ? (
                <span className="text-slate-300" title={latestSession.endTime || latestSession.lastHeartbeat || latestSession.startTime}>
                  {formatTimeToIST(latestSession.endTime || (latestSession.lastHeartbeat && latestSession.lastHeartbeat !== latestSession.startTime ? latestSession.lastHeartbeat : latestSession.startTime))}
                </span>
              ) : (
                <span className="text-slate-400">—</span>
              )}
            </div>
          </div>

          {/* ACTIVE DURATION */}
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ACTIVE DURATION</div>
            <div className="text-base font-bold text-emerald-400 font-mono mt-0.5">
              {latestSession ? `${latestSession.activeMinutes} min` : '0 min'}
            </div>
          </div>

          {/* LOCKED DURATION */}
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">LOCKED DURATION</div>
            <div className="text-base font-bold text-amber-400 font-mono mt-0.5">
              {latestSession ? `${latestSession.lockMinutes} min` : '0 min'}
            </div>
          </div>

          {/* SLEEP DURATION */}
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">SLEEP DURATION</div>
            <div className="text-base font-bold text-indigo-400 font-mono mt-0.5">
              {latestSession ? `${latestSession.sleepMinutes || 0} min` : '0 min'}
            </div>
          </div>

        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 shadow-sm">
        
        {/* Device Filter */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Filter by Device</label>
          <select
            id="select-filter-device"
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
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

        {/* Month Filter */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-semibold text-slate-700">Filter by Month</label>
            {selectedMonth !== 'ALL' && (
              <button
                onClick={() => setSelectedMonth('ALL')}
                className="text-[10px] text-blue-600 hover:underline font-semibold"
              >
                Clear (Show All)
              </button>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <input
              id="input-filter-month"
              type="month"
              value={selectedMonth === 'ALL' ? '' : selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value || 'ALL')}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-600"
            />
            {selectedMonth !== currentYearMonth && (
              <button
                type="button"
                onClick={() => setSelectedMonth(currentYearMonth)}
                className="shrink-0 px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold transition"
                title="Filter to current month"
              >
                This Month
              </button>
            )}
          </div>
        </div>

        {/* Search */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Search Date / Device</label>
          <div className="relative">
            <input
              id="input-filter-search"
              type="text"
              placeholder="Search date, device ID, or session..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-600"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>
        </div>

      </div>

      {/* Summary Chips */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 p-4 rounded-2xl text-xs space-y-1 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Filtered Runtime</div>
          <div className="text-xl font-bold text-slate-900">
            {(totalDurationMinutes / 60).toFixed(1)} <span className="text-xs font-normal text-slate-400">hours ({totalDurationMinutes}m)</span>
          </div>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl text-xs space-y-1 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Active Time</div>
          <div className="text-xl font-bold text-emerald-600">
            {(totalActiveMinutes / 60).toFixed(1)} <span className="text-xs font-normal text-slate-400">hours ({totalActiveMinutes}m)</span>
          </div>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl text-xs space-y-1 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Locked Duration</div>
          <div className="text-xl font-bold text-amber-600">
            {(totalLockMinutes / 60).toFixed(1)} <span className="text-xs font-normal text-slate-400">hours ({totalLockMinutes}m)</span>
          </div>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl text-xs space-y-1 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Sleep Duration</div>
          <div className="text-xl font-bold text-indigo-600">
            {(totalSleepMinutes / 60).toFixed(1)} <span className="text-xs font-normal text-slate-400">hours ({totalSleepMinutes}m)</span>
          </div>
        </div>
      </div>

      {/* Sessions Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800">Usage Sessions Log ({filteredSessions.length})</span>
          <span className="text-[11px] text-slate-400">Derived from live Windows Agent system events</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider font-bold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Device Name</th>
                <th className="px-4 py-3">Start Time (IST)</th>
                <th className="px-4 py-3">End Time (IST)</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3">Locked</th>
                <th className="px-4 py-3">Sleep</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredSessions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500 font-medium">
                    No usage activity recorded yet.
                  </td>
                </tr>
              ) : (
                filteredSessions.map((sess) => {
                  const isOngoing = isSessionGenuinelyOngoing(sess);
                  const resolvedEndTime = isOngoing
                    ? null
                    : (sess.endTime || (sess.lastHeartbeat && sess.lastHeartbeat !== sess.startTime ? sess.lastHeartbeat : sess.startTime));

                  return (
                    <tr key={sess.sessionId} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 font-semibold text-slate-900">{sess.date}</td>
                      <td className="px-4 py-3 font-medium text-blue-700 flex items-center space-x-1.5">
                        <Laptop className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>{sess.deviceName} ({sess.deviceId})</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-mono">
                        {formatTimeToIST(sess.startTime)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-mono">
                        {isOngoing ? (
                          <span className="inline-flex items-center space-x-1.5 text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span>Ongoing</span>
                          </span>
                        ) : resolvedEndTime ? (
                          formatTimeToIST(resolvedEndTime)
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-900">
                        {sess.durationMinutes} mins
                        {isOngoing && <span className="text-[10px] text-emerald-600 font-normal ml-1">(live)</span>}
                      </td>
                      <td className="px-4 py-3 text-emerald-600 font-semibold">{sess.activeMinutes} mins</td>
                      <td className="px-4 py-3 text-amber-600">{sess.lockMinutes} mins</td>
                      <td className="px-4 py-3 text-indigo-600">{sess.sleepMinutes || 0} mins</td>
                      <td className="px-4 py-3">
                        {isOngoing ? (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center space-x-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping mr-1"></span>
                            ACTIVE
                          </span>
                        ) : sess.status === 'OFFLINE_TIMEOUT' ? (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-300">
                            OFFLINE TIMEOUT
                          </span>
                        ) : sess.status === 'LOCKED' ? (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                            LOCKED
                          </span>
                        ) : sess.status === 'SLEEPING' ? (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                            SLEEPING
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                            COMPLETED
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

