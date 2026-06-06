/* © 2026 Aditum — Aditum FieldOps — shared logic (validation, numbering, types).
   Dependency-free; the Firestore instance is passed in by the caller (Admin SDK). */

export type TicketStatus =
  | 'pendiente'
  | 'asignado'
  | 'en_proceso'
  | 'listo_revision'
  | 'aprobado'
  | 'rechazado'
  | 'cerrado';

export const STATUSES: TicketStatus[] = ['pendiente', 'asignado', 'en_proceso', 'listo_revision', 'aprobado', 'rechazado', 'cerrado'];

export type Priority = 'baja' | 'media' | 'alta' | 'urgente';
export const PRIORITIES: Priority[] = ['baja', 'media', 'alta', 'urgente'];

export const SHAREABLE_STATUSES: TicketStatus[] = ['listo_revision', 'aprobado', 'cerrado'];

export type WikiStatus = 'DRAFT' | 'PUBLISHED' | 'INACTIVE';
export const WIKI_STATUSES: WikiStatus[] = ['DRAFT', 'PUBLISHED', 'INACTIVE'];

export function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** 'YYYY-MM-DD HH:mm' in America/Costa_Rica. */
export function nowCR(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Costa_Rica',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`;
}

export interface NewTicketInput {
  title: string;
  client: string;
  site?: string;
  address?: string;
  priority?: Priority;
  techId?: string | null;
  scheduled?: string;
  deadline?: string;
  description?: string;
  instructions?: string;
  expected?: string;
  doneConditions?: string;
  observations?: string;
  evidenceReq?: string;
  checklist?: { text: string }[];
}

export function validateNewTicket(input: NewTicketInput): string[] {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') return ['Invalid payload'];
  if (!input.title || !input.title.trim()) errors.push('title is required');
  if (!input.client || !input.client.trim()) errors.push('client is required');
  if (input.priority && !PRIORITIES.includes(input.priority)) errors.push('invalid priority');
  return errors;
}

/** Builds the full ticket document (without the number). */
export function buildTicketDoc(input: NewTicketInput, by: string, techName?: string) {
  const priority: Priority = (input.priority && PRIORITIES.includes(input.priority) ? input.priority : 'media') as Priority;
  const status: TicketStatus = input.techId ? 'asignado' : 'pendiente';
  const ts = nowCR();
  const history: any[] = [{ status: 'pendiente', at: ts, by }];
  if (input.techId) history.push({ status: 'asignado', at: ts, by, note: 'Asignado a ' + (techName || '') });
  return {
    title: input.title.trim(),
    client: input.client.trim(),
    site: input.site || '',
    address: input.address || '',
    priority,
    status,
    techId: input.techId || null,
    scheduled: input.scheduled || '',
    deadline: input.deadline || '',
    created: ts,
    description: input.description || '',
    instructions: input.instructions || '',
    expected: input.expected || '',
    doneConditions: input.doneConditions || '',
    observations: input.observations || '',
    evidenceReq: input.evidenceReq || '',
    techNote: '',
    techObs: '',
    readyAt: null,
    checklist: (input.checklist || [])
      .filter((c) => c && c.text && c.text.trim())
      .map((c, i) => ({ id: 'c' + (i + 1) + '-' + Math.random().toString(36).slice(2, 7), text: c.text.trim(), done: false, by: null, at: null })),
    evidence: [],
    comments: [],
    history,
    share: { active: false, token: null, url: null, created: null, lastVisit: null },
  };
}

/** Creates a ticket with an atomic AD-#### number. `db` is an Admin Firestore instance. */
export async function createTicketWithNumber(
  db: any,
  input: NewTicketInput,
  by: string,
  techName?: string
): Promise<{ id: string; num: string }> {
  const errors = validateNewTicket(input);
  if (errors.length) throw new Error('Validation failed: ' + errors.join(', '));
  const ref = db.collection('tickets').doc();
  const counterRef = db.collection('counters').doc('tickets');
  const num = await db.runTransaction(async (tx: any) => {
    const cs = await tx.get(counterRef);
    const next = (cs.exists ? cs.data().value : 1040) + 1;
    tx.set(counterRef, { value: next }, { merge: true });
    tx.set(ref, { ...buildTicketDoc(input, by, techName), num: 'AD-' + next });
    return 'AD-' + next;
  });
  return { id: ref.id, num };
}

/* ---------------- Wiki ---------------- */
export interface NewWikiPageInput {
  title: string;
  categoryId?: string | null;
  contentMarkdown?: string;
  status?: WikiStatus;
}
export function validateWikiPage(input: NewWikiPageInput): string[] {
  const errors: string[] = [];
  if (!input || !input.title || !input.title.trim()) errors.push('title is required');
  if (input.status && !WIKI_STATUSES.includes(input.status)) errors.push('invalid status');
  return errors;
}
export function buildWikiPageDoc(input: NewWikiPageInput, by: string) {
  const ts = nowCR();
  const status: WikiStatus = input.status && WIKI_STATUSES.includes(input.status) ? input.status : 'DRAFT';
  return {
    title: input.title.trim(),
    categoryId: input.categoryId || null,
    contentMarkdown: input.contentMarkdown || '',
    status,
    attachments: [] as any[],
    createdBy: by,
    updatedBy: by,
    createdAt: ts,
    updatedAt: ts,
    publishedAt: status === 'PUBLISHED' ? ts : null,
  };
}
