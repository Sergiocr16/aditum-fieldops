/* © 2026 Aditum — Aditum FieldOps — Detalle de factura (estilo factura) + acciones GTI */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { onSnapshot, getDoc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { useTenant } from '../../lib/tenant';
import { useClients } from '../../lib/clients';
import { useChargeTypes } from '../../lib/chargeTypes';
import { Icon, Button, Field, Input, Select, Modal, toast } from '../../components/ui';
import { PageHeader } from './AdminShell';
import { identLabel } from './Clients';
import { formatMoney, lineCalc, fiscalTone, FISCAL_CURRENCIES } from '../../lib/fiscal';
import type { AppCtx } from '../../lib/ctx';
import type { Invoice } from '../../lib/types';

interface DispLine { description: string; emitIva: boolean; amount: number; ivaIncluded: boolean }

function StatusPill({ status, label }: { status?: string; label: string }) {
  const tone = fiscalTone(status);
  const map: any = {
    ok: { bg: 'var(--st-apro-bg)', fg: 'var(--st-apro-fg)', icon: 'checkCircle' },
    err: { bg: 'var(--st-rech-bg)', fg: 'var(--st-rech-fg)', icon: 'xCircle' },
    pending: { bg: 'var(--gold-50)', fg: 'var(--gold-600)', icon: 'clock' },
    none: { bg: 'var(--surface-2)', fg: 'var(--text-2)', icon: 'clock' },
  };
  const s = map[tone];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, padding: '4px 12px', borderRadius: 99, background: s.bg, color: s.fg }}>
      <Icon name={s.icon} size={14} />{label}
    </span>
  );
}

