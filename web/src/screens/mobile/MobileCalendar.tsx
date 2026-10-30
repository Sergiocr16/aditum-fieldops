/* © 2026 Aditum — Aditum FieldOps — Agenda del técnico: sus tickets + sus órdenes de servicio
   en una grilla mensual. Toca un día para ver el detalle de ese día. */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, StatusBadge, SOStatusBadge } from '../../components/ui';
import { useTenant } from '../../lib/tenant';
import { tenantHasFeature } from '../../lib/modules';
import { useMyServiceOrders } from '../../lib/serviceOrders';
import { TechShell } from './MobileShell';
import { monthMatrix, monthOf, addMonths, monthLabel, weekdayShort } from '../../lib/dates';
import { today } from '../../lib/time';
import type { AppCtx } from '../../lib/ctx';

type Item =
  | { kind: 'ticket'; id: string; date: string; time: string; num: string; title: string; sub: string; status: string }
  | { kind: 'so'; id: string; date: string; time: string; num: string; title: string; sub: string; status: string };

const TICKET_DOT = 'var(--navy-600)';
const SO_DOT = 'var(--gold)';

export default function MobileCalendar({ ctx }: { ctx: AppCtx }) {
  const { t, i18n } = useTranslation();
  const { tenant } = useTenant();
  const featMaint = tenantHasFeature('maintenance', tenant?.features);
  const techCanEditAvail = tenant?.techEditAvailability === true;
  const { orders } = useMyServiceOrders();

  const [month, setMonth] = useState(monthOf(today()));
  const [sel, setSel] = useState(today());

  const byDate = useMemo(() => {
    const m = new Map<string, Item[]>();
    const push = (it: Item) => { if (it.date) m.set(it.date, [...(m.get(it.date) || []), it]); };
    if (featMaint) {
      for (const o of orders) {
        if (o.status === 'CANCELADA' || !o.scheduledDate) continue;
        const eq = o.equipmentSnapshot || ({} as any);
        push({ kind: 'so', id: o.id, date: o.scheduledDate, time: o.scheduledTime || '', num: o.num, title: [eq.typeName, eq.brand].filter(Boolean).join(' · ') || o.title || o.num, sub: o.client?.name || '', status: o.status });
      }
    }
    for (const list of m.values()) list.sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
    return m;
  }, [orders, featMaint]);

  const weeks = useMemo(() => monthMatrix(month), [month]);
  const dows = weekdayShort(i18n.language);
  const selItems = byDate.get(sel) || [];

  return (
    <TechShell ctx={ctx} active="calendar">
      <div className="m-scroll" style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Navegación de mes */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="icon-btn" style={{ width: 36, height: 36 }} onClick={() => setMonth(addMonths(month, -1))} aria-label="prev">
            <Icon name="chevronLeft" size={17} />
          </button>
          <div style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 700 }}>{monthLabel(month, i18n.language)}</div>
          <button className="icon-btn" style={{ width: 36, height: 36 }} onClick={() => setMonth(addMonths(month, 1))} aria-label="next">
            <Icon name="chevronRight" size={17} />
          </button>
        </div>

        {/* Grilla */}
        <div className="card" style={{ overflow: 'hidden', padding: '6px 6px 8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {dows.map((d) => (
              <div key={d} style={{ textAlign: 'center', padding: '4px 0 8px', fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>{d}</div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {week.map((date) => {
                const inMonth = monthOf(date) === month;
                const isToday = date === today();
                const isSel = date === sel;
                const list = byDate.get(date) || [];
                const hasT = list.some((x) => x.kind === 'ticket');
                const hasS = list.some((x) => x.kind === 'so');
                return (
                  <button
                    key={date}
                    onClick={() => setSel(date)}
                    style={{
                      aspectRatio: '1 / 1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                      border: 'none', cursor: 'pointer', borderRadius: 11, margin: 1,
                      background: isSel ? 'var(--navy-800)' : 'transparent',
                      color: isSel ? '#fff' : inMonth ? 'var(--text)' : 'var(--text-3)',
                      opacity: inMonth ? 1 : 0.4,
                    }}
                  >
                    <span className="mono" style={{
                      fontSize: 13, fontWeight: isToday || isSel ? 800 : 500,
                      ...(isToday && !isSel ? { color: 'var(--gold-600)' } : {}),
                    }}>
                      {Number(date.slice(8))}
                    </span>
                    <span style={{ display: 'flex', gap: 3, height: 6 }}>
                      {hasT && <span style={{ width: 6, height: 6, borderRadius: 99, background: isSel ? '#fff' : TICKET_DOT }} />}
                      {hasS && <span style={{ width: 6, height: 6, borderRadius: 99, background: SO_DOT }} />}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Leyenda */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: 'var(--text-3)' }}>
          {featMaint && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 99, background: SO_DOT }} />{t('mobileOrders.navShort')}</span>}
        </div>

        {/* Disponibilidad: solo si la empresa habilita que el técnico la edite */}
        {techCanEditAvail && (
          <button
            onClick={() => ctx.go('techAvailability')}
            style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', border: '1px solid var(--border)', background: '#fff', borderRadius: 14, padding: '13px 15px', cursor: 'pointer', textAlign: 'left' }}
          >
            <span style={{ width: 38, height: 38, borderRadius: 10, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gold-50)', color: 'var(--gold-600)' }}>
              <Icon name="clock" size={18} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: 'var(--text)' }}>{t('availability.title')}</span>
              <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-3)' }}>{t('availability.sub')}</span>
            </span>
            <Icon name="chevronRight" size={18} style={{ color: 'var(--text-3)', flex: 'none' }} />
          </button>
        )}

        {/* Detalle del día seleccionado */}
        <div>
          <div className="section-label" style={{ marginBottom: 10 }}>
            {new Date(Date.UTC(+sel.slice(0, 4), +sel.slice(5, 7) - 1, +sel.slice(8))).toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'es-CR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}
          </div>
          {selItems.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {selItems.map((it) => (
                <button
                  key={it.kind + it.id}
                  onClick={() => ctx.go(it.kind === 'ticket' ? 'techTicket' : 'techOrder', { id: it.id })}
                  className="m-ticket-card"
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 13 }}
                >
                  <span style={{ width: 40, height: 40, borderRadius: 11, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: it.kind === 'ticket' ? 'var(--surface-2)' : 'var(--gold-50)', color: it.kind === 'ticket' ? 'var(--navy-700)' : 'var(--gold-600)' }}>
                    <Icon name={it.kind === 'ticket' ? 'clipboard' : 'wrench'} size={18} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      {it.time && <span className="mono" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>{it.time}</span>}
                      <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{it.num}</span>
                    </div>
                    <div style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.title}</div>
                    {it.sub && <div style={{ fontSize: 12.5, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.sub}</div>}
                  </div>
                  {it.kind === 'ticket' ? <StatusBadge status={it.status as any} size="sm" /> : <SOStatusBadge status={it.status as any} size="sm" />}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-3)', fontSize: 13.5 }}>
              <Icon name="calendar" size={26} style={{ opacity: 0.4 }} />
              <div style={{ marginTop: 8 }}>{t('techCal.emptyDay')}</div>
            </div>
          )}
        </div>
      </div>
    </TechShell>
  );
}
