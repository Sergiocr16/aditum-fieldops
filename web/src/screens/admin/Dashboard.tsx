/* © 2026 Aditum — Aditum FieldOps — Admin dashboard */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, Avatar, StatusBadge, PriorityChip, SOStatusBadge } from '../../components/ui';
import { STATUS, statusCounts, SO_ACTIVE_STATUSES } from '../../lib/config';
import { useServiceOrdersRange, useBillingOrders } from '../../lib/serviceOrders';
import { useContracts } from '../../lib/contracts';
import { useInventory } from '../../lib/inventory';
import { addDays, monthOf } from '../../lib/dates';
import { today } from '../../lib/time';
import { CorrectiveModal } from './ServiceOrders';
import { canSeeModule } from '../../lib/modules';
import { useAuth } from '../../lib/auth';
import type { AppCtx } from '../../lib/ctx';
import type { ServiceOrder } from '../../lib/types';

const BADGE_COLORS: Record<string, [string, string, string]> = {
  pend: ['#eef0f3', '#54606e', '#8a93a1'],
  asig: ['#e6f0fb', '#1f5fa8', '#2f7ad1'],
  proc: ['#fdf2e0', '#a96a12', '#e0911f'],
  revi: ['#f0e9fb', '#6b3fb5', '#8b5cf0'],
  apro: ['#e4f6ec', '#1f7a47', '#27a35a'],
  rech: ['#fdeaea', '#bb2d2d', '#e04545'],
  cerr: ['#e7ebef', '#3a4654', '#56636f'],
};
const METRIC_ICON: Record<string, string> = { total: 'ticket', pend: 'clock', asig: 'users', proc: 'wrench', revi: 'eye', apro: 'checkCircle', rech: 'alert', cerr: 'lock' };

function MetricCard({ cls, label, count, big }: any) {
  const { t } = useTranslation();
  if (big) {
    return (
      <div className="card card-pad" style={{ background: 'var(--navy-800)', border: 'none', color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 118, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: -10, top: -10, opacity: 0.12, color: 'var(--gold)' }}>
          <Icon name="ticket" size={92} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.7)' }}>{label}</div>
        <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1 }}>{count}</div>
        <div style={{ fontSize: 12, color: 'var(--gold)' }}>{t('dashboard.inWholeSystem')}</div>
      </div>
    );
  }
  const [bg, fg, dot] = BADGE_COLORS[cls];
  return (
    <div className="card card-pad metric" style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 118 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ width: 34, height: 34, borderRadius: 9, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={METRIC_ICON[cls]} size={18} />
        </span>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot }} />
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1, color: 'var(--text)' }}>{count}</div>
      <div style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500 }}>{label}</div>
    </div>
  );
}

