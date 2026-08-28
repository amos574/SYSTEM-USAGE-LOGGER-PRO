import React, { useState, useEffect, useCallback } from 'react';
import {
  UserProfile,
  Device,
  SystemEvent,
  UsageSession,
  Report,
} from '../types';
import {
  DriveFileItem,
  DriveStorageQuota,
  ensureDriveAccessToken,
  getDriveStorageInfo,
  getOrCreateAppFolder,
  listDriveFiles,
  backupDatabaseToDrive,
  uploadReportArtifactToDrive,
  deleteDriveFile,
  formatBytes,
} from '../lib/googleDriveService';
import { generatePdfReport, generateExcelReport } from '../lib/reportGenerators';
import { getCachedDriveToken } from '../lib/firebase';
import { formatToIST } from '../lib/dateUtils';
import {
  HardDrive,
  Cloud,
  Folder,
  FileText,
  FileSpreadsheet,
  FileCode,
  ExternalLink,
  Download,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Search,
  UploadCloud,
  Database,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  FolderPlus,
} from 'lucide-react';

interface GoogleDriveViewProps {
  user: UserProfile;
  devices: Device[];
  events: SystemEvent[];
  sessions: UsageSession[];
  reports: Report[];
}

export const GoogleDriveView: React.FC<GoogleDriveViewProps> = ({
  user,
  devices,
  events,
  sessions,
  reports,
}) => {
  const [token, setToken] = useState<string | null>(getCachedDriveToken());
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Drive state
  const [quota, setQuota] = useState<DriveStorageQuota | null>(null);
  const [appFolderId, setAppFolderId] = useState<string | null>(null);
  const [files, setFiles] = useState<DriveFileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [activeFolderTab, setActiveFolderTab] = useState<'ALL' | 'REPORTS' | 'BACKUPS'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Action status
  const [backingUp, setBackingUp] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<{ message: string; link?: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Destructive Confirmation Modal State (MANDATORY per Workspace guidelines)
  const [fileToDelete, setFileToDelete] = useState<DriveFileItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load drive info and files when token is available
  const loadDriveData = useCallback(async (activeToken: string) => {
    setLoadingFiles(true);
    setActionError(null);
    try {
      // 1. Fetch quota and user details
      const quotaData = await getDriveStorageInfo(activeToken).catch((err) => {
        console.warn('[DRIVE_QUOTA_WARN]', err);
        return null;
      });
      if (quotaData) setQuota(quotaData);

      // 2. Locate or create root folder
      const rootFolderId = await getOrCreateAppFolder(activeToken, 'System Usage Logger Pro');
      setAppFolderId(rootFolderId);

      // 3. List files in app root or all app files
      const fileList = await listDriveFiles(
        activeToken,
        undefined,
        `'${rootFolderId}' in parents or name contains 'SysLogger'`
      );
      setFiles(fileList);
    } catch (err: any) {
      console.error('[DRIVE_LOAD_ERROR]', err);
      setActionError(err.message || 'Unable to connect to Google Drive. Please re-authorize.');
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    const existing = getCachedDriveToken();
    if (existing) {
      setToken(existing);
      loadDriveData(existing);
    }
  }, [loadDriveData]);

  // Handle Google Drive OAuth Authorization
  const handleConnectDrive = async () => {
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      const driveToken = await ensureDriveAccessToken();
      setToken(driveToken);
      await loadDriveData(driveToken);
    } catch (err: any) {
      setAuthError(err.message || 'Failed to authenticate with Google Drive');
    } finally {
      setIsAuthenticating(false);
    }
  };

  // 1. Full Database Snapshot Backup
  const handleBackupDatabase = async () => {
    if (!token) {
      await handleConnectDrive();
      return;
    }

    setBackingUp(true);
    setActionSuccess(null);
    setActionError(null);

    try {
      const payload = {
        exportDate: new Date().toISOString(),
        version: '1.0.3',
        app: 'System Usage Logger Pro',
        user: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
        },
        stats: {
          totalDevices: devices.length,
          totalEvents: events.length,
          totalSessions: sessions.length,
          totalReports: reports.length,
        },
        devices,
        events,
        sessions,
        reports,
      };

      const result = await backupDatabaseToDrive(token, payload);
      setActionSuccess({
        message: `Database snapshot '${result.name}' successfully backed up to Google Drive!`,
        link: result.webViewLink,
      });
      await loadDriveData(token);
    } catch (err: any) {
      setActionError(err.message || 'Failed to backup database to Google Drive');
    } finally {
      setBackingUp(false);
    }
  };

  // 2. Export PDF Report to Drive
  const handleExportPdfToDrive = async () => {
    if (!token) {
      await handleConnectDrive();
      return;
    }

    setExportingPdf(true);
    setActionSuccess(null);
    setActionError(null);

    try {
      const reportData = {
        title: 'SYSTEM USAGE LOGGER MONTHLY REPORT',
        period: `${new Date().toLocaleString('default', { month: 'long' })} ${new Date().getFullYear()}`,
        userName: user.displayName || 'Authenticated User',
        userEmail: user.email,
        generatedAt: new Date().toISOString(),
        environment: 'PRODUCTION' as const,
        devices,
        sessions,
        events,
        stats: {
          totalDevices: devices.length,
          totalUsageMinutes: sessions.reduce((acc, s) => acc + s.durationMinutes, 0),
          totalSessions: sessions.length,
          totalActiveMinutes: sessions.reduce((acc, s) => acc + s.activeMinutes, 0),
          totalIdleMinutes: sessions.reduce((acc, s) => acc + s.idleMinutes, 0),
          totalLockMinutes: sessions.reduce((acc, s) => acc + s.lockMinutes, 0),
          totalSleepMinutes: sessions.reduce((acc, s) => acc + s.sleepMinutes, 0),
          startupCount: events.filter((e) => e.eventType === 'STARTUP').length,
          shutdownCount: events.filter((e) => e.eventType === 'SHUTDOWN').length,
          lockCount: events.filter((e) => e.eventType === 'LOCK').length,
          unlockCount: events.filter((e) => e.eventType === 'UNLOCK').length,
          sleepCount: events.filter((e) => e.eventType === 'SLEEP').length,
          wakeCount: events.filter((e) => e.eventType === 'WAKE').length,
        },
      };

      const pdfBase64 = generatePdfReport(reportData);
      const byteCharacters = atob(pdfBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const pdfBlob = new Blob([byteArray], { type: 'application/pdf' });

      const timestamp = new Date().toISOString().slice(0, 10);
      const fileName = `SysLogger-Report-${timestamp}.pdf`;

      const result = await uploadReportArtifactToDrive(token, {
        fileName,
        mimeType: 'application/pdf',
        content: pdfBlob,
        reportTitle: `System Usage PDF Report — ${reportData.period}`,
      });

      setActionSuccess({
        message: `PDF Report '${result.name}' successfully uploaded to Google Drive!`,
        link: result.webViewLink,
      });
      await loadDriveData(token);
    } catch (err: any) {
      setActionError(err.message || 'Failed to export PDF to Google Drive');
    } finally {
      setExportingPdf(false);
    }
  };

  // 3. Export Excel Spreadsheet to Drive
  const handleExportExcelToDrive = async () => {
    if (!token) {
      await handleConnectDrive();
      return;
    }

    setExportingExcel(true);
    setActionSuccess(null);
    setActionError(null);

    try {
      const reportData = {
        title: 'SYSTEM USAGE LOGGER MONTHLY REPORT',
        period: `${new Date().toLocaleString('default', { month: 'long' })} ${new Date().getFullYear()}`,
        userName: user.displayName || 'Authenticated User',
        userEmail: user.email,
        generatedAt: new Date().toISOString(),
        environment: 'PRODUCTION' as const,
        devices,
        sessions,
        events,
        stats: {
          totalDevices: devices.length,
          totalUsageMinutes: sessions.reduce((acc, s) => acc + s.durationMinutes, 0),
          totalSessions: sessions.length,
          totalActiveMinutes: sessions.reduce((acc, s) => acc + s.activeMinutes, 0),
          totalIdleMinutes: sessions.reduce((acc, s) => acc + s.idleMinutes, 0),
          totalLockMinutes: sessions.reduce((acc, s) => acc + s.lockMinutes, 0),
          totalSleepMinutes: sessions.reduce((acc, s) => acc + s.sleepMinutes, 0),
          startupCount: events.filter((e) => e.eventType === 'STARTUP').length,
          shutdownCount: events.filter((e) => e.eventType === 'SHUTDOWN').length,
          lockCount: events.filter((e) => e.eventType === 'LOCK').length,
          unlockCount: events.filter((e) => e.eventType === 'UNLOCK').length,
          sleepCount: events.filter((e) => e.eventType === 'SLEEP').length,
          wakeCount: events.filter((e) => e.eventType === 'WAKE').length,
        },
      };

      const excelBase64 = generateExcelReport(reportData);
      const byteCharacters = atob(excelBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const excelBlob = new Blob([byteArray], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const timestamp = new Date().toISOString().slice(0, 10);
      const fileName = `SysLogger-Report-${timestamp}.xlsx`;

      const result = await uploadReportArtifactToDrive(token, {
        fileName,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        content: excelBlob,
        reportTitle: `System Usage Excel Spreadsheet — ${reportData.period}`,
      });

      setActionSuccess({
        message: `Excel Workbook '${result.name}' successfully uploaded to Google Drive!`,
        link: result.webViewLink,
      });
      await loadDriveData(token);
    } catch (err: any) {
      setActionError(err.message || 'Failed to export Excel to Google Drive');
    } finally {
      setExportingExcel(false);
    }
  };

  // 4. Delete File with Confirmed Action
  const handleConfirmDelete = async () => {
    if (!token || !fileToDelete) return;

    setIsDeleting(true);
    setActionError(null);
    try {
      await deleteDriveFile(token, fileToDelete.id);
      setActionSuccess({
        message: `File '${fileToDelete.name}' has been permanently deleted from Google Drive.`,
      });
      setFileToDelete(null);
      await loadDriveData(token);
    } catch (err: any) {
      setActionError(err.message || 'Failed to delete file from Google Drive');
    } finally {
      setIsDeleting(false);
    }
  };

  // Filter files by tab and search
  const filteredFiles = files.filter((f) => {
    const matchesSearch =
      searchQuery.trim() === '' ||
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.description && f.description.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (activeFolderTab === 'REPORTS') {
      return (
        f.mimeType === 'application/pdf' ||
        f.mimeType.includes('spreadsheet') ||
        f.name.endsWith('.pdf') ||
        f.name.endsWith('.xlsx')
      );
    }
    if (activeFolderTab === 'BACKUPS') {
      return (
        f.mimeType === 'application/json' ||
        f.name.endsWith('.json') ||
        f.name.includes('Backup')
      );
    }
    return true;
  });

  const usedBytes = quota?.usage ? parseInt(quota.usage, 10) : 0;
  const limitBytes = quota?.limit ? parseInt(quota.limit, 10) : 0;
  const quotaPercent = limitBytes > 0 ? Math.min(100, Math.round((usedBytes / limitBytes) * 100)) : 0;

  return (
    <div id="google-drive-view" className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-start space-x-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0 shadow-xs">
            <HardDrive className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2.5">
              <h1 className="text-xl font-bold text-slate-900">Google Drive Cloud Workspace</h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                Official REST API v3
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-xl">
              Seamlessly backup audit event logs, export monthly compliance PDFs, and store detailed Excel
              spreadsheets directly into your personal or corporate Google Drive.
            </p>
          </div>
        </div>

        {/* Connection Action */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          {token ? (
            <div className="flex items-center space-x-2 bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2 rounded-xl text-xs font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Drive Connected</span>
              <button
                onClick={() => loadDriveData(token)}
                disabled={loadingFiles}
                className="ml-2 text-emerald-700 hover:text-emerald-900 hover:bg-emerald-100 p-1 rounded-md transition"
                title="Refresh Drive Files"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingFiles ? 'animate-spin' : ''}`} />
              </button>
            </div>
          ) : (
            <button
              id="btn-connect-google-drive"
              onClick={handleConnectDrive}
              disabled={isAuthenticating}
              className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition"
            >
              <Cloud className="w-4 h-4" />
              <span>{isAuthenticating ? 'Authorizing...' : 'Authorize Google Drive'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Auth Error Banner if any */}
      {authError && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start space-x-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">Google Drive Connection Notice: </span>
            <span>{authError}</span>
          </div>
        </div>
      )}

      {/* Action Notification Banner */}
      {actionSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{actionSuccess.message}</span>
          </div>
          {actionSuccess.link && (
            <a
              href={actionSuccess.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-bold text-[11px] transition shrink-0 ml-3"
            >
              <span>View in Drive</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
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

      {/* Drive Status & 1-Click Operations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Drive Account & Quota */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Drive Storage & Account
              </span>
              <Cloud className="w-4 h-4 text-blue-600" />
            </div>

            <div className="flex items-center space-x-3 mb-4">
              {quota?.user?.photoLink ? (
                <img
                  src={quota.user.photoLink}
                  alt="Drive User"
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 rounded-full border border-slate-200"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-sm">
                  {user.displayName?.charAt(0) || 'G'}
                </div>
              )}
              <div className="overflow-hidden">
                <div className="text-xs font-bold text-slate-900 truncate">
                  {quota?.user?.displayName || user.displayName}
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  {quota?.user?.emailAddress || user.email}
                </div>
              </div>
            </div>

            {/* Storage bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] text-slate-500 font-medium">
                <span>Used: {formatBytes(usedBytes)}</span>
                <span>{limitBytes > 0 ? formatBytes(limitBytes) : 'Unlimited'}</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(2, quotaPercent)}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-400 text-right">
                {quotaPercent}% quota utilized
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center space-x-1">
              <Folder className="w-3.5 h-3.5 text-amber-500" />
              <span>Target: /System Usage Logger Pro</span>
            </span>
            <span className="text-emerald-600 font-bold">Encrypted</span>
          </div>
        </div>

        {/* Database Snapshot Backup Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Instant System Backup
              </span>
              <Database className="w-4 h-4 text-emerald-600" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Full Telemetry Snapshot</h3>
            <p className="text-xs text-slate-500 mb-4">
              Pack all {events.length} system events, {devices.length} registered workstations, and active sessions into a structured JSON backup in Google Drive.
            </p>
          </div>

          <button
            id="btn-backup-to-drive"
            onClick={handleBackupDatabase}
            disabled={backingUp}
            className="w-full flex items-center justify-center space-x-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-2.5 rounded-xl transition shadow-xs"
          >
            {backingUp ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Uploading Snapshot...</span>
              </>
            ) : (
              <>
                <UploadCloud className="w-4 h-4 text-emerald-400" />
                <span>Backup Database to Drive</span>
              </>
            )}
          </button>
        </div>

        {/* Reports Push Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Direct Artifact Exports
              </span>
              <Sparkles className="w-4 h-4 text-blue-600" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Export Compliance Reports</h3>
            <p className="text-xs text-slate-500 mb-4">
              Generate the current month's executive PDF report and Excel audit sheets and automatically store them in Drive.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              id="btn-export-pdf-drive"
              onClick={handleExportPdfToDrive}
              disabled={exportingPdf}
              className="flex items-center justify-center space-x-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold py-2.5 rounded-xl transition"
            >
              {exportingPdf ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileText className="w-3.5 h-3.5" />
              )}
              <span>Export PDF</span>
            </button>

            <button
              id="btn-export-excel-drive"
              onClick={handleExportExcelToDrive}
              disabled={exportingExcel}
              className="flex items-center justify-center space-x-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold py-2.5 rounded-xl transition"
            >
              {exportingExcel ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-3.5 h-3.5" />
              )}
              <span>Export Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* Google Drive File Explorer */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        {/* Explorer Header */}
        <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <Folder className="w-5 h-5 text-amber-500" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">Google Drive Files & Backups</h2>
              <p className="text-[11px] text-slate-500">
                Displaying artifacts synchronized with Google Drive
              </p>
            </div>
          </div>

          {/* Filter Tabs & Search */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            {/* Search */}
            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search drive files..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Folder Filter Pills */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs font-medium self-stretch sm:self-auto">
              <button
                onClick={() => setActiveFolderTab('ALL')}
                className={`px-3 py-1 rounded-md transition ${
                  activeFolderTab === 'ALL'
                    ? 'bg-white text-blue-600 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({files.length})
              </button>
              <button
                onClick={() => setActiveFolderTab('REPORTS')}
                className={`px-3 py-1 rounded-md transition ${
                  activeFolderTab === 'REPORTS'
                    ? 'bg-white text-blue-600 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Reports
              </button>
              <button
                onClick={() => setActiveFolderTab('BACKUPS')}
                className={`px-3 py-1 rounded-md transition ${
                  activeFolderTab === 'BACKUPS'
                    ? 'bg-white text-blue-600 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Backups
              </button>
            </div>
          </div>
        </div>

        {/* Files List Table */}
        {loadingFiles ? (
          <div className="p-12 text-center space-y-3">
            <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto" />
            <div className="text-xs text-slate-500 font-medium">
              Fetching Google Drive repository items...
            </div>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Cloud className="w-10 h-10 text-slate-300 mx-auto" />
            <h4 className="text-sm font-bold text-slate-700">No Drive Artifacts Found</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {searchQuery
                ? `No files matching "${searchQuery}" in Google Drive.`
                : 'Click "Backup Database to Drive" or export a report above to automatically save files into your Google Drive.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">File Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Last Modified (IST)</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredFiles.map((file) => {
                  const isPdf = file.mimeType === 'application/pdf' || file.name.endsWith('.pdf');
                  const isExcel =
                    file.mimeType.includes('spreadsheet') || file.name.endsWith('.xlsx');
                  const isJson =
                    file.mimeType === 'application/json' || file.name.endsWith('.json');
                  const isFolder = file.mimeType === 'application/vnd.google-apps.folder';

                  return (
                    <tr key={file.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center space-x-3">
                          {isPdf && (
                            <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                              <FileText className="w-4 h-4" />
                            </div>
                          )}
                          {isExcel && (
                            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
                              <FileSpreadsheet className="w-4 h-4" />
                            </div>
                          )}
                          {isJson && (
                            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shrink-0">
                              <FileCode className="w-4 h-4" />
                            </div>
                          )}
                          {isFolder && (
                            <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
                              <Folder className="w-4 h-4" />
                            </div>
                          )}

                          <div className="overflow-hidden">
                            <div className="font-bold text-slate-900 truncate max-w-xs sm:max-w-md">
                              {file.name}
                            </div>
                            {file.description && (
                              <div className="text-[10px] text-slate-400 truncate max-w-xs sm:max-w-md">
                                {file.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-slate-600">
                        {isPdf && (
                          <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 font-semibold text-[10px]">
                            PDF Report
                          </span>
                        )}
                        {isExcel && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-[10px]">
                            Excel Sheet
                          </span>
                        )}
                        {isJson && (
                          <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold text-[10px]">
                            JSON Snapshot
                          </span>
                        )}
                        {isFolder && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 font-semibold text-[10px]">
                            Folder
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-slate-500 font-mono text-[11px]">
                        {formatBytes(file.size)}
                      </td>

                      <td className="px-4 py-3.5 text-slate-500 font-mono text-[11px]">
                        {file.modifiedTime
                          ? formatToIST(file.modifiedTime)
                          : file.createdTime
                          ? formatToIST(file.createdTime)
                          : '—'}
                      </td>

                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          {file.webViewLink && (
                            <a
                              href={file.webViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                              title="Open in Google Drive"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}

                          {file.webContentLink && (
                            <a
                              href={file.webContentLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                              title="Direct Download"
                            >
                              <Download className="w-4 h-4" />
                            </a>
                          )}

                          <button
                            id={`btn-delete-drive-file-${file.id}`}
                            onClick={() => setFileToDelete(file)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Delete file from Drive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MANDATORY DESTRUCTIVE CONFIRMATION MODAL */}
      {fileToDelete && (
        <div
          id="delete-drive-file-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900">
                Delete File from Google Drive?
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to permanently delete{' '}
                <span className="font-semibold text-slate-900">"{fileToDelete.name}"</span> from your Google Drive account? This action cannot be undone.
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">File ID:</span>
                <span className="font-mono text-slate-700">{fileToDelete.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Size:</span>
                <span>{formatBytes(fileToDelete.size)}</span>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                id="btn-cancel-delete-drive"
                onClick={() => setFileToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>

              <button
                id="btn-confirm-delete-drive"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex items-center space-x-1.5 px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition shadow-xs"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirm Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
