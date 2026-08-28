import { getCachedGmailToken, requestGmailAccessToken } from './firebase';

export interface GmailProfile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId: string;
}

export interface GmailMessageHeader {
  name: string;
  value: string;
}

export interface GmailMessageItem {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  labelIds?: string[];
  subject?: string;
  from?: string;
  to?: string;
  date?: string;
}

export interface GmailAttachment {
  filename: string;
  mimeType: string;
  content: string; // Base64 encoded string
}

export interface SendGmailOptions {
  to: string;
  from?: string;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  attachments?: GmailAttachment[];
}

export interface GmailDraftItem {
  id: string;
  message: {
    id: string;
    threadId: string;
    snippet?: string;
  };
}

/**
 * Ensures a valid Google Workspace / Gmail OAuth access token.
 */
export async function ensureGmailAccessToken(): Promise<string> {
  const existing = getCachedGmailToken();
  if (existing) {
    return existing;
  }
  return await requestGmailAccessToken();
}

/**
 * Fetches user Gmail profile information (email address, total messages, threads)
 */
export async function getGmailProfile(token: string): Promise<GmailProfile> {
  const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to fetch Gmail profile (${resp.status})`);
  }

  return await resp.json();
}

/**
 * Encodes string/binary to RFC 4648 Base64URL string
 */
function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Encodes a header with UTF-8 support
 */
function encodeHeaderValue(value: string): string {
  // Check if string contains non-ASCII characters
  if (/^[\x00-\x7F]*$/.test(value)) {
    return value;
  }
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `=?utf-8?B?${btoa(binary)}?=`;
}

/**
 * Builds RFC 2822 compliant MIME raw email string
 */
export function buildRfc2822Message(options: SendGmailOptions): string {
  const boundaryMixed = `====_Mixed_Boundary_${Date.now()}_${Math.random().toString(36).slice(2)}====`;
  const boundaryAlt = `====_Alt_Boundary_${Date.now()}_${Math.random().toString(36).slice(2)}====`;

  const headers: string[] = [
    `To: ${options.to}`,
    `Subject: ${encodeHeaderValue(options.subject)}`,
    'MIME-Version: 1.0',
  ];

  if (options.from) {
    headers.push(`From: ${options.from}`);
  }

  const hasAttachments = options.attachments && options.attachments.length > 0;

  let rawMessage = '';

  if (hasAttachments) {
    headers.push(`Content-Type: multipart/mixed; boundary="${boundaryMixed}"`);
    rawMessage = headers.join('\r\n') + '\r\n\r\n';

    // Body container
    rawMessage += `--${boundaryMixed}\r\n`;
    rawMessage += `Content-Type: multipart/alternative; boundary="${boundaryAlt}"\r\n\r\n`;

    // Plain text part
    if (options.bodyText) {
      rawMessage += `--${boundaryAlt}\r\n`;
      rawMessage += `Content-Type: text/plain; charset="UTF-8"\r\n`;
      rawMessage += `Content-Transfer-Encoding: 7bit\r\n\r\n`;
      rawMessage += options.bodyText + '\r\n\r\n';
    }

    // HTML part
    if (options.bodyHtml) {
      rawMessage += `--${boundaryAlt}\r\n`;
      rawMessage += `Content-Type: text/html; charset="UTF-8"\r\n`;
      rawMessage += `Content-Transfer-Encoding: 7bit\r\n\r\n`;
      rawMessage += options.bodyHtml + '\r\n\r\n';
    }

    rawMessage += `--${boundaryAlt}--\r\n\r\n`;

    // Attachment parts
    for (const att of options.attachments!) {
      // Ensure attachment base64 doesn't have data: prefix
      const cleanBase64 = att.content.includes('base64,')
        ? att.content.split('base64,')[1]
        : att.content;

      // Break base64 into 76-character lines as per MIME standard
      const formattedBase64 = cleanBase64.replace(/(.{76})/g, '$1\r\n');

      rawMessage += `--${boundaryMixed}\r\n`;
      rawMessage += `Content-Type: ${att.mimeType}; name="${att.filename}"\r\n`;
      rawMessage += `Content-Disposition: attachment; filename="${att.filename}"\r\n`;
      rawMessage += `Content-Transfer-Encoding: base64\r\n\r\n`;
      rawMessage += formattedBase64 + '\r\n\r\n';
    }

    rawMessage += `--${boundaryMixed}--\r\n`;
  } else {
    // No attachments - multipart/alternative or simple html/plain
    if (options.bodyHtml && options.bodyText) {
      headers.push(`Content-Type: multipart/alternative; boundary="${boundaryAlt}"`);
      rawMessage = headers.join('\r\n') + '\r\n\r\n';

      rawMessage += `--${boundaryAlt}\r\n`;
      rawMessage += `Content-Type: text/plain; charset="UTF-8"\r\n`;
      rawMessage += `Content-Transfer-Encoding: 7bit\r\n\r\n`;
      rawMessage += options.bodyText + '\r\n\r\n';

      rawMessage += `--${boundaryAlt}\r\n`;
      rawMessage += `Content-Type: text/html; charset="UTF-8"\r\n`;
      rawMessage += `Content-Transfer-Encoding: 7bit\r\n\r\n`;
      rawMessage += options.bodyHtml + '\r\n\r\n';

      rawMessage += `--${boundaryAlt}--\r\n`;
    } else if (options.bodyHtml) {
      headers.push('Content-Type: text/html; charset="UTF-8"');
      headers.push('Content-Transfer-Encoding: 7bit');
      rawMessage = headers.join('\r\n') + '\r\n\r\n' + options.bodyHtml;
    } else {
      headers.push('Content-Type: text/plain; charset="UTF-8"');
      headers.push('Content-Transfer-Encoding: 7bit');
      rawMessage = headers.join('\r\n') + '\r\n\r\n' + (options.bodyText || '');
    }
  }

  return rawMessage;
}

/**
 * Sends an email directly using the official Gmail REST API v1
 */
export async function sendEmailViaGmail(
  token: string,
  options: SendGmailOptions
): Promise<{ id: string; threadId: string; labelIds?: string[] }> {
  const rawRfc2822 = buildRfc2822Message(options);
  const encodedRaw = base64UrlEncode(rawRfc2822);

  const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encodedRaw }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to send email via Gmail (${resp.status})`);
  }

  return await resp.json();
}

