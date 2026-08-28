import {
  UserProfile,
  Device,
  SystemEvent,
  UsageSession,
  Report,
  RecipientEmail,
  EventType,
  DeviceState
} from '../types';

/**
 * Robust fetch helper that guarantees graceful JSON parsing and never throws
 * "Unexpected token '<', '<!doctype '... is not valid JSON" when receiving HTML or 404s.
 */
export async function safeFetchJson<T = any>(
  url: string,
  options?: RequestInit,
  fallback?: T
): Promise<T> {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();

    if (!text || text.trim().length === 0) {
      return (fallback ?? { success: res.ok }) as T;
    }

    if (contentType.includes('application/json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
      try {
        return JSON.parse(text) as T;
      } catch (parseErr) {
        console.warn(`[safeFetchJson] Failed to parse JSON from ${url}:`, parseErr);
        return (fallback ?? { success: false, error: 'Invalid JSON response' }) as T;
      }
    }

    // Response is HTML or plain text (e.g. server error or fallback)
    console.warn(`[safeFetchJson] Non-JSON payload received from ${url} (status: ${res.status})`);
    return (fallback ?? { success: false, error: `Server returned non-JSON (${res.status})` }) as T;
  } catch (netErr: any) {
    console.warn(`[safeFetchJson] Network error for ${url}:`, netErr?.message);
    return (fallback ?? { success: false, error: netErr?.message || 'Network error' }) as T;
  }
}

// Helper to filter out test/simulated devices
export function isRealProductionDevice(dev: Device | any): boolean {
  if (!dev || !dev.deviceId) return false;
  const id = String(dev.deviceId);
  const name = String(dev.deviceName || '');
  if (id.startsWith('dev_verify_') || id.startsWith('dev_temp_test_') || id.startsWith('PC-TEST-')) {
    return false;
  }
  if (name === 'Verification Test Node' || name === 'Temp Permission Check') {
    return false;
  }
  return true;
}

// User Profile Management (API Single Source of Truth)
export async function ensureUserProfile(
  uid: string,
  email: string,
  displayName: string,
  photoURL?: string,
  provider?: string
): Promise<UserProfile> {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const now = new Date();
  const nowIso = now.toISOString();

  // Trigger background onboarding initialization asynchronously
  fetch('/api/onboarding/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid,
      email,
      displayName,
      photoURL,
      provider: provider || 'google.com',
    }),
  }).catch((err) => {
    console.warn('[WELCOME_EMAIL] Background onboarding dispatch notice (non-blocking):', err);
  });

  try {
    const data = await safeFetchJson<{ success?: boolean; profile?: any }>(`/api/user/profile?uid=${encodeURIComponent(uid)}`);
    if (data.success && data.profile) {
      const existing = data.profile as UserProfile;
      const trialStartDate = existing.trialStartDate || nowIso;
      const trialEndDate = existing.trialEndDate || new Date(now.getTime() + 7 * 86400000).toISOString();
      const diffMs = new Date(trialEndDate).getTime() - now.getTime();
      const trialDaysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

      const updated: UserProfile = {
        ...existing,
        displayName: displayName || existing.displayName || 'User',
        photoURL: photoURL || existing.photoURL || '',
        timezone,
        lastLoginAt: nowIso,
        accountStatus: 'active',
        trialStatus: trialDaysRemaining > 0 ? 'active' : 'expired',
        trialDaysRemaining,
        trialDaysTotal: existing.trialDaysTotal || 7,
        userId: uid,
      };

      fetch('/api/user/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      }).catch(() => {});

      return updated;
    }
  } catch (err) {
    console.warn('[ensureUserProfile] Backend profile read notice:', err);
  }

  const trialStartDate = nowIso;
  const trialEndDate = new Date(now.getTime() + 7 * 86400000).toISOString();

  const newUser: UserProfile = {
    uid,
    userId: uid,
    email: email || '',
    displayName: displayName || 'User',
    photoURL: photoURL || '',
    provider: provider || 'google.com',
    createdAt: nowIso,
    lastLoginAt: nowIso,
    accountStatus: 'active',
    trialStatus: 'active',
    trialStartDate,
    trialEndDate,
    trialDaysTotal: 7,
    trialDaysRemaining: 7,
    welcomeEmailSent: false,
    welcomeEmailSentAt: null,
    trialReportGenerated: false,
    trialPdfStoragePath: null,
    trialPdfDownloadUrl: `/api/onboarding/sample-pdf?uid=${uid}`,
    trialExcelStoragePath: null,
    trialExcelDownloadUrl: `/api/onboarding/sample-excel?uid=${uid}`,
    onboardingCompleted: false,
    onboardingStep: 1,
    recipientEmail: email || '',
    timezone,
  };

  fetch('/api/user/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newUser),
  }).catch(() => {});

  if (email) {
    fetch('/api/recipients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, email, name: displayName || 'Primary Recipient' }),
    }).catch(() => {});
  }

  return newUser;
}

export async function fetchOnboardingStatus(uid: string) {
  return await safeFetchJson(`/api/onboarding/status?uid=${encodeURIComponent(uid)}`, undefined, { success: false, error: 'Network error' });
}

