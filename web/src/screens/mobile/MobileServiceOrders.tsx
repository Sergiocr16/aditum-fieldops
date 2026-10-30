/* © 2026 Aditum — Aditum FieldOps — Technician mobile: my service orders */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, EmptyState, SOStatusBadge } from '../../components/ui';
import { useMyServiceOrders } from '../../lib/serviceOrders';
import { TechShell } from './MobileShell';
import { today } from '../../lib/time';
import type { AppCtx } from '../../lib/ctx';
import type { ServiceOrder } from '../../lib/types';

function SOCard({ o, onClick }: { o: ServiceOrder; onClick: () => void }) {
  const { t } = useTranslation();
  const eq = o.equipmentSnapshot || ({} as any);
  const isDemand = (o.mode || 'periodico') === 'demanda';
  const eqCount = (o.equipments?.length || (o.equipmentSnapshot ? 1 : 0));
  const overdue = o.scheduledDate < today() && ['PROGRAMADA', 'NOTIFICADA', 'CONFIRMADA', 'REAGENDADA'].includes(o.status);
  return (
    <button onClick={onClick} className="m-ticket-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>{o.num}</span>
        <span className="badge" style={{ fontSize: 11 }}>
          <Icon name={isDemand ? 'zap' : 'refresh'} size={11} />
          {isDemand ? t('serviceOrders.mode_demanda') : t('serviceOrders.type_' + o.type)}
        </span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3, marginBottom: 8, color: 'var(--text)', textAlign: 'left' }}>
        {(isDemand ? o.title : (eqCount > 1 ? t('serviceOrders.nEquipment', { count: eqCount }) : [eq.typeName, eq.brand].filter(Boolean).join(' · '))) || t('serviceOrders.title')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5, color: 'var(--text-2)' }}>
          <Icon name="building" size={15} style={{ flex: 'none', color: 'var(--text-3)' }} />
          {o.client?.name}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5, color: 'var(--text-2)' }}>
          <Icon name="mapPin" size={15} style={{ flex: 'none', color: 'var(--text-3)' }} />
          {eq.location || o.site || '—'}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 11 }}>
        <SOStatusBadge status={o.status} size="sm" />
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: overdue ? 'var(--st-rech-fg)' : 'var(--text-2)', fontWeight: overdue ? 600 : 400 }} className="mono">
          <Icon name="calendar" size={14} />
          {o.scheduledDate} {o.scheduledTime}
        </span>
      </div>
    </button>
  );
}

export default function MobileServiceOrders({ ctx }: { ctx: AppCtx }) {
  const { t } = useTranslation();
  const { orders } = useMyServiceOrders();
  const d = today();
  const week = (() => {
    const [y, m, dd] = d.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, dd + 7));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  })();

  const ACTIVE = ['PROGRAMADA', 'NOTIFICADA', 'CONFIRMADA', 'REAGENDADA', 'EN_PROGRESO'];
  const tabs = [
    { key: 'today', label: t('mobileOrders.tabToday'), f: (o: ServiceOrder) => ACTIVE.includes(o.status) && o.scheduledDate <= d },
    { key: 'week', label: t('mobileOrders.tabWeek'), f: (o: ServiceOrder) => ACTIVE.includes(o.status) && o.scheduledDate > d && o.scheduledDate <= week },
    { key: 'upcoming', label: t('mobileOrders.tabUpcoming'), f: (o: ServiceOrder) => ACTIVE.includes(o.status) && o.scheduledDate > week },
    { key: 'done', label: t('mobileOrders.tabDone'), f: (o: ServiceOrder) => ['SERVICIO_TERMINADO', 'EN_REVISION', 'PENDIENTE_FACTURAR', 'FACTURADA', 'CERRADA'].includes(o.status) },
  ];
  const [tab, setTab] = useState('today');
  const active = tabs.find((x) => x.key === tab)!;
  const list = orders.filter(active.f);

  return (
    <TechShell ctx={ctx} active="orders">
      <div className="m-chips">
        {tabs.map((tb) => {
          const n = orders.filter(tb.f).length;
          return (
            <button key={tb.key} onClick={() => setTab(tb.key)} className={'m-chip' + (tab === tb.key ? ' active' : '')}>
              {tb.label}
              {n > 0 && <span className="m-chip-count">{n}</span>}
            </button>
          );
        })}
      </div>

      <div className="m-scroll" style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 24px', gap: 12 }}>
        {list.length ? (
          list.map((o) => <SOCard key={o.id} o={o} onClick={() => ctx.go('techOrder', { id: o.id })} />)
        ) : (
          <div style={{ marginTop: 30 }}>
            <EmptyState icon="checkCircle" title={t('mobileOrders.empty')} sub={t('mobileOrders.emptySub')} />
          </div>
        )}
      </div>
    </TechShell>
  );
}
