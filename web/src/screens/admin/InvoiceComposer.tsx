/* © 2026 Aditum — Aditum FieldOps — Compositor de factura por líneas (estilo factura) */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { useTenant } from '../../lib/tenant';
import { useClients } from '../../lib/clients';
import { useChargeTypes } from '../../lib/chargeTypes';
import { Icon, Button, Field, Input, Select, EmptyState, toast } from '../../components/ui';
import { PageHeader } from './AdminShell';
import { identLabel } from './Clients';
import { currencySymbol, formatMoney, lineCalc, FISCAL_CURRENCIES } from '../../lib/fiscal';
import type { AppCtx } from '../../lib/ctx';

interface LineDraft { description: string; chargeTypeId: string; amount: string }

const emptyLine = (): LineDraft => ({ description: '', chargeTypeId: '', amount: '' });

export default function InvoiceComposer({ ctx, itemIds }: { ctx: AppCtx; itemIds?: string[] }) {
  const { t } = useTranslation();
  const { tenant, tdoc } = useTenant();
  const clients = useClients();
  const chargeTypes = useChargeTypes();
  const [receptorId, setReceptorId] = useState('');
  const [currency, setCurrency] = useState<'CRC' | 'USD'>('CRC');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [sourceItemIds, setSourceItemIds] = useState<string[]>([]);

  // Precarga desde órdenes pendientes seleccionadas en la bandeja.
  useEffect(() => {
    const ids = (itemIds || []).filter(Boolean);
    if (!ids.length) return;
    setSourceItemIds(ids);
    (async () => {
      const snaps = await Promise.all(ids.map((id) => getDoc(tdoc('invoiceItems', id))));
      const items = snaps.filter((s) => s.exists()).map((s) => ({ id: s.id, ...(s.data() as any) }));
      if (!items.length) return;
      setLines(items.map((it) => ({ description: it.description || it.equipmentSummary || it.soNum || '', chargeTypeId: it.chargeTypeId || '', amount: it.amount != null ? String(it.amount) : '' })));
      const recs = [...new Set(items.map((it) => it.clientId).filter(Boolean))];
      if (recs.length === 1) setReceptorId(recs[0] as string);
      const curs = [...new Set(items.map((it) => it.currency).filter(Boolean))];
      if (curs.length === 1) setCurrency(curs[0] === 'USD' ? 'USD' : 'CRC');
    })();
  }, []);

  const emisor = tenant?.branding?.appName || 'Aditum';
  const receptor = clients.items.find((c) => c.id === receptorId);
  const ctById = (id: string) => chargeTypes.items.find((c) => c.id === id);
  const emitIvaOf = (id: string) => { const c = ctById(id); return c ? c.emitIva !== false : true; };

  const calc = useMemo(() => {
    let subtotal = 0, iva = 0, total = 0;
    const per = lines.map((l) => {
      const r = lineCalc(Number(l.amount) || 0, emitIvaOf(l.chargeTypeId), false);
      subtotal += r.subtotal; iva += r.iva; total += r.total;
      return r;
    });
    return { per, subtotal, iva, total };
  }, [lines, chargeTypes.items]);

  const setLine = (i: number, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, emptyLine()]);
  const removeLine = (i: number) => setLines((ls) => (ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls));

  const isStarted = (l: LineDraft) => !!(l.description.trim() || Number(l.amount) > 0 || l.chargeTypeId);
  const isComplete = (l: LineDraft) => !!(l.description.trim() && Number(l.amount) > 0 && l.chargeTypeId);
  const valid = !!receptorId && lines.some(isComplete) && lines.filter(isStarted).every(isComplete);

  const submit = async () => {
    if (!receptorId) return toast(t('invoice.needReceptor'), 'error');
    if (lines.filter(isStarted).some((l) => !l.chargeTypeId)) return toast(t('invoice.needChargeType'), 'error');
    const payloadLines = lines
      .filter(isComplete)
      .map((l) => ({ description: l.description.trim(), chargeTypeId: l.chargeTypeId, amount: Number(l.amount) }));
    if (!payloadLines.length) return toast(t('invoice.needLine'), 'error');
    setBusy(true);
    try {
      const res: any = await httpsCallable(functions, 'createManualInvoice')({ receptorId, currency, note: note.trim(), lines: payloadLines, sourceItemIds });
      const d = res.data || {};
      if (d.ok) {
        toast(t('invoice.emitted', { num: d.num }), 'success');
      } else {
        toast(t('invoice.createdButError', { error: d.error || '' }), 'error');
      }
      if (d.invoiceId) ctx.go('invoiceDetail', { id: d.invoiceId });
      else ctx.go('billing');
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    } finally {
      setBusy(false);
    }
  };

  const sym = currencySymbol(currency);

  return (
    <div className="fade-in">
      <PageHeader title={t('invoice.newTitle')} sub={t('invoice.newSub')} back={() => ctx.go('billing')} />

      {/* Documento estilo factura */}
      <div className="card card-pad" style={{ maxWidth: 880, margin: '0 auto' }}>
        {/* Encabezado: emisor + tipo de documento + moneda */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--navy-800)' }}>{emisor}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{t('invoice.electronic')}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: 'var(--gold-600)' }}>{t('invoice.docType')}</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', margin: '2px 0 8px' }}>{t('invoice.draft')}</div>
            <div className="section-label" style={{ marginBottom: 4 }}>{t('invoice.currency')}</div>
            <div style={{ width: 120, marginLeft: 'auto' }}>
              <Select value={currency} onChange={(e: any) => setCurrency(e.target.value)}>
                {FISCAL_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />

        {/* Receptor */}
        <div className="section-label" style={{ marginBottom: 8 }}>{t('invoice.billTo')}</div>
        <div style={{ maxWidth: 420 }}>
          <Select value={receptorId} onChange={(e: any) => setReceptorId(e.target.value)}>
            <option value="">{t('invoice.selectReceptor')}</option>
            {clients.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        {receptor && (
          <div style={{ marginTop: 10, background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px', fontSize: 13, lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700 }}>{receptor.name}{receptor.comercialName ? <span style={{ fontWeight: 400, color: 'var(--text-3)' }}> · {receptor.comercialName}</span> : null}</div>
            <div style={{ color: 'var(--text-2)' }}>{identLabel(t, receptor.identType)}: <span className="mono">{receptor.identNumber}</span></div>
            <div style={{ color: 'var(--text-2)' }}>{receptor.email}{receptor.direction ? ` · ${receptor.direction}` : ''}</div>
          </div>
        )}

        <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />

        {/* Líneas */}
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th style={{ width: 30 }}>#</th>
                <th>{t('invoice.description')}</th>
                <th style={{ width: 180 }}>{t('invoice.chargeType')}</th>
                <th style={{ width: 140, textAlign: 'right' }}>{t('invoice.amount')}</th>
                <th style={{ width: 110, textAlign: 'right' }}>{t('invoice.iva')}</th>
                <th style={{ width: 130, textAlign: 'right' }}>{t('invoice.lineTotal')}</th>
                <th style={{ width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--text-3)' }}>{i + 1}</td>
                  <td><Input placeholder={t('invoice.descriptionPh')} value={l.description} onChange={(e: any) => setLine(i, { description: e.target.value })} /></td>
                  <td>
                    <Select value={l.chargeTypeId} onChange={(e: any) => setLine(i, { chargeTypeId: e.target.value })}>
                      <option value="">{t('invoice.selectChargeType')}</option>
                      {chargeTypes.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                  </td>
                  <td>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', fontSize: 13 }}>{sym}</span>
                      <input className="input" type="number" style={{ textAlign: 'right', paddingLeft: 22 }} value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} />
                    </div>
                  </td>
                  <td className="mono" style={{ textAlign: 'right', color: 'var(--text-2)', fontSize: 12.5 }}>{calc.per[i].iva ? formatMoney(calc.per[i].iva, currency) : (emitIvaOf(l.chargeTypeId) ? formatMoney(0, currency) : t('invoice.noIva'))}</td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(calc.per[i].total, currency)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="icon-btn" style={{ width: 30, height: 30, color: 'var(--st-rech-fg)' }} title={t('common.delete')} onClick={() => removeLine(i)} disabled={lines.length <= 1}><Icon name="trash" size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button variant="ghost" icon="plus" onClick={addLine}>{t('invoice.addLine')}</Button>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('invoice.chargeTypeHint')}</span>
        </div>

        {/* Totales */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <div style={{ width: 280, fontSize: 13.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
              <span style={{ color: 'var(--text-2)' }}>{t('invoice.subtotal')}</span>
              <span className="mono">{formatMoney(calc.subtotal, currency)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
              <span style={{ color: 'var(--text-2)' }}>{t('invoice.ivaTotal')}</span>
              <span className="mono">{formatMoney(calc.iva, currency)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', marginTop: 6, borderTop: '2px solid var(--navy-800)', fontWeight: 800, fontSize: 16 }}>
              <span>{t('invoice.total')}</span>
              <span className="mono">{formatMoney(calc.total, currency)}</span>
            </div>
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />
        <Field label={t('invoice.note')} hint={t('invoice.noteHint')}>
          <Input value={note} onChange={(e: any) => setNote(e.target.value)} />
        </Field>

        {clients.items.length === 0 && (
          <div style={{ marginTop: 12 }}>
            <EmptyState icon="building" title={t('invoice.noClients')} sub={t('invoice.noClientsSub')} action={<Button variant="ghost" icon="plus" onClick={() => ctx.go('clients')}>{t('clients.add')}</Button>} />
          </div>
        )}
      </div>

      {/* Acciones */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, maxWidth: 880, margin: '16px auto 0' }}>
        <Button variant="ghost" onClick={() => ctx.go('billing')}>{t('common.cancel')}</Button>
        <Button variant="gold" icon="send" onClick={submit} disabled={busy || !valid}>{busy ? '…' : t('invoice.emitBtn')}</Button>
      </div>
    </div>
  );
}