export default function InvoiceDetail({ ctx, id }: { ctx: AppCtx; id: string }) {
  const { t } = useTranslation();
  const { tenant, tdoc } = useTenant();
  const clients = useClients();
  const chargeTypes = useChargeTypes();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [dispLines, setDispLines] = useState<DispLine[]>([]);
  const [acting, setActing] = useState(false);
  const [ncOpen, setNcOpen] = useState(false);
  const [ncAmount, setNcAmount] = useState('');
  const [ncReason, setNcReason] = useState('');

  useEffect(() => {
    return onSnapshot(tdoc('invoices', id), (snap) => {
      setInv(snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as Invoice) : null);
      setLoading(false);
    }, () => setLoading(false));
  }, [id]);

  // Líneas para mostrar: manual (inv.lines) o consolidada (invoiceItems por itemIds).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!inv) return setDispLines([]);
      if (Array.isArray(inv.lines) && inv.lines.length) {
        setDispLines(inv.lines.map((l) => ({ description: l.description, emitIva: l.emitIva !== false, amount: Number(l.amount), ivaIncluded: l.ivaIncluded === true })));
        return;
      }
      const ids: string[] = Array.isArray(inv.itemIds) ? inv.itemIds : [];
      const snaps = await Promise.all(ids.map((iid) => getDoc(tdoc('invoiceItems', iid))));
      if (cancelled) return;
      const ctMap = new Map(chargeTypes.items.map((c) => [c.id, c]));
      setDispLines(
        snaps.filter((s) => s.exists()).map((s) => {
          const d = s.data() as any;
          const ct = d.chargeTypeId ? ctMap.get(d.chargeTypeId) : null;
          return { description: d.description || d.equipmentSummary || d.soNum || 'Servicio', emitIva: ct ? ct.emitIva !== false : true, amount: Number(d.amount) || 0, ivaIncluded: true };
        })
      );
    })();
    return () => { cancelled = true; };
  }, [inv?.id, inv?.lines, chargeTypes.items.length]);

  const totals = useMemo(() => {
    let subtotal = 0, iva = 0, total = 0;
    const per = dispLines.map((l) => { const r = lineCalc(l.amount, l.emitIva, l.ivaIncluded); subtotal += r.subtotal; iva += r.iva; total += r.total; return r; });
    return { per, subtotal, iva, total };
  }, [dispLines]);

  if (loading) return <div style={{ padding: 40, color: 'var(--text-2)' }}>{t('common.loading')}</div>;
  if (!inv) return <div style={{ padding: 40 }}>{t('invoice.notFound')}</div>;

  const receptor = clients.items.find((c) => c.id === inv.receptorId);
  const emisor = tenant?.branding?.appName || 'Aditum';
  const currency = inv.currency || 'CRC';
  const sent = !!inv.isElectronicBillSend;
  const statusLabel = inv.electronicBillStatus ? t('gti.st.' + inv.electronicBillStatus, { defaultValue: inv.electronicBillStatus }) : t('gti.st.PENDING');

  const run = async (fn: () => Promise<any>, okMsg: string) => {
    setActing(true);
    try { await fn(); toast(okMsg, 'success'); } catch (e: any) { toast(e?.message || 'Error', 'error'); } finally { setActing(false); }
  };
  const emit = () => run(() => httpsCallable(functions, 'emitElectronicInvoice')({ invoiceId: inv.id }), t('billing.emitOk'));
  const checkStatus = () => run(() => httpsCallable(functions, 'queryFiscalStatus')({ kind: 'invoice', id: inv.id }), t('billing.statusChecked'));
  const resend = () => run(() => httpsCallable(functions, 'resendFiscalEmail')({ kind: 'invoice', id: inv.id }), t('billing.resendOk'));
  const submitNc = async () => {
    const amount = Number(ncAmount);
    if (!amount || amount <= 0) return toast(t('billing.ncAmountErr'), 'error');
    if (!ncReason.trim()) return toast(t('billing.ncReasonErr'), 'error');
    await run(() => httpsCallable(functions, 'emitCreditNote')({ invoiceId: inv.id, amount, reason: ncReason.trim() }), t('billing.ncOk'));
    setNcOpen(false); setNcAmount(''); setNcReason('');
  };

  const total = inv.total ?? totals.total;

  return (
    <div className="fade-in">
      <PageHeader
        title={inv.num}
        sub={t('invoice.detailSub')}
        back={() => ctx.go('billing')}
        action={
          <>
            {!sent && (
              <div style={{ width: 110 }}>
                <Select value={currency} onChange={(e: any) => updateDoc(tdoc('invoices', inv.id), { currency: e.target.value }).catch(() => {})}>
                  {FISCAL_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </div>
            )}
            {!sent && inv.receptorId && <Button variant="gold" icon="send" disabled={acting} onClick={emit}>{fiscalTone(inv.electronicBillStatus) === 'err' ? t('billing.retry') : t('billing.emit')}</Button>}
            {sent && <Button variant="ghost" icon="refresh" disabled={acting} onClick={checkStatus}>{t('billing.checkStatus')}</Button>}
            {sent && <Button variant="ghost" icon="mail" disabled={acting} onClick={resend}>{t('billing.resend')}</Button>}
            {sent && !inv.creditNoteId && <Button variant="ghost" icon="x" disabled={acting} onClick={() => { setNcOpen(true); setNcAmount(String(total ?? '')); }}>{t('billing.creditNote')}</Button>}
          </>
        }
      />

      <div className="card card-pad" style={{ maxWidth: 880, margin: '0 auto' }}>
        {/* Encabezado */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--navy-800)' }}>{emisor}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{t('invoice.electronic')}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{inv.num}</div>
            <div style={{ margin: '6px 0' }}><StatusPill status={inv.electronicBillStatus} label={statusLabel} /></div>
            {inv.emittedAt && <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{inv.emittedAt}</div>}
          </div>
        </div>

        {(inv.referenceNumber || inv.numericKey) && (
          <div style={{ marginTop: 12, display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 12.5 }}>
            {inv.referenceNumber && <div><span style={{ color: 'var(--text-3)' }}>{t('billing.thConsecutive')}: </span><span className="mono">{inv.referenceNumber}</span></div>}
            {inv.numericKey && <div><span style={{ color: 'var(--text-3)' }}>{t('invoice.numericKey')}: </span><span className="mono">{inv.numericKey}</span></div>}
          </div>
        )}

        <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />

        {/* Receptor */}
        <div className="section-label" style={{ marginBottom: 8 }}>{t('invoice.billTo')}</div>
        {receptor ? (
          <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700 }}>{receptor.name}{receptor.comercialName ? <span style={{ fontWeight: 400, color: 'var(--text-3)' }}> · {receptor.comercialName}</span> : null}</div>
            <div style={{ color: 'var(--text-2)' }}>{identLabel(t, receptor.identType)}: <span className="mono">{receptor.identNumber}</span></div>
            <div style={{ color: 'var(--text-2)' }}>{receptor.email}{receptor.direction ? ` · ${receptor.direction}` : ''}</div>
          </div>
        ) : (
          <div style={{ color: 'var(--st-rech-fg)', fontSize: 13 }}>{t('billing.noReceptor')}</div>
        )}

        <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />

        {/* Líneas */}
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th style={{ width: 30 }}>#</th>
                <th>{t('invoice.description')}</th>
                <th style={{ width: 130, textAlign: 'right' }}>{t('invoice.subtotal')}</th>
                <th style={{ width: 110, textAlign: 'right' }}>{t('invoice.iva')}</th>
                <th style={{ width: 130, textAlign: 'right' }}>{t('invoice.lineTotal')}</th>
              </tr>
            </thead>
            <tbody>
              {dispLines.map((l, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--text-3)' }}>{i + 1}</td>
                  <td>{l.description}{!l.emitIva ? <span className="tag" style={{ marginLeft: 8, fontSize: 10 }}>{t('chargeTypes.ivaExempt')}</span> : null}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{formatMoney(totals.per[i]?.subtotal, currency)}</td>
                  <td className="mono" style={{ textAlign: 'right', color: 'var(--text-2)' }}>{formatMoney(totals.per[i]?.iva, currency)}</td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(totals.per[i]?.total, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totales */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <div style={{ width: 280, fontSize: 13.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}><span style={{ color: 'var(--text-2)' }}>{t('invoice.subtotal')}</span><span className="mono">{formatMoney(inv.subtotal ?? totals.subtotal, currency)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}><span style={{ color: 'var(--text-2)' }}>{t('invoice.ivaTotal')}</span><span className="mono">{formatMoney(inv.tax ?? totals.iva, currency)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', marginTop: 6, borderTop: '2px solid var(--navy-800)', fontWeight: 800, fontSize: 16 }}><span>{t('invoice.total')}</span><span className="mono">{formatMoney(total, currency)}</span></div>
          </div>
        </div>

        {inv.note && <div style={{ marginTop: 16, fontSize: 12.5, color: 'var(--text-2)' }}><b>{t('invoice.note')}:</b> {inv.note}</div>}
        {inv.electronicBillResponse && fiscalTone(inv.electronicBillStatus) === 'err' && (
          <div style={{ marginTop: 14, background: 'var(--st-rech-bg)', color: 'var(--st-rech-fg)', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, whiteSpace: 'pre-wrap' }}>{inv.electronicBillResponse}</div>
        )}
        {inv.creditNoteId && <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--text-2)' }}><Icon name="x" size={13} /> {t('invoice.credited', { amount: formatMoney(inv.creditedAmount, currency) })}</div>}
      </div>

      <Modal open={ncOpen} onClose={() => setNcOpen(false)} title={t('billing.ncTitle', { num: inv.num })} sub={t('billing.ncSub')}
        footer={<><Button variant="ghost" onClick={() => setNcOpen(false)}>{t('common.cancel')}</Button><Button variant="primary" icon="send" onClick={submitNc} disabled={acting}>{t('billing.ncEmit')}</Button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label={t('billing.ncAmount')} hint={t('billing.ncAmountHint')}><Input type="number" value={ncAmount} onChange={(e: any) => setNcAmount(e.target.value)} /></Field>
          <Field label={t('billing.ncReason')} required><Input value={ncReason} onChange={(e: any) => setNcReason(e.target.value)} /></Field>
        </div>
      </Modal>
    </div>
  );
}
