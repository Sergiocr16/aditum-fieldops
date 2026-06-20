/* © 2026 Aditum — Aditum FieldOps — Service-order detail (admin) */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, Button, Modal, Field, Input, Select, Textarea, EmptyState, SOStatusBadge, MediaGallery, toast, confirmDialog } from '../../components/ui';
import { PageHeader } from './AdminShell';
import { useServiceOrder, useServiceOrderActions, soEquipments } from '../../lib/serviceOrders';
import { useAuth } from '../../lib/auth';
import DynamicChecklist from '../../components/DynamicChecklist';
import { VisitBar } from '../../components/visits';
import { visitWorkedMinutes, fmtDuration } from '../../lib/time';
import type { AppCtx } from '../../lib/ctx';

function VisitsTimeline({ so }: { so: any }) {
  const { t } = useTranslation();
  const visits = so.visits || [];
  const lastId = visits.length ? visits[visits.length - 1].id : '';
  const [over, setOver] = useState<Record<string, boolean>>({});
  if (!visits.length) return null;
  const isOpen = (vid: string) => (vid in over ? over[vid] : vid === lastId);
  const toggle = (vid: string) => setOver((p) => ({ ...p, [vid]: !isOpen(vid) }));
  const totalMin = visits.reduce((a: number, v: any) => a + visitWorkedMinutes(v), 0);
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px 0' }}>
        <div className="section-label">{t('ticketDetail.visitsTitle', { count: visits.length })}</div>
        {totalMin > 0 && <div style={{ fontSize: 13, fontWeight: 700 }}>{t('serviceOrders.totalHours')}: {fmtDuration(totalMin)}</div>}
      </div>
      <div>
        {visits.map((v: any, idx: number) => {
          const photos = (so.evidence || []).filter((e: any) => e.visitId === v.id).map((e: any) => ({ id: e.id, file: e.file, type: e.type, desc: e.desc || '', date: e.date || '', name: e.name }));
          const open = isOpen(v.id);
          const dayMin = visitWorkedMinutes(v);
          const closed = (v.segments || []).filter((s: any) => s.end);
          return (
            <div key={v.id}>
              <VisitBar index={idx} dateStr={v.date} meta={v.techName} preview={dayMin > 0 ? fmtDuration(dayMin) + (v.note ? ' · ' + v.note : '') : v.note} count={photos.length} open={open} onToggle={() => toggle(v.id)} />
              {open && (
                <div className="fade-in" style={{ padding: '0 16px 16px 73px' }}>
                  {dayMin > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{fmtDuration(dayMin)}</span>
                      {closed.map((s: any, i: number) => (
                        <span key={i} className="mono" style={{ fontSize: 11.5, color: 'var(--text-3)', marginLeft: 8 }}>{s.start.slice(11)}–{(s.end || '').slice(11)}</span>
                      ))}
                    </div>
                  )}
                  {v.note ? <p style={{ margin: '0 0 10px', fontSize: 13.5, lineHeight: 1.55 }}>{v.note}</p> : null}
                  {photos.length > 0 && <MediaGallery items={photos} />}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{label}</span>
      <span className={mono ? 'mono' : ''} style={{ fontSize: 13, fontWeight: 600, textAlign: 'right' }}>{value || '—'}</span>
    </div>
  );
}

export default function ServiceOrderDetail({ ctx, id }: { ctx: AppCtx; id: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { order: so, loading } = useServiceOrder(id);
  const actions = useServiceOrderActions();
  const [reschedOpen, setReschedOpen] = useState(false);
  const [resched, setResched] = useState({ date: '', time: '08:00', techId: '', durationMin: 60, notes: '' });
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (!so) return <EmptyState icon="calendar" title={t('serviceOrders.notFound')} sub="" />;

  const techName = (tid: string | null) => ctx.db.technicians.find((x) => x.id === tid)?.name || '—';
  const eq = so.equipmentSnapshot || ({} as any);
  const isDemand = (so.mode || 'periodico') === 'demanda';
  const isAdmin = user?.role === 'admin';
  const inReview = so.status === 'EN_REVISION';
  const canCancel = ['PROGRAMADA', 'NOTIFICADA', 'CONFIRMADA', 'REAGENDADA'].includes(so.status);
  const canResched = canCancel;

  const approve = async () => {
    setBusy(true);
    try {
      await actions.approve(so.id);
      toast(t('serviceOrders.approved'), 'success');
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    } finally {
      setBusy(false);
    }
  };

  const doReject = async () => {
    if (!rejectComment.trim()) { toast(t('serviceOrders.rejectReasonErr'), 'error'); return; }
    setBusy(true);
    try {
      await actions.reject(so.id, rejectComment.trim());
      setRejectOpen(false);
      setRejectComment('');
      toast(t('serviceOrders.rejected'), 'success');
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    const ok = await confirmDialog({ title: t('serviceOrders.cancelTitle'), message: t('serviceOrders.cancelMsg'), tone: 'danger', confirmLabel: t('serviceOrders.cancelBtn') });
    if (!ok) return;
    await actions.cancel(so, t('serviceOrders.cancelledByAdmin'));
    toast(t('serviceOrders.cancelled'), 'success');
  };

  const doResched = async () => {
    if (!resched.date) return;
    await actions.reschedule(so, resched.date, resched.time, resched.techId || null, undefined, {
      durationMin: Number(resched.durationMin) || 60,
      notes: resched.notes,
    });
    setReschedOpen(false);
    toast(t('serviceOrders.edited'), 'success');
  };

  const lightboxItems = (so.photos || []).map((p) => ({ id: p.id, file: p.url, type: 'image' as const, desc: p.desc || '', date: p.at || '' }));

  return (
    <div className="fade-in">
      <PageHeader
        title={<span className="mono">{so.num}</span> as any}
        sub={`${(soEquipments(so).length > 1 ? t('serviceOrders.nEquipment', { count: soEquipments(so).length }) : (eq.typeName || so.title)) || ''} · ${so.client?.name || ''}`}
        back={() => ctx.back()}
        action={
          <>
            {so.reportShare?.url && (
              <Button variant="ghost" icon="external" onClick={() => window.open(so.reportShare.url!, '_blank')}>{t('serviceOrders.viewReport')}</Button>
            )}
            {inReview && isAdmin && <Button variant="ghost" icon="x" onClick={() => setRejectOpen(true)} disabled={busy}>{t('serviceOrders.rejectBtn')}</Button>}
            {inReview && isAdmin && <Button variant="gold" icon="check" onClick={approve} disabled={busy}>{busy ? '…' : t('serviceOrders.approveBtn')}</Button>}
            {canResched && <Button variant="ghost" icon="edit" onClick={() => { setResched({ date: so.scheduledDate, time: so.scheduledTime, techId: so.techId || '', durationMin: so.durationMin || 60, notes: so.notes || '' }); setReschedOpen(true); }}>{t('serviceOrders.editBtn')}</Button>}
            {canCancel && <Button variant="danger" onClick={cancel}>{t('serviceOrders.cancelBtn')}</Button>}
          </>
        }
      />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <SOStatusBadge status={so.status} />
        <span className="badge">
          <Icon name={so.type === 'correctivo' ? 'zap' : 'refresh'} size={12} />
          {t('serviceOrders.type_' + so.type)}
        </span>
        {so.notify?.confirmedAt && (
          <span className="badge" style={{ background: 'var(--st-apro-bg)', color: 'var(--st-apro-fg)' }}>
            <Icon name="checkCircle" size={12} />
            {t('serviceOrders.confirmedBy_' + (so.notify.confirmedVia || 'cliente'))}
          </span>
        )}
      </div>

      <div className="detail-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {isDemand && (so.description || so.instructions || so.expected || so.doneConditions) && (
            <div className="card card-pad">
              <div className="section-label" style={{ marginBottom: 10 }}>{t('serviceOrders.briefing')}</div>
              {so.description && <p style={{ margin: '0 0 8px', fontSize: 13.5, lineHeight: 1.6 }}>{so.description}</p>}
              {so.instructions && <InfoRow label={t('ticketDetail.instructions')} value={so.instructions} />}
              {so.expected && <InfoRow label={t('ticketDetail.expected')} value={so.expected} />}
              {so.doneConditions && <InfoRow label={t('ticketDetail.doneConditions')} value={so.doneConditions} />}
            </div>
          )}

          {/* Demanda: checklist ad-hoc a nivel orden */}
          {isDemand && (so.checklist?.length || 0) > 0 && (
            <div className="card card-pad">
              <div className="section-label" style={{ marginBottom: 12 }}>{t('serviceOrders.checklist')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(so.checklist as any[]).map((it) => (
                  <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
                    <Icon name={it.done ? 'checkCircle' : 'circle'} size={15} />
                    <span style={{ textDecoration: it.done ? 'line-through' : 'none', color: it.done ? 'var(--text-3)' : 'inherit' }}>{it.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Periódico/correctivo: una sección de checklist por equipo */}
          {!isDemand && soEquipments(so).map((e, i) => (
            <div className="card card-pad" key={e.equipmentId || i}>
              <div className="section-label" style={{ marginBottom: 4 }}>
                {e.equipmentSnapshot?.typeName || t('serviceOrders.equipmentCard')}
                {e.checklistTemplateVersion ? ` · v${e.checklistTemplateVersion}` : ''}
              </div>
              <div className="mono" style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 10 }}>
                {[e.equipmentSnapshot?.brand, e.equipmentSnapshot?.model].filter(Boolean).join(' ')}{e.equipmentSnapshot?.serial ? ` · S/N ${e.equipmentSnapshot.serial}` : ''}{e.equipmentSnapshot?.location ? ` · ${e.equipmentSnapshot.location}` : ''}
              </div>
              {(e.checklist?.length || 0) > 0
                ? <DynamicChecklist items={e.checklist as any} mode="readonly" />
                : <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)' }}>{t('serviceOrders.checklistPending')}</p>}
            </div>
          ))}

          {isDemand && (so.visits || []).length > 0 && <VisitsTimeline so={so} />}

          {(() => {
            // Evidencia libre sin visita (la de cada día se muestra en el acordeón de visitas).
            const loose = (so.evidence || []).filter((e) => !e.visitId);
            if (!loose.length) return null;
            return (
              <div className="card card-pad">
                <div className="section-label" style={{ marginBottom: 12 }}>{t('serviceOrders.evidence')}</div>
                <MediaGallery items={loose.map((e) => ({ id: e.id, file: e.file, type: e.type, desc: e.desc || '', date: e.date || '', name: e.name }))} captions />
              </div>
            );
          })()}

          {(so.photos || []).length > 0 && (
            <div className="card card-pad">
              <div className="section-label" style={{ marginBottom: 12 }}>{t('serviceOrders.photos')}</div>
              <MediaGallery items={lightboxItems} />
            </div>
          )}

          {so.observations && (
            <div className="card card-pad">
              <div className="section-label" style={{ marginBottom: 10 }}>{t('serviceOrders.observations')}</div>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>{so.observations}</p>
            </div>
          )}

          {so.signature && (
            <div className="card card-pad">
              <div className="section-label" style={{ marginBottom: 10 }}>{t('serviceOrders.signature')}</div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <img src={so.signature.url} alt="Firma" style={{ height: 90, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: 6 }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>{so.signature.name}</div>
                  <div className="mono" style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{so.signature.idNumber}</div>
                  <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{so.signature.at}</div>
                </div>
              </div>
            </div>
          )}

          {((so.materials && so.materials.length > 0) || so.materialsNote) && (
            <div className="card card-pad">
              <div className="section-label" style={{ marginBottom: 10 }}>{t('materials.reported')}</div>
              {so.materials && so.materials.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: so.materialsNote ? 12 : 0 }}>
                  {so.materials.map((mt, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontWeight: 700, fontSize: 14, minWidth: 36 }}>{mt.qty}×</span>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{mt.name}</span>
                        {mt.comment ? <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}> · {mt.comment}</span> : null}
                        {!mt.productId ? <span className="tag" style={{ marginLeft: 6 }}>extra</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {so.materialsNote && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-2)' }}>{so.materialsNote}</p>}
            </div>
          )}

          <div className="card card-pad">
            <div className="section-label" style={{ marginBottom: 12 }}>{t('serviceOrders.history')}</div>
            {[...(so.history || [])].reverse().map((h, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <SOStatusBadge status={h.status as any} size="sm" />
                <div style={{ flex: 1 }}>
                  {h.note && <div style={{ fontSize: 13 }}>{h.note}</div>}
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)' }} className="mono">{h.at} · {h.by}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card card-pad">
            <div className="section-label" style={{ marginBottom: 10 }}>{t('serviceOrders.visit')}</div>
            <InfoRow label={t('serviceOrders.fDate')} value={so.scheduledDate} mono />
            <InfoRow label={t('serviceOrders.fTime')} value={so.scheduledTime} mono />
            <InfoRow label={t('serviceOrders.fTech')} value={techName(so.techId)} />
            <InfoRow label={t('serviceOrders.noticeDate')} value={so.skipNotice ? t('serviceOrders.noNotice') : so.notify?.noticeDate} mono />
            <InfoRow label={t('serviceOrders.noticeSent')} value={so.notify?.noticeSentAt} mono />
            <InfoRow label={t('serviceOrders.started')} value={so.startedAt} mono />
            <InfoRow label={t('serviceOrders.finished')} value={so.finishedAt} mono />
          </div>

          <div className="card card-pad">
            <div className="section-label" style={{ marginBottom: 10 }}>{t('contracts.secClient')}</div>
            <InfoRow label={t('contracts.fClient')} value={so.client?.name} />
            <InfoRow label={t('contracts.fClientEmail')} value={so.client?.email} mono />
            <InfoRow label={t('contracts.fClientPhone')} value={so.client?.phone} mono />
            {isDemand && <InfoRow label={t('serviceOrders.fSite')} value={so.site} />}
            {isDemand && <InfoRow label={t('serviceOrders.fAddress')} value={so.address} />}
            {so.notes && <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-2)' }}>{so.notes}</div>}
          </div>
        </div>
      </div>

      <Modal open={reschedOpen} onClose={() => setReschedOpen(false)} title={t('serviceOrders.editTitle')} sub={so.num} width={620}
        footer={<>
          <Button variant="ghost" onClick={() => setReschedOpen(false)}>{t('common.cancel')}</Button>
          <Button onClick={doResched}>{t('common.save')}</Button>
        </>}>
        <div className="form-grid">
          <Field label={t('serviceOrders.fDate')} required>
            <Input type="date" value={resched.date} onChange={(e: any) => setResched((p) => ({ ...p, date: e.target.value }))} />
          </Field>
          <Field label={t('serviceOrders.fTime')}>
            <Input type="time" value={resched.time} onChange={(e: any) => setResched((p) => ({ ...p, time: e.target.value }))} />
          </Field>
          <Field label={t('serviceOrders.fTech')}>
            <Select value={resched.techId} onChange={(e: any) => setResched((p) => ({ ...p, techId: e.target.value }))}>
              <option value="">{t('common.unassigned')}</option>
              {ctx.db.technicians.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
          </Field>
          <Field label={t('serviceOrders.fDuration')} hint={t('serviceOrders.fDurationHint')}>
            <Input type="number" min={15} max={480} step={15} value={resched.durationMin} onChange={(e: any) => setResched((p) => ({ ...p, durationMin: e.target.value }))} />
          </Field>
        </div>
        <Field label={t('serviceOrders.fNotes')}>
          <Textarea rows={3} value={resched.notes} onChange={(e: any) => setResched((p) => ({ ...p, notes: e.target.value }))} />
        </Field>
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '6px 0 0' }}>{t('serviceOrders.reschedHint')}</p>
      </Modal>

      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title={t('serviceOrders.rejectTitle')} sub={so.num} width={520}
        footer={<>
          <Button variant="ghost" onClick={() => setRejectOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={doReject} disabled={busy}>{busy ? '…' : t('serviceOrders.rejectBtn')}</Button>
        </>}>
        <Field label={t('serviceOrders.rejectReason')} required>
          <Textarea rows={4} value={rejectComment} onChange={(e: any) => setRejectComment(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}