/**
 * Creates an email Draft directly in the user's Gmail mailbox
 */
export async function createDraftViaGmail(
  token: string,
  options: SendGmailOptions
): Promise<{ id: string; message: { id: string; threadId: string } }> {
  const rawRfc2822 = buildRfc2822Message(options);
  const encodedRaw = base64UrlEncode(rawRfc2822);

  const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: { raw: encodedRaw },
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to create draft in Gmail (${resp.status})`);
  }

  return await resp.json();
}

/**
 * Lists user's messages (with optional search query like subject, from, etc.)
 */
export async function listGmailMessages(
  token: string,
  options: { q?: string; maxResults?: number; labelIds?: string[] } = {}
): Promise<GmailMessageItem[]> {
  const params = new URLSearchParams();
  if (options.q) params.set('q', options.q);
  if (options.maxResults) params.set('maxResults', String(options.maxResults));
  if (options.labelIds) {
    options.labelIds.forEach((lbl) => params.append('labelIds', lbl));
  }

  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to list Gmail messages (${resp.status})`);
  }

  const data = await resp.json();
  const rawList: { id: string; threadId: string }[] = data.messages || [];

  if (rawList.length === 0) return [];

  // Fetch metadata details for the messages (up to 15 items in parallel)
  const detailPromises = rawList.slice(0, 15).map(async (item) => {
    try {
      const detailResp = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!detailResp.ok) return { id: item.id, threadId: item.threadId };
      const detailData = await detailResp.json();

      const headers: GmailMessageHeader[] = detailData.payload?.headers || [];
      const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value || '(No Subject)';
      const from = headers.find((h) => h.name.toLowerCase() === 'from')?.value || '';
      const to = headers.find((h) => h.name.toLowerCase() === 'to')?.value || '';
      const date = headers.find((h) => h.name.toLowerCase() === 'date')?.value || '';

      return {
        id: detailData.id,
        threadId: detailData.threadId,
        snippet: detailData.snippet,
        internalDate: detailData.internalDate,
        labelIds: detailData.labelIds,
        subject,
        from,
        to,
        date,
      };
    } catch {
      return { id: item.id, threadId: item.threadId };
    }
  });

  return await Promise.all(detailPromises);
}