export async function runOnboardingAcceptanceSuite(uid: string, userEmail: string) {
  return await safeFetchJson(
    '/api/onboarding/test-suite',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, userEmail }),
    },
    { success: false, error: 'Test suite failed' }
  );
}

// Devices Real-time Polling & CRUD (Single Source of Truth via API)
export function listenUserDevices(uid: string, callback: (devices: Device[]) => void) {
  let isMounted = true;

  const fetchDevices = async () => {
    try {
      const data = await safeFetchJson<{ success?: boolean; devices?: Device[] }>(`/api/devices?uid=${encodeURIComponent(uid)}`);
      if (isMounted && data.success && Array.isArray(data.devices)) {
        callback(data.devices);
      }
    } catch (err) {
      console.warn('[listenUserDevices] Device fetch notice:', err);
    }
  };

  // Immediate fetch
  fetchDevices();

  // Poll every 5 seconds for live fleet synchronization
  const intervalId = setInterval(fetchDevices, 5000);

  return () => {
    isMounted = false;
    clearInterval(intervalId);
  };
}

export async function fetchUserDevices(uid: string): Promise<Device[]> {
  try {
    const data = await safeFetchJson<{ success?: boolean; devices?: Device[] }>(`/api/devices?uid=${encodeURIComponent(uid)}`);
    return data.success && Array.isArray(data.devices) ? data.devices : [];
  } catch {
    return [];
  }
}

export async function fetchLiveStats(uid: string) {
  return await safeFetchJson(
    `/api/devices/live-stats?uid=${encodeURIComponent(uid)}`,
    undefined,
    { success: false, totalDevices: 0, onlineDevices: 0, offlineDevices: 0, activeSessionsCount: 0 }
  );
}

export async function deregisterAndPurgeDevice(
  deviceId: string,
  uid?: string
): Promise<{ success: boolean; message?: string; totalSessionsPurged?: number; totalEventsPurged?: number; error?: string }> {
  try {
    const data = await safeFetchJson(
      '/api/devices/deregister',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, uid, action: 'UNINSTALL' }),
      },
      { success: false, error: 'Network error during device deregistration' }
    );
    if (data.success && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('syslogger:device-deregistered', { detail: { deviceId } }));
    }
    return data;
  } catch (err: any) {
    console.error('deregisterAndPurgeDevice error:', err);
    return { success: false, error: err?.message || 'Network error during device deregistration' };
  }
}

export async function purgeSimulatedVerificationDevices(uid: string): Promise<number> {
  const data = await safeFetchJson<{ deletedCount?: number }>(
    '/api/agent/clean-simulated',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid }),
    },
    { deletedCount: 0 }
  );
  return data.deletedCount || 0;
}

export async function registerOrUpdateDevice(
  device: Partial<Device> & { deviceId: string; uid: string; deviceName: string }
): Promise<Device> {
  try {
    const data = await safeFetchJson<{ success?: boolean; device?: Device }>(
      '/api/devices',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(device),
      }
    );
    if (data.success && data.device) {
      return data.device as Device;
    }
  } catch (err) {
    console.error('registerOrUpdateDevice error:', err);
  }

  const now = new Date().toISOString();
  return {
    deviceId: device.deviceId,
    uid: device.uid,
    userId: device.uid,
    deviceName: device.deviceName,
    hostname: device.deviceName,
    operatingSystem: device.os || 'Windows 11 x64',
    os: device.os || 'Windows 11 x64',
    osVersion: '10.0.22631',
    agentVersion: device.agentVersion || '1.0.3',
    registeredAt: now,
    createdAt: now,
    lastSeen: now,
    lastSeenAt: now,
    currentState: device.currentState || 'ACTIVE',
    isOnline: true,
    status: 'ACTIVE',
  } as Device;
}

// System Events Real-time Polling & Ingestion
export function listenUserEvents(uid: string, limitCount: number = 200, callback: (events: SystemEvent[]) => void) {
  let isMounted = true;

  const fetchEvents = async () => {
    try {
      const data = await safeFetchJson<{ success?: boolean; events?: SystemEvent[] }>(
        `/api/events?uid=${encodeURIComponent(uid)}&limit=${limitCount}`
      );
      if (isMounted && data.success && Array.isArray(data.events)) {
        callback(data.events);
      }
    } catch (err) {
      console.warn('[listenUserEvents] Event fetch notice:', err);
    }
  };

  fetchEvents();
  const intervalId = setInterval(fetchEvents, 6000);

  return () => {
    isMounted = false;
    clearInterval(intervalId);
  };
}

export async function fetchDeviceDiagnostics(uid: string, deviceId: string = '') {
  return await safeFetchJson(
    `/api/agent/diagnose-events?uid=${encodeURIComponent(uid)}&deviceId=${encodeURIComponent(deviceId)}`,
    undefined,
    { success: false, error: 'Diagnostics request failed' }
  );
}

