/* © 2026 Aditum — Aditum FieldOps — Service-order detail (admin) */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, Button, Modal, Field, Input, Select, Textarea, EmptyState, SOStatusBadge, MediaGallery, toast, confirmDialog } from '../../components/ui';
import { PageHeader } from './AdminShell';
import { useServiceOrder, useServiceOrderActions } from '../../lib/serviceOrders';
import DynamicChecklist from '../../components/DynamicChecklist';
import type { AppCtx } from '../../lib/ctx';

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
  const { order: so, loading } = useServiceOrder(id);
  const actions = useServiceOrderActions();
  const [reschedOpen, setReschedOpen] = useState(false);
  const [resched, setResched] = useState({ date: '', time: '08:00', techId: '', durationMin: 60, notes: '' });

  if (loading) return null;
  if (!so) return <EmptyState icon="calendar" title={t('serviceOrders.notFound')} sub="" />;

  const techName = (tid: string | null) => ctx.db.technicians.find((x) => x.id === tid)?.name || '—';
  const eq = so.equipmentSnapshot || ({} as any);
  const canCancel = ['PROGRAMADA', 'NOTIFICADA', 'CONFIRMADA', 'REAGENDADA'].includes(so.status);
  const canResched = canCancel;

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
        sub={`${eq.typeName || ''} · ${so.client?.name || ''}`}
        back={() => ctx.back()}
        action={
          <>
            {so.reportShare?.url && (
              <Button variant="ghost" icon="external" onClick={() => window.open(so.reportShare.url!, '_blank')}>{t('serviceOrders.viewReport')}</Button>
            )}
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
          {so.checklist?.length > 0 && (
            <div className="card card-pad">
              <div className="section-label" style={{ marginBottom: 12 }}>
                {t('serviceOrders.checklist')} {so.checklistTemplateVersion ? `· v${so.checklistTemplateVersion}` : ''}
              </div>
              <DynamicChecklist items={so.checklist} mode="readonly" />
            </div>
          )}

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
            <div className="section-label" style={{ marginBottom: 10 }}>{t('serviceOrders.equipmentCard')}</div>
            <InfoRow label={t('equipment.fType')} value={eq.typeName} />
            <InfoRow label={t('equipment.fBrand')} value={[eq.brand, eq.model].filter(Boolean).join(' ')} />
            <InfoRow label={t('equipment.fSerial')} value={eq.serial} mono />
            <InfoRow label={t('equipment.fLocation')} value={eq.location} />
          </div>

          <div className="card card-pad">
            <div className="section-label" style={{ marginBottom: 10 }}>{t('contracts.secClient')}</div>
            <InfoRow label={t('contracts.fClient')} value={so.client?.name} />
            <InfoRow label={t('contracts.fClientEmail')} value={so.client?.email} mono />
            <InfoRow label={t('contracts.fClientPhone')} value={so.client?.phone} mono />
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
    </div>
  );
}
