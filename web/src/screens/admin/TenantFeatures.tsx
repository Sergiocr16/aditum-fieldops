/* © 2026 Aditum — Aditum FieldOps — Módulos que usa la empresa (features del tenant) */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { useTenant } from '../../lib/tenant';
import { TENANT_FEATURES, type TenantFeature } from '../../lib/modules';
import { Icon, Toggle, toast } from '../../components/ui';

const FEATURE_ICON: Record<TenantFeature, string> = { tickets: 'ticket', maintenance: 'wrench', inventory: 'building', wiki: 'globe' };

export default function TenantFeatures() {
  const { t } = useTranslation();
  const { tenant, tid } = useTenant();
  const [busy, setBusy] = useState<string | null>(null);

  // Ausente = todas activas (legacy).
  const enabled = (f: TenantFeature) => !tenant?.features || tenant.features.includes(f);

  const toggle = async (f: TenantFeature) => {
    if (!tid) return;
    const current = tenant?.features ? [...tenant.features] : [...TENANT_FEATURES];
    const next = current.includes(f) ? current.filter((x) => x !== f) : [...current, f];
    if (next.length === 0) {
      toast(t('tenantFeatures.atLeastOne'), 'error');
      return;
    }
    setBusy(f);
    try {
      await httpsCallable(functions, 'updateTenant')({ tenantId: tid, features: next });
      toast(t('common.saved'), 'success');
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    } finally {
      setBusy(null);
    }
  };

  const toggleAvail = async () => {
    if (!tid) return;
    setBusy('avail');
    try {
      await httpsCallable(functions, 'updateTenant')({ tenantId: tid, techEditAvailability: !(tenant?.techEditAvailability === true) });
      toast(t('common.saved'), 'success');
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card card-pad">
      <div className="section-label" style={{ marginBottom: 6 }}>{t('tenantFeatures.title')}</div>
      <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 14px', lineHeight: 1.5 }}>{t('tenantFeatures.intro')}</p>
      {TENANT_FEATURES.map((f) => (
        <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--bg)', color: 'var(--navy-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <Icon name={FEATURE_ICON[f]} size={17} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{t('tenantFeatures.f_' + f)}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{t('tenantFeatures.f_' + f + '_sub')}</div>
          </div>
          <Toggle on={enabled(f)} onClick={() => busy ? null : toggle(f)} />
        </div>
      ))}
      <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '12px 0 0' }}>{t('tenantFeatures.note')}</p>

      {/* Permiso: ¿el técnico edita su propia disponibilidad? */}
      {enabled('maintenance') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0 2px', marginTop: 10, borderTop: '1px solid var(--border)' }}>
          <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--bg)', color: 'var(--navy-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <Icon name="clock" size={17} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{t('tenantFeatures.techAvail')}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{t('tenantFeatures.techAvailSub')}</div>
          </div>
          <Toggle on={tenant?.techEditAvailability === true} onClick={() => busy ? null : toggleAvail()} />
        </div>
      )}
    </div>
  );
}