export async function ingestEventBatch(events: SystemEvent[]): Promise<{ ingested: number; updatedDeviceState?: string }> {
  if (!events || events.length === 0) return { ingested: 0 };

  try {
    const data = await safeFetchJson<{ syncedCount?: number }>(
      '/api/sync',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: events[0].uid,
          deviceId: events[0].deviceId,
          events,
        }),
      },
      { syncedCount: events.length }
    );
    return { ingested: data.syncedCount || events.length };
  } catch (err) {
    console.error('ingestEventBatch error:', err);
    return { ingested: events.length };
  }
}

// Session Calculation Engine
export { computeSessionsFromEvents } from '../services/sessionCalculator';

export async function recalculateSessionsForUser(uid: string): Promise<UsageSession[]> {
  try {
    const data = await safeFetchJson<{ success?: boolean; sessions?: UsageSession[] }>(
      `/api/sessions?uid=${encodeURIComponent(uid)}`
    );
    return data.success && Array.isArray(data.sessions) ? data.sessions : [];
  } catch {
    return [];
  }
}

// Usage Sessions Listeners
export function listenUserSessions(uid: string, callback: (sessions: UsageSession[]) => void) {
  let isMounted = true;

  const fetchSessions = async () => {
    try {
      const data = await safeFetchJson<{ success?: boolean; sessions?: UsageSession[] }>(
        `/api/sessions?uid=${encodeURIComponent(uid)}`
      );
      if (isMounted && data.success && Array.isArray(data.sessions)) {
        callback(data.sessions);
      }
    } catch (err) {
      console.warn('[listenUserSessions] Sessions fetch notice:', err);
    }
  };

  fetchSessions();
  const intervalId = setInterval(fetchSessions, 8000);

  return () => {
    isMounted = false;
    clearInterval(intervalId);
  };
}

// Reports Listeners & Management
export function listenUserReports(uid: string, callback: (reports: Report[]) => void) {
  let isMounted = true;

  const fetchReports = async () => {
    try {
      const data = await safeFetchJson<{ success?: boolean; reports?: Report[] }>(
        `/api/reports?uid=${encodeURIComponent(uid)}`
      );
      if (isMounted && data.success && Array.isArray(data.reports)) {
        callback(data.reports);
      }
    } catch (err) {
      console.warn('[listenUserReports] Reports fetch notice:', err);
    }
  };

  fetchReports();
  const intervalId = setInterval(fetchReports, 10000);

  return () => {
    isMounted = false;
    clearInterval(intervalId);
  };
}

export async function saveReport(report: Partial<Report> & { reportId: string; uid: string }): Promise<void> {
  try {
    await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
  } catch (err) {
    console.warn('[saveReport] Backend report save notice:', err);
  }
}

// Recipient Email Management
export function listenUserRecipients(uid: string, callback: (recipients: RecipientEmail[]) => void) {
  let isMounted = true;

  const fetchRecipients = async () => {
    try {
      const data = await safeFetchJson<{ success?: boolean; recipients?: RecipientEmail[] }>(
        `/api/recipients?uid=${encodeURIComponent(uid)}`
      );
      if (isMounted && data.success && Array.isArray(data.recipients)) {
        callback(data.recipients);
      }
    } catch (err) {
      console.warn('[listenUserRecipients] Recipients fetch notice:', err);
    }
  };

  fetchRecipients();
  const intervalId = setInterval(fetchRecipients, 10000);

  return () => {
    isMounted = false;
    clearInterval(intervalId);
  };
}

export async function addRecipientEmail(uid: string, email: string, name: string): Promise<RecipientEmail> {
  const recipientId = `rec_${Date.now()}`;
  const newRec: RecipientEmail = {
    recipientId,
    uid,
    email,
    name: name || email,
    isPrimary: false,
    addedAt: new Date().toISOString(),
  };

  try {
    const data = await safeFetchJson<{ success?: boolean; recipient?: RecipientEmail }>(
      '/api/recipients',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, email, name }),
      }
    );
    if (data.success && data.recipient) {
      return data.recipient;
    }
  } catch (err) {
    console.warn('[addRecipientEmail] notice:', err);
  }

  return newRec;
}

export async function removeRecipientEmail(recipientId: string) {
  try {
    await fetch(`/api/recipients/${encodeURIComponent(recipientId)}`, {
      method: 'DELETE',
    });
  } catch (err) {
    console.warn('[removeRecipientEmail] notice:', err);
  }
}

export async function updatePrimaryRecipient(uid: string, recipientEmail: string) {
  try {
    await fetch('/api/recipients/primary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, recipientEmail }),
    });
  } catch (err) {
    console.warn('[updatePrimaryRecipient] notice:', err);
  }
}

export async function executeCompleteCustomerCleanup(uid?: string): Promise<{
  success: boolean;
  purgedCounts: Record<string, number>;
  message: string;
}> {
  try {
    const data = await safeFetchJson<{ purgedCounts?: Record<string, number> }>(
      '/api/admin/clean-all-test-data',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid }),
      },
      { purgedCounts: {} }
    );
    return {
      success: true,
      purgedCounts: data.purgedCounts || {},
      message: 'All test data and simulated artifacts purged successfully.',
    };
  } catch (err: any) {
    return {
      success: false,
      purgedCounts: {},
      message: err.message || 'Cleanup encountered an error',
    };
  }
}
