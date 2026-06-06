/* © 2026 Aditum — Aditum FieldOps — App context shape shared by screens */
import type { AppUser, Ticket } from './types';
import { PUBLIC_BASE_URL } from './firebase';

export interface AppCtx {
  db: { tickets: Ticket[]; technicians: AppUser[] };
  /** Current logged-in user, exposed in the shape the screens expect. */
  admin: { name: string; email: string; role: string; initials: string; uid: string };
  updateTicket: (id: string, patch: Partial<Ticket>) => void | Promise<void>;
  addTicket: (data: Partial<Ticket>) => Promise<string>;
  addTechnician: (data: { name: string; email: string; phone?: string; password: string }) => Promise<{ uid: string; password: string }>;
  updateTechnician: (id: string, patch: Partial<AppUser>) => void | Promise<void>;
  resetTechnicianPassword: (id: string) => Promise<{ password: string }>;
  sendPublicLink: (ticketId: string, to: string, cc?: string, message?: string) => Promise<{ url: string }>;
  go: (name: string, params?: any) => void;
  back: () => void;
  logout: () => void;
  openPublic: (ticket: Ticket) => void;
  loading: boolean;
}

/** Cryptographically strong, non-sequential, URL-safe public token (32 bytes). */
export function makePublicToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function publicUrl(token: string): string {
  return `${PUBLIC_BASE_URL.replace(/\/$/, '')}/p/${token}`;
}
