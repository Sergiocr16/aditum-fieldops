/* © 2026 Aditum — Aditum FieldOps — Service-orders data hooks (tenant-scoped, siempre acotados) */
import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, query, where, updateDoc, runTransaction } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';
import { useAuth } from './auth';
import { useTenant } from './tenant';
import { now, today } from './time';
import type { ServiceOrder, ServiceOrderStatus } from './types';

export const SO_BUSY: ServiceOrderStatus[] = ['PROGRAMADA', 'NOTIFICADA', 'CONFIRMADA', 'REAGENDADA', 'EN_PROGRESO'];

function mapDocs(snap: any): ServiceOrder[] {
  const list = snap.docs.map((d: any) => ({ id: d.id, ...(d.data() as any) })) as ServiceOrder[];
  list.sort((a, b) => (a.scheduledDate + (a.scheduledTime || '')).localeCompare(b.scheduledDate + (b.scheduledTime || '')));
  return list;
}

/** Rango de fechas (calendario / listas admin). Re-suscribe al cambiar el rango. */
export function useServiceOrdersRange(from: string, to: string, techId?: string) {
  const { user } = useAuth();
  const { tid, tcol } = useTenant();
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !tid || user.role === 'superadmin') {
      setLoading(false);
      return;
    }
    setLoading(true);
    let q = query(tcol('serviceOrders'), where('scheduledDate', '>=', from), where('scheduledDate', '<=', to));
    if (techId) q = query(q, where('techId', '==', techId));
    return onSnapshot(q, (snap) => { setOrders(mapDocs(snap)); setLoading(false); }, () => setLoading(false));
  }, [user?.uid, tid, from, to, techId]);

  return { orders, loading };
}

/** OS por contrato (ficha de contrato). */
export function useContractServiceOrders(contractId: string) {
  const { user } = useAuth();
  const { tid, tcol } = useTenant();
  const [orders, setOrders] = useState<ServiceOrder[]>([]);

  useEffect(() => {
    if (!user || !tid || !contractId) return;
    const q = query(tcol('serviceOrders'), where('contractId', '==', contractId));
    return onSnapshot(q, (snap) => setOrders(mapDocs(snap)), () => {});
  }, [user?.uid, tid, contractId]);

  return orders;
}

/** OS del técnico: ayer → +14 días (vista móvil). */
export function useMyServiceOrders() {
  const { user } = useAuth();
  const { tid, tcol } = useTenant();
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !tid || user.role !== 'tech') {
      setLoading(false);
      return;
    }
    const q = query(tcol('serviceOrders'), where('techId', '==', user.uid));
    return onSnapshot(q, (snap) => { setOrders(mapDocs(snap)); setLoading(false); }, () => setLoading(false));
  }, [user?.uid, tid]);

  return { orders, loading };
}

/** Doc individual (detalle/ejecución, sin depender de la lista). */
export function useServiceOrder(id?: string) {
  const { user } = useAuth();
  const { tid, tdoc } = useTenant();
  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !tid || !id) {
      setLoading(false);
      return;
    }
    return onSnapshot(tdoc('serviceOrders', id), (snap) => {
      setOrder(snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as ServiceOrder) : null);
      setLoading(false);
    }, () => setLoading(false));
  }, [user?.uid, tid, id]);

  return { order, loading };
}

/** Bandeja de facturación. */
export function useBillingOrders(tab: 'pendiente' | 'facturado') {
  const { user } = useAuth();
  const { tid, tcol } = useTenant();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !tid || (user.role !== 'admin' && user.role !== 'facturacion')) {
      setLoading(false);
      return;
    }
    const q = query(tcol('invoiceItems'), where('status', '==', tab));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      list.sort((a: any, b: any) => (b.serviceDate || '').localeCompare(a.serviceDate || ''));
      setItems(list);
      setLoading(false);
    }, () => setLoading(false));
  }, [user?.uid, tid, tab]);

  return { items, loading };
}

