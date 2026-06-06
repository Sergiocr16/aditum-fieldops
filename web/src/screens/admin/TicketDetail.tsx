/* © 2026 Aditum — Aditum FieldOps — Admin ticket detail */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Icon, Avatar, Button, StatusBadge, PriorityChip, EmptyState, EvidenceThumb,
  Lightbox, Timeline, SharePanel, toast,
} from '../../components/ui';
import { RejectModal, ApproveModal, ReassignModal } from './modals';
import { approveTicket, rejectTicket, reassignTicket, closeTicket, addComment, generateLink, regenerateLink, toggleLink } from '../../lib/actions';
import type { AppCtx } from '../../lib/ctx';
import type { Comment } from '../../lib/types';

function InfoRow({ label, value, mono }: any) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 13, color: 'var(--text-2)', flex: 'none' }}>{label}</span>
      <span className={mono ? 'mono' : ''} style={{ fontSize: 13.5, fontWeight: 600, textAlign: 'right', color: 'var(--text)' }}>{value || '—'}</span>
    </div>
  );
}
function Block({ title, icon, children, accent }: any) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 9, background: accent ? 'var(--gold-50)' : 'var(--surface-2)' }}>
        {icon && <span style={{ color: accent ? 'var(--gold-600)' : 'var(--navy-700)', display: 'flex' }}><Icon name={icon} size={17} /></span>}
        <span style={{ fontWeight: 700, fontSize: 14.5 }}>{title}</span>
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </div>
  );
}
function Prose({ label, text }: any) {
  const { t } = useTranslation();
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>{label}</div>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{text || <span style={{ color: 'var(--text-3)' }}>{t('common.noInfo')}</span>}</p>
    </div>
  );
}
function CommentItem({ c }: { c: Comment }) {
  const { t } = useTranslation();
  const map: any = {
    general: ['#eef1f4', '#54606e', 'dots'],
    rechazo: ['var(--st-rech-bg)', 'var(--st-rech-fg)', 'xCircle'],
    aprobacion: ['var(--st-apro-bg)', 'var(--st-apro-fg)', 'checkCircle'],
    tecnica: ['#eef1f4', '#54606e', 'wrench'],
  };
  const [bg, fg, icon] = map[c.type] || map.general;
  return (
    <div style={{ display: 'flex', gap: 11 }}>
      <span style={{ width: 32, height: 32, borderRadius: 9, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        <Icon name={icon} size={16} />
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 13.5 }}>{c.by}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: fg, background: bg, padding: '2px 7px', borderRadius: 5 }}>{t('comments.' + c.type)}</span>
          <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{c.at}</span>
        </div>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: 'var(--text)' }}>{c.text}</p>
      </div>
    </div>
  );
}

