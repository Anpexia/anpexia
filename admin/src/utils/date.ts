/**
 * Convert a <input type="datetime-local"> value (e.g. "2026-04-16T10:00")
 * into an ISO string anchored to Brasília time (UTC-3, no DST since 2019).
 * Returns "2026-04-16T10:00:00-03:00" — the backend can `new Date(...)` it
 * safely regardless of server timezone.
 */
export function datetimeLocalToBrazilISO(value: string): string {
  if (!value) return '';
  const withSeconds = value.length === 16 ? `${value}:00` : value;
  return `${withSeconds}-03:00`;
}
