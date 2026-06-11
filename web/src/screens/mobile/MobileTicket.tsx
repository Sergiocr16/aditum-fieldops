/* © 2026 Aditum — Aditum FieldOps — Technician mobile ticket detail (on site) */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, StatusBadge, PriorityChip, Field, Textarea, Input, Select, Button, Stepper, Modal, Lightbox, EvidenceThumb, toast, confirmDialog } from '../../components/ui';
import { VisitBar } from '../../components/visits';
import { MobileHeader } from './MobileDashboard';
import Uploader from '../../components/Uploader';
import { ref as storageRef, deleteObject } from 'firebase/storage';
import { storage } from '../../lib/firebase';
import { useInventory } from '../../lib/inventory';
import { useTenant } from '../../lib/tenant';
import { tenantHasFeature } from '../../lib/modules';
import { now, today } from '../../lib/time';
import type { AppCtx } from '../../lib/ctx';
import type { MaterialUse, Visit } from '../../lib/types';

function MBlock({ icon, q, children, tone }: any) {
  const tones: any = {
    default: ['var(--surface)', 'var(--border)'],
    gold: ['var(--gold-50)', '#ecdcb8'],
  };
  const [bg, bd] = tones[tone || 'default'];
  return (
    <div style={{ background: bg, border: '1px solid ' + bd, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 34, height: 34, borderRadius: 9, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: tone === 'gold' ? 'var(--gold)' : 'var(--navy-800)', color: tone === 'gold' ? 'var(--navy-900)' : '#fff' }}>
          <Icon name={icon} size={18} />
        </span>
        <span style={{ fontWeight: 700, fontSize: 16, color: tone === 'gold' ? '#7a5e1f' : 'var(--text)' }}>{q}</span>
      </div>
      <div style={{ padding: '0 15px 15px' }}>{children}</div>
    </div>
  );
}

