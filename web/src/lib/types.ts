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
export type PeriodicityMonths = 1 | 2 | 3 | 6 | 12;

export interface Contract {
  id: string;
  num: string;
  licitacionNum: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
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
  | 'SERVICIO_TERMINADO' | 'PENDIENTE_FACTURAR' | 'FACTURADA' | 'CANCELADA';

export type ServiceOrderType = 'preventivo' | 'correctivo';

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

export interface ServiceOrder {
  id: string;
  num: string;
  type: ServiceOrderType;
  status: ServiceOrderStatus;
  contractId: string;
  equipmentId: string;
  equipmentSnapshot: { typeId: string; typeName: string; brand: string; model: string; serial: string; location: string };
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
  checklist: SOChecklistEntry[];
  photos: SOPhoto[];
  observations: string;
  notes?: string;
  signature: SOSignature | null;
  startedAt: string | null;
  finishedAt: string | null;
  reportShare: ShareLink;
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
}
