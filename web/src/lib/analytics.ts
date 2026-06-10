/* © 2026 Aditum — Aditum FieldOps — derivaciones puras para los gráficos del dashboard.
   Sin dependencias de React/Firestore: reciben arrays y devuelven datos listos para Recharts. */
import { addDays, monthOf, addMonths, startOfWeek, monthLabel } from './dates';
import { STATUS, SO_STATUS, PRIORITY_COLOR, TIMELINE_COLOR } from './config';
import type { Ticket, ServiceOrder, InvoiceItem, AppUser, TicketStatus, Priority } from './types';

const day = (s?: string | null) => (s || '').slice(0, 10);

/* ---------------- tickets ---------------- */
const TICKET_OPEN: TicketStatus[] = ['pendiente', 'asignado', 'en_proceso', 'listo_revision', 'rechazado'];
const TICKET_RESOLVED: TicketStatus[] = ['aprobado', 'cerrado'];

export function ticketsByStatus(tickets: Ticket[]) {
  const order: TicketStatus[] = ['pendiente', 'asignado', 'en_proceso', 'listo_revision', 'aprobado', 'rechazado', 'cerrado'];
  return order
    .map((s) => ({ key: s, label: s, value: tickets.filter((t) => t.status === s).length, color: TIMELINE_COLOR[STATUS[s].cls] }))
    .filter((d) => d.value > 0);
}

export function ticketsByPriority(tickets: Ticket[]) {
  const order: Priority[] = ['urgente', 'alta', 'media', 'baja'];
  return order.map((p) => ({ key: p, label: p, value: tickets.filter((t) => t.priority === p).length, color: PRIORITY_COLOR[p] }));
}

/** Fecha en que el ticket quedó resuelto (última entrada aprobado/cerrado del history). */
function ticketResolvedAt(t: Ticket): string | null {
  const hist = [...(t.history || [])].reverse().find((h) => TICKET_RESOLVED.includes(h.status));
  if (hist) return day(hist.at);
  if (TICKET_RESOLVED.includes(t.status)) return day(t.readyAt || t.created);
  return null;
}

/** Series creados vs resueltos por semana (lunes), últimas `weeks` semanas. */
export function createdVsResolvedByWeek(tickets: Ticket[], weeks: number, today: string) {
  const buckets: { key: string; label: string; creados: number; resueltos: number }[] = [];
  const idx = new Map<string, number>();
  let wk = startOfWeek(addDays(today, -7 * (weeks - 1)));
  for (let i = 0; i < weeks; i++) {
    idx.set(wk, buckets.length);
    buckets.push({ key: wk, label: wk.slice(5), creados: 0, resueltos: 0 });
    wk = addDays(wk, 7);
  }
  for (const t of tickets) {
    const cw = startOfWeek(day(t.created));
    if (idx.has(cw)) buckets[idx.get(cw)!].creados++;
    const r = ticketResolvedAt(t);
    if (r) {
      const rw = startOfWeek(r);
      if (idx.has(rw)) buckets[idx.get(rw)!].resueltos++;
    }
  }
  return buckets;
}