export default function TechTicketDetail({ ctx, id }: { ctx: AppCtx; id: string }) {
  const { t } = useTranslation();
  const tk = ctx.db.tickets.find((x) => x.id === id);
  const [obs, setObs] = useState(tk?.techObs || '');
  const [lb, setLb] = useState<number | null>(null);
  const [warn, setWarn] = useState('');
  const inv = useInventory();
  const { tenant } = useTenant();
  const showMaterials = tenantHasFeature('inventory', tenant?.features);
  const [materials, setMaterials] = useState<MaterialUse[]>(tk?.materials || []);
  const [matNote, setMatNote] = useState(tk?.materialsNote || '');
  const [selProduct, setSelProduct] = useState('');
  const [selQty, setSelQty] = useState(1);
  const [selComment, setSelComment] = useState('');
  const [confirmReady, setConfirmReady] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newDate, setNewDate] = useState(today());
  // Borradores de nota por visita (se persisten al salir del campo); permite editar cualquier día.
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [vOver, setVOver] = useState<Record<string, boolean>>({});
  const visits: Visit[] = tk?.visits || [];
  const activeVisit = visits.length ? visits[visits.length - 1] : null;
  if (!tk) return null;
  const lastVisitId = activeVisit?.id || '';
  const vIsOpen = (vid: string) => (vid in vOver ? vOver[vid] : vid === lastVisitId);
  const vToggle = (vid: string) => setVOver((p) => ({ ...p, [vid]: !vIsOpen(vid) }));
  const me = ctx.admin.name;
  const doneCount = tk.checklist.filter((c) => c.done).length;
  const allDone = doneCount === tk.checklist.length && tk.checklist.length > 0;
  const hasEvidence = tk.evidence.length > 0;
  const noteOf = (v: Visit) => (noteDrafts[v.id] !== undefined ? noteDrafts[v.id] : v.note);
  const hasVisitWork = visits.some((v) => (noteOf(v) || '').trim());
  const rejected = tk.status === 'rechazado';
  const rejectComment = tk.comments.filter((c) => c.type === 'rechazo').slice(-1)[0];
  const canEdit = tk.status !== 'aprobado' && tk.status !== 'cerrado' && tk.status !== 'listo_revision';

  const toggleCheck = (cid: string) => {
    ctx.updateTicket(id, {
      checklist: tk.checklist.map((c) => (c.id === cid ? { ...c, done: !c.done, by: !c.done ? me : null, at: !c.done ? now() : null, visitId: !c.done ? activeVisit?.id || null : null } : c)),
    });
  };
  const markProcess = () => {
    ctx.updateTicket(id, { status: 'en_proceso', history: [...tk.history, { status: 'en_proceso', at: now(), by: me }] });
    toast(t('mobile.inProcess'), 'success');
  };
  // Visitas (trabajo por día) ----------------------------------------------------
  const addVisit = (date: string) => {
    const v: Visit = { id: 'v' + now().replace(/[^0-9]/g, '') + '-' + Math.random().toString(36).slice(2, 7), date: date || today(), techId: ctx.admin.uid, techName: me, note: '', hours: null, at: now(), by: me };
    const patch: any = { visits: [...visits, v] };
    if (tk.status === 'asignado' || tk.status === 'pendiente') {
      patch.status = 'en_proceso';
      patch.history = [...tk.history, { status: 'en_proceso', at: now(), by: me }];
    }
    ctx.updateTicket(id, patch);
    setAddOpen(false);
  };
  const setDraft = (vid: string, val: string) => setNoteDrafts((p) => ({ ...p, [vid]: val }));
  const saveNote = (vid: string) => {
    if (noteDrafts[vid] === undefined) return;
    ctx.updateTicket(id, { visits: visits.map((v) => (v.id === vid ? { ...v, note: noteDrafts[vid] } : v)) });
  };
  const flushNotes = () => {
    if (!Object.keys(noteDrafts).length) return;
    ctx.updateTicket(id, { visits: visits.map((v) => (noteDrafts[v.id] !== undefined ? { ...v, note: noteDrafts[v.id] } : v)) });
  };
  const removeVisit = async (vid: string) => {
    const okc = await confirmDialog({ title: t('mobile.removeVisit'), message: t('mobile.removeVisitConfirm'), tone: 'danger', confirmLabel: t('common.delete'), confirmIcon: 'trash' });
    if (!okc) return;
    ctx.updateTicket(id, { visits: visits.filter((v) => v.id !== vid), evidence: tk.evidence.filter((e) => e.visitId !== vid) });
  };
  const persistMaterials = (mats: MaterialUse[], noteVal: string) => {
    setMaterials(mats);
    ctx.updateTicket(id, { materials: mats, materialsNote: noteVal });
  };
  const addMaterial = () => {
    if (!selProduct) return;
    const p = inv.items.find((x) => x.id === selProduct);
    if (!p) return;
    persistMaterials([...materials, { productId: p.id, name: p.name, qty: Math.max(1, Number(selQty) || 1), comment: selComment.trim() }], matNote);
    setSelProduct('');
    setSelQty(1);
    setSelComment('');
  };
  const removeMaterial = (idx: number) => persistMaterials(materials.filter((_, i) => i !== idx), matNote);
  const setMaterialQty = (idx: number, qty: number) => persistMaterials(materials.map((m, i) => (i === idx ? { ...m, qty: Math.max(1, qty) } : m)), matNote);
  const removeEvidence = async (idx: number) => {
    const ev = tk.evidence[idx];
    const okc = await confirmDialog({ title: t('mobile.removeEvidence'), message: t('mobile.removeEvidenceConfirm'), tone: 'danger', confirmLabel: t('common.delete'), confirmIcon: 'trash' });
    if (!okc) return;
    await ctx.updateTicket(id, { evidence: tk.evidence.filter((_, i) => i !== idx) });
    if (ev?.path) {
      try {
        await deleteObject(storageRef(storage, ev.path));
      } catch {
        /* archivo ya no existe o sin permiso: la evidencia igual se quitó del ticket */
      }
    }
    toast(t('mobile.evidenceRemoved'));
  };
  const requestReady = () => {
    flushNotes();
    ctx.updateTicket(id, { techObs: obs, materials, materialsNote: matNote });
    if (!allDone) {
      setWarn(t('mobile.warnChecklist'));
      return;
    }
    if (!hasEvidence) {
      setWarn(t('mobile.warnEvidence'));
      return;
    }
    if (!hasVisitWork) {
      setWarn(t('mobile.warnVisit'));
      return;
    }
    setWarn('');
    setConfirmReady(true);
  };
  const submitReady = () => {
    setConfirmReady(false);
    ctx.updateTicket(id, {
      status: 'listo_revision',
      techObs: obs,
      materials,
      materialsNote: matNote,
      readyAt: now(),
      history: [...tk.history, { status: 'listo_revision', at: now(), by: me }],
    });
    toast(t('mobile.sentForReview'), 'success');
    ctx.go('techDashboard');
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <MobileHeader title={tk.num} sub={tk.title} onBack={() => ctx.go('techDashboard')} />

      <div className="m-scroll" style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 120px', gap: 13 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <StatusBadge status={tk.status} />
          <PriorityChip priority={tk.priority} />
        </div>

        {rejected && rejectComment && (
          <div style={{ background: 'var(--st-rech-bg)', border: '1.5px solid #eeb5b5', borderRadius: 14, padding: '14px 15px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
              <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--st-rech-fg)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <Icon name="alert" size={17} />
              </span>
              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--st-rech-fg)' }}>{t('mobile.reworkTitle')}</span>
            </div>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: '#8a3030' }}>{rejectComment.text}</p>
          </div>
        )}

        <MBlock icon="mapPin" q={t('mobile.whereToGo')}>
          <div style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 3 }}>{tk.site}</div>
          <p style={{ margin: '0 0 11px', fontSize: 14, color: 'var(--text-2)', lineHeight: 1.5 }}>{tk.address}</p>
          <a href={'https://maps.google.com/?q=' + encodeURIComponent(tk.address)} target="_blank" rel="noreferrer" className="btn btn-ghost btn-block" style={{ textDecoration: 'none' }}>
            <Icon name="mapPin" size={17} />
            {t('mobile.openMaps')}
            <Icon name="external" size={15} style={{ marginLeft: 'auto' }} />
          </a>
        </MBlock>

        <MBlock icon="wrench" q={t('mobile.whatToDo')}>
          <p style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--text)', lineHeight: 1.55 }}>{tk.description}</p>
          {tk.instructions && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>{t('ticketDetail.instructions')}</div>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text-2)', lineHeight: 1.55 }}>{tk.instructions}</p>
            </>
          )}
        </MBlock>

        <MBlock icon="eye" q={t('mobile.whatToVerify')}>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text)', lineHeight: 1.55 }}>{tk.expected}</p>
        </MBlock>

        <MBlock icon="camera" q={t('mobile.whatToRecord')} tone="gold">
          <p style={{ margin: 0, fontSize: 14.5, color: '#6b521a', lineHeight: 1.55, fontWeight: 500 }}>{tk.evidenceReq}</p>
        </MBlock>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)' }}>
            <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--navy-800)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="checkCircle" size={18} />
            </span>
            <span style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>{t('mobile.checklist')}</span>
            <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: allDone ? 'var(--st-apro-fg)' : 'var(--text-2)' }}>{doneCount}/{tk.checklist.length}</span>
          </div>
          <div>
            {tk.checklist.map((c) => (
              <button key={c.id} onClick={() => canEdit && toggleCheck(c.id)} disabled={!canEdit} className="m-check-row">
                <span className={'m-check' + (c.done ? ' on' : '')}>{c.done && <Icon name="check" size={20} />}</span>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontSize: 14.5, lineHeight: 1.4, color: c.done ? 'var(--text)' : 'var(--text-2)', fontWeight: c.done ? 500 : 400 }}>{c.text}</div>
                  {c.done && c.at && (
                    <div className="mono" style={{ fontSize: 11.5, color: 'var(--st-apro-fg)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="clock" size={12} />
                      {c.at}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Visitas: el trabajo por día (una orden de varios días = varias visitas). */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)' }}>
            <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--navy-800)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="clock" size={18} /></span>
            <span style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>{t('mobile.visitsTitle')}</span>
            {visits.length > 0 && <span className="mono" style={{ fontSize: 13, color: 'var(--text-2)' }}>{visits.length}</span>}
          </div>
          <div>
            {visits.length === 0 && !canEdit && <div style={{ fontSize: 13.5, color: 'var(--text-3)', padding: '14px 15px' }}>{t('mobile.noVisits')}</div>}
            {visits.map((v, idx) => {
              const photos = tk.evidence.filter((e) => e.visitId === v.id);
              const open = vIsOpen(v.id);
              return (
                <div key={v.id} style={{ borderTop: idx > 0 ? '1px solid var(--border)' : 'none' }}>
                  <VisitBar index={idx} dateStr={v.date} meta={v.techName} preview={noteOf(v)} count={photos.length} open={open} onToggle={() => vToggle(v.id)} />
                  {open && (
                    <div className="fade-in" style={{ padding: '0 14px 14px' }}>
                      {canEdit ? (
                        <>
                          <Textarea placeholder={t('mobile.whatYouDidPh')} value={noteOf(v)} onChange={(e: any) => setDraft(v.id, e.target.value)} onBlur={() => saveNote(v.id)} style={{ minHeight: 76, fontSize: 15 }} />
                          {photos.length > 0 && (
                            <div className="m-evidence-grid" style={{ marginTop: 10 }}>
                              {photos.map((ev) => { const gi = tk.evidence.indexOf(ev); return (
                                <div key={ev.id} style={{ position: 'relative' }}>
                                  <EvidenceThumb src={ev.file} type={ev.type} onClick={() => setLb(gi)} h={84} />
                                  <button onClick={(e) => { e.stopPropagation(); removeEvidence(gi); }} aria-label="x" style={{ position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'rgba(0,30,47,.78)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="x" size={14} /></button>
                                </div>
                              ); })}
                            </div>
                          )}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
                            <Uploader ticket={tk} ctx={ctx} kind="photo" by={me} visitId={v.id} />
                            <Uploader ticket={tk} ctx={ctx} kind="video" by={me} visitId={v.id} />
                          </div>
                          <button onClick={() => removeVisit(v.id)} style={{ marginTop: 12, border: 'none', background: 'transparent', color: 'var(--st-rech-fg)', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: 0 }}>
                            <Icon name="trash" size={14} />{t('mobile.removeVisit')}
                          </button>
                        </>
                      ) : (
                        <>
                          <p style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{v.note || <span style={{ color: 'var(--text-3)' }}>{t('common.noInfo')}</span>}</p>
                          {photos.length > 0 && (
                            <div className="m-evidence-grid">
                              {photos.map((ev) => { const gi = tk.evidence.indexOf(ev); return <EvidenceThumb key={ev.id} src={ev.file} type={ev.type} onClick={() => setLb(gi)} h={84} />; })}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{ padding: '13px 14px', borderTop: visits.length ? '1px solid var(--border)' : 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {tk.evidence.filter((e) => !e.visitId).length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 6 }}>{t('mobile.otherPhotos')}</div>
                  <div className="m-evidence-grid">
                    {tk.evidence.filter((e) => !e.visitId).map((ev) => { const gi = tk.evidence.indexOf(ev); return <EvidenceThumb key={ev.id} src={ev.file} type={ev.type} onClick={() => setLb(gi)} h={84} />; })}
                  </div>
                </div>
              )}
              {canEdit && (addOpen ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1px dashed var(--border-strong)', borderRadius: 12, padding: 12 }}>
                  <Field label={t('mobile.fVisitDate')}>
                    <Input type="date" value={newDate} onChange={(e: any) => setNewDate(e.target.value)} style={{ width: 180, maxWidth: '100%' }} />
                  </Field>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button variant="ghost" block onClick={() => setAddOpen(false)}>{t('common.cancel')}</Button>
                    <Button variant="gold" icon="plus" block onClick={() => addVisit(newDate)}>{t('mobile.addVisitConfirm')}</Button>
                  </div>
                </div>
              ) : (
                <Button variant="ghost" icon="plus" block onClick={() => { setNewDate(today()); setAddOpen(true); }}>{visits.length === 0 ? t('mobile.addTodayWork') : t('mobile.addAnotherDay')}</Button>
              ))}
            </div>
          </div>
        </div>

        {(canEdit || tk.techObs) && (
          <MBlock icon="eye" q={t('mobile.techObs')}>
            {canEdit ? (
              <Textarea placeholder={t('mobile.techObsPh')} value={obs} onChange={(e: any) => setObs(e.target.value)} onBlur={() => ctx.updateTicket(id, { techObs: obs })} style={{ minHeight: 64, fontSize: 15 }} />
            ) : (
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{tk.techObs}</p>
            )}
          </MBlock>
        )}

        {showMaterials && (
        <MBlock icon="box" q={t('materials.title')}>
          {materials.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {materials.map((mt, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px', background: 'var(--surface-2)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.3 }}>{mt.name}</div>
                    {mt.comment ? <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 2 }}>{mt.comment}</div> : null}
                  </div>
                  {canEdit ? (
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
          {canEdit && (
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
          {canEdit && (
            <>
              <div style={{ height: 10 }} />
              <Field label={t('materials.extra')} hint={t('common.optional')}>
                <Textarea placeholder={t('materials.extraPh')} value={matNote} onChange={(e: any) => setMatNote(e.target.value)} onBlur={() => persistMaterials(materials, matNote)} style={{ minHeight: 56, fontSize: 14 }} />
              </Field>
            </>
          )}
          {!canEdit && materials.length === 0 && !matNote && <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{t('materials.none')}</div>}
          {!canEdit && matNote && <p style={{ margin: '6px 0 0', fontSize: 13.5, color: 'var(--text-2)' }}>{matNote}</p>}
        </MBlock>
        )}

      </div>

      {canEdit && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid var(--border)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 9, boxShadow: '0 -4px 20px rgba(0,30,47,.07)' }}>
          {warn && (
            <div className="fade-in" style={{ display: 'flex', gap: 9, background: 'var(--st-rech-bg)', border: '1px solid #eeb5b5', color: 'var(--st-rech-fg)', padding: '11px 13px', borderRadius: 12, fontSize: 13.5, lineHeight: 1.4, alignItems: 'flex-start', fontWeight: 500 }}>
              <Icon name="alert" size={17} style={{ flex: 'none', marginTop: 1 }} />
              <span style={{ flex: 1 }}>{warn}</span>
              <button onClick={() => setWarn('')} style={{ border: 'none', background: 'transparent', color: 'var(--st-rech-fg)', cursor: 'pointer', padding: 0, flex: 'none' }}><Icon name="x" size={16} /></button>
            </div>
          )}
          {(tk.status === 'asignado' || tk.status === 'pendiente') && (
            <Button variant="ghost" size="lg" block icon="play" onClick={markProcess}>{t('mobile.markProcess')}</Button>
          )}
          <Button variant="gold" size="lg" block icon="checkCircle" onClick={requestReady}>{t('mobile.markReady')}</Button>
        </div>
      )}
      {tk.status === 'listo_revision' && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'var(--st-revi-bg)', borderTop: '1px solid #d9c9f0', padding: '14px', textAlign: 'center', color: 'var(--st-revi-fg)', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Icon name="clock" size={17} />
          {t('mobile.waitingReview')}
        </div>
      )}

      {lb != null && <Lightbox items={tk.evidence} index={lb} onClose={() => setLb(null)} onIndex={setLb} />}

      <Modal
        open={confirmReady}
        onClose={() => setConfirmReady(false)}
        width={400}
        tone="success"
        title={t('mobile.confirmReadyTitle')}
        sub={t('mobile.confirmReadySub')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReady(false)}>{t('common.cancel')}</Button>
            <Button variant="gold" icon="checkCircle" onClick={submitReady}>{t('mobile.confirmReadyBtn')}</Button>
          </>
        }
      >
        <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.5 }}>{t('mobile.confirmReadyBody')}</div>
      </Modal>
    </div>
  );
}
