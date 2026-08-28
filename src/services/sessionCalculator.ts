import { SystemEvent, UsageSession } from '../types';
import { formatTimeToIST } from '../lib/dateUtils';

/**
 * Terminating event types that definitively close a Windows session.
 */
export const TERMINATING_EVENT_TYPES = ['SHUTDOWN', 'LOGOUT', 'RESTART', 'LOCK', 'SLEEP'] as const;

/**
 * Active event types that indicate ongoing user interaction.
 */
export const ACTIVE_EVENT_TYPES = ['STARTUP', 'ACTIVE', 'UNLOCK', 'WAKE', 'LOGIN'] as const;

/**
 * Calculates and aggregates SystemEvents into UsageSessions with accurate open/ongoing handling.
 * 
 * Rules:
 * 1. Ongoing Active Sessions:
 *    - If the most recent event is STARTUP or ACTIVE (or UNLOCK/WAKE/LOGIN), and no closing event
 *      (LOCK, SLEEP, SHUTDOWN, LOGOUT, RESTART) has occurred:
 *      - endTime = null
 *      - status = 'ACTIVE'
 *      - duration = dynamic difference from startTimestamp to current clock.
 * 2. Session Closure:
 *    - Only set a definitive endTime when a terminating event arrives (LOCK, SLEEP, SHUTDOWN, etc.)
 *      or when a new session trigger arrives.
 */
export function computeSessionsFromEvents(
  events: SystemEvent[],
  nowTimeMs: number = Date.now()
): UsageSession[] {
  if (!events || events.length === 0) return [];

  // Group events by deviceId (excluding test mock artifacts)
  const deviceEventsMap: Record<string, SystemEvent[]> = {};
  for (const evt of events) {
    if (!evt || !evt.deviceId) continue;
    const devId = String(evt.deviceId);
    const devName = String(evt.deviceName || '');
    if (
      devId.startsWith('dev_verify_') ||
      devId.startsWith('dev_temp_test_') ||
      devName === 'Verification Test Node' ||
      devName === 'Temp Permission Check'
    ) {
      continue;
    }
    if (!deviceEventsMap[devId]) deviceEventsMap[devId] = [];
    deviceEventsMap[devId].push(evt);
  }

  const resultSessions: UsageSession[] = [];

  for (const devId of Object.keys(deviceEventsMap)) {
    const rawEvts = deviceEventsMap[devId];
    // Sort strictly chronological ascending
    const devEvts = rawEvts.slice().sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    if (devEvts.length === 0) continue;

    let currentSessionEvents: SystemEvent[] = [];

    for (let i = 0; i < devEvts.length; i++) {
      const e = devEvts[i];
      const prevE = currentSessionEvents[currentSessionEvents.length - 1];

      let isNewSessionTrigger = false;
      if (currentSessionEvents.length === 0) {
        isNewSessionTrigger = true;
      } else if (e.eventType === 'STARTUP') {
        isNewSessionTrigger = true;
      } else if (prevE) {
        const prevT = new Date(prevE.timestamp).getTime();
        const currT = new Date(e.timestamp).getTime();
        const gapHours = (currT - prevT) / (1000 * 60 * 60);

        if (['SHUTDOWN', 'RESTART', 'LOGOUT'].includes(prevE.eventType)) {
          isNewSessionTrigger = true;
        } else if (gapHours >= 4 && ['STARTUP', 'WAKE', 'UNLOCK', 'LOGIN', 'ACTIVE'].includes(e.eventType)) {
          isNewSessionTrigger = true;
        }
      }

      if (isNewSessionTrigger && currentSessionEvents.length > 0) {
        // This is a closed historical session preceding a new session trigger
        const sess = buildSessionFromEventList(currentSessionEvents, false, nowTimeMs);
        if (sess) resultSessions.push(sess);
        currentSessionEvents = [];
      }

      currentSessionEvents.push(e);
    }

    if (currentSessionEvents.length > 0) {
      // The latest event cluster for this device — could be actively ongoing!
      const sess = buildSessionFromEventList(currentSessionEvents, true, nowTimeMs);
      if (sess) resultSessions.push(sess);
    }
  }

  // Sort descending by startTime so newest sessions are at the top
  resultSessions.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  return resultSessions;
}

