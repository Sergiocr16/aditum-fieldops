/* © 2026 Aditum — Aditum FieldOps — Technician mobile dashboard */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, Avatar, StatusBadge, PriorityChip, EmptyState, LangSwitcher } from '../../components/ui';
import { today } from '../../lib/time';
import type { AppCtx } from '../../lib/ctx';
import type { Ticket } from '../../lib/types';

export function MobileHeader({ title, onBack, onLogout, sub }: any) {
  return (
    <div style={{ background: 'var(--navy-800)', color: '#fff', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 20 }}>
      {onBack ? (
        <button onClick={onBack} style={{ border: 'none', background: 'rgba(255,255,255,.12)', color: '#fff', width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <Icon name="arrowLeft" size={19} />
        </button>
      ) : (
        <img src="/assets/aditum-horizontal.png" style={{ height: 26, filter: 'brightness(0) invert(1)' }} />
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

function MobileTicketCard({ t: tk, onClick }: { t: Ticket; onClick: () => void }) {
  const overdue = tk.deadline && tk.status !== 'aprobado' && tk.status !== 'cerrado' && tk.deadline < today();
  return (
    <button onClick={onClick} className="m-ticket-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>{tk.num}</span>
        <PriorityChip priority={tk.priority} />
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3, marginBottom: 8, color: 'var(--text)', textAlign: 'left' }}>{tk.title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5, color: 'var(--text-2)' }}>
          <Icon name="building" size={15} style={{ flex: 'none', color: 'var(--text-3)' }} />
          {tk.client}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5, color: 'var(--text-2)' }}>
          <Icon name="mapPin" size={15} style={{ flex: 'none', color: 'var(--text-3)' }} />
          {tk.site}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 11 }}>
        <StatusBadge status={tk.status} size="sm" />
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: overdue ? 'var(--st-rech-fg)' : 'var(--text-2)', fontWeight: overdue ? 600 : 400 }} className="mono">
          <Icon name="calendar" size={14} />
          {tk.scheduled}
        </span>
      </div>
    </button>
  );
}

export default function TechDashboard({ ctx }: { ctx: AppCtx }) {
  const { t } = useTranslation();
  const mine = ctx.db.tickets; // store already filters tickets to the technician
  const tabs = [
    { key: 'todos', label: t('mobile.tabAll'), f: () => true },
    { key: 'pendiente', label: t('mobile.tabPending'), f: (x: Ticket) => x.status === 'asignado' || x.status === 'pendiente' },
    { key: 'en_proceso', label: t('mobile.tabInProgress'), f: (x: Ticket) => x.status === 'en_proceso' },
    { key: 'rechazado', label: t('mobile.tabRework'), f: (x: Ticket) => x.status === 'rechazado' },
    { key: 'listo_revision', label: t('mobile.tabReview'), f: (x: Ticket) => x.status === 'listo_revision' },
    { key: 'aprobado', label: t('mobile.tabApproved'), f: (x: Ticket) => x.status === 'aprobado' || x.status === 'cerrado' },
  ];
  const [tab, setTab] = useState('todos');
  const active = tabs.find((x) => x.key === tab)!;
  const list = mine.filter(active.f);
  const counts = (f: (x: Ticket) => boolean) => mine.filter(f).length;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <div style={{ background: 'var(--navy-800)', color: '#fff', padding: '14px 16px 16px', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <img src="/assets/aditum-horizontal.png" style={{ height: 24, filter: 'brightness(0) invert(1)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <LangSwitcher dark />
            <button onClick={() => ctx.go('techOrders')} title={t('mobileOrders.title')} style={{ border: 'none', background: 'rgba(255,255,255,.12)', color: '#fff', width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="calendar" size={17} />
            </button>
            <button onClick={() => ctx.go('techWiki')} title={t('wiki.title')} style={{ border: 'none', background: 'rgba(255,255,255,.12)', color: '#fff', width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="file" size={17} />
            </button>
            <button onClick={ctx.logout} style={{ border: 'none', background: 'rgba(255,255,255,.12)', color: '#fff', width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="logout" size={17} />
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <Avatar initials={ctx.admin.initials} size={42} gold />
          <div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.6)' }}>{t('mobile.hi')}</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{ctx.admin.name.split(' ')[0]} 👋</div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: 'var(--gold)' }}>{counts((x) => x.status !== 'aprobado' && x.status !== 'cerrado')}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)' }}>{t('mobile.activeCount')}</div>
          </div>
        </div>
      </div>

      <div className="m-chips">
        {tabs.map((tb) => {
          const n = counts(tb.f);
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
          list.map((tk) => <MobileTicketCard key={tk.id} t={tk} onClick={() => ctx.go('techTicket', { id: tk.id })} />)
        ) : (
          <div style={{ marginTop: 30 }}>
            <EmptyState icon="checkCircle" title={t('mobile.emptyTitle')} sub={tab === 'todos' ? t('mobile.emptyAll') : t('mobile.emptyCat')} />
          </div>
        )}
      </div>
    </div>
  );
}
