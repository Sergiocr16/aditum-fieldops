/* © 2026 Aditum — Aditum FieldOps — Facturas (FC) + notas de crédito data hooks */
import { useEffect, useState } from 'react';
import { onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { useAuth } from './auth';
import { useTenant } from './tenant';
import type { Invoice, CreditNote } from './types';

export function useInvoices() {
  const { user } = useAuth();
  const { tid, tcol } = useTenant();
  const [items, setItems] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !tid) return;
    const q = query(tcol('invoices'), orderBy('createdAt', 'desc'), limit(500));
    return onSnapshot(
      q,
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Invoice[]);
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, [user?.uid, tid]);

  return { items, loading };
}

export function useCreditNotes() {
  const { user } = useAuth();
  const { tid, tcol } = useTenant();
  const [items, setItems] = useState<CreditNote[]>([]);

  useEffect(() => {
    if (!user || !tid) return;
    const q = query(tcol('creditNotes'), orderBy('createdAt', 'desc'), limit(500));
    return onSnapshot(q, (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as CreditNote[]), () => {});
  }, [user?.uid, tid]);

  return { items };
}