export function buildSessionFromEventList(
  evts: SystemEvent[],
  isLatestCluster: boolean = false,
  nowTimeMs: number = Date.now()
): UsageSession | null {
  if (evts.length === 0) return null;

  const first = evts[0];
  const last = evts[evts.length - 1];
  const devId = first.deviceId;
  const devName = first.deviceName || 'Windows Workstation';
  const uid = first.uid;

  const startMs = new Date(first.timestamp).getTime();
  const lastEventMs = new Date(last.timestamp).getTime();

  // Check if the last event is a terminating event
  const isTerminated = (TERMINATING_EVENT_TYPES as readonly string[]).includes(last.eventType);

  // Inactive gap check: If the last event is older than 3 minutes (180,000 ms), the session is timed out
  const timeSinceLastEventMs = nowTimeMs - lastEventMs;
  const isWithinActiveWindow = timeSinceLastEventMs <= 3 * 60 * 1000;

  // An event cluster is ONLY ongoing if it is the latest cluster, not terminated, AND recent (<= 3 min)
  const isOngoing = isLatestCluster && !isTerminated && isWithinActiveWindow;

  // If latest cluster has not terminated but has timed out (> 3 min of silence), mark as OFFLINE_TIMEOUT
  const isOfflineTimeout = isLatestCluster && !isTerminated && !isWithinActiveWindow;

  // Effective end time for duration metrics:
  // - If genuinely ongoing: current time
  // - If timed out: last event time (or +1 min if single event)
  // - If closed: last event time
  let effectiveEndMs = lastEventMs;
  if (isOngoing) {
    effectiveEndMs = Math.max(lastEventMs, nowTimeMs);
  } else if (isOfflineTimeout) {
    effectiveEndMs = (startMs === lastEventMs) ? startMs + 60000 : lastEventMs;
  }

  let activeSec = 0;
  let lockSec = 0;
  let sleepSec = 0;
  let idleSec = 0;

  let currentState = first.eventType;
  let stateStartMs = startMs;

  for (let i = 1; i < evts.length; i++) {
    const e = evts[i];
    const currMs = new Date(e.timestamp).getTime();
    const deltaSec = Math.max(0, (currMs - stateStartMs) / 1000);

    if (['ACTIVE', 'STARTUP', 'UNLOCK', 'WAKE', 'LOGIN'].includes(currentState)) {
      activeSec += deltaSec;
    } else if (['LOCK'].includes(currentState)) {
      lockSec += deltaSec;
    } else if (['SLEEP'].includes(currentState)) {
      sleepSec += deltaSec;
    } else if (['IDLE'].includes(currentState)) {
      idleSec += deltaSec;
    }

    currentState = e.eventType;
    stateStartMs = currMs;
  }

  // Add the trailing duration from the last recorded event to effectiveEndMs if ongoing
  if (isOngoing) {
    const trailingSec = Math.max(0, (effectiveEndMs - lastEventMs) / 1000);
    if (trailingSec > 0) {
      if (['ACTIVE', 'STARTUP', 'UNLOCK', 'WAKE', 'LOGIN'].includes(currentState)) {
        activeSec += trailingSec;
      } else if (['LOCK'].includes(currentState)) {
        lockSec += trailingSec;
      } else if (['SLEEP'].includes(currentState)) {
        sleepSec += trailingSec;
      } else if (['IDLE'].includes(currentState)) {
        idleSec += trailingSec;
      }
    }
  }

  // If session is a single event or initial startup with 0 elapsed time
  const totalElapsedSec = Math.max(0, (effectiveEndMs - startMs) / 1000);
  if (totalElapsedSec === 0 && evts.length === 1 && !isOngoing) {
    if (['LOCK'].includes(currentState)) lockSec = 60;
    else if (['SLEEP'].includes(currentState)) sleepSec = 60;
    else activeSec = 60;
  }

  const durationMinutes = Math.max(1, Math.round((effectiveEndMs - startMs) / (1000 * 60)));
  const activeMinutes = Math.max(activeSec > 0 ? 1 : 0, Math.round(activeSec / 60));
  const lockMinutes = Math.round(lockSec / 60);
  const sleepMinutes = Math.round(sleepSec / 60);
  const idleMinutes = Math.round(idleSec / 60);

  const sessionId = `sess_${devId}_${first.timestamp.substring(0, 10)}_${startMs}`;
  const dateStr = first.timestamp.substring(0, 10);
  const nowIso = new Date(nowTimeMs).toISOString();

  let finalStatus = 'ACTIVE';
  let resolvedEndTime: string | null = null;

  if (isOngoing) {
    finalStatus = 'ACTIVE';
    resolvedEndTime = null;
  } else if (isOfflineTimeout) {
    finalStatus = 'OFFLINE_TIMEOUT';
    resolvedEndTime = new Date(effectiveEndMs).toISOString();
  } else {
    // Terminated normally
    resolvedEndTime = last.timestamp;
    if (['SHUTDOWN', 'LOGOUT', 'RESTART'].includes(last.eventType)) {
      finalStatus = 'COMPLETED';
    } else if (last.eventType === 'LOCK') {
      finalStatus = 'LOCKED';
    } else if (last.eventType === 'SLEEP') {
      finalStatus = 'SLEEPING';
    } else {
      finalStatus = 'COMPLETED';
    }
  }

  return {
    sessionId,
    uid,
    userId: uid,
    deviceId: devId,
    deviceName: devName,
    startTime: first.timestamp,
    endTime: resolvedEndTime,
    startupTime: first.timestamp,
    shutdownTime: resolvedEndTime,
    lastHeartbeat: last.timestamp,
    durationMinutes,
    durationHours: Number((durationMinutes / 60).toFixed(2)),
    activeMinutes: Math.max(1, activeMinutes || durationMinutes),
    idleMinutes,
    lockMinutes,
    sleepMinutes,
    eventCount: evts.length,
    date: dateStr,
    status: finalStatus,
    calculatedAt: nowIso,
    ...(first.testRunId ? { testRunId: first.testRunId } : {}),
  };
}

