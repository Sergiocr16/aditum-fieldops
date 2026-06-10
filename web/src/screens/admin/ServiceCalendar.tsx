/* © 2026 Aditum — Aditum FieldOps — Service-orders calendar (month view, per technician) */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, Button, Select, SOStatusBadge } from '../../components/ui';
import { PageHeader } from './AdminShell';
import { useServiceOrdersRange } from '../../lib/serviceOrders';
import { SO_STATUS } from '../../lib/config';
import { monthMatrix, monthOf, addMonths, monthLabel, weekdayShort } from '../../lib/dates';
import { today } from '../../lib/time';
import type { AppCtx } from '../../lib/ctx';
import type { ServiceOrder } from '../../lib/types';

const DOT: Record<string, string> = {
  pend: 'var(--st-pend-dot)',
  asig: 'var(--st-asig-dot)',
  proc: 'var(--st-proc-dot)',
  revi: 'var(--st-revi-dot)',
  apro: 'var(--st-apro-dot)',
  rech: 'var(--st-rech-dot)',
  cerr: 'var(--st-cerr-dot)',
};

export default function ServiceCalendar({ ctx }: { ctx: AppCtx }) {
  const { t, i18n } = useTranslation();
  const [month, setMonth] = useState(monthOf(today()));
  const [fTech, setFTech] = useState('');
  const weeks = useMemo(() => monthMatrix(month), [month]);
  const from = weeks[0][0];
  const to = weeks[weeks.length - 1][6];
  const { orders } = useServiceOrdersRange(from, to, fTech || undefined);
  const [selected, setSelected] = useState<ServiceOrder | null>(null);

  const byDate = useMemo(() => {
    const m = new Map<string, ServiceOrder[]>();
    orders.forEach((o) => {
      if (o.status === 'CANCELADA') return;
      m.set(o.scheduledDate, [...(m.get(o.scheduledDate) || []), o]);
    });
    return m;
  }, [orders]);

  const dows = weekdayShort(i18n.language);

  return (
    <div className="fade-in">
      <PageHeader
        title={t('calendar.title')}
        sub={t('calendar.sub')}
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Select value={fTech} onChange={(e: any) => setFTech(e.target.value)}>
              <option value="">{t('serviceOrders.allTechs')}</option>
              {ctx.db.technicians.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
            <button className="icon-btn" style={{ width: 36, height: 36 }} onClick={() => setMonth(addMonths(month, -1))}>
              <Icon name="chevronLeft" size={16} />
            </button>
            <Button size="sm" variant="ghost" onClick={() => setMonth(monthOf(today()))}>{t('calendar.today')}</Button>
            <button className="icon-btn" style={{ width: 36, height: 36 }} onClick={() => setMonth(addMonths(month, 1))}>
              <Icon name="chevronRight" size={16} />
            </button>
          </div>
        }
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, textTransform: 'capitalize' }}>{monthLabel(month, i18n.language)}</h2>
        <div style={{ display: 'flex', gap: 12, fontSize: 11.5, color: 'var(--text-3)', flexWrap: 'wrap' }}>
          {(['PROGRAMADA', 'CONFIRMADA', 'EN_PROGRESO', 'PENDIENTE_FACTURAR'] as const).map((s) => (
            <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: DOT[SO_STATUS[s].cls] }} />
              {t('soStatus.' + s)}
            </span>
          ))}
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
          {dows.map((d) => (
            <div key={d} style={{ padding: '8px 10px', fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>{d}</div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: wi < weeks.length - 1 ? '1px solid var(--border)' : 'none' }}>
            {week.map((date) => {
              const inMonth = monthOf(date) === month;
              const isToday = date === today();
              const list = byDate.get(date) || [];
              return (
                <div key={date} style={{ minHeight: 96, padding: '6px 7px', borderRight: '1px solid var(--border)', background: inMonth ? 'var(--surface)' : 'var(--bg)', opacity: inMonth ? 1 : 0.55 }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                    <span className="mono" style={{
                      fontSize: 12, fontWeight: isToday ? 800 : 500,
                      ...(isToday ? { background: 'var(--gold)', color: 'var(--navy-900)', borderRadius: 99, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' } : { color: 'var(--text-3)' }),
                    }}>
                      {Number(date.slice(8))}
                    </span>
                  </div>
                  {list.slice(0, 3).map((o) => (
                    <button
                      key={o.id}
                      onClick={() => setSelected(o)}
                      title={`${o.num} · ${o.client?.name}`}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5, width: '100%', border: 'none',
                        background: 'var(--bg)', borderRadius: 6, padding: '3px 6px', marginBottom: 3,
                        fontSize: 11, cursor: 'pointer', textAlign: 'left', overflow: 'hidden',
                      }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: 99, flex: 'none', background: DOT[SO_STATUS[o.status]?.cls || 'pend'] }} />
                      <span className="mono" style={{ fontWeight: 700, flex: 'none' }}>{o.scheduledTime}</span>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-2)' }}>
                        {o.equipmentSnapshot?.typeName || o.num}
                      </span>
                    </button>
                  ))}
                  {list.length > 3 && (
                    <div style={{ fontSize: 10.5, color: 'var(--text-3)', paddingLeft: 4 }}>+{list.length - 3}</div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {selected && (
        <div className="card card-pad fade-in" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontWeight: 800 }}>{selected.num}</span>
          <SOStatusBadge status={selected.status} />
          <span style={{ fontSize: 13.5 }}>{selected.equipmentSnapshot?.typeName} · {selected.client?.name}</span>
          <span className="mono" style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{selected.scheduledDate} {selected.scheduledTime}</span>
          <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{ctx.db.technicians.find((x) => x.id === selected.techId)?.name || t('common.unassigned')}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>{t('common.close')}</Button>
            <Button size="sm" icon="external" onClick={() => ctx.go('soDetail', { id: selected.id })}>{t('calendar.openOrder')}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
