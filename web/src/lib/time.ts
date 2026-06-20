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

/** Minutos entre dos timestamps 'YYYY-MM-DD HH:mm' (mismo huso). */
export function minutesBetween(start?: string | null, end?: string | null): number {
  if (!start || !end) return 0;
  const p = (s: string) => { const [d, t] = s.split(' '); const [y, mo, da] = d.split('-').map(Number); const [h, mi] = (t || '00:00').split(':').map(Number); return Date.UTC(y, mo - 1, da, h, mi); };
  const ms = p(end) - p(start);
  return ms > 0 ? Math.round(ms / 60000) : 0;
}

/** Formatea minutos como "Xh Ym" (o "Ym" si <1h). */
export function fmtDuration(min: number): string {
  const m = Math.max(0, Math.round(min || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
}

/** Suma de minutos de los tramos CERRADOS de una visita. */
export function visitWorkedMinutes(visit: { segments?: { start: string; end: string | null }[] } | null | undefined): number {
  return (visit?.segments || []).reduce((acc, s) => acc + (s.end ? minutesBetween(s.start, s.end) : 0), 0);
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
