/* © 2026 Aditum — Aditum FieldOps — pure date helpers for the calendar (YYYY-MM-DD strings) */

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return toStr(dt);
}

const toStr = (dt: Date) =>
  `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;

/** Monday of the week containing the date. */
export function startOfWeek(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7; // 0 = lunes
  return addDays(dateStr, -dow);
}

/** 'YYYY-MM' of a date. */
export const monthOf = (dateStr: string) => dateStr.slice(0, 7);

export function addMonths(yyyymm: string, months: number): string {
  const [y, m] = yyyymm.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Matrix of weeks (each 7 days, monday-first) covering the month. */
export function monthMatrix(yyyymm: string): string[][] {
  const first = yyyymm + '-01';
  let cursor = startOfWeek(first);
  const weeks: string[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
    if (monthOf(cursor) !== yyyymm && w >= 3) break;
  }
  return weeks;
}

export function monthLabel(yyyymm: string, lang: string): string {
  const [y, m] = yyyymm.split('-').map(Number);
  const s = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-CR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  // Solo la primera letra en mayúscula ("Octubre de 2026", no "Octubre De 2026").
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function weekdayShort(lang: string): string[] {
  const base = '2026-06-08'; // lunes
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(base, i);
    const [y, m, dd] = d.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-CR', { weekday: 'short', timeZone: 'UTC' });
  });
}
