/* © 2026 Aditum — Aditum FieldOps — Clientes (receptores fiscales) data hook */
import { useEffect, useState } from 'react';
import { addDoc, deleteDoc, doc, getDocs, onSnapshot, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './auth';
import { useTenant } from './tenant';
import { now } from './time';
import type { Client } from './types';

const numOrNull = (v: any) => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v));
/** Clave de upsert para importación: número de identificación normalizado. */
export const identKeyOf = (ident?: string) => String(ident || '').trim().toLowerCase().replace(/[\s-]/g, '');

function cleanClient(data: Partial<Client>): any {
  const out: any = {};
  if (data.name !== undefined) out.name = (data.name || '').trim();
  if (data.identType !== undefined) out.identType = Number(data.identType) || 1;
  if (data.identNumber !== undefined) out.identNumber = String(data.identNumber || '').trim();
  if (data.comercialName !== undefined) out.comercialName = (data.comercialName || '').trim().slice(0, 80);
  if (data.email !== undefined) out.email = (data.email || '').trim();
  if (data.ccEmails !== undefined) out.ccEmails = (data.ccEmails || '').trim();
  if (data.activityCode !== undefined) out.activityCode = (data.activityCode || '').trim();
  if (data.province !== undefined) out.province = numOrNull(data.province);
  if (data.canton !== undefined) out.canton = numOrNull(data.canton);
  if (data.district !== undefined) out.district = numOrNull(data.district);
  if (data.neighborhood !== undefined) out.neighborhood = numOrNull(data.neighborhood);
  if (data.direction !== undefined) out.direction = (data.direction || '').trim().slice(0, 160);
  if (data.internalCode !== undefined) out.internalCode = (data.internalCode || '').trim();
  if (data.active !== undefined) out.active = !!data.active;
  return out;
}

export function useClients() {
  const { user } = useAuth();
  const { tid, tcol, tdoc } = useTenant();
  const [items, setItems] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !tid) return;
    return onSnapshot(
      tcol('clients'),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Client[];
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
    create: async (data: Partial<Client>) => {
      const ref = await addDoc(tcol('clients'), { ...cleanClient(data), active: true, createdAt: now(), updatedAt: now() });
      return ref.id;
    },
    update: async (id: string, patch: Partial<Client>) => {
      await updateDoc(tdoc('clients', id), { ...cleanClient(patch), updatedAt: now() });
    },
    remove: async (id: string) => {
      await deleteDoc(tdoc('clients', id));
    },
    /** Importación masiva: upsert por número de identificación (actualiza existentes, crea nuevos). */
    bulkUpsert: async (rows: Partial<Client>[]) => {
      const snap = await getDocs(tcol('clients'));
      const byKey = new Map<string, string>();
      snap.docs.forEach((d) => byKey.set(identKeyOf((d.data() as any).identNumber), d.id));
      let batch = writeBatch(db);
      let ops = 0;
      let created = 0;
      let updated = 0;
      for (const r of rows) {
        const name = (r.name || '').trim();
        const ident = String(r.identNumber || '').trim();
        if (!name || !ident) continue;
        const key = identKeyOf(ident);
        const payload = cleanClient({ ...r, name, identNumber: ident, active: true });
        payload.updatedAt = now();
        const existingId = byKey.get(key);
        if (existingId) {
          batch.update(tdoc('clients', existingId), payload);
          updated++;
        } else {
          const ref = doc(tcol('clients'));
          payload.createdAt = now();
          batch.set(ref, payload);
          byKey.set(key, ref.id);
          created++;
        }
        if (++ops >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          ops = 0;
        }
      }
      if (ops > 0) await batch.commit();
      return { created, updated };
    },
  };
}