/**
 * Formats standard rich HTML body for System Usage Logger monthly reports
 */
export function buildReportEmailHtml(params: {
  period: string;
  userName: string;
  totalDevices: number;
  totalSessions: number;
  totalUsageMinutes: number;
  totalActiveMinutes: number;
  totalIdleMinutes: number;
  startupEvents: number;
  shutdownEvents: number;
}): string {
  const usageHours = (params.totalUsageMinutes / 60).toFixed(1);
  const activeHours = (params.totalActiveMinutes / 60).toFixed(1);
  const idleHours = (params.totalIdleMinutes / 60).toFixed(1);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; }
    .header { background: #0f172a; color: #ffffff; padding: 32px 24px; text-align: left; }
    .header h1 { margin: 0 0 8px 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; color: #ffffff; }
    .header p { margin: 0; font-size: 13px; color: #94a3b8; }
    .content { padding: 24px; }
    .metric-grid { display: table; width: 100%; margin: 20px 0; border-collapse: separate; border-spacing: 8px; }
    .metric-row { display: table-row; }
    .metric-card { display: table-cell; width: 50%; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; text-align: center; }
    .metric-val { font-size: 22px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
    .metric-lbl { font-size: 11px; text-transform: uppercase; font-weight: 600; color: #64748b; letter-spacing: 0.05em; }
    .details-table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px; }
    .details-table th { background: #f1f5f9; padding: 10px 12px; text-align: left; font-weight: 600; color: #475569; border-bottom: 1px solid #cbd5e1; }
    .details-table td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; }
    .badge { display: inline-block; padding: 4px 10px; background: #eff6ff; color: #1d4ed8; border-radius: 6px; font-size: 12px; font-weight: 600; }
    .footer { padding: 20px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div style="font-size: 11px; font-weight: 700; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 6px;">
        System Usage Logger Pro • Automated Audit
      </div>
      <h1>Computer Usage Report — ${params.period}</h1>
      <p>Audit compiled for <strong>${params.userName}</strong> • Generated securely via Gmail API</p>
    </div>

    <div class="content">
      <p style="font-size: 14px; color: #475569; margin-top: 0;">
        Hello, please find attached the monthly computer usage telemetry report and audit workbook for <strong>${params.period}</strong>.
      </p>

      <div class="metric-grid">
        <div class="metric-row">
          <div class="metric-card">
            <div class="metric-val">${usageHours} hrs</div>
            <div class="metric-lbl">Total Logged Time</div>
          </div>
          <div class="metric-card">
            <div class="metric-val">${activeHours} hrs</div>
            <div class="metric-lbl">Active Working Time</div>
          </div>
        </div>
        <div class="metric-row">
          <div class="metric-card">
            <div class="metric-val">${params.totalDevices}</div>
            <div class="metric-lbl">Monitored Workstations</div>
          </div>
          <div class="metric-card">
            <div class="metric-val">${params.totalSessions}</div>
            <div class="metric-lbl">Active Sessions</div>
          </div>
        </div>
      </div>

      <table class="details-table">
        <tr>
          <th>Telemetry Category</th>
          <th>Recorded Metric</th>
        </tr>
        <tr>
          <td>Idle Duration</td>
          <td><strong>${idleHours} hours</strong></td>
        </tr>
        <tr>
          <td>System Startup Events</td>
          <td><strong>${params.startupEvents} events</strong></td>
        </tr>
        <tr>
          <td>System Shutdown Events</td>
          <td><strong>${params.shutdownEvents} events</strong></td>
        </tr>
        <tr>
          <td>Attached File Formats</td>
          <td><span class="badge">Executive PDF</span> &nbsp; <span class="badge">Audit Excel (.xlsx)</span></td>
        </tr>
      </table>

      <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">
        Both the standalone executive PDF summary and raw Excel audit spreadsheet are attached to this email.
      </p>
    </div>

    <div class="footer">
      Generated automatically by System Usage Logger Pro • Secure Google Workspace Integration
    </div>
  </div>
</body>
</html>
  `.trim();
}
