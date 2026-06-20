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

/* ---------------- tenancy ---------------- */
export type Role = 'superadmin' | 'admin' | 'coordinador' | 'facturacion' | 'tech';
/** Roles que un admin puede crear dentro de su tenant (no puede crear otros admins). */
export const ADMIN_CREATABLE_ROLES = ['tech', 'coordinador', 'facturacion'] as const;
/** Roles de escritorio (panel admin); 'tech' usa la app móvil. */
export const DESKTOP_ROLES = ['admin', 'coordinador', 'facturacion'] as const;

export interface TenantNumbering {
  ticketPrefix: string;   // 'AD'
  contractPrefix: string; // 'CT'
  osPrefix: string;       // 'OS'
}

export interface TenantBranding {
  appName: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
}

export interface TenantDoc {
  name: string;
  active: boolean;
  plan?: string;
  branding: TenantBranding;
  numbering: TenantNumbering;
  notifyEmail: string;
  smtpStatus: 'unset' | 'verified' | 'error';
  language?: 'es' | 'en';
  /** Si el tenant puede personalizar su marca (logo + paleta). Lo define el superadmin. */
  whiteLabel?: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export const DEFAULT_NUMBERING: TenantNumbering = { ticketPrefix: 'AD', contractPrefix: 'CT', osPrefix: 'OS' };
export const DEFAULT_BRANDING: TenantBranding = { appName: 'Aditum Service', logoUrl: '', primaryColor: '#002A42', accentColor: '#DEB66E' };

export type PublicTokenPurpose = 'ticket_share' | 'so_confirm' | 'so_reschedule' | 'so_report';

export interface PublicTokenDoc {
  tenantId: string;
  purpose: PublicTokenPurpose;
  targetId: string;
  active: boolean;
  singleUse: boolean;
  usedAt: string | null;
  invalidatedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  createdBy?: string;
}

/** Valid tenant slug: lowercase letters, digits and dashes, 3–20 chars. */
export function validTenantId(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,18}[a-z0-9]$/.test(id || '');
}

/* ---------------- maintenance: contracts & equipment ---------------- */
/** Periodicidad de mantenimiento en meses. `0.5` = quincenal (cada 15 días). */
export type PeriodicityMonths = 0.5 | 1 | 2 | 3 | 6 | 12;
export const PERIODICITIES: PeriodicityMonths[] = [0.5, 1, 2, 3, 6, 12];

/** Modalidad del contrato: 'periodico' (mantenimiento programado por el scheduler)
    o 'demanda' (trabajo puntual; el scheduler no genera órdenes). */
export type ContractModality = 'periodico' | 'demanda';
export const CONTRACT_MODALITIES: ContractModality[] = ['periodico', 'demanda'];

export interface NewContractInput {
  licitacionNum: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  modality?: ContractModality;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;
  defaultPeriodicityMonths?: PeriodicityMonths;
  defaultTechId?: string | null;
  noticeDaysBefore?: number | null;
  notes?: string;
}

export function validateContract(input: NewContractInput): string[] {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') return ['Invalid payload'];
  if (!input.licitacionNum?.trim()) errors.push('licitacionNum is required');
  if (!input.clientName?.trim()) errors.push('clientName is required');
  if (input.modality && !CONTRACT_MODALITIES.includes(input.modality)) errors.push('invalid modality');
  if (input.defaultPeriodicityMonths && !PERIODICITIES.includes(input.defaultPeriodicityMonths)) errors.push('invalid periodicity');
  if (input.startDate && input.endDate && input.endDate < input.startDate) errors.push('endDate before startDate');
  return errors;
}

export function buildContractDoc(input: NewContractInput, by: string) {
  const ts = nowCR();
  return {
    licitacionNum: input.licitacionNum.trim(),
    clientName: input.clientName.trim(),
    clientEmail: (input.clientEmail || '').trim(),
    clientPhone: (input.clientPhone || '').trim(),
    modality: (input.modality && CONTRACT_MODALITIES.includes(input.modality) ? input.modality : 'periodico') as ContractModality,
    startDate: input.startDate || '',
    endDate: input.endDate || '',
    defaultPeriodicityMonths: (input.defaultPeriodicityMonths && PERIODICITIES.includes(input.defaultPeriodicityMonths) ? input.defaultPeriodicityMonths : 3) as PeriodicityMonths,
    defaultTechId: input.defaultTechId || null,
    noticeDaysBefore: input.noticeDaysBefore ?? null,
    notes: input.notes || '',
    active: true,
    createdAt: ts,
    updatedAt: ts,
    createdBy: by,
    history: [{ at: ts, by, note: 'Contrato creado' }],
  };
}

