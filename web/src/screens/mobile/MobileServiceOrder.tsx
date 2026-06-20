/* © 2026 Aditum — Aditum FieldOps — Technician mobile: execute a service order */
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../lib/firebase';
import { useTenant } from '../../lib/tenant';
import { tenantHasFeature } from '../../lib/modules';
import { Icon, Button, EmptyState, SOStatusBadge, Stepper, Select, Input, Textarea, Field, toast, confirmDialog } from '../../components/ui';
import DynamicChecklist, { validateChecklist } from '../../components/DynamicChecklist';
import { VisitBar } from '../../components/visits';
import { MobileHeader } from './MobileDashboard';
import { useServiceOrder, useServiceOrderActions, soEquipments } from '../../lib/serviceOrders';
import { useInventory } from '../../lib/inventory';
import { now, today, minutesBetween, visitWorkedMinutes, fmtDuration } from '../../lib/time';
import type { AppCtx } from '../../lib/ctx';
import type { MaterialUse, Visit } from '../../lib/types';

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
  const { tid, tenant } = useTenant();
  const { order: so, loading } = useServiceOrder(id);
  const actions = useServiceOrderActions();
  const inv = useInventory();
  const showMaterials = tenantHasFeature('inventory', tenant?.features);
  const [busy, setBusy] = useState(false);
  const [uploadingItem, setUploadingItem] = useState<string | null>(null);
  const [selProduct, setSelProduct] = useState('');
  const [selQty, setSelQty] = useState(1);
  const [selComment, setSelComment] = useState('');
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [vOver, setVOver] = useState<Record<string, boolean>>({});
  const [addDayOpen, setAddDayOpen] = useState(false);
  const [addDate, setAddDate] = useState(today());
  // contador en vivo: re-render cada segundo mientras haya un tramo abierto (hooks antes de cualquier return)
  const [, setTick] = useState(0);
  const hasOpenSegment = !!(((so?.visits as any[]) || []).some((v: any) => (v.segments || []).some((s: any) => !s.end)));
  useEffect(() => {
    if (!hasOpenSegment) return;
    const iv = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, [hasOpenSegment]);

  if (loading) return null;
  if (!so) return <EmptyState icon="calendar" title={t('serviceOrders.notFound')} sub="" />;

  const eq = so.equipmentSnapshot || ({} as any);
  const isDemand = (so.mode || 'periodico') === 'demanda';
  const editable = so.status === 'EN_PROGRESO';
  const canStart = ['PROGRAMADA', 'NOTIFICADA', 'CONFIRMADA', 'REAGENDADA'].includes(so.status);
  const eqList = soEquipments(so);
  // Validación agregada del checklist de todos los equipos (periódico).
  const check = validateChecklist(eqList.flatMap((e) => e.checklist || []) as any);

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

  // Orden por demanda: alternar ítem de checklist ad-hoc (sin plantilla); vincula a la visita activa
  const toggleAdhoc = async (itemId: string) => {
    const next = (so.checklist as any[]).map((c) =>
      c.id === itemId ? { ...c, done: !c.done, at: !c.done ? now() : null, by: !c.done ? ctx.admin.name : null, visitId: !c.done ? (activeVisit?.id || null) : null } : c
    );
    await actions.update(so.id, { checklist: next } as any);
  };

  // Orden por demanda: subir evidencia libre (foto/video/pdf) a evidence[], asociada a una visita
  const onEvidence = async (e: React.ChangeEvent<HTMLInputElement>, visitId: string | null = null) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 200 * 1024 * 1024) { toast('> 200MB', 'error'); return; }
    setUploadingItem(visitId || 'general');
    try {
      const eid = 'e' + Math.random().toString(36).slice(2, 9);
      const type = file.type.startsWith('video/') ? 'video' : file.type === 'application/pdf' ? 'pdf' : 'image';
      const p = `tenants/${tid}/serviceOrders/${so.id}/ev-${eid}.${file.name.split('.').pop() || 'jpg'}`;
      const snap = await uploadBytes(storageRef(storage, p), file, { contentType: file.type, customMetadata: { serviceOrderId: so.id, evidenceId: eid } as any });
      const url = await getDownloadURL(snap.ref);
      const item = { id: eid, path: p, file: url, type, name: file.name, size: file.size, desc: '', by: ctx.admin.name, date: now(), status: type === 'video' ? 'processing' : 'ready', visitId };
      await actions.update(so.id, { evidence: [...((so.evidence as any[]) || []), item] } as any);
      toast(t('mobile.photoUploaded'), 'success');
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    } finally {
      setUploadingItem(null);
    }
  };

  const finishDemand = async () => {
    const cont = await confirmDialog({ title: t('mobileOrders.finishReviewTitle'), message: t('mobileOrders.finishReviewMsg'), tone: 'info', confirmLabel: t('mobileOrders.finishBtn') });
    if (!cont) return;
    setBusy(true);
    try {
      await actions.requestReview(so.id);
      toast(t('mobileOrders.sentToReview'), 'success');
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    } finally {
      setBusy(false);
    }
  };

  // Actualiza un ítem del checklist de un equipo (multi-equipo) o el legacy a nivel orden.
  const updateEqChecklist = async (equipmentId: string, itemId: string, patch: any) => {
    const apply = (c: any) => (c.id === itemId ? { ...c, ...patch } : c);
    if (Array.isArray((so as any).equipments) && (so as any).equipments.length) {
      const equipments = (so as any).equipments.map((e: any) => (e.equipmentId === equipmentId ? { ...e, checklist: (e.checklist || []).map(apply) } : e));
      await actions.update(so.id, { equipments } as any);
    } else {
      await actions.update(so.id, { checklist: (so.checklist || []).map(apply) } as any);
    }
  };

  const onAnswer = async (equipmentId: string, itemId: string, answer: any, alert: boolean) => {
    await updateEqChecklist(equipmentId, itemId, { answer, alert, at: now(), by: ctx.admin.name });
  };

  // ---- materiales / inventario ----
  const mats: MaterialUse[] = (so.materials as MaterialUse[]) || [];
  const addMaterial = async () => {
    const p = inv.items.find((x) => x.id === selProduct);
    if (!p) return;
    await actions.update(so.id, { materials: [...mats, { productId: p.id, name: p.name, qty: Math.max(1, Number(selQty) || 1), comment: selComment.trim() }] } as any);
    setSelProduct(''); setSelQty(1); setSelComment('');
  };
  const removeMaterial = async (idx: number) => { await actions.update(so.id, { materials: mats.filter((_, i) => i !== idx) } as any); };
  const setMaterialQty = async (idx: number, qty: number) => { await actions.update(so.id, { materials: mats.map((m, i) => (i === idx ? { ...m, qty: Math.max(1, qty) } : m)) } as any); };

  // ---- visitas (trabajo por día) ----
  const me = ctx.admin.name;
  const visits: Visit[] = (so.visits as Visit[]) || [];
  const activeVisit = visits.length ? visits[visits.length - 1] : null;
  const lastVisitId = activeVisit?.id || '';
  const vIsOpen = (vid: string) => (vid in vOver ? vOver[vid] : vid === lastVisitId);
  const vToggle = (vid: string) => setVOver((p) => ({ ...p, [vid]: !vIsOpen(vid) }));
  const setDraft = (vid: string, val: string) => setNoteDrafts((p) => ({ ...p, [vid]: val }));
  const addVisit = async (date: string) => {
    const v: Visit = { id: 'v' + now().replace(/[^0-9]/g, '') + '-' + Math.random().toString(36).slice(2, 7), date: date || today(), techId: ctx.admin.uid, techName: me, note: '', hours: null, at: now(), by: me };
    await actions.update(so.id, { visits: [...visits, v] } as any);
    setAddDayOpen(false);
  };
  const saveNote = async (vid: string) => {
    if (noteDrafts[vid] === undefined) return;
    await actions.update(so.id, { visits: visits.map((v) => (v.id === vid ? { ...v, note: noteDrafts[vid] } : v)) } as any);
  };
  const removeVisit = async (vid: string) => {
    const okc = await confirmDialog({ title: t('mobile.removeVisit'), message: t('mobile.removeVisitMsg'), tone: 'danger', confirmLabel: t('common.delete') });
    if (!okc) return;
    await actions.update(so.id, { visits: visits.filter((v) => v.id !== vid), evidence: ((so.evidence as any[]) || []).filter((e) => e.visitId !== vid) } as any);
  };

  // ---- fichaje (clock-in/out) por día ----
  const openSeg = (v: Visit) => (v.segments || []).find((s) => !s.end) || null;
  const anyOpen = visits.some((v) => openSeg(v)); // un solo tramo abierto por orden
  const recalcHours = (segments: any[]) => Math.round((segments.reduce((a, s) => a + (s.end ? minutesBetween(s.start, s.end) : 0), 0) / 60) * 100) / 100;
  const startWork = async (vid: string) => {
    if (anyOpen) { toast(t('mobileOrders.alreadyWorking'), 'error'); return; }
    await actions.update(so.id, { visits: visits.map((v) => (v.id === vid ? { ...v, segments: [...(v.segments || []), { start: now(), end: null }] } : v)) } as any);
  };
  const stopWork = async (vid: string) => {
    await actions.update(so.id, { visits: visits.map((v) => {
      if (v.id !== vid) return v;
      const segments = (v.segments || []).map((s) => (s.end ? s : { ...s, end: now() }));
      return { ...v, segments, hours: recalcHours(segments) };
    }) } as any);
  };

  const liveLabel = (startTs: string) => {
    const ms = Date.now() - (() => { const [d, tt] = startTs.split(' '); const [y, mo, da] = d.split('-').map(Number); const [h, mi] = (tt || '00:00').split(':').map(Number); return new Date(y, mo - 1, da, h, mi).getTime(); })();
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  // Subida en una sola petición (uploadBytes): más robusta que el protocolo resumible
  // contra el emulador y evita el cuelgue silencioso si getDownloadURL falla — cualquier
  // error se propaga al catch del llamador y el finally limpia el spinner.
  const uploadImage = async (path: string, file: File): Promise<{ path: string; url: string }> => {
    const snap = await uploadBytes(storageRef(storage, path), file, { contentType: file.type });
    return { path, url: await getDownloadURL(snap.ref) };
  };

  const onItemPhoto = async (equipmentId: string, itemId: string, file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      toast('> 20MB', 'error');
      return;
    }
    setUploadingItem(itemId);
    try {
      const p = `tenants/${tid}/serviceOrders/${so.id}/check-${itemId}-${Date.now()}.${file.name.split('.').pop() || 'jpg'}`;
      const up = await uploadImage(p, file);
      await updateEqChecklist(equipmentId, itemId, { photoPath: up.path, photoUrl: up.url, at: now(), by: ctx.admin.name });
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
      <MobileHeader title={so.num} sub={`${(isDemand ? so.title : (eqList.length > 1 ? t('serviceOrders.nEquipment', { count: eqList.length }) : eq.typeName)) || ''} · ${so.client?.name || ''}`} onBack={() => ctx.back()} />

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
          {isDemand && so.title && <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{so.title}</div>}
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>{so.client?.name}</div>
          <div style={{ fontSize: 13.5, color: 'var(--text-2)', marginTop: 2 }}>{(isDemand ? (so.site || so.address) : eq.location) || '—'}</div>
          {!isDemand && (
            <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12.5, color: 'var(--text-2)' }} className="mono">
              <span>{[eq.brand, eq.model].filter(Boolean).join(' ')}</span>
              {eq.serial && <span>S/N {eq.serial}</span>}
            </div>
          )}
          {isDemand && so.description && (
            <div style={{ marginTop: 10, background: 'var(--bg)', borderRadius: 9, padding: '9px 11px', fontSize: 13, color: 'var(--text-2)' }}>
              {so.description}
            </div>
          )}
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

        {isDemand && !so.checklistTemplateId && (so.checklist || []).length > 0 && (
          <MBlock title={t('serviceOrders.checklist')} icon="check" gold={editable}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(so.checklist as any[]).map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => editable && toggleAdhoc(it.id)}
                  disabled={!editable}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 4px', background: 'none', border: 'none', textAlign: 'left', cursor: editable ? 'pointer' : 'default', fontSize: 14 }}
                >
                  <Icon name={it.done ? 'checkCircle' : 'circle'} size={20} style={{ color: it.done ? 'var(--gold-600)' : 'var(--text-3)', flex: 'none' }} />
                  <span style={{ textDecoration: it.done ? 'line-through' : 'none', color: it.done ? 'var(--text-3)' : 'inherit' }}>{it.text}</span>
                </button>
              ))}
            </div>
          </MBlock>
        )}

        {/* Periódico/correctivo: una sección de checklist por equipo */}
        {!isDemand && eqList.map((e, i) => (
          <MBlock key={e.equipmentId || i} title={`${e.equipmentSnapshot?.typeName || t('serviceOrders.equipmentCard')}${e.checklistTemplateVersion ? ' · v' + e.checklistTemplateVersion : ''}`} icon="cpu" gold={editable}>
            <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 8 }}>
              {[e.equipmentSnapshot?.brand, e.equipmentSnapshot?.model].filter(Boolean).join(' ')}{e.equipmentSnapshot?.serial ? ` · S/N ${e.equipmentSnapshot.serial}` : ''}{e.equipmentSnapshot?.location ? ` · ${e.equipmentSnapshot.location}` : ''}
            </div>
            {(e.checklist?.length || 0) > 0 ? (
              <DynamicChecklist
                items={e.checklist as any}
                mode={editable ? 'execute' : 'readonly'}
                onAnswer={(itemId: string, answer: any, alert: boolean) => onAnswer(e.equipmentId, itemId, answer, alert)}
                onPhoto={(itemId: string, file: File) => onItemPhoto(e.equipmentId, itemId, file)}
              />
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>{t('mobileOrders.noChecklist')}</p>
            )}
          </MBlock>
        ))}
        {!isDemand && uploadingItem && uploadingItem !== 'general' && (
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="spin"><Icon name="refresh" size={13} /></span>
            {t('mobile.uploading')}
          </div>
        )}

        {isDemand && (editable || visits.length > 0) && (
          <div className="card" style={{ overflow: 'hidden', ...(editable ? { borderColor: 'var(--gold)', borderWidth: 1.5 } : {}) }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 15px 8px' }}>
              <Icon name="calendar" size={16} style={{ color: editable ? 'var(--gold-600)' : 'var(--text-3)' }} />
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.02em' }}>{t('ticketDetail.visitsTitle', { count: visits.length })}</span>
            </div>
            {visits.map((v, idx) => {
              const photos = ((so.evidence as any[]) || []).filter((e) => e.visitId === v.id);
              const open = vIsOpen(v.id);
              return (
                <div key={v.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <VisitBar index={idx} dateStr={v.date} meta={v.techName} preview={v.note} count={photos.length} open={open} onToggle={() => vToggle(v.id)} />
                  {open && (
                    <div className="fade-in" style={{ padding: '0 15px 15px' }}>
                      {/* fichaje: iniciar / salir + contador en vivo + tramos */}
                      {(() => {
                        const seg = openSeg(v);
                        const closed = (v.segments || []).filter((s) => s.end);
                        const dayMin = visitWorkedMinutes(v);
                        return (
                          <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                              <div>
                                <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>{t('mobileOrders.dayTotal')}</div>
                                <div style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: seg ? 'var(--gold-600)' : 'var(--text)' }}>
                                  {seg ? liveLabel(seg.start) : fmtDuration(dayMin)}
                                </div>
                                {seg && dayMin > 0 && <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{t('mobileOrders.accumulated', { d: fmtDuration(dayMin) })}</div>}
                              </div>
                              {editable && (seg
                                ? <Button variant="danger" icon="x" onClick={() => stopWork(v.id)}>{t('mobileOrders.leaveSite')}</Button>
                                : <Button variant="gold" icon="play" onClick={() => startWork(v.id)} disabled={anyOpen}>{t('mobileOrders.startWork')}</Button>)}
                            </div>
                            {closed.length > 0 && (
                              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 3 }}>
                                {closed.map((s, i) => (
                                  <div key={i} className="mono" style={{ fontSize: 11.5, color: 'var(--text-2)', display: 'flex', justifyContent: 'space-between' }}>
                                    <span>{s.start.slice(11)} → {(s.end || '').slice(11)}</span>
                                    <span>{fmtDuration(minutesBetween(s.start, s.end))}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      {editable ? (
                        <textarea className="input" rows={3} style={{ width: '100%', resize: 'vertical', marginBottom: 10 }} placeholder={t('mobileOrders.obsPh')}
                          defaultValue={v.note}
                          onChange={(e) => setDraft(v.id, e.target.value)}
                          onBlur={() => saveNote(v.id)} />
                      ) : (
                        v.note && <p style={{ margin: '0 0 10px', fontSize: 13.5, lineHeight: 1.5 }}>{v.note}</p>
                      )}
                      {photos.length > 0 && (
                        <div className="evidence-grid" style={{ marginBottom: editable ? 10 : 0 }}>
                          {photos.map((ev) => (
                            <div key={ev.id} onClick={() => window.open(ev.file, '_blank')}>
                              {ev.type === 'image' ? (
                                <img src={ev.file} style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 9 }} />
                              ) : (
                                <div style={{ width: '100%', height: 100, borderRadius: 9, background: 'var(--navy-900)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 4 }}>
                                  <Icon name={ev.type === 'video' ? 'play' : 'file'} size={22} />
                                  <span style={{ fontSize: 10.5 }}>{ev.type.toUpperCase()}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {editable && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <label className="m-upload-btn" style={{ cursor: 'pointer', flex: 1 }}>
                            <span style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--navy-800)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                              {uploadingItem === v.id ? <span className="spin"><Icon name="refresh" size={17} /></span> : <Icon name="camera" size={19} />}
                            </span>
                            <div style={{ textAlign: 'left' }}>
                              <div style={{ fontWeight: 700, fontSize: 14 }}>{t('mobile.addEvidence')}</div>
                              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('mobileOrders.evidenceHint')}</div>
                            </div>
                            <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,application/pdf" style={{ display: 'none' }} onChange={(e) => onEvidence(e, v.id)} />
                          </label>
                          <button className="icon-btn" onClick={() => removeVisit(v.id)} style={{ color: 'var(--st-rech-fg)', flex: 'none', alignSelf: 'center' }} aria-label={t('common.delete')}>
                            <Icon name="trash" size={17} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {editable && (
              <div style={{ padding: '10px 15px 14px', borderTop: visits.length ? '1px solid var(--border)' : 'none' }}>
                {addDayOpen ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Input type="date" value={addDate} onChange={(e: any) => setAddDate(e.target.value)} />
                    <Button variant="gold" onClick={() => addVisit(addDate)}>{t('common.add')}</Button>
                    <Button variant="ghost" onClick={() => setAddDayOpen(false)}>{t('common.cancel')}</Button>
                  </div>
                ) : (
                  <Button block variant="ghost" icon="plus" onClick={() => { setAddDate(today()); setAddDayOpen(true); }}>{t('mobileOrders.addDay')}</Button>
                )}
              </div>
            )}
          </div>
        )}

        {!isDemand && (editable || (so.photos || []).length > 0) && (
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

        {showMaterials && (editable || mats.length > 0 || so.materialsNote) && (
          <MBlock title={t('materials.title')} icon="box" gold={editable && mats.length > 0}>
            {mats.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: editable ? 12 : 0 }}>
                {mats.map((mt, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px', background: 'var(--surface-2)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.3 }}>{mt.name}</div>
                      {mt.comment ? <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 2 }}>{mt.comment}</div> : null}
                    </div>
                    {editable ? (
                      <>
                        <Stepper value={mt.qty} onChange={(v: number) => setMaterialQty(i, v)} size={34} />
                        <button className="icon-btn" onClick={() => removeMaterial(i)} style={{ color: 'var(--st-rech-fg)', flex: 'none' }} aria-label="x">
                          <Icon name="trash" size={16} />
                        </button>
                      </>
                    ) : (
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{mt.qty}×</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {editable && (
              <div style={{ background: 'var(--surface)', border: '1px dashed var(--border-strong)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Select value={selProduct} onChange={(e: any) => setSelProduct(e.target.value)}>
                  <option value="">{t('materials.selectProduct')}</option>
                  {inv.items.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.quantity})</option>
                  ))}
                </Select>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>{t('materials.qty')}</span>
                  <Stepper value={selQty} onChange={setSelQty} size={40} />
                  <div style={{ flex: 1 }}>
                    <Input placeholder={t('materials.commentPh')} value={selComment} onChange={(e: any) => setSelComment(e.target.value)} />
                  </div>
                </div>
                <Button variant="gold" icon="plus" block onClick={addMaterial} disabled={!selProduct}>{t('materials.addLine')}</Button>
              </div>
            )}
            {editable && (
              <div style={{ marginTop: 10 }}>
                <Field label={t('materials.extra')} hint={t('common.optional')}>
                  <Textarea placeholder={t('materials.extraPh')} defaultValue={so.materialsNote || ''} onBlur={(e: any) => actions.update(so.id, { materialsNote: e.target.value } as any)} style={{ minHeight: 56, fontSize: 14 }} />
                </Field>
              </div>
            )}
            {!editable && mats.length === 0 && !so.materialsNote && <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{t('materials.none')}</div>}
            {!editable && so.materialsNote && <p style={{ margin: '6px 0 0', fontSize: 13.5, color: 'var(--text-2)' }}>{so.materialsNote}</p>}
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
          <Button block variant="primary" icon="check" onClick={isDemand ? finishDemand : goSign} disabled={busy} style={{ height: 52, fontSize: 15.5 }}>
            {isDemand ? t('mobileOrders.finishReviewBtn') : t('mobileOrders.finishBtn')}
          </Button>
          {!isDemand && !check.ok && (
            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
              {t('mobileOrders.missingItems', { n: check.missing.length })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
