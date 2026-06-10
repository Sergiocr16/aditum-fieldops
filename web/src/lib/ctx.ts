/* © 2026 Aditum — Aditum FieldOps — App context shape shared by screens */
import type { AppUser, Ticket } from './types';
import { PUBLIC_BASE_URL } from './firebase';

export interface AppCtx {
  db: { tickets: Ticket[]; technicians: AppUser[] };
  /** Current logged-in user, exposed in the shape the screens expect. */
  admin: { name: string; email: string; role: string; initials: string; uid: string };
  updateTicket: (id: string, patch: Partial<Ticket>) => void | Promise<void>;
  addTicket: (data: Partial<Ticket>) => Promise<string>;
  addTechnician: (data: { name: string; email: string; phone?: string; password: string; role?: string }) => Promise<{ uid: string; password: string }>;
  updateTechnician: (id: string, patch: Partial<AppUser>) => void | Promise<void>;
  resetTechnicianPassword: (id: string) => Promise<{ password: string }>;
  sendPublicLink: (ticketId: string, to: string, cc?: string, message?: string) => Promise<{ url: string }>;
  /** Server-side public-link management (tokens live in the global publicTokens collection). */
  ensurePublicLink: (ticketId: string, action?: 'generate' | 'regenerate' | 'toggle') => Promise<{ token: string; url: string; active: boolean }>;
  go: (name: string, params?: any) => void;
  back: () => void;
  logout: () => void;
  openPublic: (ticket: Ticket) => void;
  loading: boolean;
}

export function publicUrl(token: string): string {
  return `${PUBLIC_BASE_URL.replace(/\/$/, '')}/p/${token}`;
}