export default function TicketDetailAdmin({ ctx, id }: { ctx: AppCtx; id: string }) {
  const { t } = useTranslation();
  const tk = ctx.db.tickets.find((x) => x.id === id);
  const [modal, setModal] = useState<string | null>(null);
  const [lb, setLb] = useState<number | null>(null);
  const [newComment, setNewComment] = useState('');
  if (!tk) return <div style={{ padding: 40 }}>{t('ticketDetail.notFound')}</div>;
  const tech = ctx.db.technicians.find((x) => x.id === tk.techId);

  const actions: any[] = [];
  if (tk.status === 'listo_revision') {
    actions.push(<Button key="a" variant="success" icon="checkCircle" onClick={() => setModal('approve')}>{t('ticketDetail.approve')}</Button>);
    actions.push(<Button key="r" variant="danger" icon="xCircle" onClick={() => setModal('reject')}>{t('ticketDetail.reject')}</Button>);
  }
  if (tk.status === 'aprobado') {
    actions.push(<Button key="c" variant="primary" icon="lock" onClick={() => { closeTicket(ctx, tk); toast(t('ticketDetail.closed'), 'success'); }}>{t('ticketDetail.close')}</Button>);
  }
  actions.push(<Button key="re" variant="ghost" icon="users" onClick={() => setModal('reassign')}>{t('ticketDetail.reassign')}</Button>);
  actions.push(<Button key="e" variant="ghost" icon="edit" onClick={() => ctx.go('ticketForm', { mode: 'edit', id })}>{t('ticketDetail.edit')}</Button>);

  const doneCount = tk.checklist.filter((c) => c.done).length;
  const sendComment = () => {
    if (newComment.trim()) {
      addComment(ctx, tk, newComment.trim(), 'Admin · ' + ctx.admin.name, 'general');
      setNewComment('');
    }
  };

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 18 }}>
        <button onClick={() => ctx.go('tickets')} className="back-link">
          <Icon name="arrowLeft" size={15} />
          {t('ticketDetail.backToTickets')}
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginTop: 10 }}>
          <div style={{ flex: '1 1 360px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7, flexWrap: 'wrap' }}>
              <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', background: '#eef1f4', padding: '3px 9px', borderRadius: 6, whiteSpace: 'nowrap' }}>{tk.num}</span>
              <StatusBadge status={tk.status} />
              <PriorityChip priority={tk.priority} />
            </div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-.01em', lineHeight: 1.2 }}>{tk.title}</h1>
            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 13.5, color: 'var(--text-2)', flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="building" size={14} />{tk.client}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="mapPin" size={14} />{tk.site}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>{actions}</div>
        </div>
      </div>

      {tk.status === 'rechazado' &&
        tk.comments.filter((c) => c.type === 'rechazo').slice(-1).map((c, i) => (
          <div key={i} style={{ display: 'flex', gap: 11, background: 'var(--st-rech-bg)', border: '1px solid #f3cccc', borderRadius: 12, padding: '14px 16px', marginBottom: 18 }}>
            <Icon name="alert" size={18} style={{ color: 'var(--st-rech-fg)', flex: 'none', marginTop: 1 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--st-rech-fg)', marginBottom: 2 }}>{t('ticketDetail.rejectedBanner')}</div>
              <p style={{ margin: 0, fontSize: 13.5, color: '#8a3030', lineHeight: 1.5 }}>{c.text}</p>
            </div>
          </div>
        ))}

      <div className="detail-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Block title={t('ticketDetail.generalInfo')} icon="ticket">
            <div className="info-2col">
              <InfoRow label={t('ticketDetail.client')} value={tk.client} />
              <InfoRow label={t('ticketDetail.site')} value={tk.site} />
              <InfoRow label={t('ticketDetail.address')} value={tk.address} />
              <InfoRow label={t('ticketDetail.created')} value={tk.created} mono />
            </div>
          </Block>

          <Block title={t('ticketDetail.requested')} icon="wrench">
            <Prose label={t('ticketDetail.description')} text={tk.description} />
            <Prose label={t('ticketDetail.instructions')} text={tk.instructions} />
            <Prose label={t('ticketDetail.expected')} text={tk.expected} />
            <Prose label={t('ticketDetail.doneConditions')} text={tk.doneConditions} />
            {tk.observations && <Prose label={t('ticketDetail.observations')} text={tk.observations} />}
          </Block>

          <Block title={t('ticketDetail.evidenceReq')} icon="camera" accent>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--text)' }}>{tk.evidenceReq}</p>
          </Block>

          <Block title={t('ticketDetail.workDone')} icon="check">
            {tk.techNote ? (
              <>
                <Prose label={t('ticketDetail.whatTechDid')} text={tk.techNote} />
                {tk.techObs && <Prose label={t('ticketDetail.techObs')} text={tk.techObs} />}
                {tk.readyAt && <div className="mono" style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('ticketDetail.markedReady', { at: tk.readyAt })}</div>}
              </>
            ) : (
              <EmptyState icon="clock" title={t('ticketDetail.noReportTitle')} sub={t('ticketDetail.noReportSub')} />
            )}
          </Block>

          <Block title={`${t('ticketDetail.checklist')} · ${doneCount}/${tk.checklist.length}`} icon="checkCircle">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {tk.checklist.map((c) => (
                <div key={c.id} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ width: 22, height: 22, borderRadius: 6, flex: 'none', marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.done ? 'var(--st-apro-dot)' : '#fff', border: '1.5px solid ' + (c.done ? 'var(--st-apro-dot)' : 'var(--border-strong)'), color: '#fff' }}>
                    {c.done && <Icon name="check" size={14} />}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, color: c.done ? 'var(--text)' : 'var(--text-2)', fontWeight: c.done ? 500 : 400 }}>{c.text}</div>
                    {c.done && c.at && <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{c.by} · {c.at}</div>}
                  </div>
                </div>
              ))}
            </div>
          </Block>

          <Block title={`${t('ticketDetail.gallery')} · ${tk.evidence.length}`} icon="camera">
            {tk.evidence.length ? (
              <div className="evidence-grid">
                {tk.evidence.map((ev, i) => (
                  <div key={i}>
                    <EvidenceThumb src={ev.file} type={ev.type} onClick={() => setLb(i)} h={120} />
                    <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 6, lineHeight: 1.3 }}>{ev.desc}</div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{ev.date}</div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon="camera" title={t('ticketDetail.noEvidenceTitle')} sub={t('ticketDetail.noEvidenceSub')} />
            )}
          </Block>

          <Block title={t('ticketDetail.comments')} icon="dots">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {tk.comments.length ? tk.comments.map((c, i) => <CommentItem key={i} c={c} />) : <div style={{ fontSize: 13.5, color: 'var(--text-3)' }}>{t('ticketDetail.noComments')}</div>}
              <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <Avatar initials={ctx.admin.initials} size={32} />
                <div style={{ flex: 1, display: 'flex', gap: 8 }}>
                  <input className="input" placeholder={t('ticketDetail.commentPlaceholder')} value={newComment} onChange={(e) => setNewComment(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sendComment(); }} />
                  <Button variant="primary" icon="send" onClick={sendComment} />
                </div>
              </div>
            </div>
          </Block>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card card-pad">
            <div className="section-label" style={{ marginBottom: 12 }}>{t('ticketDetail.assignedTech')}</div>
            {tech ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <Avatar initials={tech.initials} size={42} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{tech.name}</div>
                  <div className="mono-sm" style={{ fontSize: 12, color: 'var(--text-2)' }}>{tech.email}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{tech.phone}</div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-3)' }}>
                <Avatar initials="—" size={42} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-2)' }}>{t('common.unassigned')}</div>
                  <button onClick={() => setModal('reassign')} style={{ border: 'none', background: 'transparent', color: 'var(--navy-700)', fontWeight: 600, fontSize: 13, padding: 0, cursor: 'pointer' }}>{t('ticketDetail.assignTech')}</button>
                </div>
              </div>
            )}
          </div>

          <div className="card card-pad">
            <div className="section-label" style={{ marginBottom: 10 }}>{t('ticketDetail.keyDates')}</div>
            <InfoRow label={t('ticketDetail.scheduled')} value={tk.scheduled} mono />
            <InfoRow label={t('ticketDetail.deadline')} value={tk.deadline} mono />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '9px 0' }}>
              <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{t('ticketDetail.markedReadyShort')}</span>
              <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{tk.readyAt || '—'}</span>
            </div>
          </div>

          <div className="card card-pad">
            <div className="section-label" style={{ marginBottom: 14 }}>{t('ticketDetail.statusHistory')}</div>
            <Timeline history={tk.history} />
          </div>

          <SharePanel
            ticket={tk}
            onGenerate={() => { generateLink(ctx, tk); toast(t('share.generated'), 'success'); }}
            onRegenerate={() => { regenerateLink(ctx, tk); toast(t('share.regenerated'), 'success'); }}
            onToggle={() => { toggleLink(ctx, tk); toast(tk.share.active ? t('share.disabled') : t('share.activated')); }}
            onCopy={() => { navigator.clipboard && navigator.clipboard.writeText(tk.share.url || ''); toast(t('share.copied'), 'success'); }}
          />

          <button onClick={() => ctx.openPublic(tk)} className="btn btn-ghost btn-block" style={{ justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="eye" size={16} />
              {t('ticketDetail.previewPublic')}
            </span>
            <Icon name="external" size={15} />
          </button>
        </div>
      </div>

      <RejectModal open={modal === 'reject'} onClose={() => setModal(null)} onConfirm={(c: string) => { rejectTicket(ctx, tk, c); setModal(null); toast(t('ticketDetail.rejected'), 'error'); }} />
      <ApproveModal open={modal === 'approve'} onClose={() => setModal(null)} onConfirm={(c: string) => { approveTicket(ctx, tk, c); setModal(null); toast(t('ticketDetail.approved'), 'success'); }} />
      <ReassignModal open={modal === 'reassign'} ticket={tk} ctx={ctx} onClose={() => setModal(null)} onConfirm={(tid: string) => { reassignTicket(ctx, tk, tid); setModal(null); toast(t('ticketDetail.reassigned'), 'success'); }} />
      {lb != null && <Lightbox items={tk.evidence} index={lb} onClose={() => setLb(null)} onIndex={setLb} />}
    </div>
  );
}
