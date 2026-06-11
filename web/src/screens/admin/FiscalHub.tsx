/* © 2026 Aditum — Aditum FieldOps — Hub de configuración de facturación electrónica (mini-dashboard) */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { onSnapshot } from 'firebase/firestore';
import { useTenant } from '../../lib/tenant';
import { useClients } from '../../lib/clients';
import { useChargeTypes } from '../../lib/chargeTypes';
import { Icon, Button } from '../../components/ui';
import { PageHeader } from './AdminShell';
import type { AppCtx } from '../../lib/ctx';

type Conn = 'unset' | 'disabled' | 'verified' | 'error';

function Kpi({ label, value, sub, dot, accent, onClick }: { label: string; value: React.ReactNode; sub?: string; dot?: string; accent?: boolean; onClick: () => void }) {
  return (
    <div className={'kpi kpi--link' + (accent ? ' kpi--accent' : '')} onClick={onClick}>
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        {dot && !accent && <span className="kpi-dot" style={{ background: dot }} />}
      </div>
      <div className="kpi-foot">
        <div className="kpi-val" style={{ fontSize: typeof value === 'string' ? 22 : undefined }}>{value}</div>
        {sub && <span className="u" style={{ color: 'var(--text-3)' }}>{sub}</span>}
      </div>
    </div>
  );
}

export default function FiscalHub({ ctx }: { ctx: AppCtx }) {
  const { t } = useTranslation();
  const { tdoc } = useTenant();
  const clients = useClients();
  const chargeTypes = useChargeTypes();
  const [status, setStatus] = useState<'unset' | 'verified' | 'error'>('unset');
  const [enabled, setEnabled] = useState(false);
  const [hasCreds, setHasCreds] = useState(false);

  useEffect(() => {
    return onSnapshot(tdoc('settings', 'gti'), (snap) => {
      const d = snap.exists() ? (snap.data() as any) : null;
      setStatus(d?.status || 'unset');
      setEnabled(!!d?.enabled);
      setHasCreds(!!(d && d.accountNumber && d.passCiphertext));
    }, () => {});
  }, []);

  const conn: Conn = !hasCreds ? 'unset' : !enabled ? 'disabled' : status === 'verified' ? 'verified' : status === 'error' ? 'error' : 'disabled';
  const tone = { unset: 'neutral', disabled: 'gold', verified: 'ok', error: 'err' }[conn];
  const toneColors: any = {
    neutral: { bg: 'var(--surface-2)', fg: 'var(--text-2)', icon: 'settings' },
    gold: { bg: 'var(--gold-50)', fg: 'var(--gold-600)', icon: 'clock' },
    ok: { bg: 'var(--st-apro-bg)', fg: 'var(--st-apro-fg)', icon: 'checkCircle' },
    err: { bg: 'var(--st-rech-bg)', fg: 'var(--st-rech-fg)', icon: 'xCircle' },
  };
  const tc = toneColors[tone];
  const bannerTitle = { unset: t('gti.hubUnsetTitle'), disabled: t('gti.hubDisabledTitle'), verified: t('gti.hubConfiguredTitle'), error: t('gti.hubErrorTitle') }[conn];
  const bannerSub = { unset: t('gti.hubUnsetSub'), disabled: t('gti.hubDisabledSub'), verified: t('gti.hubConfiguredSub'), error: t('gti.hubErrorSub') }[conn];
  const connWord = { unset: t('gti.connUnset'), disabled: t('gti.connDisabled'), verified: t('gti.connVerified'), error: t('gti.connError') }[conn];
  const connDot = { unset: 'var(--text-3)', disabled: 'var(--gold-600)', verified: 'var(--st-apro-fg)', error: 'var(--st-rech-fg)' }[conn];
  const ctaLabel = conn === 'unset' ? t('gti.configure') : conn === 'error' ? t('gti.review') : t('gti.editConn');

  const gravados = chargeTypes.items.filter((c) => c.emitIva !== false).length;

  return (
    <div className="fade-in">
      <PageHeader
        title={t('gti.nav')}
        sub={t('gti.hubSub')}
        action={<Button variant="ghost" icon="receipt" onClick={() => ctx.go('billing')}>{t('billing.nav')}</Button>}
      />

      {/* Banner de estado de configuración */}
      <div className="card card-pad" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ width: 48, height: 48, borderRadius: 12, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: tc.bg, color: tc.fg }}>
          <Icon name={tc.icon} size={24} />
        </span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{bannerTitle}</div>
          <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{bannerSub}</div>
        </div>
        <Button variant={conn === 'verified' ? 'ghost' : 'primary'} icon="zap" onClick={() => ctx.go('gtiSettings')}>{ctaLabel}</Button>
      </div>

      {/* Mini-dashboard */}
      <div className="kpi-row" style={{ marginBottom: 16 }}>
        <Kpi label={t('gti.kpiConnection')} value={connWord} dot={connDot} onClick={() => ctx.go('gtiSettings')} />
        <Kpi label={t('gti.kpiChargeTypes')} value={chargeTypes.items.length} sub={t('gti.kpiGravados', { n: gravados })} onClick={() => ctx.go('chargeTypes')} />
        <Kpi label={t('gti.kpiClients')} value={clients.items.length} onClick={() => ctx.go('clients')} />
      </div>

      {/* Accesos */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Button variant="ghost" icon="receipt" onClick={() => ctx.go('chargeTypes')}>{t('chargeTypes.title')}</Button>
        <Button variant="ghost" icon="building" onClick={() => ctx.go('clients')}>{t('clients.title')}</Button>
        <Button variant="ghost" icon="file" onClick={() => ctx.go('gtiSettings')}>{t('gti.hubGti')}</Button>
        <Button variant="primary" icon="plus" onClick={() => ctx.go('invoiceNew')}>{t('billing.newInvoice')}</Button>
      </div>
    </div>
  );
}
