// Utility module for 100% binary-safe PDF conversion, hashing, download, and client verification.

/**
 * Safe normalization to Uint8Array for any binary data type.
 */
export function toUint8Array(value: any): Uint8Array {
  if (!value) {
    return new Uint8Array(0);
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (value instanceof DataView) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (typeof globalThis !== 'undefined' && (globalThis as any).Buffer && typeof (globalThis as any).Buffer.isBuffer === 'function' && (globalThis as any).Buffer.isBuffer(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (Array.isArray(value)) {
    return new Uint8Array(value);
  }
  if (typeof value === 'object' && 'buffer' in value && value.buffer instanceof ArrayBuffer) {
    return new Uint8Array(value.buffer, value.byteOffset || 0, value.byteLength || value.length);
  }
  throw new Error(`Cannot normalize value of type ${Object.prototype.toString.call(value)} to Uint8Array`);
}

/**
 * Converts Uint8Array (or ArrayBuffer / Buffer) to base64 string safely without stack size limits or byte corruption.
 */
export function uint8ToBase64(input: any): string {
  const uint8 = toUint8Array(input);
  if (typeof globalThis !== 'undefined' && (globalThis as any).Buffer && typeof (globalThis as any).Buffer.from === 'function') {
    return (globalThis as any).Buffer.from(uint8).toString('base64');
  }
  let binary = '';
  const len = uint8.byteLength;
  const CHUNK_SIZE = 0x8000; // 32768
  for (let i = 0; i < len; i += CHUNK_SIZE) {
    const chunk = uint8.subarray(i, i + CHUNK_SIZE);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return typeof btoa === 'function' ? btoa(binary) : '';
}

/**
 * Converts a base64 string or data URI into Uint8Array safely.
 */
export function base64ToUint8(base64Input: string): Uint8Array {
  let cleanBase64 = base64Input;
  if (cleanBase64.includes(',')) {
    cleanBase64 = cleanBase64.split(',')[1];
  }
  // Strip whitespace/newlines
  cleanBase64 = cleanBase64.replace(/\s/g, '');

  if (typeof globalThis !== 'undefined' && (globalThis as any).Buffer && typeof (globalThis as any).Buffer.from === 'function') {
    return new Uint8Array((globalThis as any).Buffer.from(cleanBase64, 'base64'));
  }
  const binary = atob(cleanBase64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Computes SHA-256 hash string (hex) of a Uint8Array or ArrayBuffer.
 */
export async function computeSha256(data: any): Promise<string> {
  const bytes = toUint8Array(data);
  
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', copy.buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  
  // Fallback for Node.js
  const cryptoModule = await import('crypto');
  return cryptoModule.createHash('sha256').update(bytes).digest('hex');
}

/**
 * Validates PDF binary structure directly from any binary input.
 */
export function validatePdfBinaryStructure(input: any): {
  valid: boolean;
  sizeBytes: number;
  headerValid: boolean;
  eofValid: boolean;
  header: string;
  error?: string;
} {
  const bytes = toUint8Array(input);
  const sizeBytes = bytes.byteLength;
  if (sizeBytes === 0) {
    return { valid: false, sizeBytes: 0, headerValid: false, eofValid: false, header: '', error: 'File size is 0 bytes' };
  }

  // Check PDF header %PDF-
  const headerSlice = bytes.subarray(0, 5);
  let headerStr = '';
  for (let i = 0; i < headerSlice.length; i++) {
    headerStr += String.fromCharCode(headerSlice[i]);
  }
  const headerValid = headerStr === '%PDF-';

  // Check EOF marker %%EOF in last 1024 bytes
  const tailSlice = bytes.subarray(Math.max(0, sizeBytes - 1024));
  let tailStr = '';
  for (let i = 0; i < tailSlice.length; i++) {
    tailStr += String.fromCharCode(tailSlice[i]);
  }
  const eofValid = tailStr.includes('%%EOF');

  const valid = headerValid && eofValid && sizeBytes > 100;

  return {
    valid,
    sizeBytes,
    headerValid,
    eofValid,
    header: headerStr,
    error: !headerValid ? `Invalid PDF header: '${headerStr}'` : !eofValid ? 'Missing %%EOF marker in PDF tail' : undefined,
  };
}

/**
 * Safely downloads a PDF directly from raw Uint8Array bytes using an exact application/pdf Blob.
 */
export function downloadPdfFromBytes(input: any, filename: string): void {
  const bytes = toUint8Array(input);
  const validation = validatePdfBinaryStructure(bytes);
  if (!validation.valid) {
    alert(`Cannot download invalid PDF: ${validation.error || 'Corrupted binary'}`);
    return;
  }

  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Safely downloads a PDF directly from base64 or Data URI string by converting to Uint8Array first.
 */
export function downloadPdfFromBase64(base64Input: string, filename: string): void {
  const bytes = base64ToUint8(base64Input);
  downloadPdfFromBytes(bytes, filename);
}