export default function AdminDashboard({ ctx }: { ctx: AppCtx }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  // El dashboard refleja los módulos visibles del usuario.
  const sees = (m: string) => canSeeModule(m, user?.role, user?.modules);
  const showTickets = sees('tickets');
  const showMaintenance = sees('serviceOrders') || sees('contracts') || sees('equipment') || sees('calendar');
  const showBilling = sees('billing');
  const tickets = ctx.db.tickets;
  const c = statusCounts(tickets);
  const recent = [...tickets].sort((a, b) => (b.created || '').localeCompare(a.created || '')).slice(0, 6);

  /* ---- mantenimiento: un solo rango cubre KPIs, próximas visitas y alertas ---- */
  const d = today();
  const range = useMemo(() => ({ from: addDays(d, -30), to: addDays(d, 7) }), [d]);
  const { orders } = useServiceOrdersRange(range.from, range.to);
  const { items: pendingBilling } = useBillingOrders('pendiente');
  const { contracts } = useContracts();
  const inv = useInventory();
  const [correctiveOpen, setCorrectiveOpen] = useState(false);

  const isActive = (o: ServiceOrder) => SO_ACTIVE_STATUSES.includes(o.status);
  const kpi = useMemo(() => {
    const week = addDays(d, 7);
    const month = monthOf(d);
    const monthOrders = orders.filter((o) => monthOf(o.scheduledDate) === month && o.status !== 'CANCELADA');
    const monthDone = monthOrders.filter((o) => ['SERVICIO_TERMINADO', 'PENDIENTE_FACTURAR', 'FACTURADA'].includes(o.status));
    return {
      hoy: orders.filter((o) => isActive(o) && o.scheduledDate === d).length,
      semana: orders.filter((o) => isActive(o) && o.scheduledDate > d && o.scheduledDate <= week).length,
      vencidas: orders.filter((o) => isActive(o) && o.status !== 'EN_PROGRESO' && o.scheduledDate < d).length,
      sinConfirmar: orders.filter((o) => o.status === 'NOTIFICADA' && o.scheduledDate <= addDays(d, 3)).length,
      cumplimiento: monthOrders.length ? Math.round((monthDone.length / monthOrders.length) * 100) : null,
    };
  }, [orders, d]);

  const upcoming = useMemo(
    () => orders.filter((o) => isActive(o) && o.scheduledDate >= d).slice(0, 6),
    [orders, d]
  );

  const alerts = useMemo(() => {
    const out: { icon: string; text: string; sub: string; tone: 'rech' | 'proc'; go: () => void }[] = [];
    // mediciones fuera de rango en servicios recientes
    orders
      .filter((o) => ['SERVICIO_TERMINADO', 'PENDIENTE_FACTURAR', 'FACTURADA'].includes(o.status))
      .forEach((o) => {
        (o.checklist || []).filter((it) => it.alert).forEach((it) => {
          out.push({
            icon: 'alert',
            text: `${it.label}: ${it.answer ?? '—'} ${it.unit || ''}`.trim(),
            sub: `${o.equipmentSnapshot?.typeName || ''} · ${o.equipmentSnapshot?.serial || ''} · ${o.num}`,
            tone: 'rech',
            go: () => ctx.go('soDetail', { id: o.id }),
          });
        });
      });
    // inventario bajo mínimo
    inv.items
      .filter((i) => (i.minQty || 0) > 0 && (i.quantity || 0) <= i.minQty)
      .forEach((i) => {
        out.push({ icon: 'building', text: t('dashboard.lowStock', { name: i.name }), sub: t('dashboard.lowStockSub', { q: i.quantity, min: i.minQty }), tone: 'proc', go: () => ctx.go('inventory') });
      });
    // contratos por vencer (< 60 días)
    contracts
      .filter((x) => x.active && x.endDate && x.endDate >= d && x.endDate <= addDays(d, 60))
      .forEach((x) => {
        out.push({ icon: 'file', text: t('dashboard.contractExpiring', { num: x.num, client: x.clientName }), sub: t('dashboard.contractExpiringSub', { date: x.endDate }), tone: 'proc', go: () => ctx.go('contractDetail', { id: x.id }) });
      });
    return out.slice(0, 8);
  }, [orders, inv.items, contracts, d]);

  const techName = (id: string | null) => ctx.db.technicians.find((x) => x.id === id)?.name?.split(' ')[0] || '—';

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {showTickets && (
          <button onClick={() => ctx.go('ticketForm', { mode: 'new' })} className="quick-action quick-gold">
            <span className="qa-ico" style={{ background: 'var(--gold)', color: 'var(--navy-900)' }}>
              <Icon name="plus" size={22} />
            </span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{t('dashboard.createTicket')}</div>
              <div style={{ fontSize: 12.5, opacity: 0.65 }}>{t('dashboard.createTicketSub')}</div>
            </div>
            <Icon name="chevronRight" size={18} style={{ marginLeft: 'auto', opacity: 0.5 }} />
          </button>
        )}
        {showMaintenance && (
          <button onClick={() => setCorrectiveOpen(true)} className="quick-action">
            <span className="qa-ico" style={{ background: 'var(--st-proc-bg)', color: 'var(--st-proc-fg)' }}>
              <Icon name="zap" size={20} />
            </span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{t('serviceOrders.newCorrective')}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{t('dashboard.correctiveSub')}</div>
            </div>
            <Icon name="chevronRight" size={18} style={{ marginLeft: 'auto', color: 'var(--text-3)' }} />
          </button>
        )}
        {sees('technicians') && (
          <button onClick={() => ctx.go('technicians', { create: true })} className="quick-action">
            <span className="qa-ico" style={{ background: 'var(--navy-800)', color: '#fff' }}>
              <Icon name="users" size={20} />
            </span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{t('dashboard.createTech')}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{t('dashboard.createTechSub')}</div>
            </div>
            <Icon name="chevronRight" size={18} style={{ marginLeft: 'auto', color: 'var(--text-3)' }} />
          </button>
        )}
      </div>

      {/* ---------- mantenimiento ---------- */}
      {showMaintenance && (
      <div>
        <div className="section-label">{t('dashboard.maintenanceTitle')}</div>
        <div className="metric-grid">
          <MetricCard cls="asig" label={t('dashboard.visitsToday')} count={kpi.hoy} />
          <MetricCard cls="proc" label={t('dashboard.visitsWeek')} count={kpi.semana} />
          <MetricCard cls="rech" label={t('dashboard.overdue')} count={kpi.vencidas} />
          <MetricCard cls="revi" label={t('dashboard.unconfirmed')} count={kpi.sinConfirmar} />
          {showBilling && (
            <div onClick={() => ctx.go('billing')} style={{ cursor: 'pointer' }}>
              <MetricCard cls="apro" label={t('dashboard.pendingBilling')} count={pendingBilling.length} />
            </div>
          )}
          <MetricCard cls="cerr" label={t('dashboard.monthCompliance')} count={kpi.cumplimiento === null ? '—' : kpi.cumplimiento + '%'} />
        </div>
      </div>
      )}

      {showMaintenance && (
      <div style={{ display: 'grid', gridTemplateColumns: alerts.length ? '1.4fr 1fr' : '1fr', gap: 16, alignItems: 'start' }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{t('dashboard.upcomingVisits')}</div>
            <button onClick={() => ctx.go('calendar')} style={{ border: 'none', background: 'transparent', color: 'var(--navy-700)', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              {t('dashboard.viewCalendar')} <Icon name="chevronRight" size={15} />
            </button>
          </div>
          {upcoming.length === 0 ? (
            <div style={{ padding: '22px 20px', fontSize: 13.5, color: 'var(--text-3)' }}>{t('dashboard.noUpcoming')}</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <tbody>
                  {upcoming.map((o) => (
                    <tr key={o.id} onClick={() => ctx.go('soDetail', { id: o.id })} style={{ cursor: 'pointer' }}>
                      <td className="mono" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                        <b>{o.scheduledDate === d ? t('dashboard.todayShort') : o.scheduledDate.slice(5)}</b> {o.scheduledTime}
                      </td>
                      <td style={{ fontWeight: 600 }}>{o.equipmentSnapshot?.typeName || o.num}</td>
                      <td style={{ color: 'var(--text-2)', fontSize: 12.5 }}>{o.client?.name}</td>
                      <td style={{ fontSize: 12.5 }}>{techName(o.techId)}</td>
                      <td><SOStatusBadge status={o.status} size="sm" /></td>
                      <td><Icon name="chevronRight" size={15} style={{ color: 'var(--text-3)' }} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {alerts.length > 0 && (
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="alert" size={16} style={{ color: 'var(--st-rech-fg)' }} />
              <span style={{ fontWeight: 700, fontSize: 15 }}>{t('dashboard.alerts')}</span>
              <span className="badge" style={{ marginLeft: 'auto', background: 'var(--st-rech-bg)', color: 'var(--st-rech-fg)' }}>{alerts.length}</span>
            </div>
            {alerts.map((a, i) => (
              <button key={i} onClick={a.go} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: '11px 18px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                <span style={{ width: 30, height: 30, borderRadius: 8, flex: 'none', background: `var(--st-${a.tone}-bg)`, color: `var(--st-${a.tone}-fg)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={a.icon} size={15} />
                </span>
                <span>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>{a.text}</span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--text-3)' }}>{a.sub}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      )}

      {showTickets && (
      <div>
        <div className="section-label">{t('dashboard.summaryByStatus')}</div>
        {/* tickets ad-hoc */}
        <div className="metric-grid">
          <MetricCard big label={t('dashboard.totalTickets')} count={c.total} />
          <MetricCard cls={STATUS.pendiente.cls} label={t('status.pendiente')} count={c.pendiente} />
          <MetricCard cls={STATUS.asignado.cls} label={t('status.asignado')} count={c.asignado} />
          <MetricCard cls={STATUS.en_proceso.cls} label={t('status.en_proceso')} count={c.en_proceso} />
          <MetricCard cls={STATUS.listo_revision.cls} label={t('status.listo_revision')} count={c.listo_revision} />
          <MetricCard cls={STATUS.aprobado.cls} label={t('status.aprobado')} count={c.aprobado} />
          <MetricCard cls={STATUS.rechazado.cls} label={t('status.rechazado')} count={c.rechazado} />
          <MetricCard cls={STATUS.cerrado.cls} label={t('status.cerrado')} count={c.cerrado} />
        </div>
      </div>
      )}

      {showTickets && (
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{t('dashboard.recentTickets')}</div>
          <button onClick={() => ctx.go('tickets')} style={{ border: 'none', background: 'transparent', color: 'var(--navy-700)', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            {t('dashboard.viewAll')} <Icon name="chevronRight" size={15} />
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('tickets.colNum')}</th>
                <th>{t('tickets.colTitle')}</th>
                <th>{t('tickets.colClient')}</th>
                <th>{t('tickets.colTech')}</th>
                <th>{t('tickets.colPriority')}</th>
                <th>{t('tickets.colStatus')}</th>
                <th>{t('tickets.colScheduled')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recent.map((tk) => {
                const tech = ctx.db.technicians.find((x) => x.id === tk.techId);
                return (
                  <tr key={tk.id} onClick={() => ctx.go('ticketDetail', { id: tk.id })} style={{ cursor: 'pointer' }}>
                    <td className="mono" style={{ color: 'var(--text-2)', fontWeight: 500 }}>{tk.num}</td>
                    <td style={{ fontWeight: 600, maxWidth: 230 }}>
                      <div className="truncate">{tk.title}</div>
                    </td>
                    <td style={{ color: 'var(--text-2)' }}>{tk.client}</td>
                    <td>
                      {tech ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                          <Avatar initials={tech.initials} size={24} />
                          {tech.name.split(' ')[0]}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-3)' }}>{t('common.unassigned')}</span>
                      )}
                    </td>
                    <td><PriorityChip priority={tk.priority} /></td>
                    <td><StatusBadge status={tk.status} size="sm" /></td>
                    <td className="mono" style={{ color: 'var(--text-2)', fontSize: 12.5 }}>{tk.scheduled}</td>
                    <td><Icon name="chevronRight" size={16} style={{ color: 'var(--text-3)' }} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      <CorrectiveModal open={correctiveOpen} onClose={() => setCorrectiveOpen(false)} ctx={ctx} onCreated={(id) => ctx.go('soDetail', { id })} />
    </div>
  );
}