/** Creates a contract with an atomic <prefix>-#### number inside a tenant. */
export async function createContractWithNumber(
  db: any,
  tenantId: string,
  input: NewContractInput,
  by: string,
  prefix = 'CT'
): Promise<{ id: string; num: string }> {
  const errors = validateContract(input);
  if (errors.length) throw new Error('Validation failed: ' + errors.join(', '));
  const tenant = db.collection('tenants').doc(tenantId);
  const ref = tenant.collection('contracts').doc();
  const counterRef = tenant.collection('counters').doc('contracts');
  const num = await db.runTransaction(async (tx: any) => {
    const cs = await tx.get(counterRef);
    const next = (cs.exists ? cs.data().value : 1000) + 1;
    tx.set(counterRef, { value: next }, { merge: true });
    tx.set(ref, { ...buildContractDoc(input, by), num: prefix + '-' + next });
    return prefix + '-' + next;
  });
  return { id: ref.id, num };
}

export interface NewEquipmentInput {
  contractId: string;
  typeId: string;
  brand?: string;
  model?: string;
  serial?: string;
  location?: string;
  assignedTechId?: string | null;
  periodicityMonths?: PeriodicityMonths | null;
  noticeDaysBefore?: number | null;
  nextScheduledDate?: string | null;
  notes?: string;
}

export function validateEquipment(input: NewEquipmentInput): string[] {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') return ['Invalid payload'];
  if (!input.contractId) errors.push('contractId is required');
  if (!input.typeId) errors.push('typeId is required');
  if (input.periodicityMonths != null && !PERIODICITIES.includes(input.periodicityMonths)) errors.push('invalid periodicity');
  return errors;
}

export function buildEquipmentDoc(input: NewEquipmentInput, by: string) {
  const ts = nowCR();
  return {
    contractId: input.contractId,
    typeId: input.typeId,
    brand: (input.brand || '').trim(),
    model: (input.model || '').trim(),
    serial: (input.serial || '').trim(),
    location: (input.location || '').trim(),
    assignedTechId: input.assignedTechId || null,
    periodicityMonths: input.periodicityMonths ?? null,
    noticeDaysBefore: input.noticeDaysBefore ?? null,
    nextScheduledDate: input.nextScheduledDate || null,
    lastServiceDate: null as string | null,
    notes: input.notes || '',
    active: true,
    importBatchId: null as string | null,
    createdAt: ts,
    updatedAt: ts,
    createdBy: by,
  };
}

/* ---------------- maintenance: date helpers (strings YYYY-MM-DD, CR) ---------------- */

/** Adds months to a YYYY-MM-DD date, clamping to the end of month
    (2026-01-31 + 1m = 2026-02-28). Pure string/date math, timezone-free. */
export function addMonthsCR(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const totalMonths = (y * 12 + (m - 1)) + months;
  const ny = Math.floor(totalMonths / 12);
  const nm = totalMonths % 12; // 0-based
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const nd = Math.min(d, lastDay);
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}

