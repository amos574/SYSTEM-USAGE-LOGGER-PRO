import * as XLSX from 'xlsx';
import { Device, SystemEvent, UsageSession } from '../types';
import { buildProfessionalPdf, buildBasicValidationPdf, PdfReportData } from './pdfGenerator';
import { uint8ToBase64 } from './pdfUtils';
import { formatToIST, formatTimeToIST } from './dateUtils';

export interface ReportData extends PdfReportData {
  title: string;
}

export function generateBasicTestPdfReport(userName: string, userEmail: string, dateStr: string): string {
  const bytes = buildBasicValidationPdf(userName, userEmail, dateStr);
  const base64Str = uint8ToBase64(bytes);
  return `data:application/pdf;base64,${base64Str}`;
}

export function generatePdfBuffer(data: ReportData): Uint8Array {
  return buildProfessionalPdf(data);
}

// Generate PDF Document and Return Base64 Data URI
export function generatePdfReport(data: ReportData): string {
  const bytes = buildProfessionalPdf(data);
  const base64Str = uint8ToBase64(bytes);
  return `data:application/pdf;base64,${base64Str}`;
}

// Generate Excel Workbook and Return Base64
export function generateTrialExcelReport(data: ReportData): string {
  const workbook = XLSX.utils.book_new();

  // Sheet 1: Trial Summary
  const summaryData = [
    ['SYSTEM USAGE LOGGER PRO — 7-DAY PRO TRIAL REPORT'],
    ['NOTICE', 'TRIAL / SAMPLE DATA — NOT ACTUAL CUSTOMER USAGE'],
    [],
    ['Account Name', data.userName],
    ['Account Email', data.userEmail],
    ['Trial Period', data.period],
    ['Trial Status', 'ACTIVE (7-Day Pro Trial)'],
    ['Environment', 'TRIAL'],
    ['Generated At (IST)', formatToIST(data.generatedAt)],
    [],
    ['METRIC', 'VALUE', 'UNIT', 'DESCRIPTION'],
    ['Monitored Workstations', data.stats.totalDevices, 'Devices', 'Sample configured endpoints'],
    ['Total Usage Time', (data.stats.totalUsageMinutes / 60).toFixed(2), 'Hours', 'Cumulative system powered-on time'],
    ['Total Usage Minutes', data.stats.totalUsageMinutes, 'Minutes', 'Minutes of logged usage'],
    ['Active Work Time', (data.stats.totalActiveMinutes / 60).toFixed(2), 'Hours', 'Time with active keyboard/mouse activity'],
    ['Idle Inactive Time', (data.stats.totalIdleMinutes / 60).toFixed(2), 'Hours', 'System idle before sleep/lock'],
    ['Locked Screen Time', (data.stats.totalLockMinutes / 60).toFixed(2), 'Hours', 'Time workstation in locked state'],
    ['Sleep Standby Time', (data.stats.totalSleepMinutes / 60).toFixed(2), 'Hours', 'Time in low power sleep state'],
    ['Total Recorded Sessions', data.stats.totalSessions, 'Sessions', 'Startup to shutdown cycles'],
    ['Cold Boot Startups', data.stats.startupCount, 'Events', 'System boot events recorded'],
    ['Shutdowns', data.stats.shutdownCount, 'Events', 'Clean power off events'],
    ['Lock Transitions', data.stats.lockCount, 'Events', 'Workstation lock events'],
    ['Unlock Transitions', data.stats.unlockCount, 'Events', 'Workstation unlock events'],
    ['Sleep Transitions', data.stats.sleepCount, 'Events', 'System sleep events'],
    ['Wake Transitions', data.stats.wakeCount, 'Events', 'System wake events'],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Trial Summary');

  // Sheet 2: Usage Log
  const usageLogHeader = ['Log ID', 'Device Name', 'Device ID', 'Date', 'Start Time (IST)', 'End Time (IST)', 'Total (min)', 'Active (min)', 'Idle (min)', 'Lock (min)', 'Sleep (min)', 'Data Type'];
  const usageLogRows = data.sessions.map((s, idx) => [
    `LOG-${String(idx + 1).padStart(4, '0')}`,
    s.deviceName,
    s.deviceId,
    s.date,
    formatTimeToIST(s.startTime),
    s.endTime ? formatTimeToIST(s.endTime) : 'Ongoing',
    s.durationMinutes,
    s.activeMinutes,
    s.idleMinutes,
    s.lockMinutes,
    s.sleepMinutes,
    'TRIAL_SAMPLE',
  ]);
  const usageLogSheet = XLSX.utils.aoa_to_sheet([usageLogHeader, ...usageLogRows]);
  XLSX.utils.book_append_sheet(workbook, usageLogSheet, 'Usage Log');

  // Sheet 3: Daily Summary
  const dailyHeader = ['Date', 'Device Name', 'Active Hours', 'Idle Hours', 'Lock Hours', 'Sleep Hours', 'Total Hours', 'Session Count'];
  const dailyRows = [
    [data.sessions[0]?.date || 'Today', 'Engineering Workstation (Dell OptiPlex 7090)', '6.8', '0.4', '0.5', '0.3', '8.0', '1'],
    [data.sessions[1]?.date || 'Yesterday', 'Executive Laptop (Lenovo ThinkPad X1 Carbon)', '6.6', '0.5', '0.5', '0.4', '8.0', '1'],
  ];
  const dailySheet = XLSX.utils.aoa_to_sheet([dailyHeader, ...dailyRows]);
  XLSX.utils.book_append_sheet(workbook, dailySheet, 'Daily Summary');

  // Sheet 4: Sessions
  const sessionsHeader = ['Session ID', 'Device Name', 'Device ID', 'Date', 'Start Time', 'End Time', 'Duration (mins)', 'Active (mins)', 'Idle (mins)', 'Lock (mins)', 'Sleep (mins)', 'Status'];
  const sessionsRows = data.sessions.map((s) => [
    s.sessionId,
    s.deviceName,
    s.deviceId,
    s.date,
    s.startTime,
    s.endTime || 'Ongoing',
    s.durationMinutes,
    s.activeMinutes,
    s.idleMinutes,
    s.lockMinutes,
    s.sleepMinutes,
    s.status || 'COMPLETED',
  ]);
  const sessionsSheet = XLSX.utils.aoa_to_sheet([sessionsHeader, ...sessionsRows]);
  XLSX.utils.book_append_sheet(workbook, sessionsSheet, 'Sessions');

  // Sheet 5: Events
  const eventsHeader = ['Event ID', 'Device Name', 'Device ID', 'Event Type', 'Timestamp (UTC)', 'Timezone', 'Operating System', 'Agent Version', 'Event Source', 'Sync Status'];
  const eventsRows = data.events.map((e) => [
    e.eventId,
    e.deviceName,
    e.deviceId,
    e.eventType,
    e.timestamp,
    e.timezone,
    e.os,
    e.agentVersion,
    e.source,
    'SYNCED',
  ]);
  const eventsSheet = XLSX.utils.aoa_to_sheet([eventsHeader, ...eventsRows]);
  XLSX.utils.book_append_sheet(workbook, eventsSheet, 'Events');

  // Write base64 string
  const base64Str = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
  return `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64Str}`;
}

// Generate Excel Workbook and Return Base64 (Standard or Trial)
export function generateExcelReport(data: ReportData): string {
  if (data.environment === 'TRIAL') {
    return generateTrialExcelReport(data);
  }

  const workbook = XLSX.utils.book_new();

  // Sheet 1: Summary
  const summaryData = [
    ['SYSTEM USAGE LOGGER - MONTHLY REPORT'],
    ['Product', 'syslogger-pro'],
    ['Reporting Period', data.period],
    ['Environment', data.environment],
    ['User Name', data.userName],
    ['User Email', data.userEmail],
    ['Generated At (IST)', formatToIST(data.generatedAt)],
    [],
    ['METRIC', 'VALUE', 'UNIT'],
    ['Monitored Devices', data.stats.totalDevices, 'Devices'],
    ['Total Usage Time', (data.stats.totalUsageMinutes / 60).toFixed(2), 'Hours'],
    ['Total Usage Time', data.stats.totalUsageMinutes, 'Minutes'],
    ['Total Active Time', (data.stats.totalActiveMinutes / 60).toFixed(2), 'Hours'],
    ['Total Logged Sessions', data.stats.totalSessions, 'Sessions'],
    ['Startup Count', data.stats.startupCount, 'Events'],
    ['Shutdown Count', data.stats.shutdownCount, 'Events'],
    ['Lock Count', data.stats.lockCount, 'Events'],
    ['Unlock Count', data.stats.unlockCount, 'Events'],
    ['Sleep Count', data.stats.sleepCount, 'Events'],
    ['Wake Count', data.stats.wakeCount, 'Events'],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  // Sheet 2: Devices
  const devicesHeader = ['Device Name', 'Device ID', 'OS', 'Agent Version', 'Current State', 'Online Status', 'Registered At (IST)', 'Last Seen (IST)'];
  const devicesRows = data.devices.map((d) => [
    d.deviceName,
    d.deviceId,
    d.os,
    d.agentVersion,
    d.currentState,
    d.isOnline ? 'ONLINE' : 'OFFLINE',
    d.registeredAt ? formatToIST(d.registeredAt) : 'N/A',
    d.lastSeen ? formatToIST(d.lastSeen) : 'N/A',
  ]);
  const devicesSheet = XLSX.utils.aoa_to_sheet([devicesHeader, ...devicesRows]);
  XLSX.utils.book_append_sheet(workbook, devicesSheet, 'Devices');

  // Sheet 3: Usage Sessions
  const sessionsHeader = ['Session ID', 'Device Name', 'Device ID', 'Date', 'Start Time (IST)', 'End Time (IST)', 'Duration (mins)', 'Active (mins)', 'Idle (mins)', 'Lock (mins)', 'Sleep (mins)'];
  const sessionsRows = data.sessions.map((s) => [
    s.sessionId,
    s.deviceName,
    s.deviceId,
    s.date,
    formatTimeToIST(s.startTime),
    s.endTime ? formatTimeToIST(s.endTime) : 'Ongoing',
    s.durationMinutes,
    s.activeMinutes,
    s.idleMinutes,
    s.lockMinutes,
    s.sleepMinutes,
  ]);
  const sessionsSheet = XLSX.utils.aoa_to_sheet([sessionsHeader, ...sessionsRows]);
  XLSX.utils.book_append_sheet(workbook, sessionsSheet, 'Usage Sessions');

  // Sheet 4: System Events
  const eventsHeader = ['Event ID', 'Device Name', 'Device ID', 'Event Type', 'Timestamp (IST)', 'Timezone', 'OS', 'Agent Version', 'Source', 'Synced At (IST)'];
  const eventsRows = data.events.map((e) => [
    e.eventId,
    e.deviceName,
    e.deviceId,
    e.eventType,
    formatToIST(e.timestamp),
    'Asia/Kolkata (IST)',
    e.os,
    e.agentVersion,
    e.source,
    e.syncedAt ? formatToIST(e.syncedAt) : 'N/A',
  ]);
  const eventsSheet = XLSX.utils.aoa_to_sheet([eventsHeader, ...eventsRows]);
  XLSX.utils.book_append_sheet(workbook, eventsSheet, 'System Events');

  // Write base64 string
  const base64Str = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
  return `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64Str}`;
}