export function ticketsByTech(tickets: Ticket[], techs: AppUser[]) {
  const counts = new Map<string, number>();
  tickets.filter((t) => TICKET_OPEN.includes(t.status) && t.techId).forEach((t) => counts.set(t.techId!, (counts.get(t.techId!) || 0) + 1));
  return techs
    .map((u) => ({ key: u.id, label: u.name.split(' ')[0], value: counts.get(u.id) || 0 }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
}

/** Tiempo medio de resolución (días) sobre tickets resueltos. */
export function avgResolutionDays(tickets: Ticket[]): number | null {
  const spans: number[] = [];
  for (const t of tickets) {
    const r = ticketResolvedAt(t);
    if (r && t.created) spans.push(daysBetween(day(t.created), r));
  }
  if (!spans.length) return null;
  return Math.round((spans.reduce((a, b) => a + b, 0) / spans.length) * 10) / 10;
}

/** % de tickets resueltos sin haber pasado por 'rechazado'. */
export function firstPassRate(tickets: Ticket[]): number | null {
  const resolved = tickets.filter((t) => ticketResolvedAt(t));
  if (!resolved.length) return null;
  const clean = resolved.filter((t) => !(t.history || []).some((h) => h.status === 'rechazado')).length;
  return Math.round((clean / resolved.length) * 100);
}

export const ticketsOpenCount = (tickets: Ticket[]) => tickets.filter((t) => TICKET_OPEN.includes(t.status)).length;

/* ---------------- service orders ---------------- */
const SO_DONE = ['SERVICIO_TERMINADO', 'PENDIENTE_FACTURAR', 'FACTURADA'];
const SO_ACTIVE = ['PROGRAMADA', 'NOTIFICADA', 'CONFIRMADA', 'REAGENDADA', 'EN_PROGRESO'];

const SO_DOT: Record<string, string> = {
  pend: '#8a93a1', asig: '#2f7ad1', proc: '#e0911f', revi: '#8b5cf0', apro: '#27a35a', rech: '#e04545', cerr: '#56636f',
};

export function soByStatus(orders: ServiceOrder[]) {
  const order = ['PROGRAMADA', 'NOTIFICADA', 'CONFIRMADA', 'REAGENDADA', 'EN_PROGRESO', 'SERVICIO_TERMINADO', 'PENDIENTE_FACTURAR', 'FACTURADA', 'CANCELADA'];
  return order
    .map((s) => ({ key: s, label: s, value: orders.filter((o) => o.status === s).length, color: SO_DOT[SO_STATUS[s as keyof typeof SO_STATUS].cls] }))
    .filter((d) => d.value > 0);
}

/** Fecha real de servicio: finishedAt o última entrada SERVICIO_TERMINADO del history. */
function soDoneAt(o: ServiceOrder): string | null {
  if (o.finishedAt) return day(o.finishedAt);
  const h = [...(o.history || [])].reverse().find((x) => x.status === 'SERVICIO_TERMINADO');
  return h ? day(h.at) : null;
}

function monthBuckets(months: number, today: string) {
  const out: string[] = [];
  let m = addMonths(monthOf(today), -(months - 1));
  for (let i = 0; i < months; i++) {
    out.push(m);
    m = addMonths(m, 1);
  }
  return out;
}

export function preventiveVsCorrectiveByMonth(orders: ServiceOrder[], months: number, today: string, lang: string) {
  const ms = monthBuckets(months, today);
  const idx = new Map(ms.map((m, i) => [m, i]));
  const data = ms.map((m) => ({ key: m, label: monthLabel(m, lang).split(' ')[0], preventivo: 0, correctivo: 0 }));
  for (const o of orders) {
    const m = monthOf(o.scheduledDate);
    if (!idx.has(m)) continue;
    if (o.status === 'CANCELADA') continue;
    data[idx.get(m)!][o.type === 'correctivo' ? 'correctivo' : 'preventivo']++;
  }
  return data;
}

export function complianceByMonth(orders: ServiceOrder[], months: number, today: string, lang: string) {
  const ms = monthBuckets(months, today);
  const idx = new Map(ms.map((m, i) => [m, i]));
  const agg = ms.map((m) => ({ key: m, label: monthLabel(m, lang).split(' ')[0], prog: 0, done: 0, cumplimiento: 0 }));
  for (const o of orders) {
    const m = monthOf(o.scheduledDate);
    if (!idx.has(m) || o.status === 'CANCELADA') continue;
    const b = agg[idx.get(m)!];
    b.prog++;
    if (SO_DONE.includes(o.status)) b.done++;
  }
  agg.forEach((b) => (b.cumplimiento = b.prog ? Math.round((b.done / b.prog) * 100) : 0));
  return agg;
}

export function soByEquipmentType(orders: ServiceOrder[]) {
  const counts = new Map<string, number>();
  orders.forEach((o) => {
    const n = o.equipmentSnapshot?.typeName || '—';
    counts.set(n, (counts.get(n) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([label, value]) => ({ key: label, label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 7);
}

export function soByTech(orders: ServiceOrder[], techs: AppUser[]) {
  const counts = new Map<string, number>();
  orders.filter((o) => SO_ACTIVE.includes(o.status) && o.techId).forEach((o) => counts.set(o.techId!, (counts.get(o.techId!) || 0) + 1));
  return techs
    .map((u) => ({ key: u.id, label: u.name.split(' ')[0], value: counts.get(u.id) || 0 }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
}

/** Engagement del cliente: notificadas, confirmadas (por el cliente), reagendadas. */
export function confirmationFunnel(orders: ServiceOrder[]) {
  const notified = orders.filter((o) => o.notify?.noticeSentAt).length;
  const confirmed = orders.filter((o) => o.notify?.confirmedAt).length;
  const rescheduled = orders.filter((o) => (o.notify?.rescheduleCount || 0) > 0).length;
  return [
    { key: 'notified', value: notified },
    { key: 'confirmed', value: confirmed },
    { key: 'rescheduled', value: rescheduled },
  ];
}

export const soDoneInMonth = (orders: ServiceOrder[], today: string) =>
  orders.filter((o) => { const d = soDoneAt(o); return d && monthOf(d) === monthOf(today); }).length;

export function preventiveRate(orders: ServiceOrder[]): number | null {
  const valid = orders.filter((o) => o.status !== 'CANCELADA');
  if (!valid.length) return null;
  return Math.round((valid.filter((o) => o.type === 'preventivo').length / valid.length) * 100);
}

/** Sparkline de OS terminadas por semana (últimas N). */
export function soDoneByWeek(orders: ServiceOrder[], weeks: number, today: string) {
  const idx = new Map<string, number>();
  const out: { key: string; value: number }[] = [];
  let wk = startOfWeek(addDays(today, -7 * (weeks - 1)));
  for (let i = 0; i < weeks; i++) {
    idx.set(wk, out.length);
    out.push({ key: wk, value: 0 });
    wk = addDays(wk, 7);
  }
  orders.forEach((o) => {
    const d = soDoneAt(o);
    if (!d) return;
    const w = startOfWeek(d);
    if (idx.has(w)) out[idx.get(w)!].value++;
  });
  return out;
}

/* ---------------- billing ---------------- */
export function billingByMonth(pending: InvoiceItem[], invoiced: InvoiceItem[], months: number, today: string, lang: string) {
  const ms = monthBuckets(months, today);
  const idx = new Map(ms.map((m, i) => [m, i]));
  const data = ms.map((m) => ({ key: m, label: monthLabel(m, lang).split(' ')[0], facturado: 0, pendiente: 0 }));
  const useAmount = [...pending, ...invoiced].some((i) => typeof i.amount === 'number' && i.amount! > 0);
  const val = (i: InvoiceItem) => (useAmount ? i.amount || 0 : 1);
  invoiced.forEach((i) => { const m = monthOf(i.invoicedAt || i.serviceDate); if (idx.has(m)) data[idx.get(m)!].facturado += val(i); });
  pending.forEach((i) => { const m = monthOf(i.serviceDate); if (idx.has(m)) data[idx.get(m)!].pendiente += val(i); });
  return { data, useAmount };
}

/* ---------------- util ---------------- */
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const da = Date.UTC(ay, am - 1, ad);
  const db = Date.UTC(by, bm - 1, bd);
  return Math.max(0, Math.round((db - da) / 86400000));
}

/** Días por período. */
export const PERIODS = [
  { key: 'month', days: 31, weeks: 6, months: 3 },
  { key: '90d', days: 90, weeks: 13, months: 4 },
  { key: '6m', days: 183, weeks: 26, months: 6 },
] as const;
export type PeriodKey = (typeof PERIODS)[number]['key'];