/** Subtracts days from a YYYY-MM-DD date (for notice dates). */
export function addDaysCR(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export function computeNoticeDate(scheduledDate: string, daysBefore: number): string {
  return addDaysCR(scheduledDate, -Math.abs(daysBefore));
}

/** Avanza una fecha según la periodicidad (meses). `< 1` = quincenal (15 días). */
export function addPeriodCR(dateStr: string, per: number): string {
  return per && per < 1 ? addDaysCR(dateStr, 15) : addMonthsCR(dateStr, Math.round(per || 0));
}

/** Deterministic service-order id for a planned preventive visit (scheduler idempotency). */
export function soPlanId(equipmentId: string, dateStr: string): string {
  return 'eq_' + equipmentId + '_' + dateStr.replace(/-/g, '');
}

/** Deterministic id de una visita preventiva A NIVEL CONTRATO (una orden agrupa todos los equipos). */
export function soContractPlanId(contractId: string, dateStr: string): string {
  return 'co_' + contractId + '_' + dateStr.replace(/-/g, '');
}

/** Normaliza la lectura multi-equipo: usa `equipments[]` si existe; si no, sintetiza
    un arreglo de 1 desde los campos legacy (orden vieja de un solo equipo). Demanda → []. */
export function soEquipments(so: any): SOEquipment[] {
  if (Array.isArray(so?.equipments) && so.equipments.length) return so.equipments;
  if (so?.equipmentSnapshot) {
    return [{
      equipmentId: so.equipmentId || '',
      equipmentSnapshot: so.equipmentSnapshot,
      checklistTemplateId: so.checklistTemplateId ?? null,
      checklistTemplateVersion: so.checklistTemplateVersion ?? null,
      checklist: so.checklist || [],
    }];
  }
  return [];
}

/* ---------------- maintenance: availability slots (pure helpers) ---------------- */
export interface TimeRange { start: string; end: string } // 'HH:mm'

export const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};
export const toHHMM = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Subtracts busy intervals from free intervals (all 'HH:mm'). */
export function subtractBusy(free: TimeRange[], busy: TimeRange[]): TimeRange[] {
  let result = free.map((r) => ({ s: toMin(r.start), e: toMin(r.end) })).filter((r) => r.e > r.s);
  for (const b of busy) {
    const bs = toMin(b.start);
    const be = toMin(b.end);
    const next: { s: number; e: number }[] = [];
    for (const r of result) {
      if (be <= r.s || bs >= r.e) {
        next.push(r);
        continue;
      }
      if (bs > r.s) next.push({ s: r.s, e: bs });
      if (be < r.e) next.push({ s: be, e: r.e });
    }
    result = next;
  }
  return result.map((r) => ({ start: toHHMM(r.s), end: toHHMM(r.e) }));
}

/** Splits free ranges into fixed-size slots (start times). */
export function chunkSlots(free: TimeRange[], slotMin: number): string[] {
  const out: string[] = [];
  for (const r of free) {
    let s = toMin(r.start);
    const e = toMin(r.end);
    while (s + slotMin <= e) {
      out.push(toHHMM(s));
      s += slotMin;
    }
  }
  return out;
}

