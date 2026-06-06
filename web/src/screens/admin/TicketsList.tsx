/* © 2026 Aditum — Aditum FieldOps — Tickets list */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, Avatar, Button, StatusBadge, PriorityChip, EmptyState, Input, Field, toast } from '../../components/ui';
import { PageHeader } from './AdminShell';
import { STATUS, PRIORITY, SHAREABLE_STATUSES } from '../../lib/config';
import { generateLink } from '../../lib/actions';
import type { AppCtx } from '../../lib/ctx';
import type { Ticket } from '../../lib/types';

function FilterSelect({ value, onChange, options }: any) {
  return (
    <div style={{ position: 'relative' }}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="filter-select" style={{ appearance: 'none' }}>
        {options.map(([v, l]: any) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <span style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-3)' }}>
        <Icon name="chevronDown" size={15} />
      </span>
    </div>
  );
}

function TicketRowMenu({ ticket, ctx, onApprove, onReject, onReassign }: any) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const canApprove = ticket.status === 'listo_revision';
  const canShare = SHAREABLE_STATUSES.includes(ticket.status);
  const item = (icon: string, label: string, fn: () => void, danger?: boolean) => (
    <button className="menu-item" onClick={(e) => { e.stopPropagation(); setOpen(false); fn(); }} style={danger ? { color: 'var(--st-rech-fg)' } : {}}>
      <Icon name={icon} size={15} />
      {label}
    </button>
  );
  return (
    <div ref={ref} style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
      <button className="icon-btn" onClick={() => setOpen((o) => !o)}>
        <Icon name="dots" size={16} />
      </button>
      {open && (
        <div className="menu-pop fade-in">
          {item('eye', t('tickets.menuView'), () => ctx.go('ticketDetail', { id: ticket.id }))}
          {item('edit', t('tickets.menuEdit'), () => ctx.go('ticketForm', { mode: 'edit', id: ticket.id }))}
          {item('users', t('tickets.menuReassign'), () => onReassign(ticket))}
          {canApprove && (
            <>
              <div className="menu-sep" />
              {item('checkCircle', t('tickets.menuApprove'), () => onApprove(ticket))}
              {item('xCircle', t('tickets.menuReject'), () => onReject(ticket), true)}
            </>
          )}
          {canShare && (
            <>
              <div className="menu-sep" />
              {ticket.share?.url
                ? item('copy', t('tickets.menuCopyLink'), () => {
                    navigator.clipboard && navigator.clipboard.writeText(ticket.share.url);
                    toast(t('share.copied'), 'success');
                  })
                : item('link', t('tickets.menuGenLink'), () => {
                    generateLink(ctx, ticket);
                    toast(t('share.generated'), 'success');
                  })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function TicketsList({ ctx, onApprove, onReject, onReassign }: { ctx: AppCtx; onApprove: (t: Ticket) => void; onReject: (t: Ticket) => void; onReassign: (t: Ticket) => void }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fTech, setFTech] = useState('');
  const [fPrio, setFPrio] = useState('');
  const [fClient, setFClient] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [dateOpen, setDateOpen] = useState(false);
  const [page, setPage] = useState(1);

  const clients = [...new Set(ctx.db.tickets.map((x) => x.client))];

  const rows = ctx.db.tickets.filter((tk) => {
    if (q && !(tk.title.toLowerCase().includes(q.toLowerCase()) || tk.num.toLowerCase().includes(q.toLowerCase()) || tk.client.toLowerCase().includes(q.toLowerCase()))) return false;
    if (fStatus && tk.status !== fStatus) return false;
    if (fTech && tk.techId !== fTech) return false;
    if (fPrio && tk.priority !== fPrio) return false;
    if (fClient && tk.client !== fClient) return false;
    if (fFrom && (!tk.scheduled || tk.scheduled < fFrom)) return false;
    if (fTo && (!tk.scheduled || tk.scheduled > fTo)) return false;
    return true;
  });
  const hasFilters = q || fStatus || fTech || fPrio || fClient || fFrom || fTo;
  const perPage = 6;
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const pageRows = rows.slice((page - 1) * perPage, page * perPage);
  useEffect(() => {
    setPage(1);
  }, [q, fStatus, fTech, fPrio, fClient, fFrom, fTo]);
  const clearAll = () => {
    setQ('');
    setFStatus('');
    setFTech('');
    setFPrio('');
    setFClient('');
    setFFrom('');
    setFTo('');
  };

  return (
    <div className="fade-in">
      <PageHeader title={t('tickets.title')} sub={t('tickets.sub', { count: ctx.db.tickets.length })} action={<Button variant="primary" icon="plus" onClick={() => ctx.go('ticketForm', { mode: 'new' })}>{t('tickets.create')}</Button>} />

      <div className="card" style={{ padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 240px', minWidth: 200 }}>
            <Input icon="search" placeholder={t('tickets.searchPlaceholder')} value={q} onChange={(e: any) => setQ(e.target.value)} />
          </div>
          <FilterSelect value={fStatus} onChange={setFStatus} options={[['', t('tickets.allStatuses')], ...Object.values(STATUS).map((s) => [s.key, t('status.' + s.key)])]} />
          <FilterSelect value={fTech} onChange={setFTech} options={[['', t('tickets.allTechs')], ...ctx.db.technicians.map((x) => [x.id, x.name])]} />
          <FilterSelect value={fPrio} onChange={setFPrio} options={[['', t('tickets.allPriorities')], ...Object.values(PRIORITY).map((p) => [p.key, t('priority.' + p.key)])]} />
          <FilterSelect value={fClient} onChange={setFClient} options={[['', t('tickets.allClients')], ...clients.map((c) => [c, c])]} />
          <div style={{ position: 'relative' }}>
            <button className="date-btn" onClick={() => setDateOpen((o) => !o)} style={fFrom || fTo ? { borderColor: 'var(--navy-500)', color: 'var(--navy-700)', fontWeight: 600 } : {}}>
              <Icon name="calendar" size={15} />
              {fFrom || fTo ? `${fFrom || '…'} → ${fTo || '…'}` : t('common.date')}
              <Icon name="chevronDown" size={14} />
            </button>
            {dateOpen && (
              <div className="menu-pop fade-in" style={{ right: 'auto', left: 0, top: 44, padding: 14, minWidth: 230 }} onMouseLeave={() => setDateOpen(false)}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Field label={t('tickets.dateFrom')}>
                    <Input type="date" value={fFrom} onChange={(e: any) => setFFrom(e.target.value)} />
                  </Field>
                  <Field label={t('tickets.dateTo')}>
                    <Input type="date" value={fTo} onChange={(e: any) => setFTo(e.target.value)} />
                  </Field>
                  <button onClick={() => { setFFrom(''); setFTo(''); }} style={{ border: 'none', background: 'transparent', color: 'var(--navy-700)', fontWeight: 600, fontSize: 13, cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                    {t('tickets.clearDate')}
                  </button>
                </div>
              </div>
            )}
          </div>
          {hasFilters && (
            <button onClick={clearAll} style={{ border: 'none', background: 'transparent', color: 'var(--navy-700)', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="x" size={14} />
              {t('tickets.clear')}
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('tickets.colNum')}</th>
                <th>{t('tickets.colTitle')}</th>
                <th>{t('tickets.colClient')}</th>
                <th>{t('tickets.colSite')}</th>
                <th>{t('tickets.colTech')}</th>
                <th>{t('tickets.colPriority')}</th>
                <th>{t('tickets.colStatus')}</th>
                <th>{t('tickets.colScheduled')}</th>
                <th style={{ textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <EmptyState
                      icon={hasFilters ? 'search' : 'ticket'}
                      title={hasFilters ? t('tickets.noResultsTitle') : t('tickets.emptyTitle')}
                      sub={hasFilters ? t('tickets.noResultsSub') : t('tickets.emptySub')}
                      action={hasFilters ? <Button variant="ghost" icon="x" onClick={clearAll}>{t('tickets.clearFilters')}</Button> : <Button variant="primary" icon="plus" onClick={() => ctx.go('ticketForm', { mode: 'new' })}>{t('tickets.create')}</Button>}
                    />
                  </td>
                </tr>
              ) : (
                pageRows.map((tk) => {
                  const tech = ctx.db.technicians.find((x) => x.id === tk.techId);
                  return (
                    <tr key={tk.id} onClick={() => ctx.go('ticketDetail', { id: tk.id })} style={{ cursor: 'pointer' }}>
                      <td className="mono" style={{ color: 'var(--text-2)', fontWeight: 500 }}>{tk.num}</td>
                      <td style={{ fontWeight: 600, maxWidth: 220 }}>
                        <div className="truncate">{tk.title}</div>
                      </td>
                      <td style={{ color: 'var(--text-2)' }}>{tk.client}</td>
                      <td style={{ color: 'var(--text-2)', maxWidth: 150 }}>
                        <div className="truncate">{tk.site}</div>
                      </td>
                      <td>
                        {tech ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
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
                      <td style={{ textAlign: 'right' }}>
                        <TicketRowMenu ticket={tk} ctx={ctx} onApprove={onApprove} onReject={onReject} onReassign={onReassign} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {pageRows.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
              {t('common.showing')} <b>{(page - 1) * perPage + 1}–{Math.min(page * perPage, rows.length)}</b> {t('common.of')} <b>{rows.length}</b>
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button className="icon-btn" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                <Icon name="chevronLeft" size={16} />
              </button>
              {[...Array(pages)].map((_, i) => (
                <button key={i} onClick={() => setPage(i + 1)} className={'page-btn' + (page === i + 1 ? ' active' : '')}>
                  {i + 1}
                </button>
              ))}
              <button className="icon-btn" disabled={page === pages} onClick={() => setPage((p) => p + 1)}>
                <Icon name="chevronRight" size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
