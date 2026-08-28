import React, { useState, useEffect, useCallback, useRef } from 'react';
import { auth, loginWithGoogle, logoutUser, checkAuthRedirect } from './lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import {
  UserProfile,
  Device,
  SystemEvent,
  UsageSession,
  Report,
  RecipientEmail,
} from './types';
import {
  ensureUserProfile,
  listenUserDevices,
  listenUserEvents,
  listenUserSessions,
  listenUserReports,
  listenUserRecipients,
  recalculateSessionsForUser,
} from './lib/dataService';
import { Navbar } from './components/Navbar';
import { Sidebar, NavTab } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { DevicesView } from './components/DevicesView';
import { UsageHistoryView } from './components/UsageHistoryView';
import { SystemEventsView } from './components/SystemEventsView';
import { ReportsView } from './components/ReportsView';
import { GoogleDriveView } from './components/GoogleDriveView';
import { GmailView } from './components/GmailView';
import { RecipientsView } from './components/RecipientsView';
import { TestPipelineView } from './components/TestPipelineView';
import { SettingsView } from './components/SettingsView';
import { LoginView } from './components/LoginView';
import { AgentInstallModal } from './components/AgentInstallModal';

const VALID_TABS: NavTab[] = [
  'dashboard',
  'devices',
  'history',
  'events',
  'reports',
  'google-drive',
  'gmail',
  'recipients',
  'test-pipeline',
  'settings',
];

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Parse tab from current URL pathname
  const getTabFromPath = useCallback((): NavTab => {
    if (typeof window === 'undefined') return 'dashboard';
    const rawPath = window.location.pathname.replace(/^\/+/, '').split('/')[0]?.toLowerCase();
    if (VALID_TABS.includes(rawPath as NavTab)) {
      return rawPath as NavTab;
    }
    return 'dashboard';
  }, []);

  const [currentTab, setCurrentTab] = useState<NavTab>(getTabFromPath);
  const targetTabRef = useRef<NavTab>(getTabFromPath());

  // Sync browser URL when tab changes without full page reload
  const handleTabChange = useCallback((tab: NavTab) => {
    setCurrentTab(tab);
    targetTabRef.current = tab;
    if (typeof window !== 'undefined') {
      const targetPath = tab === 'dashboard' ? '/dashboard' : `/${tab}`;
      if (window.location.pathname !== targetPath) {
        window.history.pushState({ tab }, '', targetPath);
      }
    }
  }, []);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const tab = getTabFromPath();
      setCurrentTab(tab);
      targetTabRef.current = tab;
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [getTabFromPath]);

  const [devices, setDevices] = useState<Device[]>([]);
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [sessions, setSessions] = useState<UsageSession[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [recipients, setRecipients] = useState<RecipientEmail[]>([]);

  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Set document title
  useEffect(() => {
    document.title = 'System Usage Logger Pro — Automated Windows Event Collector';
  }, []);

  // Helper to establish initial user profile and route to destination tab
  const activateAuthenticatedUser = useCallback((fbUser: FirebaseUser) => {
    const initialProfile: UserProfile = {
      uid: fbUser.uid,
      userId: fbUser.uid,
      email: fbUser.email || '',
      displayName: fbUser.displayName || 'User',
      photoURL: fbUser.photoURL || undefined,
      createdAt: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      accountStatus: 'active',
      trialStatus: 'active',
      trialDaysTotal: 7,
      trialDaysRemaining: 7,
      welcomeEmailSent: false,
      welcomeEmailSentAt: null,
      trialReportGenerated: false,
      trialPdfStoragePath: null,
      trialPdfDownloadUrl: `/api/onboarding/sample-pdf?uid=${fbUser.uid}`,
      trialExcelStoragePath: null,
      trialExcelDownloadUrl: `/api/onboarding/sample-excel?uid=${fbUser.uid}`,
      onboardingCompleted: false,
      onboardingStep: 1,
      recipientEmail: fbUser.email || '',
    };

    setUser(initialProfile);
    setAuthLoading(false);

    // Determine target route
    const currentPath = typeof window !== 'undefined' ? window.location.pathname.replace(/^\/+/, '').split('/')[0]?.toLowerCase() : '';
    const destinationTab: NavTab = VALID_TABS.includes(currentPath as NavTab) ? (currentPath as NavTab) : targetTabRef.current || 'dashboard';

    setCurrentTab(destinationTab);

    if (typeof window !== 'undefined') {
      const targetPath = destinationTab === 'dashboard' ? '/dashboard' : `/${destinationTab}`;
      if (window.location.pathname !== targetPath) {
        window.history.replaceState({ tab: destinationTab }, '', targetPath);
      }
    }

    // Asynchronously synchronize profile with Firestore in background
    ensureUserProfile(
      fbUser.uid,
      fbUser.email || '',
      fbUser.displayName || '',
      fbUser.photoURL || undefined
    ).then((profile) => {
      if (profile) {
        setUser(profile);
      }
    }).catch((err) => {
      console.warn('[FIRESTORE_PROFILE_LOAD] Background sync notice:', err);
    });
  }, []);

  // Auth State Subscription & Session Restoration
  useEffect(() => {
    let isMounted = true;
    console.log('[AUTH_INITIALIZATION] Initializing Firebase Auth observer...');

    // Check for redirect result first (mobile browsers or popup fallback)
    checkAuthRedirect().then((redirectUser) => {
      if (redirectUser && isMounted) {
        console.log('[AUTH_REDIRECT] Redirect auth resolved for:', redirectUser.uid);
        activateAuthenticatedUser(redirectUser);
      }
    }).catch(() => {});

    const unsubscribe = onAuthStateChanged(auth, (fbUser: FirebaseUser | null) => {
      if (!isMounted) return;

      if (fbUser) {
        console.log('[AUTH_INITIALIZATION] Session active for:', fbUser.uid);
        activateAuthenticatedUser(fbUser);
      } else {
        console.log('[AUTH_INITIALIZATION] No active session. Showing login.');
        setUser(null);
        setAuthLoading(false);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [activateAuthenticatedUser]);

  // Real-time Firestore Subscriptions when user is logged in
  useEffect(() => {
    if (!user) return;

    const unsubs: Array<() => void> = [];

    unsubs.push(listenUserDevices(user.uid, (data) => setDevices(data)));
    unsubs.push(listenUserEvents(user.uid, 150, (data) => {
      setEvents(data);
      recalculateSessionsForUser(user.uid).catch(() => {});
    }));
    unsubs.push(listenUserSessions(user.uid, (data) => setSessions(data)));
    unsubs.push(listenUserReports(user.uid, (data) => setReports(data)));
    unsubs.push(listenUserRecipients(user.uid, (data) => setRecipients(data)));

    recalculateSessionsForUser(user.uid).catch(() => {});

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [user]);

  // Google Login action triggered from LoginView
  const handleGoogleLogin = async () => {
    const fbUser = await loginWithGoogle();
    if (fbUser) {
      activateAuthenticatedUser(fbUser);
    }
  };

  const handleLogout = async () => {
    await logoutUser();
    setUser(null);
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/');
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-900 space-y-3">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <div className="text-xs text-slate-500 font-medium">Connecting to System Usage Logger Pro...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginView onLoginWithGoogle={handleGoogleLogin} />;
  }

  const onlineDevicesCount = devices.filter((d) => d.isOnline).length;

  return (
    <div id="app-root" className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col font-sans">
      
      {/* Main Top Navigation Header */}
      <Navbar
        user={user}
        onLogout={handleLogout}
        onlineCount={onlineDevicesCount}
        totalDevices={devices.length}
        mobileMenuOpen={mobileMenuOpen}
        onToggleMobileMenu={() => setMobileMenuOpen((prev) => !prev)}
      />

      <div className="flex-1 flex max-w-7xl w-full mx-auto overflow-x-hidden">
        
        {/* Main Left Navigation Sidebar */}
        <Sidebar
          currentTab={currentTab}
          onSelectTab={(tab) => {
            handleTabChange(tab);
            setMobileMenuOpen(false);
          }}
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />

        {/* Main Content Body */}
        <main className="flex-1 p-3 sm:p-6 md:p-8 overflow-y-auto w-full min-w-0">
          {currentTab === 'dashboard' && (
            <DashboardView
              user={user}
              devices={devices}
              events={events}
              sessions={sessions}
              reports={reports}
              onNavigateTab={(tab) => handleTabChange(tab as NavTab)}
              onOpenAgentModal={() => setAgentModalOpen(true)}
            />
          )}

          {currentTab === 'devices' && (
            <DevicesView
              user={user}
              uid={user.uid}
              devices={devices}
              onOpenAgentModal={() => setAgentModalOpen(true)}
            />
          )}

          {currentTab === 'history' && (
            <UsageHistoryView
              user={user}
              sessions={sessions}
              devices={devices}
              events={events}
            />
          )}

          {currentTab === 'events' && (
            <SystemEventsView events={events} devices={devices} userUid={user.uid} />
          )}

          {currentTab === 'reports' && (
            <ReportsView
              user={user}
              reports={reports}
              devices={devices}
              sessions={sessions}
              events={events}
            />
          )}

          {currentTab === 'google-drive' && (
            <GoogleDriveView
              user={user}
              devices={devices}
              events={events}
              sessions={sessions}
              reports={reports}
            />
          )}

          {currentTab === 'gmail' && (
            <GmailView
              user={user}
              devices={devices}
              events={events}
              sessions={sessions}
              reports={reports}
              recipients={recipients}
            />
          )}

          {currentTab === 'recipients' && (
            <RecipientsView user={user} recipients={recipients} />
          )}

          {currentTab === 'test-pipeline' && (
            <TestPipelineView user={user} />
          )}

          {currentTab === 'settings' && (
            <SettingsView user={user} onLogout={handleLogout} />
          )}
        </main>

      </div>

      {/* Windows Agent Installation Modal */}
      <AgentInstallModal
        uid={user.uid}
        isOpen={agentModalOpen}
        onClose={() => setAgentModalOpen(false)}
      />

    </div>
  );
}
