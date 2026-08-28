/**
 * System Usage Logger Pro - Indian Standard Time (IST / Asia/Kolkata) Date Formatting Utilities
 */

/**
 * Standardized format to IST (Indian Standard Time / Asia/Kolkata): DD/MM/YYYY, hh:mm:ss a
 */
export function formatToIST(dateString: string | null | undefined): string {
  if (!dateString) return 'Ongoing';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Formats time only to IST (e.g. "02:45:10 PM" or "02:45 PM")
 */
export function formatTimeToIST(
  dateString: string | null | undefined,
  includeSeconds: boolean = true
): string {
  if (!dateString) return 'Ongoing';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    hour12: true,
  }).format(date);
}

/**
 * Formats date only to IST (e.g. "28/08/2026")
 */
export function formatDateToIST(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Formats full readable datetime with IST indicator (e.g. "28 Aug 2026, 02:45 PM IST")
 */
export function formatDateTimeToIST(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '—';

  return (
    new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(date) + ' IST'
  );
}
