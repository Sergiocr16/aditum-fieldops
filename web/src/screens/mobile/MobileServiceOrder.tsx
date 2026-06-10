/* © 2026 Aditum — Aditum FieldOps — Technician mobile: execute a service order */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../lib/firebase';
import { useTenant } from '../../lib/tenant';
import { Icon, Button, EmptyState, SOStatusBadge, toast, confirmDialog } from '../../components/ui';
import DynamicChecklist, { validateChecklist } from '../../components/DynamicChecklist';
import { MobileHeader } from './MobileDashboard';
import { useServiceOrder, useServiceOrderActions } from '../../lib/serviceOrders';
import { now } from '../../lib/time';
import type { AppCtx } from '../../lib/ctx';

function MBlock({ title, icon, children, gold }: any) {
  return (
    <div className="card" style={{ padding: '14px 15px', ...(gold ? { borderColor: 'var(--gold)', borderWidth: 1.5 } : {}) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Icon name={icon} size={16} style={{ color: gold ? 'var(--gold-600)' : 'var(--text-3)' }} />
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.02em' }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

export default function MobileServiceOrder({ ctx, id }: { ctx: AppCtx; id: string }) {
  const { t } = useTranslation();
  const { tid } = useTenant();
  const { order: so, loading } = useServiceOrder(id);
  const actions = useServiceOrderActions();
  const [busy, setBusy] = useState(false);
  const [uploadingItem, setUploadingItem] = useState<string | null>(null);

  if (loading) return null;
  if (!so) return <EmptyState icon="calendar" title={t('serviceOrders.notFound')} sub="" />;

  const eq = so.equipmentSnapshot || ({} as any);
  const editable = so.status === 'EN_PROGRESO';
  const canStart = ['PROGRAMADA', 'NOTIFICADA', 'CONFIRMADA', 'REAGENDADA'].includes(so.status);
  const check = validateChecklist(so.checklist || []);

  const start = async () => {
    setBusy(true);
    try {
      const res = await actions.start(so.id);
      toast(t('mobileOrders.started', { n: res.items }), 'success');
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    } finally {
      setBusy(false);
    }
  };

  const onAnswer = async (itemId: string, answer: any, alert: boolean) => {
    const next = (so.checklist || []).map((c) =>
      c.id === itemId ? { ...c, answer, alert, at: now(), by: ctx.admin.name } : c
    );
    await actions.update(so.id, { checklist: next } as any);
  };

  // Subida en una sola petición (uploadBytes): más robusta que el protocolo resumible
  // contra el emulador y evita el cuelgue silencioso si getDownloadURL falla — cualquier
  // error se propaga al catch del llamador y el finally limpia el spinner.
  const uploadImage = async (path: string, file: File): Promise<{ path: string; url: string }> => {
    const snap = await uploadBytes(storageRef(storage, path), file, { contentType: file.type });
    return { path, url: await getDownloadURL(snap.ref) };
  };

  const onItemPhoto = async (itemId: string, file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      toast('> 20MB', 'error');
      return;
    }
    setUploadingItem(itemId);
    try {
      const p = `tenants/${tid}/serviceOrders/${so.id}/check-${itemId}-${Date.now()}.${file.name.split('.').pop() || 'jpg'}`;
      const up = await uploadImage(p, file);
      const next = (so.checklist || []).map((c) =>
        c.id === itemId ? { ...c, photoPath: up.path, photoUrl: up.url, at: now(), by: ctx.admin.name } : c
      );
      await actions.update(so.id, { checklist: next } as any);
      toast(t('mobile.photoUploaded'), 'success');
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    } finally {
      setUploadingItem(null);
    }
  };

  const onGeneralPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast('> 20MB', 'error');
      return;
    }
    setUploadingItem('general');
    try {
      const pid = Math.random().toString(36).slice(2, 9);
      const p = `tenants/${tid}/serviceOrders/${so.id}/photo-${pid}.${file.name.split('.').pop() || 'jpg'}`;
      const up = await uploadImage(p, file);
      await actions.update(so.id, { photos: [...(so.photos || []), { id: pid, path: up.path, url: up.url, desc: '', at: now(), by: ctx.admin.name }] } as any);
      toast(t('mobile.photoUploaded'), 'success');
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    } finally {
      setUploadingItem(null);
    }
  };

  const goSign = async () => {
    if (!check.ok) {
      toast(t('mobileOrders.missingItems', { n: check.missing.length }), 'error');
      return;
    }
    if (check.alerts.length) {
      const cont = await confirmDialog({
        title: t('mobileOrders.alertsTitle'),
        message: t('mobileOrders.alertsMsg', { n: check.alerts.length }),
        tone: 'info',
        confirmLabel: t('common.confirm'),
      });
      if (!cont) return;
    }
    ctx.go('techSignature', { id: so.id });
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <MobileHeader title={so.num} sub={`${eq.typeName || ''} · ${so.client?.name || ''}`} onBack={() => ctx.back()} />

      <div className="m-scroll" style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 110px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <SOStatusBadge status={so.status} />
          <span className="badge" style={{ fontSize: 11 }}>
            <Icon name={so.type === 'correctivo' ? 'zap' : 'refresh'} size={11} />
            {t('serviceOrders.type_' + so.type)}
          </span>
          <span className="mono" style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--text-2)' }}>
            {so.scheduledDate} {so.scheduledTime}
          </span>
        </div>

        <MBlock title={t('mobileOrders.whereTitle')} icon="mapPin">
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>{so.client?.name}</div>
          <div style={{ fontSize: 13.5, color: 'var(--text-2)', marginTop: 2 }}>{eq.location || '—'}</div>
          <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12.5, color: 'var(--text-2)' }} className="mono">
            <span>{[eq.brand, eq.model].filter(Boolean).join(' ')}</span>
            {eq.serial && <span>S/N {eq.serial}</span>}
          </div>
          {so.notes && (
            <div style={{ marginTop: 10, background: 'var(--bg)', borderRadius: 9, padding: '9px 11px', fontSize: 13, color: 'var(--text-2)' }}>
              {so.notes}
            </div>
          )}
        </MBlock>

        {canStart && (
          <Button block variant="gold" icon="play" onClick={start} disabled={busy} style={{ height: 50, fontSize: 15.5 }}>
            {busy ? '…' : t('mobileOrders.startBtn')}
          </Button>
        )}

        {(so.checklist || []).length > 0 && (
          <MBlock title={`${t('serviceOrders.checklist')} ${so.checklistTemplateVersion ? '· v' + so.checklistTemplateVersion : ''}`} icon="check" gold={editable}>
            <DynamicChecklist
              items={so.checklist}
              mode={editable ? 'execute' : 'readonly'}
              onAnswer={onAnswer}
              onPhoto={onItemPhoto}
            />
            {uploadingItem && uploadingItem !== 'general' && (
              <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="spin"><Icon name="refresh" size={13} /></span>
                {t('mobile.uploading')}
              </div>
            )}
          </MBlock>
        )}

        {editable && (so.checklist || []).length === 0 && (
          <MBlock title={t('serviceOrders.checklist')} icon="check">
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>{t('mobileOrders.noChecklist')}</p>
          </MBlock>
        )}

        {(editable || (so.photos || []).length > 0) && (
          <MBlock title={t('serviceOrders.photos')} icon="camera">
            {(so.photos || []).length > 0 && (
              <div className="evidence-grid" style={{ marginBottom: editable ? 10 : 0 }}>
                {so.photos.map((p) => (
                  <img key={p.id} src={p.url} style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 9 }} onClick={() => window.open(p.url, '_blank')} />
                ))}
              </div>
            )}
            {editable && (
              <label className="m-upload-btn" style={{ cursor: 'pointer' }}>
                <span style={{ width: 42, height: 42, borderRadius: 11, background: 'var(--navy-800)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                  {uploadingItem === 'general' ? <span className="spin"><Icon name="refresh" size={19} /></span> : <Icon name="camera" size={21} />}
                </span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{t('mobile.takePhoto')}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{t('mobileOrders.photoHint')}</div>
                </div>
                <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" style={{ display: 'none' }} onChange={onGeneralPhoto} />
              </label>
            )}
          </MBlock>
        )}

        {(editable || so.observations) && (
          <MBlock title={t('serviceOrders.observations')} icon="edit">
            {editable ? (
              <textarea
                className="input"
                rows={3}
                style={{ width: '100%', resize: 'vertical' }}
                placeholder={t('mobileOrders.obsPh')}
                defaultValue={so.observations}
                onBlur={(e) => actions.update(so.id, { observations: e.target.value } as any)}
              />
            ) : (
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>{so.observations}</p>
            )}
          </MBlock>
        )}

        {so.signature && (
          <MBlock title={t('serviceOrders.signature')} icon="check">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <img src={so.signature.url} style={{ height: 70, background: '#fff', border: '1px solid var(--border)', borderRadius: 9, padding: 4 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{so.signature.name}</div>
                <div className="mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>{so.signature.idNumber}</div>
              </div>
            </div>
          </MBlock>
        )}
      </div>

      {editable && (
        <div style={{ position: 'sticky', bottom: 0, padding: '12px 14px calc(12px + env(safe-area-inset-bottom))', background: 'linear-gradient(transparent, var(--bg) 30%)' }}>
          <Button block variant="primary" icon="check" onClick={goSign} style={{ height: 52, fontSize: 15.5 }}>
            {t('mobileOrders.finishBtn')}
          </Button>
          {!check.ok && (
            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
              {t('mobileOrders.missingItems', { n: check.missing.length })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
