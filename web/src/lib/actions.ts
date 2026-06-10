/* © 2026 Aditum — Aditum FieldOps — ticket transition helpers (write to Firestore via ctx) */
import { now } from './time';
import type { AppCtx } from './ctx';
import type { Ticket, TicketStatus } from './types';

const adminBy = (ctx: AppCtx) => 'Admin · ' + ctx.admin.name;

export function approveTicket(ctx: AppCtx, t: Ticket, comment: string) {
  const at = now();
  const text = comment || 'Trabajo aprobado.';
  return ctx.updateTicket(t.id, {
    status: 'aprobado',
    approval: { at, by: ctx.admin.name, comment: text },
    comments: [...t.comments, { type: 'aprobacion', by: adminBy(ctx), at, text }],
    history: [...t.history, { status: 'aprobado', at, by: adminBy(ctx) }],
  });
}

export function rejectTicket(ctx: AppCtx, t: Ticket, comment: string) {
  const at = now();
  return ctx.updateTicket(t.id, {
    status: 'rechazado',
    comments: [...t.comments, { type: 'rechazo', by: adminBy(ctx), at, text: comment }],
    history: [...t.history, { status: 'rechazado', at, by: adminBy(ctx), note: 'Requiere corrección' }],
  });
}

export function reassignTicket(ctx: AppCtx, t: Ticket, techId: string) {
  const nt = ctx.db.technicians.find((x) => x.id === techId);
  const at = now();
  return ctx.updateTicket(t.id, {
    techId: techId || null,
    status: t.status === 'pendiente' && techId ? 'asignado' : t.status,
    history: [...t.history, { status: 'asignado', at, by: adminBy(ctx), note: 'Reasignado a ' + (nt ? nt.name : 'sin asignar') }],
  });
}

export function closeTicket(ctx: AppCtx, t: Ticket) {
  const at = now();
  return ctx.updateTicket(t.id, {
    status: 'cerrado',
    history: [...t.history, { status: 'cerrado', at, by: adminBy(ctx), note: 'Obra cerrada' }],
  });
}

export function setStatus(ctx: AppCtx, t: Ticket, status: TicketStatus, by: string, note?: string) {
  const at = now();
  const entry: any = { status, at, by };
  if (note) entry.note = note;
  return ctx.updateTicket(t.id, { status, history: [...t.history, entry] });
}

export function addComment(ctx: AppCtx, t: Ticket, text: string, by: string, type: any = 'general') {
  return ctx.updateTicket(t.id, { comments: [...t.comments, { type, by, at: now(), text }] });
}

/* ----- share link (admin) — token minted server-side (ensurePublicLink callable) ----- */
export function generateLink(ctx: AppCtx, t: Ticket) {
  return ctx.ensurePublicLink(t.id, 'generate');
}
export function regenerateLink(ctx: AppCtx, t: Ticket) {
  return ctx.ensurePublicLink(t.id, 'regenerate');
}
export function toggleLink(ctx: AppCtx, t: Ticket) {
  return ctx.ensurePublicLink(t.id, 'toggle');
}