/** Acciones sobre OS (admin/técnico). */
export function useServiceOrderActions() {
  const { user } = useAuth();
  const { tid, tenant, tcol, tdoc } = useTenant();
  const by = (user?.role === 'admin' ? 'Admin · ' : '') + (user?.name || '');

  return useMemo(() => ({
    /** Crea una OS correctiva manual (numeración atómica client-side, patrón tickets). */
    createCorrective: async (data: {
      contractId: string;
      equipmentId: string;
      equipmentSnapshot: any;
      client: { name: string; email: string; phone: string };
      techId: string | null;
      scheduledDate: string;
      scheduledTime?: string;
      skipNotice?: boolean;
      notes?: string;
    }): Promise<{ id: string; num: string }> => {
      const prefix = tenant?.numbering?.osPrefix || 'OS';
      const ref = doc(tcol('serviceOrders'));
      const ts = now();
      const noticeDays = 3;
      const num = await runTransaction(db, async (tx) => {
        const counterRef = tdoc('counters', 'serviceOrders');
        const cs = await tx.get(counterRef);
        const next = (cs.exists() ? (cs.data() as any).value : 1000) + 1;
        tx.set(counterRef, { value: next }, { merge: true });
        const noticeDate = (() => {
          const [y, m, d] = data.scheduledDate.split('-').map(Number);
          const dt = new Date(Date.UTC(y, m - 1, d - noticeDays));
          return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
        })();
        tx.set(ref, {
          num: prefix + '-' + next,
          type: 'correctivo',
          status: 'PROGRAMADA',
          contractId: data.contractId,
          equipmentId: data.equipmentId,
          equipmentSnapshot: data.equipmentSnapshot,
          client: data.client,
          techId: data.techId || null,
          planDate: data.scheduledDate,
          scheduledDate: data.scheduledDate,
          scheduledTime: data.scheduledTime || '08:00',
          durationMin: 60,
          skipNotice: data.skipNotice !== false,
          notify: { noticeDaysBefore: noticeDays, noticeDate, noticeSentAt: null, reminderSentAt: null, confirmedAt: null, confirmedVia: null, rescheduleCount: 0, tokens: { confirm: null, reschedule: null } },
          hold: null,
          checklistTemplateId: null,
          checklistTemplateVersion: null,
          checklist: [],
          photos: [],
          observations: '',
          notes: data.notes || '',
          signature: null,
          startedAt: null,
          finishedAt: null,
          reportShare: { active: false, token: null, url: null, created: null, lastVisit: null },
          billingApplied: false,
          invoiceItemId: null,
          cadenceApplied: false,
          history: [{ status: 'PROGRAMADA', at: ts, by }],
          created: ts,
          createdBy: user?.uid || '',
        });
        return prefix + '-' + next;
      });
      return { id: ref.id, num };
    },

    update: async (id: string, patch: Partial<ServiceOrder>) => {
      await updateDoc(tdoc('serviceOrders', id), patch as any);
    },

    /** Editar / reprogramar / reasignar (admin, escritura directa con history). */
    reschedule: async (
      so: ServiceOrder,
      scheduledDate: string,
      scheduledTime: string,
      techId?: string | null,
      note?: string,
      extras?: { durationMin?: number; notes?: string }
    ) => {
      const at = now();
      const noticeDays = so.notify?.noticeDaysBefore ?? 3;
      const [y, m, d] = scheduledDate.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d - noticeDays));
      const noticeDate = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
      const dateChanged = scheduledDate !== so.scheduledDate || scheduledTime !== so.scheduledTime;
      await updateDoc(tdoc('serviceOrders', so.id), {
        scheduledDate,
        scheduledTime,
        ...(techId !== undefined ? { techId } : {}),
        ...(extras?.durationMin ? { durationMin: extras.durationMin } : {}),
        ...(extras?.notes !== undefined ? { notes: extras.notes } : {}),
        notify: { ...so.notify, noticeDate },
        history: [
          ...(so.history || []),
          { status: so.status, at, by, note: note || (dateChanged ? `Reprogramada a ${scheduledDate} ${scheduledTime}` : 'Orden editada') },
        ],
      } as any);
    },

    cancel: async (so: ServiceOrder, reason: string) => {
      const at = now();
      await updateDoc(tdoc('serviceOrders', so.id), {
        status: 'CANCELADA',
        history: [...(so.history || []), { status: 'CANCELADA', at, by, note: reason }],
      } as any);
    },

    start: async (id: string) => {
      const fn = httpsCallable(functions, 'startServiceOrder');
      const res: any = await fn({ serviceOrderId: id });
      return res.data as { ok: boolean; items: number };
    },

    complete: async (id: string, signature: { name: string; idNumber: string; path: string; url: string }, observations?: string) => {
      const fn = httpsCallable(functions, 'completeServiceOrder');
      const res: any = await fn({ serviceOrderId: id, signature, observations });
      return res.data as { ok: boolean };
    },

    runScheduler: async () => {
      const fn = httpsCallable(functions, 'runMaintenanceScheduler');
      const res: any = await fn({});
      return res.data as { ok: boolean; stats: any[] };
    },

    markInvoiced: async (itemIds: string[], invoiceNote: string) => {
      const at = now();
      for (const itemId of itemIds) {
        const itemRef = tdoc('invoiceItems', itemId);
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(itemRef);
          if (!snap.exists()) return;
          const item = snap.data() as any;
          let soUpdate: { ref: any; history: any[] } | null = null;
          if (item.serviceOrderId) {
            const soRef = tdoc('serviceOrders', item.serviceOrderId);
            const soSnap = await tx.get(soRef); // reads antes de writes
            if (soSnap.exists()) soUpdate = { ref: soRef, history: (soSnap.data() as any).history || [] };
          }
          tx.update(itemRef, { status: 'facturado', invoicedAt: at, invoiceNote });
          if (soUpdate) {
            tx.update(soUpdate.ref, {
              status: 'FACTURADA',
              history: [...soUpdate.history, { status: 'FACTURADA', at, by, note: invoiceNote }],
            });
          }
        });
      }
    },
  }), [tid, user?.uid, tenant?.numbering?.osPrefix]);
}
