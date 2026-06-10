/* © 2026 Aditum — Aditum FieldOps — Firestore-backed data store (tenant-scoped) */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  updateDoc,
  runTransaction,
  orderBy,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';
import { useAuth } from './auth';
import { useTenant, ticketPrefixOf } from './tenant';
import { initialsOf } from './config';
import { now, today } from './time';
import type { AppUser, Ticket } from './types';

export interface DataState {
  tickets: Ticket[];
  technicians: AppUser[];
  loading: boolean;
  updateTicket: (id: string, patch: Partial<Ticket>) => Promise<void>;
  addTicket: (data: Partial<Ticket>) => Promise<string>;
  addTechnician: (data: {
    name: string;
    email: string;
    phone?: string;
    password: string;
    role?: string;
  }) => Promise<{ uid: string; password: string }>;
  updateTechnician: (id: string, patch: Partial<AppUser>) => Promise<void>;
  resetTechnicianPassword: (id: string) => Promise<{ password: string }>;
  sendPublicLink: (ticketId: string, to: string, cc?: string, message?: string) => Promise<{ url: string }>;
  /** Generates / regenerates / toggles the public link (server-side token). */
  ensurePublicLink: (ticketId: string, action?: 'generate' | 'regenerate' | 'toggle') => Promise<{ token: string; url: string; active: boolean }>;
}

const Ctx = createContext<DataState>(null as any);
export const useData = () => useContext(Ctx);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { tid, tenant, tcol, tdoc } = useTenant();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [technicians, setTechnicians] = useState<AppUser[]>([]);
  const [loadingT, setLoadingT] = useState(true);
  const [loadingU, setLoadingU] = useState(true);

  const isMember = !!user && !!tid && (user.role === 'admin' || user.role === 'tech');
  // Coordinador y admin necesitan la lista de técnicos (para asignar en contratos/OS).
  const canListTechs = !!user && !!tid && (user.role === 'admin' || user.role === 'coordinador');

  // Tickets: admin sees all (of their tenant); technician sees only theirs.
  // (Coordinador/facturación no tienen acceso a tickets.)
  useEffect(() => {
    if (!isMember) {
      setTickets([]);
      setLoadingT(false);
      return;
    }
    const base = tcol('tickets');
    const q =
      user!.role === 'admin'
        ? query(base, orderBy('created', 'desc'))
        : query(base, where('techId', '==', user!.uid));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Ticket[];
        // technician query can't orderBy without composite index — sort client-side
        list.sort((a, b) => (b.created || '').localeCompare(a.created || ''));
        setTickets(list);
        setLoadingT(false);
      },
      () => setLoadingT(false)
    );
  }, [user?.uid, user?.role, tid]);

  // Technicians: global users collection filtered by tenant (admin + coordinador).
  useEffect(() => {
    if (!canListTechs) {
      setTechnicians([]);
      setLoadingU(false);
      return;
    }
    const q = query(collection(db, 'users'), where('tenantId', '==', tid), where('role', '==', 'tech'));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as AppUser[];
        list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setTechnicians(list);
        setLoadingU(false);
      },
      () => setLoadingU(false)
    );
  }, [user?.uid, user?.role, tid]);

  const ticketPrefix = ticketPrefixOf(tenant);

  const actions = useMemo<Omit<DataState, 'tickets' | 'technicians' | 'loading'>>(
    () => ({
      updateTicket: async (id, patch) => {
        await updateDoc(tdoc('tickets', id), patch as any);
      },
      addTicket: async (data) => {
        const ref = doc(tcol('tickets'));
        const num = await runTransaction(db, async (tx) => {
          const counterRef = tdoc('counters', 'tickets');
          const cs = await tx.get(counterRef);
          const next = (cs.exists() ? (cs.data() as any).value : 1040) + 1;
          tx.set(counterRef, { value: next }, { merge: true });
          tx.set(ref, { ...data, num: ticketPrefix + '-' + next, created: now() });
          return ticketPrefix + '-' + next;
        });
        return num;
      },
      addTechnician: async (data) => {
        const fn = httpsCallable(functions, 'createTechnician');
        const res: any = await fn(data);
        return res.data as { uid: string; password: string };
      },
      updateTechnician: async (id, patch) => {
        const fn = httpsCallable(functions, 'updateTechnician');
        await fn({ id, ...patch });
      },
      resetTechnicianPassword: async (id) => {
        const fn = httpsCallable(functions, 'resetTechnicianPassword');
        const res: any = await fn({ id });
        return res.data as { password: string };
      },
      sendPublicLink: async (ticketId, to, cc, message) => {
        const fn = httpsCallable(functions, 'sharePublicLink');
        const res: any = await fn({ ticketId, to, cc, message });
        return res.data as { url: string };
      },
      ensurePublicLink: async (ticketId, action = 'generate') => {
        const fn = httpsCallable(functions, 'ensurePublicLink');
        const res: any = await fn({ ticketId, action });
        return res.data as { token: string; url: string; active: boolean };
      },
    }),
    [tid, ticketPrefix]
  );

  const value: DataState = {
    tickets,
    technicians,
    loading: isMember ? loadingT || loadingU : false,
    ...actions,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Build a new-ticket payload from form fields (numbering happens in addTicket). */
export function buildNewTicket(f: any, adminName: string, techName?: string): Partial<Ticket> {
  const status = f.techId ? 'asignado' : 'pendiente';
  const ts = now();
  const history: any[] = [{ status: 'pendiente', at: ts, by: 'Admin · ' + adminName }];
  if (f.techId) {
    history.push({
      status: 'asignado',
      at: ts,
      by: 'Admin · ' + adminName,
      note: 'Asignado a ' + (techName || ''),
    });
  }
  return {
    title: f.title,
    client: f.client,
    site: f.site || '',
    address: f.address || '',
    priority: f.priority,
    techId: f.techId || null,
    scheduled: f.scheduled || '',
    deadline: f.deadline || '',
    description: f.description || '',
    instructions: f.instructions || '',
    expected: f.expected || '',
    doneConditions: f.doneConditions || '',
    observations: f.observations || '',
    evidenceReq: f.evidenceReq || '',
    status,
    readyAt: null,
    checklist: (f.checklist || []).filter((c: any) => c.text.trim()),
    evidence: [],
    comments: [],
    techNote: '',
    techObs: '',
    share: { active: false, token: null, url: null, created: null, lastVisit: null },
    history,
  };
}

export { initialsOf, now, today };
