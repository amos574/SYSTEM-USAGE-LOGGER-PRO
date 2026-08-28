import React, { useState, useEffect, useCallback } from 'react';
import {
  UserProfile,
  Device,
  SystemEvent,
  UsageSession,
  Report,
  RecipientEmail,
} from '../types';
import {
  GmailProfile,
  GmailMessageItem,
  ensureGmailAccessToken,
  getGmailProfile,
  sendEmailViaGmail,
  createDraftViaGmail,
  listGmailMessages,
  buildReportEmailHtml,
} from '../lib/gmailService';
import { generatePdfReport, generateExcelReport } from '../lib/reportGenerators';
import { getCachedGmailToken } from '../lib/firebase';
import { formatToIST } from '../lib/dateUtils';
import {
  Mail,
  Send,
  FileText,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Inbox,
  FileEdit,
  ExternalLink,
  Users,
  Paperclip,
  Check,
  Sparkles,
  ShieldCheck,
  Clock,
  ChevronRight,
  ArrowRight,
  MessageSquare,
} from 'lucide-react';

interface GmailViewProps {
  user: UserProfile;
  devices: Device[];
  events: SystemEvent[];
  sessions: UsageSession[];
  reports: Report[];
  recipients: RecipientEmail[];
}

export const GmailView: React.FC<GmailViewProps> = ({
  user,
  devices,
  events,
  sessions,
  reports,
  recipients,
}) => {
  const [token, setToken] = useState<string | null>(getCachedGmailToken());
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Profile & Mailbox state
  const [profile, setProfile] = useState<GmailProfile | null>(null);
  const [messages, setMessages] = useState<GmailMessageItem[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [activeTab, setActiveTab] = useState<'DISPATCH' | 'COMPOSE' | 'ACTIVITY'>('DISPATCH');
  const [searchQuery, setSearchQuery] = useState('subject:"System Usage" OR subject:"Computer Usage"');

  // Report Dispatcher State
  const [selectedRecipientEmail, setSelectedRecipientEmail] = useState<string>(
    recipients.find((r) => r.isPrimary)?.email || user.email || ''
  );
  const [customRecipientEmail, setCustomRecipientEmail] = useState<string>('');
  const [selectedPeriod, setSelectedPeriod] = useState<string>(
    `${new Date().toLocaleString('default', { month: 'long' })} ${new Date().getFullYear()}`
  );
  const [attachPdf, setAttachPdf] = useState(true);
  const [attachExcel, setAttachExcel] = useState(true);
  const [dispatchingReport, setDispatchingReport] = useState(false);

  // Custom Compose State
  const [composeTo, setComposeTo] = useState(user.email || '');
  const [composeSubject, setComposeSubject] = useState('System Usage Summary & Telemetry Update');
  const [composeBody, setComposeBody] = useState(
    `Hello,\n\nHere is an automated update regarding workstation usage and monitoring activity across ${devices.length} registered workstations.\n\nBest regards,\n${user.displayName || 'System Admin'}`
  );
  const [composeAttachPdf, setComposeAttachPdf] = useState(false);
  const [composeAttachExcel, setComposeAttachExcel] = useState(false);
  const [sendingCustomMail, setSendingCustomMail] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  // Notification banners
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Load Gmail Data
  const loadGmailData = useCallback(async (activeToken: string) => {
    setLoadingMessages(true);
    setActionError(null);
    try {
      // 1. Fetch Profile
      const prof = await getGmailProfile(activeToken).catch((err) => {
        console.warn('[GMAIL_PROFILE_WARN]', err);
        return null;
      });
      if (prof) setProfile(prof);

      // 2. Fetch Recent Messages
      const msgList = await listGmailMessages(activeToken, {
        q: searchQuery || undefined,
        maxResults: 15,
      }).catch((err) => {
        console.warn('[GMAIL_MESSAGES_WARN]', err);
        return [];
      });
      setMessages(msgList);
    } catch (err: any) {
      console.error('[GMAIL_LOAD_ERROR]', err);
      setActionError(err.message || 'Unable to connect to Gmail. Please re-authorize.');
    } finally {
      setLoadingMessages(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    const existing = getCachedGmailToken();
    if (existing) {
      setToken(existing);
      loadGmailData(existing);
    }
  }, [loadGmailData]);

  // Handle Google Drive / Workspace OAuth
  const handleConnectGmail = async () => {
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      const activeToken = await ensureGmailAccessToken();
      setToken(activeToken);
      await loadGmailData(activeToken);
    } catch (err: any) {
      setAuthError(err.message || 'Failed to authenticate with Gmail');
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Helper to compile report data
  const getCompiledReportData = (period: string) => {
    const totalDevices = devices.length;
    const totalUsageMinutes = sessions.reduce((acc, s) => acc + s.durationMinutes, 0);
    const totalSessions = sessions.length;
    const totalActiveMinutes = sessions.reduce((acc, s) => acc + s.activeMinutes, 0);
    const totalIdleMinutes = sessions.reduce((acc, s) => acc + s.idleMinutes, 0);
    const totalLockMinutes = sessions.reduce((acc, s) => acc + s.lockMinutes, 0);
    const totalSleepMinutes = sessions.reduce((acc, s) => acc + s.sleepMinutes, 0);

    const startupCount = events.filter((e) => e.eventType === 'STARTUP').length;
    const shutdownCount = events.filter((e) => e.eventType === 'SHUTDOWN').length;
    const lockCount = events.filter((e) => e.eventType === 'LOCK').length;
    const unlockCount = events.filter((e) => e.eventType === 'UNLOCK').length;
    const sleepCount = events.filter((e) => e.eventType === 'SLEEP').length;
    const wakeCount = events.filter((e) => e.eventType === 'WAKE').length;

    return {
      title: 'SYSTEM USAGE LOGGER MONTHLY REPORT',
      period,
      userName: user.displayName || 'Authenticated User',
      userEmail: user.email,
      generatedAt: new Date().toISOString(),
      environment: 'PRODUCTION' as const,
      devices,
      sessions,
      events,
      stats: {
        totalDevices,
        totalUsageMinutes,
        totalSessions,
        totalActiveMinutes,
        totalIdleMinutes,
        totalLockMinutes,
        totalSleepMinutes,
        startupCount,
        shutdownCount,
        lockCount,
        unlockCount,
        sleepCount,
        wakeCount,
      },
    };
  };

  // 1. Dispatch Monthly Report via Gmail API
  const handleDispatchReport = async () => {
    if (!token) {
      await handleConnectGmail();
      return;
    }

    const targetRecipient = customRecipientEmail.trim() || selectedRecipientEmail;
    if (!targetRecipient) {
      setActionError('Please specify or select a recipient email address.');
      return;
    }

    setDispatchingReport(true);
    setActionSuccess(null);
    setActionError(null);

    try {
      const reportData = getCompiledReportData(selectedPeriod);
      const attachments = [];

      if (attachPdf) {
        const pdfBase64 = generatePdfReport(reportData);
        attachments.push({
          filename: `SysLogger_Report_${selectedPeriod.replace(/\s+/g, '_')}.pdf`,
          mimeType: 'application/pdf',
          content: pdfBase64,
        });
      }

      if (attachExcel) {
        const excelBase64 = generateExcelReport(reportData);
        attachments.push({
          filename: `SysLogger_Report_${selectedPeriod.replace(/\s+/g, '_')}.xlsx`,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          content: excelBase64,
        });
      }

      const htmlBody = buildReportEmailHtml({
        period: selectedPeriod,
        userName: user.displayName || 'Authenticated User',
        totalDevices: devices.length,
        totalSessions: sessions.length,
        totalUsageMinutes: reportData.stats.totalUsageMinutes,
        totalActiveMinutes: reportData.stats.totalActiveMinutes,
        totalIdleMinutes: reportData.stats.totalIdleMinutes,
        startupEvents: reportData.stats.startupCount,
        shutdownEvents: reportData.stats.shutdownCount,
      });

      await sendEmailViaGmail(token, {
        to: targetRecipient,
        from: profile?.emailAddress || user.email,
        subject: `Monthly Computer Usage Report - ${selectedPeriod}`,
        bodyText: `Monthly Computer Usage Report for ${selectedPeriod}. Please view the attached documents for the complete audit.`,
        bodyHtml: htmlBody,
        attachments,
      });

      setActionSuccess(`Monthly report successfully sent to ${targetRecipient} via official Gmail API!`);
      await loadGmailData(token);
    } catch (err: any) {
      setActionError(err.message || 'Failed to send report via Gmail');
    } finally {
      setDispatchingReport(false);
    }
  };

  // 2. Send Custom Email via Gmail
  const handleSendCustomMail = async () => {
    if (!token) {
      await handleConnectGmail();
      return;
    }

    if (!composeTo.trim()) {
      setActionError('Recipient address is required.');
      return;
    }

    setSendingCustomMail(true);
    setActionSuccess(null);
    setActionError(null);

    try {
      const attachments = [];
      const reportData = getCompiledReportData(selectedPeriod);

      if (composeAttachPdf) {
        const pdfBase64 = generatePdfReport(reportData);
        attachments.push({
          filename: `SysLogger_Audit_${new Date().toISOString().slice(0, 10)}.pdf`,
          mimeType: 'application/pdf',
          content: pdfBase64,
        });
      }

      if (composeAttachExcel) {
        const excelBase64 = generateExcelReport(reportData);
        attachments.push({
          filename: `SysLogger_Audit_${new Date().toISOString().slice(0, 10)}.xlsx`,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          content: excelBase64,
        });
      }

      await sendEmailViaGmail(token, {
        to: composeTo.trim(),
        from: profile?.emailAddress || user.email,
        subject: composeSubject,
        bodyText: composeBody,
        attachments,
      });

      setActionSuccess(`Email successfully delivered to ${composeTo} via Gmail!`);
      await loadGmailData(token);
    } catch (err: any) {
      setActionError(err.message || 'Failed to send custom email via Gmail');
    } finally {
      setSendingCustomMail(false);
    }
  };

  // 3. Save Draft to Gmail
  const handleSaveDraft = async () => {
    if (!token) {
      await handleConnectGmail();
      return;
    }

    setSavingDraft(true);
    setActionSuccess(null);
    setActionError(null);

    try {
      await createDraftViaGmail(token, {
        to: composeTo.trim() || user.email,
        from: profile?.emailAddress || user.email,
        subject: composeSubject,
        bodyText: composeBody,
      });

      setActionSuccess('Draft saved directly to your Gmail mailbox!');
      await loadGmailData(token);
    } catch (err: any) {
      setActionError(err.message || 'Failed to save draft to Gmail');
    } finally {
      setSavingDraft(false);
    }
  };

  return (
    <div id="gmail-integration-view" className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-start space-x-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0 shadow-xs">
            <Mail className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2.5">
              <h1 className="text-xl font-bold text-slate-900">Gmail Workspace Hub</h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                Official REST API v1
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-xl">
              Deliver monthly computer usage reports, custom audit summaries, and automated telemetry alerts directly from your authentic Gmail account without needing external SMTP servers.
            </p>
          </div>
        </div>

        {/* Connection Action */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          {token ? (
            <div className="flex items-center space-x-2 bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2 rounded-xl text-xs font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Gmail Connected</span>
              <button
                onClick={() => loadGmailData(token)}
                disabled={loadingMessages}
                className="ml-2 text-emerald-700 hover:text-emerald-900 hover:bg-emerald-100 p-1 rounded-md transition"
                title="Refresh Mailbox Messages"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingMessages ? 'animate-spin' : ''}`} />
              </button>
            </div>
          ) : (
            <button
              id="btn-connect-gmail"
              onClick={handleConnectGmail}
              disabled={isAuthenticating}
              className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition"
            >
              <Mail className="w-4 h-4" />
              <span>{isAuthenticating ? 'Authorizing...' : 'Authorize Gmail'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Auth Error Banner if any */}
      {authError && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start space-x-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">Gmail Connection Notice: </span>
            <span>{authError}</span>
          </div>
        </div>
      )}

      {/* Action Notification Banner */}
      {actionSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{actionSuccess}</span>
          </div>
        </div>
      )}

      {actionError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-medium">{actionError}</span>
          </div>
        </div>
      )}

      {/* Top Mailbox Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex items-center space-x-4">
          <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Authenticated Sender</div>
            <div className="text-sm font-bold text-slate-900 truncate max-w-[200px]">
              {profile?.emailAddress || user.email}
            </div>
            <div className="text-[10px] text-emerald-600 font-medium">OAuth Verified</div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex items-center space-x-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <Inbox className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Mailbox Volume</div>
            <div className="text-sm font-bold text-slate-900">
              {profile ? `${profile.messagesTotal.toLocaleString()} messages` : 'Connected'}
            </div>
            <div className="text-[10px] text-slate-500">
              {profile ? `${profile.threadsTotal.toLocaleString()} active threads` : 'Ready to send'}
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex items-center space-x-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Registered Recipients</div>
            <div className="text-sm font-bold text-slate-900">
              {recipients.length} configured
            </div>
            <div className="text-[10px] text-indigo-600 font-medium">
              {recipients.filter((r) => r.isPrimary).length} primary recipients
            </div>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="flex border-b border-slate-200 px-6 pt-4 space-x-6 bg-slate-50/50">
          <button
            onClick={() => setActiveTab('DISPATCH')}
            className={`pb-3 text-xs font-bold transition border-b-2 flex items-center space-x-2 ${
              activeTab === 'DISPATCH'
                ? 'border-rose-600 text-rose-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>1-Click Monthly Report Dispatcher</span>
          </button>

          <button
            onClick={() => setActiveTab('COMPOSE')}
            className={`pb-3 text-xs font-bold transition border-b-2 flex items-center space-x-2 ${
              activeTab === 'COMPOSE'
                ? 'border-rose-600 text-rose-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <FileEdit className="w-4 h-4" />
            <span>Custom Compose & Drafts</span>
          </button>

          <button
            onClick={() => setActiveTab('ACTIVITY')}
            className={`pb-3 text-xs font-bold transition border-b-2 flex items-center space-x-2 ${
              activeTab === 'ACTIVITY'
                ? 'border-rose-600 text-rose-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Recent Gmail Activity ({messages.length})</span>
          </button>
        </div>

        {/* Tab 1: 1-Click Monthly Report Dispatcher */}
        {activeTab === 'DISPATCH' && (
          <div className="p-6 space-y-6">
            <div className="max-w-2xl">
              <h2 className="text-base font-bold text-slate-900">
                Dispatch Formatted Usage Report via Gmail
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Compiles telemetry across all {devices.length} registered workstations, builds an executive HTML report email, generates signed PDF & Excel audit files, and sends them directly via the official Gmail API.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Form Controls */}
              <div className="space-y-4">
                {/* Period Selector */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Reporting Period
                  </label>
                  <input
                    type="text"
                    value={selectedPeriod}
                    onChange={(e) => setSelectedPeriod(e.target.value)}
                    placeholder="e.g. October 2026"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:outline-hidden focus:ring-1 focus:ring-rose-500"
                  />
                </div>

                {/* Recipient Selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Select Target Recipient
                  </label>
                  <select
                    value={selectedRecipientEmail}
                    onChange={(e) => {
                      setSelectedRecipientEmail(e.target.value);
                      setCustomRecipientEmail('');
                    }}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:outline-hidden focus:ring-1 focus:ring-rose-500"
                  >
                    <option value={user.email}>{user.email} (My Primary Account)</option>
                    {recipients.map((rec) => (
                      <option key={rec.recipientId} value={rec.email}>
                        {rec.name} ({rec.email}) {rec.isPrimary ? '• Primary' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Custom Recipient Override */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Or Enter Custom Recipient Email
                  </label>
                  <input
                    type="email"
                    value={customRecipientEmail}
                    onChange={(e) => setCustomRecipientEmail(e.target.value)}
                    placeholder="supervisor@company.com"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:outline-hidden focus:ring-1 focus:ring-rose-500"
                  />
                </div>

                {/* Attachment Checkboxes */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                  <span className="block text-xs font-bold text-slate-700">
                    MIME File Attachments
                  </span>

                  <label className="flex items-center space-x-2.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={attachPdf}
                      onChange={(e) => setAttachPdf(e.target.checked)}
                      className="rounded text-rose-600 focus:ring-rose-500"
                    />
                    <FileText className="w-4 h-4 text-rose-600" />
                    <span>Include Executive PDF Summary (.pdf)</span>
                  </label>

                  <label className="flex items-center space-x-2.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={attachExcel}
                      onChange={(e) => setAttachExcel(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Include Detailed Audit Spreadsheet (.xlsx)</span>
                  </label>
                </div>

                <button
                  id="btn-dispatch-gmail-report"
                  onClick={handleDispatchReport}
                  disabled={dispatchingReport}
                  className="w-full flex items-center justify-center space-x-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold py-3 rounded-xl transition shadow-xs disabled:opacity-50"
                >
                  {dispatchingReport ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Compiling & Sending via Gmail...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Send Monthly Report via Gmail</span>
                    </>
                  )}
                </button>
              </div>

              {/* Live Preview Box */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Gmail Template Live Preview
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-rose-100 text-rose-700 rounded-md">
                      HTML + Attachments
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="text-slate-500">
                      <strong className="text-slate-800">From:</strong> {profile?.emailAddress || user.email}
                    </div>
                    <div className="text-slate-500">
                      <strong className="text-slate-800">To:</strong>{' '}
                      {customRecipientEmail.trim() || selectedRecipientEmail}
                    </div>
                    <div className="text-slate-500">
                      <strong className="text-slate-800">Subject:</strong> Monthly Computer Usage Report - {selectedPeriod}
                    </div>
                  </div>

                  <div className="mt-4 p-3 bg-white rounded-lg border border-slate-200 text-xs text-slate-600 space-y-2">
                    <div className="font-bold text-slate-900">Summary Telemetry Snapshot</div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="bg-slate-50 p-2 rounded border border-slate-100">
                        <div className="text-slate-400 text-[10px]">Workstations</div>
                        <div className="font-bold text-slate-800">{devices.length} Devices</div>
                      </div>
                      <div className="bg-slate-50 p-2 rounded border border-slate-100">
                        <div className="text-slate-400 text-[10px]">Recorded Sessions</div>
                        <div className="font-bold text-slate-800">{sessions.length} Sessions</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 pt-3 border-t border-slate-200 flex items-center space-x-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Authenticated directly through Google Workspace OAuth 2.0</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Custom Compose & Drafts */}
        {activeTab === 'COMPOSE' && (
          <div className="p-6 space-y-5">
            <div className="max-w-2xl">
              <h2 className="text-base font-bold text-slate-900">Compose Email via Gmail</h2>
              <p className="text-xs text-slate-500 mt-1">
                Draft and send custom telemetry notifications or communications directly through your Gmail account.
              </p>
            </div>

            <div className="space-y-4 max-w-3xl">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">To</label>
                <input
                  type="email"
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  placeholder="recipient@example.com"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:outline-hidden focus:ring-1 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Subject</label>
                <input
                  type="text"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder="Subject line..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:outline-hidden focus:ring-1 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Message Body</label>
                <textarea
                  rows={6}
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  placeholder="Write your email body..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:outline-hidden focus:ring-1 focus:ring-rose-500"
                />
              </div>

              <div className="flex items-center space-x-6 text-xs text-slate-700 py-1">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={composeAttachPdf}
                    onChange={(e) => setComposeAttachPdf(e.target.checked)}
                    className="rounded text-rose-600 focus:ring-rose-500"
                  />
                  <span>Attach PDF Audit</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={composeAttachExcel}
                    onChange={(e) => setComposeAttachExcel(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Attach Excel (.xlsx)</span>
                </label>
              </div>

              <div className="flex items-center space-x-3 pt-2">
                <button
                  id="btn-send-custom-gmail"
                  onClick={handleSendCustomMail}
                  disabled={sendingCustomMail}
                  className="flex items-center space-x-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition shadow-xs"
                >
                  {sendingCustomMail ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>Send Email</span>
                </button>

                <button
                  id="btn-save-gmail-draft"
                  onClick={handleSaveDraft}
                  disabled={savingDraft}
                  className="flex items-center space-x-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-4 py-2.5 rounded-xl transition"
                >
                  {savingDraft ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileEdit className="w-4 h-4" />
                  )}
                  <span>Save to Gmail Drafts</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Recent Gmail Activity */}
        {activeTab === 'ACTIVITY' && (
          <div>
            {/* Search filter bar */}
            <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && token) loadGmailData(token);
                  }}
                  placeholder="Search Gmail messages (e.g. subject:report)..."
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-rose-500"
                />
              </div>

              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <button
                  onClick={() => token && loadGmailData(token)}
                  disabled={loadingMessages}
                  className="w-full sm:w-auto flex items-center justify-center space-x-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingMessages ? 'animate-spin' : ''}`} />
                  <span>Search Mailbox</span>
                </button>
              </div>
            </div>

            {/* Messages Table */}
            {loadingMessages ? (
              <div className="p-12 text-center space-y-3">
                <RefreshCw className="w-6 h-6 text-rose-600 animate-spin mx-auto" />
                <div className="text-xs text-slate-500 font-medium">
                  Loading messages from Gmail...
                </div>
              </div>
            ) : messages.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <Mail className="w-10 h-10 text-slate-300 mx-auto" />
                <h4 className="text-sm font-bold text-slate-700">No Messages Found</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  {searchQuery
                    ? `No Gmail messages matching "${searchQuery}".`
                    : 'Dispatch a monthly report above to view sent activity.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {messages.map((msg) => (
                  <div key={msg.id} className="p-4 hover:bg-slate-50/80 transition flex items-start justify-between gap-4">
                    <div className="flex items-start space-x-3 overflow-hidden">
                      <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0 mt-0.5">
                        <Mail className="w-4 h-4" />
                      </div>
                      <div className="overflow-hidden">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-xs text-slate-900 truncate">
                            {msg.subject || '(No Subject)'}
                          </span>
                          {msg.labelIds?.includes('SENT') && (
                            <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[9px] font-bold">
                              Sent
                            </span>
                          )}
                          {msg.labelIds?.includes('DRAFT') && (
                            <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[9px] font-bold">
                              Draft
                            </span>
                          )}
                        </div>
                        {msg.snippet && (
                          <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                            {msg.snippet}
                          </p>
                        )}
                        <div className="text-[10px] text-slate-400 mt-1 flex items-center space-x-2">
                          {msg.from && <span>From: {msg.from}</span>}
                          {msg.to && <span>• To: {msg.to}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-[10px] text-slate-400">
                        {msg.date ? formatToIST(msg.date) : '—'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
