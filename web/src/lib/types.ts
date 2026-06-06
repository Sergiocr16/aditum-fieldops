/* © 2026 Aditum — Aditum FieldOps */

export type Role = 'admin' | 'tech';

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
  phone?: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
  initials: string;
  ticketsCount?: number;
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
}
