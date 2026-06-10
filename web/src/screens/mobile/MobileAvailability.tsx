/* © 2026 Aditum — Aditum FieldOps — Technician mobile: weekly availability + blocks (read-only salvo que la empresa lo habilite) */
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../lib/auth';
import { useTenant } from '../../lib/tenant';
import { Icon } from '../../components/ui';
import { MobileHeader } from './MobileDashboard';
import AvailabilityEditor from '../../components/AvailabilityEditor';
import type { AppCtx } from '../../lib/ctx';

export default function MobileAvailability({ ctx }: { ctx: AppCtx }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { tenant } = useTenant();
  const canEdit = tenant?.techEditAvailability === true;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <MobileHeader title={t('availability.title')} sub={t('availability.sub')} onBack={() => ctx.back()} />

      <div className="m-scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px 14px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!canEdit && (
          <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 13px' }}>
            <Icon name="lock" size={16} style={{ color: 'var(--text-3)', flex: 'none', marginTop: 1 }} />
            <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.45 }}>{t('availability.readOnlyNote')}</span>
          </div>
        )}
        {user && <AvailabilityEditor techId={user.uid} canEdit={canEdit} />}
      </div>
    </div>
  );
}
