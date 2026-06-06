/* © 2026 Aditum — Aditum FieldOps — Technician mobile ticket detail (on site) */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, StatusBadge, PriorityChip, Field, Textarea, Input, Select, Button, Lightbox, EvidenceThumb, toast } from '../../components/ui';
import { MobileHeader } from './MobileDashboard';
import Uploader from '../../components/Uploader';
import { useInventory } from '../../lib/inventory';
import { now } from '../../lib/time';
import type { AppCtx } from '../../lib/ctx';
import type { MaterialUse } from '../../lib/types';

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
  const [note, setNote] = useState(tk?.techNote || '');
  const [obs, setObs] = useState(tk?.techObs || '');
  const [lb, setLb] = useState<number | null>(null);
  const [warn, setWarn] = useState('');
  const inv = useInventory();
  const [materials, setMaterials] = useState<MaterialUse[]>(tk?.materials || []);
  const [matNote, setMatNote] = useState(tk?.materialsNote || '');
  const [selProduct, setSelProduct] = useState('');
  const [selQty, setSelQty] = useState(1);
  const [selComment, setSelComment] = useState('');
  if (!tk) return null;
  const me = ctx.admin.name;
  const doneCount = tk.checklist.filter((c) => c.done).length;
  const allDone = doneCount === tk.checklist.length && tk.checklist.length > 0;
  const hasEvidence = tk.evidence.length > 0;
  const rejected = tk.status === 'rechazado';
  const rejectComment = tk.comments.filter((c) => c.type === 'rechazo').slice(-1)[0];
  const canEdit = tk.status !== 'aprobado' && tk.status !== 'cerrado' && tk.status !== 'listo_revision';

  const toggleCheck = (cid: string) => {
    ctx.updateTicket(id, {
      checklist: tk.checklist.map((c) => (c.id === cid ? { ...c, done: !c.done, by: !c.done ? me : null, at: !c.done ? now() : null } : c)),
    });
  };
  const markProcess = () => {
    ctx.updateTicket(id, { status: 'en_proceso', history: [...tk.history, { status: 'en_proceso', at: now(), by: me }] });
    toast(t('mobile.inProcess'), 'success');
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
  const markReady = () => {
    ctx.updateTicket(id, { techNote: note, techObs: obs });
    if (!allDone) {
      setWarn(t('mobile.warnChecklist'));
      return;
    }
    if (!hasEvidence) {
      setWarn(t('mobile.warnEvidence'));
      return;
    }
    if (!note.trim()) {
      setWarn(t('mobile.warnNote'));
      return;
    }
    setWarn('');
    ctx.updateTicket(id, {
      status: 'listo_revision',
      techNote: note,
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

        <MBlock icon="check" q={t('mobile.workDone')}>
          <Field label={t('mobile.whatYouDid')}>
            <Textarea placeholder={t('mobile.whatYouDidPh')} value={note} onChange={(e: any) => setNote(e.target.value)} disabled={!canEdit} style={{ minHeight: 90, fontSize: 15 }} />
          </Field>
          <div style={{ height: 12 }} />
          <Field label={t('mobile.techObs')} hint={t('common.optional')}>
            <Textarea placeholder={t('mobile.techObsPh')} value={obs} onChange={(e: any) => setObs(e.target.value)} disabled={!canEdit} style={{ minHeight: 64, fontSize: 15 }} />
          </Field>
        </MBlock>

        <MBlock icon="ticket" q={t('materials.title')}>
          {materials.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {materials.map((mt, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px' }}>
                  <span style={{ fontWeight: 700, fontSize: 14, minWidth: 34 }}>{mt.qty}×</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{mt.name}</div>
                    {mt.comment ? <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{mt.comment}</div> : null}
                  </div>
                  {canEdit && (
                    <button className="icon-btn" onClick={() => removeMaterial(i)} style={{ color: 'var(--text-3)' }}>
                      <Icon name="trash" size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {canEdit && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Select value={selProduct} onChange={(e: any) => setSelProduct(e.target.value)}>
                <option value="">{t('materials.selectProduct')}</option>
                {inv.items.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.quantity})</option>
                ))}
              </Select>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ width: 90 }}>
                  <Input type="number" min={1} value={selQty} onChange={(e: any) => setSelQty(Number(e.target.value))} />
                </div>
                <div style={{ flex: 1 }}>
                  <Input placeholder={t('materials.commentPh')} value={selComment} onChange={(e: any) => setSelComment(e.target.value)} />
                </div>
              </div>
              <Button variant="ghost" icon="plus" block onClick={addMaterial} disabled={!selProduct}>{t('materials.addLine')}</Button>
              <div style={{ height: 4 }} />
              <Field label={t('materials.extra')} hint={t('common.optional')}>
                <Textarea placeholder={t('materials.extraPh')} value={matNote} onChange={(e: any) => setMatNote(e.target.value)} onBlur={() => persistMaterials(materials, matNote)} style={{ minHeight: 56, fontSize: 14 }} />
              </Field>
            </div>
          )}
          {!canEdit && materials.length === 0 && !matNote && <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{t('materials.none')}</div>}
          {!canEdit && matNote && <p style={{ margin: '6px 0 0', fontSize: 13.5, color: 'var(--text-2)' }}>{matNote}</p>}
        </MBlock>

        <MBlock icon="upload" q={t('mobile.uploadEvidence')}>
          {tk.evidence.length > 0 && (
            <div className="m-evidence-grid" style={{ marginBottom: 12 }}>
              {tk.evidence.map((ev, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <EvidenceThumb src={ev.file} type={ev.type} onClick={() => setLb(i)} h={88} />
                </div>
              ))}
            </div>
          )}
          {canEdit ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Uploader ticket={tk} ctx={ctx} kind="photo" by={me} />
              <Uploader ticket={tk} ctx={ctx} kind="video" by={me} />
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', padding: '8px 0' }}>{t('mobile.evidenceSent')}</div>
          )}
        </MBlock>

        {warn && (
          <div className="fade-in" style={{ display: 'flex', gap: 9, background: 'var(--st-rech-bg)', border: '1px solid #f3cfcf', color: 'var(--st-rech-fg)', padding: '12px 14px', borderRadius: 12, fontSize: 13.5, lineHeight: 1.4, alignItems: 'flex-start' }}>
            <Icon name="alert" size={17} style={{ flex: 'none', marginTop: 1 }} />
            {warn}
          </div>
        )}
      </div>

      {canEdit && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid var(--border)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 9, boxShadow: '0 -4px 20px rgba(0,30,47,.07)' }}>
          {(tk.status === 'asignado' || tk.status === 'pendiente') && (
            <Button variant="ghost" size="lg" block icon="play" onClick={markProcess}>{t('mobile.markProcess')}</Button>
          )}
          <Button variant="gold" size="lg" block icon="checkCircle" onClick={markReady}>{t('mobile.markReady')}</Button>
        </div>
      )}
      {tk.status === 'listo_revision' && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'var(--st-revi-bg)', borderTop: '1px solid #d9c9f0', padding: '14px', textAlign: 'center', color: 'var(--st-revi-fg)', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Icon name="clock" size={17} />
          {t('mobile.waitingReview')}
        </div>
      )}

      {lb != null && <Lightbox items={tk.evidence} index={lb} onClose={() => setLb(null)} onIndex={setLb} />}
    </div>
  );
}
