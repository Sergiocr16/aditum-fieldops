/* © 2026 Aditum — Aditum FieldOps — Tenant context: scoping helpers + branding */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, type CollectionReference, type DocumentReference } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './auth';
import type { Tenant } from './types';

interface TenantState {
  /** Tenant id from the auth claims (null for superadmin). */
  tid: string | null;
  /** Live tenant doc (branding, numbering, active). Null while loading or for superadmin. */
  tenant: Tenant | null;
  loading: boolean;
  /** Collection scoped to the current tenant: tenants/{tid}/{name}. */
  tcol: (name: string) => CollectionReference;
  /** Doc scoped to the current tenant: tenants/{tid}/{name}/{id}. */
  tdoc: (name: string, id: string) => DocumentReference;
}

const Ctx = createContext<TenantState>(null as any);
export const useTenant = () => useContext(Ctx);

const DEFAULT_TICKET_PREFIX = 'AD';

export function ticketPrefixOf(tenant: Tenant | null): string {
  return tenant?.numbering?.ticketPrefix || DEFAULT_TICKET_PREFIX;
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  const tid = user?.tenantId || null;

  useEffect(() => {
    setTenant(null);
    if (!tid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    return onSnapshot(
      doc(db, 'tenants', tid),
      (snap) => {
        setTenant(snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as Tenant) : null);
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, [tid]);

  // Branding → CSS variables (navy/gold defaults stay if the tenant has none).
  useEffect(() => {
    const root = document.documentElement;
    const b = tenant?.branding;
    if (b?.primaryColor) root.style.setProperty('--navy-800', b.primaryColor);
    if (b?.accentColor) root.style.setProperty('--gold', b.accentColor);
    return () => {
      root.style.removeProperty('--navy-800');
      root.style.removeProperty('--gold');
    };
  }, [tenant?.branding?.primaryColor, tenant?.branding?.accentColor]);

  // A deactivated tenant logs everyone out.
  useEffect(() => {
    if (tenant && tenant.active === false) logout();
  }, [tenant?.active]);

  const value = useMemo<TenantState>(
    () => ({
      tid,
      tenant,
      loading,
      tcol: (name: string) => {
        if (!tid) throw new Error('No tenant in session');
        return collection(db, 'tenants', tid, name);
      },
      tdoc: (name: string, id: string) => {
        if (!tid) throw new Error('No tenant in session');
        return doc(db, 'tenants', tid, name, id);
      },
    }),
    [tid, tenant, loading]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