export const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/** Weekday key ('mon'...) for a YYYY-MM-DD date (timezone-free). */
export function weekdayKey(dateStr: string): (typeof WEEKDAY_KEYS)[number] {
  const [y, m, d] = dateStr.split('-').map(Number);
  return WEEKDAY_KEYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/* ---------------- maintenance: service orders ---------------- */
export type ServiceOrderStatus =
  | 'PROGRAMADA'
  | 'NOTIFICADA'
  | 'CONFIRMADA'
  | 'REAGENDADA'
  | 'EN_PROGRESO'
  | 'SERVICIO_TERMINADO'
  | 'EN_REVISION'       // compuerta de revisión interna (ex listo_revision de OT): admin aprueba/rechaza
  | 'PENDIENTE_FACTURAR'
  | 'FACTURADA'
  | 'CERRADA'           // terminal sin/ tras facturación (ex cerrado de OT)
  | 'CANCELADA';

export const SO_STATUSES: ServiceOrderStatus[] = [
  'PROGRAMADA', 'NOTIFICADA', 'CONFIRMADA', 'REAGENDADA', 'EN_PROGRESO',
  'SERVICIO_TERMINADO', 'EN_REVISION', 'PENDIENTE_FACTURAR', 'FACTURADA', 'CERRADA', 'CANCELADA',
];

export type ServiceOrderType = 'preventivo' | 'correctivo';

/** Modalidad de la orden, derivada del contrato (o explícita si la orden no tiene contrato).
    'periodico' = mantenimiento programado (scheduler); 'demanda' = trabajo puntual (ex OT). */
export type ServiceOrderMode = 'periodico' | 'demanda';
export const SO_MODES: ServiceOrderMode[] = ['periodico', 'demanda'];

export const SO_TRANSITIONS: Record<ServiceOrderStatus, ServiceOrderStatus[]> = {
  PROGRAMADA: ['NOTIFICADA', 'EN_PROGRESO', 'CANCELADA'],            // correctivo/demanda con skipNotice salta directo
  NOTIFICADA: ['CONFIRMADA', 'REAGENDADA', 'EN_PROGRESO', 'CANCELADA'],
  CONFIRMADA: ['EN_PROGRESO', 'REAGENDADA', 'CANCELADA'],
  REAGENDADA: ['NOTIFICADA', 'CONFIRMADA', 'EN_PROGRESO', 'CANCELADA'],
  EN_PROGRESO: ['SERVICIO_TERMINADO'],
  SERVICIO_TERMINADO: ['EN_REVISION', 'PENDIENTE_FACTURAR', 'CERRADA'], // → EN_REVISION si requiere revisión interna
  EN_REVISION: ['PENDIENTE_FACTURAR', 'CERRADA', 'EN_PROGRESO'],        // aprobar → facturar/cerrar; rechazar → corrige
  PENDIENTE_FACTURAR: ['FACTURADA', 'CERRADA'],
  FACTURADA: ['CERRADA'],
  CERRADA: [],
  CANCELADA: [],
};

export function canTransition(from: ServiceOrderStatus, to: ServiceOrderStatus): boolean {
  return (SO_TRANSITIONS[from] || []).includes(to);
}

/** States in which the slot of the order blocks the technician's agenda. */
export const SO_BUSY_STATUSES: ServiceOrderStatus[] = ['PROGRAMADA', 'NOTIFICADA', 'CONFIRMADA', 'REAGENDADA', 'EN_PROGRESO'];

/** Estados en los que el reporte público de la orden es visible (link compartible). */
export const SO_SHAREABLE_STATUSES: ServiceOrderStatus[] = ['SERVICIO_TERMINADO', 'EN_REVISION', 'PENDIENTE_FACTURAR', 'FACTURADA', 'CERRADA'];

export interface EquipmentSnapshot { typeId: string; typeName: string; brand: string; model: string; serial: string; location: string }

/** Un equipo dentro de una orden multi-equipo, con su propio checklist de plantilla. */
export interface SOEquipment {
  equipmentId: string;
  equipmentSnapshot: EquipmentSnapshot;
  checklistTemplateId: string | null;
  checklistTemplateVersion: number | null;
  checklist: any[];
}

export interface NewServiceOrderInput {
  type: ServiceOrderType;
  /** 'periodico' (contrato+equipo) o 'demanda' (puntual, contrato/equipo opcionales). Default 'periodico'. */
  mode?: ServiceOrderMode;
  contractId?: string | null;
  /** Legacy single equipo (compat). Para multi-equipo usar `equipments`. */
  equipmentId?: string | null;
  equipmentSnapshot?: EquipmentSnapshot | null;
  /** Varios equipos en una sola orden (periódico/correctivo). Cada uno trae su checklist al iniciar. */
  equipments?: { equipmentId: string; equipmentSnapshot: EquipmentSnapshot }[];
  client: { name: string; email: string; phone: string };
  techId: string | null;
  planDate: string;        // occurrence date (immutable)
  scheduledDate: string;   // YYYY-MM-DD
  scheduledTime?: string;  // HH:mm
  durationMin?: number;
  skipNotice?: boolean;
  noticeDaysBefore?: number;
  notes?: string;
  // ---- campos de orden por demanda (ex OT) ----
  title?: string;
  site?: string;
  address?: string;
  priority?: Priority;
  description?: string;
  instructions?: string;
  expected?: string;
  doneConditions?: string;
  evidenceReq?: string;
  /** Items de checklist ad-hoc (demanda sin plantilla de equipo). */
  checklistItems?: string[];
  /** ¿Exige revisión/aprobación interna del admin antes de facturar/cerrar?
      Default: true en demanda, false en periódico. */
  requiresReview?: boolean;
  // ---- facturación ----
  requiresInvoice?: boolean;
  chargeTypeId?: string | null;
  clientId?: string | null;
  billAmount?: number | null;
  billCurrency?: 'CRC' | 'USD';
}

export function buildServiceOrderDoc(input: NewServiceOrderInput, by: string) {
  const ts = nowCR();
  const noticeDays = input.noticeDaysBefore ?? 3;
  const mode: ServiceOrderMode = input.mode || 'periodico';
  const requiresReview = input.requiresReview ?? (mode === 'demanda');
  // checklist ad-hoc (demanda) -> mismo shape simple {id,text,done,...} que las OT
  const adhocChecklist = (input.checklistItems || [])
    .map((t) => (t || '').trim())
    .filter(Boolean)
    .map((text, i) => ({ id: `c${i}-${Math.random().toString(36).slice(2, 8)}`, text, done: false, by: null as string | null, at: null as string | null, visitId: null as string | null }));
  return {
    type: input.type,
    mode,
    status: 'PROGRAMADA' as ServiceOrderStatus,
    contractId: input.contractId || null,
    equipmentId: input.equipmentId || null,
    equipmentSnapshot: input.equipmentSnapshot || null,
    // Multi-equipo: cada equipo arranca con checklist vacío (se bindea la plantilla al iniciar).
    equipments: (input.equipments || []).map((e) => ({
      equipmentId: e.equipmentId,
      equipmentSnapshot: e.equipmentSnapshot,
      checklistTemplateId: null as string | null,
      checklistTemplateVersion: null as number | null,
      checklist: [] as any[],
    })),
    client: input.client,
    techId: input.techId || null,
    planDate: input.planDate,
    scheduledDate: input.scheduledDate,
    scheduledTime: input.scheduledTime || '08:00',
    durationMin: input.durationMin || 60,
    skipNotice: !!input.skipNotice,
    notify: {
      noticeDaysBefore: noticeDays,
      noticeDate: computeNoticeDate(input.scheduledDate, noticeDays),
      noticeSentAt: null as string | null,
      reminderSentAt: null as string | null,
      confirmedAt: null as string | null,
      confirmedVia: null as string | null,
      rescheduleCount: 0,
      tokens: { confirm: null as string | null, reschedule: null as string | null },
    },
    hold: null as any,
    checklistTemplateId: null as string | null,
    checklistTemplateVersion: null as number | null,
    checklist: adhocChecklist as any[],
    photos: [] as any[],
    evidence: [] as any[],
    visits: [] as any[],
    observations: '',
    notes: input.notes || '',
    signature: null as any,
    startedAt: null as string | null,
    finishedAt: null as string | null,
    reportShare: { active: false, token: null as string | null, url: null as string | null, created: null as string | null, lastVisit: null as string | null },
    // ---- briefing (demanda) ----
    title: input.title || '',
    site: input.site || '',
    address: input.address || '',
    priority: input.priority || 'media',
    description: input.description || '',
    instructions: input.instructions || '',
    expected: input.expected || '',
    doneConditions: input.doneConditions || '',
    evidenceReq: input.evidenceReq || '',
    techObs: '',
    readyAt: null as string | null,
    // ---- revisión interna ----
    requiresReview,
    approval: null as any,
    comments: [] as any[],
    // ---- inventario ----
    materials: [] as any[],
    materialsNote: '',
    materialsApplied: false,
    // ---- facturación ----
    requiresInvoice: !!input.requiresInvoice,
    chargeTypeId: input.chargeTypeId || null,
    clientId: input.clientId || null,
    billAmount: input.billAmount ?? null,
    billCurrency: input.billCurrency || 'CRC',
    billingApplied: false,
    invoiceItemId: null as string | null,
    cadenceApplied: false,
    history: [{ status: 'PROGRAMADA', at: ts, by }],
    created: ts,
    createdBy: by,
  };
}

/** Creates a service order with an atomic <prefix>-#### number inside a tenant.
    `explicitId` enables the deterministic id used by the scheduler (tx.create
    fails if it already exists → idempotent generation). */
export async function createServiceOrderWithNumber(
  db: any,
  tenantId: string,
  input: NewServiceOrderInput,
  by: string,
  prefix = 'OS',
  explicitId?: string
): Promise<{ id: string; num: string; created: boolean }> {
  const tenant = db.collection('tenants').doc(tenantId);
  const ref = explicitId ? tenant.collection('serviceOrders').doc(explicitId) : tenant.collection('serviceOrders').doc();
  const counterRef = tenant.collection('counters').doc('serviceOrders');
  try {
    const num = await db.runTransaction(async (tx: any) => {
      const cs = await tx.get(counterRef);
      const next = (cs.exists ? cs.data().value : 1000) + 1;
      tx.set(counterRef, { value: next }, { merge: true });
      tx.create(ref, { ...buildServiceOrderDoc(input, by), num: prefix + '-' + next });
      return prefix + '-' + next;
    });
    return { id: ref.id, num, created: true };
  } catch (e: any) {
    if (e?.code === 6 || /already.?exists/i.test(e?.message || '')) {
      return { id: ref.id, num: '', created: false };
    }
    throw e;
  }
}

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

/** Creates a ticket with an atomic <prefix>-#### number inside a tenant.
    `db` is an Admin Firestore instance; `tenantId` scopes all paths. */
export async function createTicketWithNumber(
  db: any,
  tenantId: string,
  input: NewTicketInput,
  by: string,
  techName?: string,
  prefix = 'AD'
): Promise<{ id: string; num: string }> {
  const errors = validateNewTicket(input);
  if (errors.length) throw new Error('Validation failed: ' + errors.join(', '));
  if (!tenantId) throw new Error('tenantId is required');
  const tenant = db.collection('tenants').doc(tenantId);
  const ref = tenant.collection('tickets').doc();
  const counterRef = tenant.collection('counters').doc('tickets');
  const num = await db.runTransaction(async (tx: any) => {
    const cs = await tx.get(counterRef);
    const next = (cs.exists ? cs.data().value : 1040) + 1;
    tx.set(counterRef, { value: next }, { merge: true });
    tx.set(ref, { ...buildTicketDoc(input, by, techName), num: prefix + '-' + next });
    return prefix + '-' + next;
  });
  return { id: ref.id, num };
}

/* ---------------- visitas (trabajos de varios días en una sola orden) ---------------- */

export interface WorkSegment { start: string; end: string | null }

export interface Visit {
  id: string;
  date: string;          // YYYY-MM-DD del día de la visita
  techId: string | null;
  techName: string;
  note: string;          // qué se hizo ese día
  segments?: WorkSegment[]; // tramos de fichaje (iniciar/salir/reanudar)
  hours?: number | null; // total del día (decimal), recalculado al cerrar un tramo
  at: string;            // timestamp de registro
  by: string;
}

/** Minutos entre dos timestamps 'YYYY-MM-DD HH:mm' (mismo huso). */
export function minutesBetween(start?: string | null, end?: string | null): number {
  if (!start || !end) return 0;
  const p = (s: string) => { const [d, t] = s.split(' '); const [y, mo, da] = d.split('-').map(Number); const [h, mi] = (t || '00:00').split(':').map(Number); return Date.UTC(y, mo - 1, da, h, mi); };
  const ms = p(end) - p(start);
  return ms > 0 ? Math.round(ms / 60000) : 0;
}

/** Suma de minutos de tramos cerrados de una visita. */
export function visitWorkedMinutes(visit: { segments?: WorkSegment[] } | null | undefined): number {
  return (visit?.segments || []).reduce((a, s) => a + (s.end ? minutesBetween(s.start, s.end) : 0), 0);
}

/** Formatea minutos como "Xh Ym". */
export function fmtDuration(min: number): string {
  const m = Math.max(0, Math.round(min || 0));
  const h = Math.floor(m / 60); const r = m % 60;
  return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
}

/** Arma una visita (un día de trabajo de una orden). */
export function buildVisit(
  input: { date?: string; note?: string; techId?: string | null; techName?: string; hours?: number | null },
  by: string
): Visit {
  const ts = nowCR();
  return {
    id: 'v' + ts.replace(/[^0-9]/g, '') + '-' + Math.random().toString(36).slice(2, 7),
    date: input.date || ts.slice(0, 10),
    techId: input.techId ?? null,
    techName: input.techName || '',
    note: (input.note || '').trim(),
    hours: input.hours ?? null,
    at: ts,
    by,
  };
}

/* ---------------- facturación electrónica (GTI / Hacienda CR) ---------------- */

/** Moneda del documento electrónico. GTI: 1=CRC, 2=USD. */
export type FiscalCurrency = 'CRC' | 'USD';
export const FISCAL_CURRENCIES: FiscalCurrency[] = ['CRC', 'USD'];
/** Código `Moneda` de GTI para cada divisa. */
export const GTI_CURRENCY_CODE: Record<FiscalCurrency, number> = { CRC: 1, USD: 2 };

/** Catálogo de tipos de identificación fiscal de Hacienda (código → clave i18n).
    Coincide con `Receptor.TipoIdent` de GTI. */
export const ELECTRONIC_BILL_IDENT_TYPES = [
  { code: 1, key: 'cedulaFisica' },
  { code: 2, key: 'cedulaJuridica' },
  { code: 3, key: 'dimex' },
  { code: 4, key: 'nite' },
  { code: 10, key: 'extranjera' },
] as const;
export const IDENT_TYPE_CODES: number[] = ELECTRONIC_BILL_IDENT_TYPES.map((t) => t.code);

/** Receptor fiscal (cliente al que se factura). Reusable entre órdenes de trabajo. */
export interface NewClientInput {
  name: string;
  identType: number;        // 1=céd. física, 2=jurídica, 3=DIMEX, 4=NITE
  identNumber: string;
  comercialName?: string;
  email: string;
  ccEmails?: string;        // copias separadas por coma/; opcional
  activityCode?: string;    // actividad económica del receptor (opcional)
  province?: number | null; // división territorial (códigos numéricos de Hacienda) — opcionales
  canton?: number | null;
  district?: number | null;
  neighborhood?: number | null;
  direction?: string;
  internalCode?: string;
}

export function validateClient(input: NewClientInput): string[] {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') return ['Invalid payload'];
  if (!input.name?.trim()) errors.push('name is required');
  if (!IDENT_TYPE_CODES.includes(Number(input.identType))) errors.push('invalid identType');
  if (!String(input.identNumber || '').trim()) errors.push('identNumber is required');
  if (!input.email?.trim() || !/.+@.+\..+/.test(input.email)) errors.push('valid email is required');
  return errors;
}

export function buildClientDoc(input: NewClientInput, by: string) {
  const ts = nowCR();
  const numOrNull = (v: any) => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v));
  return {
    name: input.name.trim(),
    identType: Number(input.identType),
    identNumber: String(input.identNumber).trim(),
    comercialName: (input.comercialName || '').trim().slice(0, 80),
    email: input.email.trim(),
    ccEmails: (input.ccEmails || '').trim(),
    activityCode: (input.activityCode || '').trim(),
    province: numOrNull(input.province),
    canton: numOrNull(input.canton),
    district: numOrNull(input.district),
    neighborhood: numOrNull(input.neighborhood),
    direction: (input.direction || '').trim().slice(0, 160),
    internalCode: (input.internalCode || '').trim(),
    active: true,
    createdAt: ts,
    updatedAt: ts,
    createdBy: by,
  };
}

/** Tipo de cargo facturable ("account type"): controla si emite documento,
    si es gravado (IVA 13%) o no sujeto, y su código CABYS. */
export interface NewChargeTypeInput {
  name: string;
  code?: string;        // código interno → CodProdServ
  cabysCode?: string;   // código CABYS de Hacienda (opcional)
  emitIva?: boolean;    // true = gravado tarifa 8 (13%); false = no sujeto tarifa 11 (0%)
  issuesDocument?: boolean; // ¿este tipo emite documento electrónico?
}

export function validateChargeType(input: NewChargeTypeInput): string[] {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') return ['Invalid payload'];
  if (!input.name?.trim()) errors.push('name is required');
  return errors;
}

export function buildChargeTypeDoc(input: NewChargeTypeInput, by: string) {
  const ts = nowCR();
  return {
    name: input.name.trim(),
    code: (input.code || '').trim(),
    cabysCode: (input.cabysCode || '').trim(),
    emitIva: input.emitIva !== false,            // por defecto gravado
    issuesDocument: input.issuesDocument !== false, // por defecto emite
    active: true,
    createdAt: ts,
    updatedAt: ts,
    createdBy: by,
  };
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
