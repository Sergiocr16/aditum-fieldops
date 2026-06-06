/* © 2026 Aditum — Aditum FieldOps — date/time helpers (America/Costa_Rica) */
const TZ = 'America/Costa_Rica';

/** 'YYYY-MM-DD HH:mm' in Costa Rica time. */
export function now(): string {
  const d = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

/** 'YYYY-MM-DD' today, Costa Rica time. */
export function today(): string {
  return now().split(' ')[0];
}

export function formatDate(value?: string | null, locale = 'es'): string {
  if (!value) return '—';
  const datePart = value.split(' ')[0];
  const d = new Date(datePart + 'T00:00:00');
  if (isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-CR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}
