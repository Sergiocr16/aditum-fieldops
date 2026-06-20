/* © 2026 Aditum — Aditum FieldOps — Contracts data hook (Firestore, tenant-scoped) */
import { useEffect, useState } from 'react';
import { doc, onSnapshot, runTransaction, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './auth';
import { useTenant } from './tenant';
import { now, today } from './time';
import type { Contract, PeriodicityMonths } from './types';

export const PERIODICITY_OPTIONS: PeriodicityMonths[] = [0.5, 1, 2, 3, 6, 12];

export function useContracts() {
  const { user } = useAuth();
  const { tid, tenant, tcol, tdoc } = useTenant();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !tid || user.role === 'superadmin') {
      setLoading(false);
      return;
    }
    return onSnapshot(
      tcol('contracts'),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Contract[];
        list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        setContracts(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, [user?.uid, tid]);

  const by = 'Admin · ' + (user?.name || '');
  const prefix = tenant?.numbering?.contractPrefix || 'CT';

  return {
    contracts,
    loading,
    addContract: async (data: Partial<Contract>): Promise<{ id: string; num: string }> => {
      const ref = doc(tcol('contracts'));
      const ts = now();
      const num = await runTransaction(db, async (tx) => {
        const counterRef = tdoc('counters', 'contracts');
        const cs = await tx.get(counterRef);
        const next = (cs.exists() ? (cs.data() as any).value : 1000) + 1;
        tx.set(counterRef, { value: next }, { merge: true });
        tx.set(ref, {
          licitacionNum: data.licitacionNum || '',
          clientName: data.clientName || '',
          clientEmail: data.clientEmail || '',
          clientPhone: data.clientPhone || '',
          modality: data.modality || 'periodico',
          startDate: data.startDate || today(),
          endDate: data.endDate || '',
          defaultPeriodicityMonths: data.defaultPeriodicityMonths || 3,
          techIds: data.techIds || [],
          defaultTechId: data.defaultTechId ?? (data.techIds?.[0] || null),
          noticeDaysBefore: data.noticeDaysBefore ?? null,
          notes: data.notes || '',
          active: true,
          num: prefix + '-' + next,
          createdAt: ts,
          updatedAt: ts,
          history: [{ at: ts, by, note: 'Contrato creado' }],
        });
        return prefix + '-' + next;
      });
      return { id: ref.id, num };
    },
    updateContract: async (id: string, patch: Partial<Contract>, note?: string) => {
      const p: any = { ...patch, updatedAt: now() };
      if (note) {
        const current = contracts.find((c) => c.id === id);
        p.history = [...(current?.history || []), { at: now(), by, note }];
      }
      await updateDoc(tdoc('contracts', id), p);
    },
    deleteContract: async (id: string) => {
      await deleteDoc(tdoc('contracts', id));
    },
  };
}
