/* © 2026 Aditum — Aditum FieldOps
   Status & priority configuration. Labels resolve via i18n (status.*, priority.*). */
import type { TicketStatus, Priority } from './types';

export interface StatusCfg {
  key: TicketStatus;
  cls: 'pend' | 'asig' | 'proc' | 'revi' | 'apro' | 'rech' | 'cerr';
  order: number;
}
export interface PriorityCfg {
  key: Priority;
  cls: string;
}

export const STATUS: Record<TicketStatus, StatusCfg> = {
  pendiente: { key: 'pendiente', cls: 'pend', order: 0 },
  asignado: { key: 'asignado', cls: 'asig', order: 1 },
  en_proceso: { key: 'en_proceso', cls: 'proc', order: 2 },
  listo_revision: { key: 'listo_revision', cls: 'revi', order: 3 },
  aprobado: { key: 'aprobado', cls: 'apro', order: 4 },
  rechazado: { key: 'rechazado', cls: 'rech', order: 5 },
  cerrado: { key: 'cerrado', cls: 'cerr', order: 6 },
};

export const PRIORITY: Record<Priority, PriorityCfg> = {
  baja: { key: 'baja', cls: 'pr-baja' },
  media: { key: 'media', cls: 'pr-media' },
  alta: { key: 'alta', cls: 'pr-alta' },
  urgente: { key: 'urgente', cls: 'pr-urgente' },
};

export const PRIORITY_COLOR: Record<Priority, string> = {
  baja: '#3a7a52',
  media: '#1f5fa8',
  alta: '#b96712',
  urgente: '#bb2d2d',
};

export const TIMELINE_COLOR: Record<StatusCfg['cls'], string> = {
  pend: '#8a93a1',
  asig: '#2f7ad1',
  proc: '#e0911f',
  revi: '#8b5cf0',
  apro: '#27a35a',
  rech: '#e04545',
  cerr: '#56636f',
};

/** Statuses for which an admin may generate a public share link. */
export const SHAREABLE_STATUSES: TicketStatus[] = ['listo_revision', 'aprobado', 'cerrado'];

export interface StatusCounts {
  total: number;
  pendiente: number;
  asignado: number;
  en_proceso: number;
  listo_revision: number;
  aprobado: number;
  rechazado: number;
  cerrado: number;
}

export function statusCounts(list: { status: TicketStatus }[]): StatusCounts {
  const c: StatusCounts = {
    total: list.length,
    pendiente: 0,
    asignado: 0,
    en_proceso: 0,
    listo_revision: 0,
    aprobado: 0,
    rechazado: 0,
    cerrado: 0,
  };
  list.forEach((t) => {
    (c as any)[t.status] = ((c as any)[t.status] || 0) + 1;
  });
  return c;
}

/* ---------------- service orders ---------------- */
import type { ServiceOrderStatus } from './types';

/** Reusa las clases de color de estados de tickets (--st-*) para los estados de OS. */
export const SO_STATUS: Record<ServiceOrderStatus, { key: ServiceOrderStatus; cls: StatusCfg['cls']; order: number }> = {
  PROGRAMADA: { key: 'PROGRAMADA', cls: 'pend', order: 0 },
  NOTIFICADA: { key: 'NOTIFICADA', cls: 'asig', order: 1 },
  CONFIRMADA: { key: 'CONFIRMADA', cls: 'apro', order: 2 },
  REAGENDADA: { key: 'REAGENDADA', cls: 'revi', order: 3 },
  EN_PROGRESO: { key: 'EN_PROGRESO', cls: 'proc', order: 4 },
  SERVICIO_TERMINADO: { key: 'SERVICIO_TERMINADO', cls: 'apro', order: 5 },
  EN_REVISION: { key: 'EN_REVISION', cls: 'revi', order: 6 },
  PENDIENTE_FACTURAR: { key: 'PENDIENTE_FACTURAR', cls: 'revi', order: 7 },
  FACTURADA: { key: 'FACTURADA', cls: 'cerr', order: 8 },
  CERRADA: { key: 'CERRADA', cls: 'cerr', order: 9 },
  CANCELADA: { key: 'CANCELADA', cls: 'rech', order: 10 },
};

export const SO_ACTIVE_STATUSES: ServiceOrderStatus[] = ['PROGRAMADA', 'NOTIFICADA', 'CONFIRMADA', 'REAGENDADA', 'EN_PROGRESO'];

export function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
