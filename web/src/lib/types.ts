/* © 2026 Aditum — Aditum FieldOps */

export type Role = 'superadmin' | 'admin' | 'coordinador' | 'facturacion' | 'tech';

export interface TenantBranding {
  appName: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
}

export interface TenantNumbering {
  ticketPrefix: string;
  contractPrefix: string;
  osPrefix: string;
}

export interface Tenant {
  id: string;
  name: string;
  active: boolean;
  plan?: string;
  branding: TenantBranding;
  numbering: TenantNumbering;
  notifyEmail: string;
  smtpStatus: 'unset' | 'verified' | 'error';
  /** Módulos que usa la empresa: tickets, maintenance, inventory, wiki. Ausente = todos. */
  features?: string[];
  /** Si el técnico puede editar su propia disponibilidad/bloqueos. Default false (lo gestiona admin/coordinador). */
  techEditAvailability?: boolean;
  /** Idioma de la empresa (lo fija el admin); aplica a todos los usuarios del tenant. Default 'es'. */
  language?: 'es' | 'en';
  /** Si el tenant puede personalizar su marca (logo + paleta). Lo define el superadmin. */
  whiteLabel?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface McpKeyMeta {
  id: string;
  label: string;
  last4: string;
  revoked: boolean;
  createdAt?: string;
  revokedAt?: string;
}

/* ---------------- maintenance: contracts & equipment ---------------- */
/** Periodicidad en meses; `0.5` = quincenal (cada 15 días). */
export type PeriodicityMonths = 0.5 | 1 | 2 | 3 | 6 | 12;
export type ContractModality = 'periodico' | 'demanda';

export interface Contract {
  id: string;
  num: string;
  licitacionNum: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  /** 'periodico' = el scheduler genera órdenes; 'demanda' = solo órdenes puntuales. Default 'periodico'. */
  modality?: ContractModality;
  startDate: string;
  endDate: string;
  defaultPeriodicityMonths: PeriodicityMonths;
  /** Equipo de técnicos del contrato; el primero es el técnico por defecto. */
  techIds?: string[];
  defaultTechId: string | null;
  noticeDaysBefore: number | null;
  notes: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
  history?: { at: string; by: string; note?: string }[];
}

export interface Equipment {
  id: string;
  contractId: string;
  typeId: string;
  brand: string;
  model: string;
  serial: string;
  location: string;
  assignedTechId: string | null;
  periodicityMonths: PeriodicityMonths | null;
  noticeDaysBefore: number | null;
  nextScheduledDate: string | null;
  lastServiceDate: string | null;
  notes?: string;
  active: boolean;
  condition?: EquipmentCondition;
  conditionHistory?: ConditionEntry[];
  importBatchId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface EquipmentType {
  id: string;
  name: string;
  active: boolean;
  activeTemplateVersion: number;
  createdAt?: string;
  updatedAt?: string;
}

/* ---------------- maintenance: checklist templates ---------------- */
export type TemplateItemKind = 'si_no' | 'numero' | 'texto' | 'seleccion' | 'foto';

export interface TemplateItemConfig {
  min?: number | null;
  max?: number | null;
  alertMin?: number | null;
  alertMax?: number | null;
  unit?: string;
  options?: string[];
}

export interface TemplateItem {
  id: string;
  sectionId: string | null;
  order: number;
  label: string;
  type: TemplateItemKind;
  required: boolean;
  config: TemplateItemConfig;
}

export interface TemplateSection {
  id: string;
  title: string;
  order: number;
}

export interface ChecklistTemplate {
  id: string; // {typeId}_v{n}
  typeId: string;
  version: number;
  status: 'draft' | 'active' | 'superseded';
  sections: TemplateSection[];
  items: TemplateItem[];
  createdAt?: string;
  createdBy?: string;
}

/* ---------------- maintenance: service orders ---------------- */
export type ServiceOrderStatus =
  | 'PROGRAMADA' | 'NOTIFICADA' | 'CONFIRMADA' | 'REAGENDADA' | 'EN_PROGRESO'
  | 'SERVICIO_TERMINADO' | 'EN_REVISION' | 'PENDIENTE_FACTURAR' | 'FACTURADA' | 'CERRADA' | 'CANCELADA';

export type ServiceOrderType = 'preventivo' | 'correctivo';

/** Modalidad de la orden, derivada del contrato (o explícita si no tiene contrato). */
export type ServiceOrderMode = 'periodico' | 'demanda';

export interface SOChecklistEntry {
  id: string;
  sectionId: string | null;
  sectionTitle: string | null;
  label: string;
  type: TemplateItemKind;
  required: boolean;
  config: TemplateItemConfig;
  unit: string | null;
  answer: boolean | number | string | null;
  alert: boolean;
  photoPath: string | null;
  photoUrl: string | null;
  at: string | null;
  by: string | null;
}

export interface SOPhoto {
  id: string;
  path: string;
  url: string;
  desc?: string;
  at?: string;
  by?: string;
}

export interface SOSignature {
  name: string;
  idNumber: string;
  path: string;
  url: string;
  at: string;
}

export type EquipmentCondition = 'operativo' | 'mal_estado' | 'en_reparacion' | 'fuera_servicio';
export interface ConditionEntry { condition: EquipmentCondition; at: string; by: string; orderId?: string | null; orderNum?: string | null; note?: string }

export interface SOEquipment {
  equipmentId: string;
  equipmentSnapshot: { typeId: string; typeName: string; brand: string; model: string; serial: string; location: string };
  checklistTemplateId: string | null;
  checklistTemplateVersion: number | null;
  checklist: SOChecklistEntry[];
  condition?: EquipmentCondition;
}

export interface ServiceOrder {
  id: string;
  num: string;
  type: ServiceOrderType;
  /** 'periodico' = mantenimiento programado; 'demanda' = trabajo puntual (ex OT). */
  mode?: ServiceOrderMode;
  status: ServiceOrderStatus;
  /** Opcional en modalidad 'demanda' (puede no colgar de un contrato/equipo). */
  contractId: string | null;
  equipmentId: string | null;
  equipmentSnapshot: { typeId: string; typeName: string; brand: string; model: string; serial: string; location: string } | null;
  /** Varios equipos por orden (cada uno con su checklist). Vacío en demanda. */
  equipments?: SOEquipment[];
  client: { name: string; email: string; phone: string };
  techId: string | null;
  planDate: string;
  scheduledDate: string;
  scheduledTime: string;
  durationMin: number;
  skipNotice: boolean;
  notify: {
    noticeDaysBefore: number;
    noticeDate: string;
    noticeSentAt: string | null;
    reminderSentAt: string | null;
    confirmedAt: string | null;
    confirmedVia: string | null;
    rescheduleCount: number;
    tokens: { confirm: string | null; reschedule: string | null };
  };
  hold: { date: string; time: string; holdUntil: string } | null;
  checklistTemplateId: string | null;
  checklistTemplateVersion: number | null;
  /** Periódico con plantilla: SOChecklistEntry[]; demanda ad-hoc: ChecklistItem[]. */
  checklist: SOChecklistEntry[] | ChecklistItem[];
  photos: SOPhoto[];
  observations: string;
  notes?: string;
  signature: SOSignature | null;
  startedAt: string | null;
  finishedAt: string | null;
  reportShare: ShareLink;
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
  techObs?: string;
  readyAt?: string | null;
  /** Evidencia libre (img/video/pdf) además del checklist con fotos de plantilla. */
  evidence?: Evidence[];
  /** Trabajo de varios días (un día = una visita). */
  visits?: Visit[];
  // ---- revisión interna ----
  requiresReview?: boolean;
  approval?: Approval | null;
  comments?: Comment[];
  // ---- inventario ----
  materials?: MaterialUse[];
  materialsNote?: string;
  materialsApplied?: boolean;
  // ---- facturación ----
  requiresInvoice?: boolean;
  chargeTypeId?: string | null;
  clientId?: string | null;
  billAmount?: number | null;
  billCurrency?: 'CRC' | 'USD';
  billingApplied: boolean;
  invoiceItemId: string | null;
  cadenceApplied: boolean;
  history: { status: string; at: string; by: string; note?: string }[];
  created: string;
  createdBy?: string;
}

export interface InvoiceItem {
  id: string;
  serviceOrderId: string;
  soNum: string;
  type: ServiceOrderType;
  contractId: string;
  licitacionNum: string;
  clientName: string;
  equipmentSummary: string;
  serviceDate: string;
  status: 'pendiente' | 'facturado';
  invoiceId: string | null;
  invoicedAt?: string;
  invoiceNote?: string;
  amount: number | null;
  // Facturación electrónica (GTI): receptor + tipo de cargo + moneda capturados en la OT.
  chargeTypeId?: string | null;
  clientId?: string | null;
  currency?: 'CRC' | 'USD';
  description?: string;
  createdAt: string;
}

/* ---------------- facturación electrónica (GTI) ---------------- */

export type FiscalCurrency = 'CRC' | 'USD';

/** Receptor fiscal (cliente al que se factura). Reusable entre órdenes. */
export interface Client {
  id: string;
  name: string;
  identType: number;       // 1=céd. física, 2=jurídica, 3=DIMEX, 4=NITE
  identNumber: string;
  comercialName?: string;
  email: string;
  ccEmails?: string;
  activityCode?: string;
  province?: number | null;
  canton?: number | null;
  district?: number | null;
  neighborhood?: number | null;
  direction?: string;
  internalCode?: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** Tipo de cargo facturable ("account type"). */
export interface ChargeType {
  id: string;
  name: string;
  code?: string;
  cabysCode?: string;
  emitIva: boolean;        // true = gravado 13% (tarifa 8); false = no sujeto (tarifa 11)
  issuesDocument: boolean; // ¿emite documento electrónico?
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** Línea de una factura manual (compositor). */
export interface InvoiceLine {
  description: string;
  chargeTypeId?: string | null;
  cabys?: string | null;
  prodServCode?: string | null;
  emitIva: boolean;
  amount: number;        // monto base (IVA encima)
  ivaIncluded?: boolean; // false en facturas manuales
}

/** Factura consolidada (FC-####) con tracking de emisión electrónica. */
export interface Invoice {
  id: string;
  num: string;
  itemIds: string[];
  itemCount: number;
  contractIds?: (string | null)[];
  clientNames: string[];
  receptorId?: string | null;
  currency?: FiscalCurrency;
  subtotal?: number;
  tax?: number;
  total?: number;
  note: string;
  status: string;
  /** Factura manual hecha por líneas (compositor). */
  manual?: boolean;
  lines?: InvoiceLine[];
  // Emisión GTI
  isElectronicBillSend?: boolean;
  electronicBillStatus?: string;
  electronicBillResponse?: string;
  referenceNumber?: string | null; // consecutivo
  numericKey?: string | null;       // clave numérica
  emittedAt?: string | null;
  creditedAt?: string | null;
  creditNoteId?: string | null;
  creditedAmount?: number;
  createdAt: string;
  createdBy?: string;
}

export interface CreditNote {
  id: string;
  canceledInvoiceId: string;
  canceledInvoiceNum?: string;
  receptorId?: string | null;
  amount: number;
  reason: string;
  currency?: FiscalCurrency;
  total?: number;
  isElectronicBillSend?: boolean;
  electronicBillStatus?: string;
  electronicBillResponse?: string;
  referenceNumber?: string | null;
  numericKey?: string | null;
  createdAt: string;
}

export type TicketStatus =
  | 'pendiente'
  | 'asignado'
  | 'en_proceso'
  | 'listo_revision'
  | 'aprobado'
  | 'rechazado'
  | 'cerrado';

export type Priority = 'baja' | 'media' | 'alta' | 'urgente';

export type EvidenceType = 'image' | 'video' | 'pdf';
export type CommentType = 'general' | 'rechazo' | 'aprobacion' | 'tecnica';

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Roles del usuario (multi-rol para personal de escritorio: coordinador y/o facturación). */
  roles?: Role[];
  tenantId?: string | null;
  phone?: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
  initials: string;
  ticketsCount?: number;
  /** Módulos visibles para este admin. Vacío/ausente = todos. (Solo aplica a role 'admin'.) */
  modules?: string[];
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  by?: string | null;
  at?: string | null;
  /** Visita (día) en la que se completó (trabajos de varios días). */
  visitId?: string | null;
}

export interface Evidence {
  id: string;
  /** Storage path of the original upload */
  path?: string;
  /** Public/served URL used by the UI (signed or download URL) */
  file: string;
  type: EvidenceType;
  name?: string;
  size?: number;
  desc: string;
  by?: string;
  date: string;
  status?: 'processing' | 'ready';
  /** Visita (día) a la que pertenece la foto (trabajos de varios días). */
  visitId?: string | null;
}

/** Tramo de trabajo (fichaje): entrada → salida. `end` null = en curso. */
export interface WorkSegment {
  start: string;        // 'YYYY-MM-DD HH:mm'
  end: string | null;   // null mientras el cronómetro corre
}

/** Una visita = un día de trabajo de una orden. */
export interface Visit {
  id: string;
  date: string; // YYYY-MM-DD
  techId: string | null;
  techName: string;
  note: string; // qué se hizo ese día
  /** Tramos de fichaje del día (varias sesiones: iniciar/salir/reanudar). */
  segments?: WorkSegment[];
  hours?: number | null; // total del día (decimal), recalculado al cerrar un tramo
  at: string;
  by: string;
}

export interface HistoryEntry {
  status: TicketStatus;
  at: string;
  by: string;
  note?: string;
}

export interface Comment {
  type: CommentType;
  by: string;
  at: string;
  text: string;
}

export interface Approval {
  at: string;
  by: string;
  comment: string;
}

export interface ShareLink {
  active: boolean;
  token: string | null;
  /** Full public URL built from the token */
  url: string | null;
  created: string | null;
  expiresAt?: string | null;
  lastVisit: string | null;
  createdBy?: string | null;
}

export type WikiStatus = 'DRAFT' | 'PUBLISHED' | 'INACTIVE';

export interface WikiAttachment {
  id: string;
  path?: string;
  file: string;
  type: EvidenceType;
  name: string;
  size?: number;
  by?: string;
  date: string;
}

export interface WikiCategory {
  id: string;
  name: string;
  description?: string;
  orderIndex?: number;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface WikiPage {
  id: string;
  title: string;
  categoryId: string | null;
  contentMarkdown: string;
  status: WikiStatus;
  attachments: WikiAttachment[];
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string | null;
}

export interface InventoryItem {
  id: string;
  name: string;
  nameKey?: string;
  quantity: number;
  minQty: number;
  purchaseLink?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MaterialUse {
  productId: string | null;
  name: string;
  qty: number;
  comment?: string;
}

export interface InventoryMovement {
  id: string;
  productId: string;
  productName: string;
  qty: number;
  ticketId: string;
  ticketNum: string;
  client?: string;
  site?: string;
  techName?: string;
  at: string;
}

export interface Ticket {
  id: string;
  num: string;
  title: string;
  client: string;
  site: string;
  address: string;
  priority: Priority;
  status: TicketStatus;
  techId: string | null;
  scheduled: string;
  deadline: string;
  created: string;
  description: string;
  instructions: string;
  expected: string;
  doneConditions: string;
  observations: string;
  evidenceReq: string;
  techNote: string;
  techObs: string;
  readyAt: string | null;
  checklist: ChecklistItem[];
  evidence: Evidence[];
  history: HistoryEntry[];
  comments: Comment[];
  approval?: Approval;
  share: ShareLink;
  materials?: MaterialUse[];
  materialsNote?: string;
  materialsApplied?: boolean;
  // Facturación: el admin marca si requiere factura; el resto lo gestiona el backend
  // (invoiceItem + bandeja de Facturación) y se refleja aquí al consolidar.
  requiresInvoice?: boolean;
  billingApplied?: boolean;
  invoiceItemId?: string;
  invoiced?: boolean;
  invoicedAt?: string | null;
  invoiceNum?: string;
  invoiceNote?: string;
  // Facturación electrónica (GTI): datos capturados en la OT.
  clientId?: string | null;       // receptor fiscal
  chargeTypeId?: string | null;   // tipo de cargo
  billAmount?: number | null;     // monto (IVA incluido)
  billCurrency?: 'CRC' | 'USD';
  // Trabajos de varios días: una sola orden con varias visitas (un día = una visita).
  visits?: Visit[];
}
