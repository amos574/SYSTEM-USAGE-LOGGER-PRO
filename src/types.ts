export type DeviceState = 'ACTIVE' | 'IDLE' | 'LOCKED' | 'SLEEPING' | 'OFFLINE';

export type EventType =
  | 'STARTUP'
  | 'SHUTDOWN'
  | 'RESTART'
  | 'LOCK'
  | 'UNLOCK'
  | 'SLEEP'
  | 'WAKE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'ACTIVE'
  | 'IDLE';

export interface UserProfile {
  uid: string;
  userId?: string;
  email: string;
  displayName: string;
  photoURL?: string;
  provider?: string;
  createdAt: string;
  lastLoginAt?: string;
  accountStatus?: 'active' | 'suspended' | 'trial';
  trialStatus?: 'active' | 'expired' | 'converted';
  trialStartDate?: string;
  trialEndDate?: string;
  trialDaysTotal?: number;
  trialDaysRemaining?: number;
  welcomeEmailSent?: boolean;
  welcomeEmailSentAt?: string | null;
  trialReportGenerated?: boolean;
  trialPdfStoragePath?: string | null;
  trialPdfDownloadUrl?: string | null;
  trialExcelStoragePath?: string | null;
  trialExcelDownloadUrl?: string | null;
  onboardingCompleted?: boolean;
  onboardingStep?: number;
  recipientEmail?: string;
  timezone: string;
}

export interface OnboardingStepInfo {
  stepNumber: number;
  name: string;
  description: string;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING';
  completedAt?: string;
}

export interface OnboardingStatus {
  uid: string;
  displayName: string;
  email: string;
  accountStatus: 'active' | 'suspended' | 'trial';
  trialStatus: 'active' | 'expired' | 'converted';
  trialStartDate: string;
  trialEndDate: string;
  trialDaysTotal: number;
  trialDaysRemaining: number;
  welcomeEmailSent: boolean;
  welcomeEmailSentAt: string | null;
  welcomeEmailStatus: 'SENT' | 'FAILED' | 'NOT_CONFIGURED' | 'PENDING';
  trialReportGenerated: boolean;
  trialPdfStoragePath: string | null;
  trialPdfDownloadUrl: string | null;
  trialExcelStoragePath: string | null;
  trialExcelDownloadUrl: string | null;
  onboardingCompleted: boolean;
  onboardingStep: number;
  hasConnectedDevice: boolean;
  deviceCount: number;
}

export interface OnboardingAcceptanceStep {
  stepNumber: number;
  name: string;
  category: 'AUTH' | 'DATABASE' | 'TRIAL' | 'EMAIL' | 'REPORTS' | 'STORAGE' | 'AGENT' | 'ISOLATION' | 'ACCEPTANCE';
  status: 'PASS' | 'FAIL' | 'NOT_CONFIGURED' | 'PENDING' | 'SKIPPED';
  durationMs?: number;
  details?: string;
  evidence?: Record<string, any>;
  timestamp: string;
}

export type OnboardingStepResult = OnboardingAcceptanceStep;

export interface OnboardingAcceptanceReport {
  testRunId: string;
  uid: string;
  userEmail: string;
  displayName: string;
  startedAt: string;
  completedAt: string;
  overallStatus: 'PASS' | 'FAIL' | 'PASS_WITH_WARNINGS';
  passedSteps: number;
  totalSteps: number;
  durationMs: number;
  steps: OnboardingAcceptanceStep[];
  trialDetails: {
    startDate: string;
    endDate: string;
    daysTotal: number;
    daysRemaining: number;
    status: string;
  };
  emailDetails: {
    configured: boolean;
    sent: boolean;
    sentAt: string | null;
    status: string;
  };
  reportDetails: {
    pdfGenerated: boolean;
    pdfStorageVerified: boolean;
    pdfSize: number;
    excelGenerated: boolean;
    excelStorageVerified: boolean;
    excelSize: number;
  };
  agentDetails: {
    pythonClientReady: boolean;
    exeReady?: boolean;
    ps1Ready: boolean;
    deviceCount: number;
  };
  dataSeparationVerified: boolean;
}

export interface Device {
  deviceId: string;
  uid: string;
  deviceName: string;
  os: string;
  agentVersion: string;
  registeredAt: string;
  lastSeen: string;
  currentState: DeviceState;
  isOnline: boolean;
  status?: string;
}

export interface SystemEvent {
  eventId: string;
  uid: string;
  deviceId: string;
  deviceName: string;
  eventType: EventType;
  timestamp: string; // ISO string UTC
  timezone: string;
  os: string;
  agentVersion: string;
  source: string;
  syncedAt: string;
  testRunId?: string;
}

export interface UsageSession {
  sessionId: string;
  id?: string;
  uid: string;
  userId?: string;
  deviceId: string;
  deviceName: string;
  startTime: string;
  endTime: string | null;
  lastHeartbeat?: string;
  durationMinutes: number;
  durationMins?: number;
  durationHours?: number;
  activeMinutes: number;
  idleMinutes: number;
  sleepMinutes: number;
  lockMinutes: number;
  date: string; // YYYY-MM-DD
  status?: string;
  startupTime?: string;
  shutdownTime?: string | null;
  testRunId?: string;
  eventCount?: number;
  calculatedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  isRealDevice?: boolean;
}

export type EmailStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED' | 'NOT_CONFIGURED';

export interface Report {
  reportId: string;
  uid: string;
  period: string; // e.g. "August 2026"
  generatedAt: string;
  pdfUrl?: string;
  excelUrl?: string;
  emailStatus: EmailStatus;
  emailSentAt?: string;
  recipientEmail: string;
  environment: 'PRODUCTION' | 'TEST';
  testRunId?: string;
  deviceCount: number;
  totalUsageMinutes: number;
  totalSessions: number;
  startupCount: number;
  shutdownCount: number;
  lockCount: number;
  unlockCount: number;
  sleepCount: number;
  wakeCount: number;
  emailDeliveryLog?: string;
}

export interface RecipientEmail {
  recipientId: string;
  uid: string;
  email: string;
  name: string;
  isPrimary: boolean;
  addedAt: string;
}

export interface PipelineStepResult {
  step: string;
  status: 'PASS' | 'FAIL' | 'PENDING';
  details?: string;
  timestamp: string;
}

export interface PipelineTestRun {
  testRunId: string;
  uid: string;
  userEmail: string;
  timestamp: string;
  steps: PipelineStepResult[];
  overallStatus: 'PASS' | 'FAIL' | 'RUNNING';
  pdfBase64?: string;
  excelBase64?: string;
  emailStatus: EmailStatus;
  emailLog?: string;
  cleanedUp?: boolean;
}

export type NavTab =
  | 'dashboard'
  | 'devices'
  | 'history'
  | 'events'
  | 'reports'
  | 'google-drive'
  | 'gmail'
  | 'recipients'
  | 'test-pipeline'
  | 'settings';