/**
 * Live duration and formatting helper with staleness check (IST)
 */
export function formatSessionEndTime(
  endTime: string | null | undefined,
  status?: string,
  lastHeartbeat?: string | null,
  nowTimeMs: number = Date.now()
): string {
  if (!endTime || status === 'ACTIVE') {
    if (lastHeartbeat) {
      const lastHbMs = new Date(lastHeartbeat).getTime();
      if (nowTimeMs - lastHbMs > 5 * 60 * 1000) {
        return formatTimeToIST(new Date(lastHbMs).toISOString());
      }
    }
    return 'Ongoing';
  }
  try {
    return formatTimeToIST(endTime);
  } catch {
    return '—';
  }
}

/**
 * Pure calculation helper to evaluate or update a session given an incoming heartbeat or event.
 */
export interface SessionResolutionResult {
  action: 'CREATED' | 'EXTENDED' | 'CLOSED' | 'TIMEOUT_CLOSED';
  session: UsageSession;
}

export function resolveSessionLifecycle(
  openSession: UsageSession | null,
  deviceId: string,
  uid: string,
  eventType: string = 'ACTIVE',
  currentTimestamp: string = new Date().toISOString(),
  deviceName: string = 'DELL'
): SessionResolutionResult {
  const nowIso = currentTimestamp;
  const nowMs = new Date(nowIso).getTime();
  const normEventType = (eventType || 'ACTIVE').toUpperCase().trim();
  const isClosureEvent = ['LOCK', 'SLEEP', 'SHUTDOWN', 'LOGOUT', 'RESTART'].includes(normEventType);

  // 1. Check for Ghost/Crash Timeout on open session (> 5 minutes without heartbeat or event)
  if (openSession && (!openSession.endTime || openSession.status === 'ACTIVE')) {
    const lastHb = openSession.lastHeartbeat || openSession.updatedAt || openSession.startTime;
    const lastHbMs = new Date(lastHb).getTime();
    const gapMs = nowMs - lastHbMs;

    if (gapMs > 5 * 60 * 1000) {
      // Session timed out - auto-close at lastHeartbeat (or start + 1 min)
      const startMs = new Date(openSession.startTime).getTime();
      const endMs = (startMs === lastHbMs) ? startMs + 60000 : lastHbMs;
      const durMins = Math.max(1, Math.round((endMs - startMs) / 60000));
      const endIso = new Date(endMs).toISOString();

      const closedSession: UsageSession = {
        ...openSession,
        endTime: endIso,
        shutdownTime: endIso,
        durationMinutes: durMins,
        durationMins: durMins,
        durationHours: Number((durMins / 60).toFixed(2)),
        activeMinutes: Math.max(1, Math.min(durMins, Math.round(durMins * 0.9))),
        status: 'OFFLINE_TIMEOUT',
        updatedAt: nowIso,
      };

      return {
        action: 'TIMEOUT_CLOSED',
        session: closedSession,
      };
    }
  }

  // 2. Case A: Natural Session Closure Events (LOCK, SLEEP, SHUTDOWN, LOGOUT, RESTART)
  if (isClosureEvent) {
    if (openSession) {
      const startMs = new Date(openSession.startTime).getTime();
      const endMs = nowMs;
      const durationMins = Math.max(1, Math.round((endMs - startMs) / 60000));
      let finalStatus = 'COMPLETED';
      if (normEventType === 'LOCK') finalStatus = 'LOCKED';
      else if (normEventType === 'SLEEP') finalStatus = 'SLEEPING';

      const updatedSession: UsageSession = {
        ...openSession,
        endTime: nowIso,
        shutdownTime: nowIso,
        durationMinutes: durationMins,
        durationMins: durationMins,
        durationHours: Number((durationMins / 60).toFixed(2)),
        activeMinutes: Math.max(1, durationMins),
        status: finalStatus,
        updatedAt: nowIso,
      };

      return {
        action: 'CLOSED',
        session: updatedSession,
      };
    }

    // No open session to close, create closed historical record
    const sessionId = `sess_${deviceId}_${nowIso.substring(0, 10)}_${nowMs}`;
    const singleSession: UsageSession = {
      sessionId,
      id: sessionId,
      deviceId,
      uid,
      userId: uid,
      deviceName,
      startTime: nowIso,
      startupTime: nowIso,
      lastHeartbeat: nowIso,
      endTime: nowIso,
      shutdownTime: nowIso,
      status: normEventType === 'LOCK' ? 'LOCKED' : (normEventType === 'SLEEP' ? 'SLEEPING' : 'COMPLETED'),
      durationMinutes: 1,
      durationMins: 1,
      durationHours: 0.02,
      activeMinutes: 1,
      idleMinutes: 0,
      lockMinutes: 0,
      sleepMinutes: 0,
      date: nowIso.substring(0, 10),
      createdAt: nowIso,
      updatedAt: nowIso,
      isRealDevice: true,
    };

    return {
      action: 'CLOSED',
      session: singleSession,
    };
  }

  // 3. Case B: Session Start / Resume / Heartbeat (STARTUP, UNLOCK, WAKE, LOGIN, ACTIVE)
  if (!openSession || openSession.endTime !== null) {
    // Automatically spawn new open session
    const sessionId = `sess_${deviceId}_${nowIso.substring(0, 10)}_${nowMs}`;
    const newSession: UsageSession = {
      sessionId,
      id: sessionId,
      deviceId,
      uid,
      userId: uid,
      deviceName,
      startTime: nowIso,
      startupTime: nowIso,
      lastHeartbeat: nowIso,
      endTime: null, // Remains open automatically
      shutdownTime: null,
      status: 'ACTIVE',
      durationMinutes: 1,
      durationMins: 1,
      durationHours: 0.02,
      activeMinutes: 1,
      idleMinutes: 0,
      lockMinutes: 0,
      sleepMinutes: 0,
      date: nowIso.substring(0, 10),
      createdAt: nowIso,
      updatedAt: nowIso,
      isRealDevice: true,
    };

    return {
      action: 'CREATED',
      session: newSession,
    };
  } else {
    // Automatically extend active session
    const startMs = new Date(openSession.startTime).getTime();
    const liveDurMins = Math.max(1, Math.round((nowMs - startMs) / 60000));

    const extendedSession: UsageSession = {
      ...openSession,
      lastHeartbeat: nowIso,
      durationMinutes: liveDurMins,
      durationMins: liveDurMins,
      durationHours: Number((liveDurMins / 60).toFixed(2)),
      activeMinutes: liveDurMins,
      status: 'ACTIVE',
      updatedAt: nowIso,
    };

    return {
      action: 'EXTENDED',
      session: extendedSession,
    };
  }
}
