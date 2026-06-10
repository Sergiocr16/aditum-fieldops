/* © 2026 Aditum — Aditum Service — Inventory data hook (Firestore) */
import { useEffect, useState } from 'react';
import { doc, onSnapshot, query, orderBy, limit, addDoc, updateDoc, deleteDoc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './auth';
import { useTenant } from './tenant';
import { now } from './time';
import type { InventoryItem, InventoryMovement } from './types';

export const nameKeyOf = (name: string) => (name || '').trim().toLowerCase().replace(/\s+/g, ' ');

export function useInventory() {
  const { user } = useAuth();
  const { tid, tcol, tdoc } = useTenant();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !tid) return;
    const unsubI = onSnapshot(tcol('inventory'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as InventoryItem[];
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setItems(list);
      setLoading(false);
    });
    // movimientos solo los lee el admin (reglas)
    let unsubM = () => {};
    if (user.role === 'admin') {
      const qM = query(tcol('inventoryMovements'), orderBy('at', 'desc'), limit(300));
      unsubM = onSnapshot(qM, (snap) => setMovements(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as InventoryMovement[]), () => {});
    }
    return () => {
      unsubI();
      unsubM();
    };
  }, [user?.uid, user?.role, tid]);

  return {
    items,
    movements,
    loading,
    upsertItem: async (data: Partial<InventoryItem>) => {
      const nameKey = nameKeyOf(data.name || '');
      const existing = items.find((i) => (i.nameKey || nameKeyOf(i.name)) === nameKey);
      const payload: any = {
        name: (data.name || '').trim(),
        nameKey,
        quantity: Number(data.quantity) || 0,
        minQty: Number(data.minQty) || 0,
        purchaseLink: data.purchaseLink || '',
        description: data.description || '',
        updatedAt: now(),
      };
      if (existing) {
        await updateDoc(tdoc('inventory', existing.id), payload);
        return existing.id;
      }
      payload.createdAt = now();
      const ref = await addDoc(tcol('inventory'), payload);
      return ref.id;
    },
    updateItem: async (id: string, patch: Partial<InventoryItem>) => {
      const p: any = { ...patch, updatedAt: now() };
      if (patch.name) p.nameKey = nameKeyOf(patch.name);
      await updateDoc(tdoc('inventory', id), p);
    },
    deleteItem: async (id: string) => {
      await deleteDoc(tdoc('inventory', id));
    },
    /** Importación masiva: upsert por nameKey (actualiza existentes, crea nuevos). */
    bulkUpsert: async (rows: Partial<InventoryItem>[]) => {
      // mapa actual de la BD (no solo el estado local) para upsert confiable
      const snap = await getDocs(tcol('inventory'));
      const byKey = new Map<string, string>();
      snap.docs.forEach((d) => byKey.set((d.data() as any).nameKey || nameKeyOf((d.data() as any).name), d.id));
      let batch = writeBatch(db);
      let ops = 0;
      let created = 0;
      let updated = 0;
      for (const r of rows) {
        const name = (r.name || '').trim();
        if (!name) continue;
        const key = nameKeyOf(name);
        const payload: any = {
          name,
          nameKey: key,
          quantity: Number(r.quantity) || 0,
          minQty: Number(r.minQty) || 0,
          purchaseLink: r.purchaseLink || '',
          description: r.description || '',
          updatedAt: now(),
        };
        const existingId = byKey.get(key);
        if (existingId) {
          batch.update(tdoc('inventory', existingId), payload);
          updated++;
        } else {
          const ref = doc(tcol('inventory'));
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
