/* © 2026 Aditum — Aditum FieldOps — Equipment & equipment-types data hook (tenant-scoped) */
import { useEffect, useState } from 'react';
import { doc, onSnapshot, query, where, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { useAuth } from './auth';
import { useTenant } from './tenant';
import { now } from './time';
import type { Equipment, EquipmentType } from './types';

export interface EquipmentCsvRow {
  typeName?: string;
  brand?: string;
  model?: string;
  serial?: string;
  location?: string;
  technician?: string;
  periodicityMonths?: number | string;
  nextScheduledDate?: string;
  notes?: string;
}

/** Suscripción a equipos (todos o por contrato) + catálogo de tipos. */
export function useEquipment(contractId?: string) {
  const { user } = useAuth();
  const { tid, tcol, tdoc } = useTenant();
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [types, setTypes] = useState<EquipmentType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !tid || user.role === 'superadmin') {
      setLoading(false);
      return;
    }
    const base = tcol('equipment');
    const q = contractId ? query(base, where('contractId', '==', contractId)) : base;
    const unsubE = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Equipment[];
        list.sort((a, b) => (a.location || '').localeCompare(b.location || '') || (a.serial || '').localeCompare(b.serial || ''));
        setEquipment(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    const unsubT = onSnapshot(tcol('equipmentTypes'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as EquipmentType[];
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setTypes(list);
    }, () => {});
    return () => {
      unsubE();
      unsubT();
    };
  }, [user?.uid, tid, contractId]);

  return {
    equipment,
    types,
    loading,
    typeName: (typeId: string) => types.find((t) => t.id === typeId)?.name || '—',
    addEquipment: async (data: Partial<Equipment>) => {
      const ref = await addDoc(tcol('equipment'), {
        contractId: data.contractId,
        typeId: data.typeId,
        brand: data.brand || '',
        model: data.model || '',
        serial: data.serial || '',
        location: data.location || '',
        assignedTechId: data.assignedTechId || null,
        periodicityMonths: data.periodicityMonths ?? null,
        noticeDaysBefore: data.noticeDaysBefore ?? null,
        nextScheduledDate: data.nextScheduledDate || null,
        lastServiceDate: null,
        notes: data.notes || '',
        active: true,
        condition: (data as any).condition || 'operativo',
        conditionHistory: [],
        importBatchId: null,
        createdAt: now(),
        updatedAt: now(),
      });
      return ref.id;
    },
    updateEquipment: async (id: string, patch: Partial<Equipment>) => {
      await updateDoc(tdoc('equipment', id), { ...patch, updatedAt: now() } as any);
    },
    deleteEquipment: async (id: string) => {
      await deleteDoc(tdoc('equipment', id));
    },
    addType: async (name: string) => {
      const ref = await addDoc(tcol('equipmentTypes'), { name: name.trim(), active: true, activeTemplateVersion: 0, createdAt: now(), updatedAt: now() });
      return ref.id;
    },
    updateType: async (id: string, patch: Partial<EquipmentType>) => {
      await updateDoc(tdoc('equipmentTypes', id), { ...patch, updatedAt: now() } as any);
    },
    /** Importación CSV vía callable (resuelve tipos/técnicos y dedupe por serie en el server). */
    importRows: async (contractId: string, rows: EquipmentCsvRow[]) => {
      const fn = httpsCallable(functions, 'importEquipment');
      const res: any = await fn({ contractId, rows });
      return res.data as { created: number; skipped: number; typesCreated: number; errors: { row: number; error: string }[] };
    },
  };
}
