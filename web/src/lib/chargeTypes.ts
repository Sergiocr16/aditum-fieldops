/* © 2026 Aditum — Aditum FieldOps — Tipos de cargo facturables data hook */
import { useEffect, useState } from 'react';
import { addDoc, deleteDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { useAuth } from './auth';
import { useTenant } from './tenant';
import { now } from './time';
import type { ChargeType } from './types';

function cleanChargeType(data: Partial<ChargeType>): any {
  const out: any = {};
  if (data.name !== undefined) out.name = (data.name || '').trim();
  if (data.code !== undefined) out.code = (data.code || '').trim();
  if (data.cabysCode !== undefined) out.cabysCode = (data.cabysCode || '').trim();
  if (data.emitIva !== undefined) out.emitIva = data.emitIva !== false;
  if (data.issuesDocument !== undefined) out.issuesDocument = data.issuesDocument !== false;
  if (data.active !== undefined) out.active = !!data.active;
  return out;
}

export function useChargeTypes() {
  const { user } = useAuth();
  const { tid, tcol, tdoc } = useTenant();
  const [items, setItems] = useState<ChargeType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !tid) return;
    return onSnapshot(
      tcol('chargeTypes'),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as ChargeType[];
        list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setItems(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, [user?.uid, tid]);

  return {
    items,
    loading,
    create: async (data: Partial<ChargeType>) => {
      const ref = await addDoc(tcol('chargeTypes'), {
        emitIva: true,
        issuesDocument: true,
        ...cleanChargeType(data),
        active: true,
        createdAt: now(),
        updatedAt: now(),
      });
      return ref.id;
    },
    update: async (id: string, patch: Partial<ChargeType>) => {
      await updateDoc(tdoc('chargeTypes', id), { ...cleanChargeType(patch), updatedAt: now() });
    },
    remove: async (id: string) => {
      await deleteDoc(tdoc('chargeTypes', id));
    },
  };
}
