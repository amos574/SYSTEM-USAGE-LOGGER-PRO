import { getCachedDriveToken, requestDriveAccessToken } from './firebase';
import { formatToIST, formatDateToIST } from './dateUtils';

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
  webContentLink?: string;
  iconLink?: string;
  thumbnailLink?: string;
  parents?: string[];
  description?: string;
}

export interface DriveStorageQuota {
  limit?: string;
  usage?: string;
  usageInDrive?: string;
  usageInDriveTrash?: string;
  user?: {
    displayName: string;
    emailAddress: string;
    photoLink?: string;
  };
}

export interface DriveBackupPayload {
  exportDate: string;
  version: string;
  app: string;
  user: {
    uid: string;
    email: string;
    displayName: string;
  };
  stats: {
    totalDevices: number;
    totalEvents: number;
    totalSessions: number;
    totalReports: number;
  };
  devices: any[];
  events: any[];
  sessions: any[];
  reports: any[];
}

const APP_ROOT_FOLDER_NAME = 'System Usage Logger Pro';

/**
 * Ensures we have an active Google Drive OAuth Access Token.
 * If not already cached in memory, prompts user through Google popup.
 */
export async function ensureDriveAccessToken(): Promise<string> {
  const existing = getCachedDriveToken();
  if (existing) {
    return existing;
  }
  return await requestDriveAccessToken();
}

/**
 * Retrieves Drive storage quota and user profile info
 */
export async function getDriveStorageInfo(token: string): Promise<DriveStorageQuota> {
  const resp = await fetch(
    'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,photoLink),storageQuota(limit,usage,usageInDrive,usageInDriveTrash)',
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to fetch Google Drive details (${resp.status})`);
  }

  const data = await resp.json();
  return {
    limit: data.storageQuota?.limit,
    usage: data.storageQuota?.usage,
    usageInDrive: data.storageQuota?.usageInDrive,
    usageInDriveTrash: data.storageQuota?.usageInDriveTrash,
    user: data.user,
  };
}

/**
 * Finds or creates the root 'System Usage Logger Pro' folder in Drive
 */
export async function getOrCreateAppFolder(
  token: string,
  folderName: string = APP_ROOT_FOLDER_NAME,
  parentFolderId?: string
): Promise<string> {
  // Query if folder already exists
  const parentQuery = parentFolderId ? `'${parentFolderId}' in parents` : `'root' in parents`;
  const q = `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName}' and ${parentQuery} and trashed = false`;

  const searchResp = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (searchResp.ok) {
    const searchData = await searchResp.json();
    if (searchData.files && searchData.files.length > 0) {
      return searchData.files[0].id;
    }
  }

  // Create folder if not found
  const createResp = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Created by System Usage Logger Pro for automated report and log backups.',
      parents: parentFolderId ? [parentFolderId] : undefined,
    }),
  });

  if (!createResp.ok) {
    const err = await createResp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to create folder '${folderName}' in Google Drive`);
  }

  const createdFolder = await createResp.json();
  return createdFolder.id;
}

/**
 * Lists files in Google Drive (with optional folder or query filter)
 */
export async function listDriveFiles(
  token: string,
  folderId?: string,
  customQuery?: string,
  pageSize: number = 50
): Promise<DriveFileItem[]> {
  let query = 'trashed = false';

  if (folderId) {
    query += ` and '${folderId}' in parents`;
  }

  if (customQuery) {
    query += ` and (${customQuery})`;
  }

  const fields = 'files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,webContentLink,iconLink,thumbnailLink,parents,description)';
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    query
  )}&orderBy=modifiedTime desc&pageSize=${pageSize}&fields=${encodeURIComponent(fields)}`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to list Google Drive files (${resp.status})`);
  }

  const data = await resp.json();
  return data.files || [];
}

/**
 * Uploads a file (text, JSON, PDF Blob, Excel Blob) to Google Drive using multipart upload
 */
export async function uploadFileToDrive(
  token: string,
  params: {
    name: string;
    mimeType: string;
    content: Blob | string | Uint8Array;
    folderId?: string;
    description?: string;
  }
): Promise<DriveFileItem> {
  const metadata = {
    name: params.name,
    mimeType: params.mimeType,
    description: params.description || 'System Usage Logger Pro exported artifact',
    parents: params.folderId ? [params.folderId] : undefined,
  };

  let contentBlob: Blob;
  if (params.content instanceof Blob) {
    contentBlob = params.content;
  } else if (typeof params.content === 'string') {
    contentBlob = new Blob([params.content], { type: params.mimeType });
  } else {
    contentBlob = new Blob([params.content], { type: params.mimeType });
  }

  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json; charset=UTF-8' })
  );
  form.append('file', contentBlob);

  const resp = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,createdTime,modifiedTime,webViewLink,webContentLink,iconLink,description',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form,
    }
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to upload file '${params.name}' to Google Drive`);
  }

  return await resp.json();
}

/**
 * Exports and uploads a comprehensive system database snapshot to Google Drive
 */
export async function backupDatabaseToDrive(
  token: string,
  payload: DriveBackupPayload,
  subfolderName: string = 'Backups'
): Promise<DriveFileItem> {
  // Ensure App root folder
  const rootFolderId = await getOrCreateAppFolder(token, APP_ROOT_FOLDER_NAME);
  // Ensure Backups subfolder
  const backupsFolderId = await getOrCreateAppFolder(token, subfolderName, rootFolderId);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `SysLogger-Backup-${timestamp}.json`;
  const jsonContent = JSON.stringify(payload, null, 2);

  return await uploadFileToDrive(token, {
    name: fileName,
    mimeType: 'application/json',
    content: jsonContent,
    folderId: backupsFolderId,
    description: `Full snapshot of ${payload.stats.totalEvents} system events, ${payload.stats.totalDevices} devices, ${payload.stats.totalSessions} sessions generated on ${formatToIST(new Date().toISOString())}`,
  });
}

/**
 * Uploads a generated PDF or Excel report directly to the Reports subfolder in Google Drive
 */
export async function uploadReportArtifactToDrive(
  token: string,
  params: {
    fileName: string;
    mimeType: 'application/pdf' | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' | 'application/json';
    content: Blob | string | Uint8Array;
    reportTitle?: string;
  }
): Promise<DriveFileItem> {
  // Ensure App root folder
  const rootFolderId = await getOrCreateAppFolder(token, APP_ROOT_FOLDER_NAME);
  // Ensure Reports subfolder
  const reportsFolderId = await getOrCreateAppFolder(token, 'Reports', rootFolderId);

  return await uploadFileToDrive(token, {
    name: params.fileName,
    mimeType: params.mimeType,
    content: params.content,
    folderId: reportsFolderId,
    description: params.reportTitle || `System Usage Logger Pro generated report (${formatDateToIST(new Date().toISOString())})`,
  });
}

/**
 * Deletes a file from Google Drive.
 * (Note: Callers MUST have already confirmed this with the user via a confirmation dialog)
 */
export async function deleteDriveFile(token: string, fileId: string): Promise<void> {
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok && resp.status !== 204) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to delete file from Google Drive (${resp.status})`);
  }
}

/**
 * Formats byte size to human readable (KB, MB, GB)
 */
export function formatBytes(bytesStr?: string | number): string {
  if (!bytesStr) return '0 B';
  const bytes = typeof bytesStr === 'string' ? parseInt(bytesStr, 10) : bytesStr;
  if (isNaN(bytes) || bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
