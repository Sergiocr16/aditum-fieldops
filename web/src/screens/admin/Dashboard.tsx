/* © 2026 Aditum — Aditum FieldOps — Admin dashboard */
import { useTranslation } from 'react-i18next';
import { Icon, Avatar, StatusBadge, PriorityChip } from '../../components/ui';
import { STATUS, statusCounts } from '../../lib/config';
import type { AppCtx } from '../../lib/ctx';

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
  const tickets = ctx.db.tickets;
  const c = statusCounts(tickets);
  const recent = [...tickets].sort((a, b) => (b.created || '').localeCompare(a.created || '')).slice(0, 6);

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
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
      </div>

      <div>
        <div className="section-label">{t('dashboard.summaryByStatus')}</div>
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
    </div>
  );
}
