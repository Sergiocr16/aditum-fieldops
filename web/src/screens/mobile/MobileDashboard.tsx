/* © 2026 Aditum — Aditum FieldOps — Technician mobile dashboard */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, BrandLogo, StatusBadge, PriorityChip, EmptyState } from '../../components/ui';
import { useTenant } from '../../lib/tenant';
import { tenantHasFeature } from '../../lib/modules';
import { today } from '../../lib/time';
import { TechShell } from './MobileShell';
import type { AppCtx } from '../../lib/ctx';
import type { Ticket } from '../../lib/types';

export function MobileHeader({ title, onBack, onLogout, sub }: any) {
  const { tenant } = useTenant();
  useEffect(() => { if (title) document.title = String(title); }, [title]);
  return (
    <div style={{ background: 'var(--navy-800)', color: '#fff', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 20 }}>
      {onBack ? (
        <button onClick={onBack} style={{ border: 'none', background: 'rgba(255,255,255,.12)', color: '#fff', width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <Icon name="arrowLeft" size={19} />
        </button>
      ) : (
        <BrandLogo logoUrl={tenant?.branding?.logoUrl} variant="dark" height={26} withLockup={false} dark />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: onBack ? 15 : 13, fontWeight: onBack ? 700 : 500, color: onBack ? '#fff' : 'rgba(255,255,255,.65)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)' }}>{sub}</div>}
      </div>
      {onLogout && (
        <button onClick={onLogout} style={{ border: 'none', background: 'rgba(255,255,255,.12)', color: '#fff', width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <Icon name="logout" size={18} />
        </button>
      )}
    </div>
  );
}

export default function TechDashboard({ ctx }: { ctx: AppCtx }) {
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const featMaint = tenantHasFeature('maintenance', tenant?.features);
  // El técnico ya no usa tickets: su home es la bandeja de órdenes de servicio.
  useEffect(() => {
    if (featMaint) ctx.go('techOrders');
  }, [featMaint]);
  return (
    <TechShell ctx={ctx} active="orders">
      <div style={{ marginTop: 30 }}>
        <EmptyState icon="checkCircle" title={t('mobile.emptyTitle')} sub={t('mobile.emptyAll')} />
      </div>
    </TechShell>
  );
}
