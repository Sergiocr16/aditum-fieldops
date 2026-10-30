/* © 2026 Aditum — Aditum FieldOps — Billing inbox: órdenes pendientes + facturas electrónicas (GTI) */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { Icon, Button, Modal, Field, Input, EmptyState, toast } from '../../components/ui';
import { PageHeader } from './AdminShell';
import { useBillingOrders } from '../../lib/serviceOrders';
import { useContracts } from '../../lib/contracts';
import { useInvoices } from '../../lib/invoices';
import { useClients } from '../../lib/clients';
import { formatMoney, fiscalTone } from '../../lib/fiscal';
import type { AppCtx } from '../../lib/ctx';
import type { Invoice } from '../../lib/types';

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
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: s.bg, color: s.fg }}>
      <Icon name={s.icon} size={12} />
      {label}
    </span>
  );
}

export default function BillingInbox({ ctx }: { ctx: AppCtx }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'pendiente' | 'facturas' | 'facturado'>('pendiente');
  const { items, loading } = useBillingOrders(tab === 'facturas' ? 'pendiente' : tab);
  const { contracts } = useContracts();
  const invoices = useInvoices();
  const clients = useClients();
  const [fContract, setFContract] = useState('');
  const [fKind, setFKind] = useState<'all' | 'demanda' | 'periodico'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState('');
  const [ncFor, setNcFor] = useState<Invoice | null>(null);
  const [ncAmount, setNcAmount] = useState('');
  const [ncReason, setNcReason] = useState('');

  const clientName = (id?: string | null) => clients.items.find((c) => c.id === id)?.name || '—';
  // Modalidad del ítem: los de tickets viejos (kind 'ticket') son trabajo por demanda.
  const itemMode = (i: any): 'demanda' | 'periodico' => (i.kind === 'ticket' || i.mode === 'demanda' ? 'demanda' : 'periodico');
  const filtered = useMemo(
    () =>
      items.filter((i) => {
        if (fContract && i.contractId !== fContract) return false;
        if (fKind !== 'all' && itemMode(i) !== fKind) return false;
        return true;
      }),
    [items, fContract, fKind]
  );

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const allSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.id));

  // Abre el compositor de factura con la(s) orden(es) precargada(s) como líneas.
  const billItems = (ids: string[]) => ctx.go('invoiceNew', { itemIds: ids });

  const emit = async (inv: Invoice) => {
    setActing(inv.id);
    try {
      await httpsCallable(functions, 'emitElectronicInvoice')({ invoiceId: inv.id });
      toast(t('billing.emitOk'), 'success');
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    } finally {
      setActing('');
    }
  };
  const checkStatus = async (inv: Invoice) => {
    setActing(inv.id);
    try {
      await httpsCallable(functions, 'queryFiscalStatus')({ kind: 'invoice', id: inv.id });
      toast(t('billing.statusChecked'), 'success');
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    } finally {
      setActing('');
    }
  };
  const resend = async (inv: Invoice) => {
    setActing(inv.id);
    try {
      await httpsCallable(functions, 'resendFiscalEmail')({ kind: 'invoice', id: inv.id });
      toast(t('billing.resendOk'), 'success');
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    } finally {
      setActing('');
    }
  };
  const submitNc = async () => {
    if (!ncFor) return;
    const amount = Number(ncAmount);
    if (!amount || amount <= 0) return toast(t('billing.ncAmountErr'), 'error');
    if (!ncReason.trim()) return toast(t('billing.ncReasonErr'), 'error');
    setBusy(true);
    try {
      await httpsCallable(functions, 'emitCreditNote')({ invoiceId: ncFor.id, amount, reason: ncReason.trim() });
      toast(t('billing.ncOk'), 'success');
      setNcFor(null);
      setNcAmount('');
      setNcReason('');
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    } finally {
      setBusy(false);
    }
  };

  const exportXlsx = () => {
    const rows = filtered.map((i) => ({
      Orden: i.soNum,
      Tipo: t('serviceOrders.type_' + i.type),
      Modalidad: t('serviceOrders.mode_' + itemMode(i)),
      Contrato: contracts.find((c) => c.id === i.contractId)?.num || '',
      'Licitación': i.licitacionNum,
      Cliente: i.clientName,
      Equipo: i.equipmentSummary,
      'Fecha servicio': i.serviceDate,
      Estado: t('billing.' + i.status),
      ...(i.invoicedAt ? { Facturado: i.invoicedAt, Nota: i.invoiceNote || '' } : {}),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Facturación');
    XLSX.writeFile(wb, `facturacion-${tab}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="fade-in">
      <PageHeader
        title={t('billing.title')}
        sub={t('billing.sub')}
        action={
          <>
            {tab !== 'facturas' && <Button variant="ghost" icon="download" onClick={exportXlsx} disabled={!filtered.length}>{t('billing.export')}</Button>}
            {tab === 'facturas' && <Button variant="primary" icon="plus" onClick={() => ctx.go('invoiceNew')}>{t('billing.newInvoice')}</Button>}
            {tab === 'pendiente' && selected.size > 0 && (
              <Button variant="gold" icon="receipt" onClick={() => billItems([...selected])}>{t('billing.billBtn', { n: selected.size })}</Button>
            )}
          </>
        }
      />

      <div className="card" style={{ marginBottom: 16, padding: '12px 16px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="seg" role="tablist">
          {(['pendiente', 'facturas', 'facturado'] as const).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); setSelected(new Set()); }}>
              {t('billing.tab_' + k)}
            </button>
          ))}
        </div>
        {tab !== 'facturas' && (
          <div className="seg" role="tablist">
            {(['all', 'demanda', 'periodico'] as const).map((k) => (
              <button key={k} role="tab" aria-selected={fKind === k} className={fKind === k ? 'on' : ''} onClick={() => { setFKind(k); setSelected(new Set()); }}>
                {k === 'all' ? t('billing.kind_all') : t('serviceOrders.mode_' + k)}
              </button>
            ))}
          </div>
        )}
        {tab !== 'facturas' && (
          <div style={{ width: 240, marginLeft: 'auto' }}>
            <select className="input" value={fContract} onChange={(e) => setFContract(e.target.value)}>
              <option value="">{t('equipment.allContracts')}</option>
              {contracts.map((c) => <option key={c.id} value={c.id}>{c.num} · {c.clientName}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* ---------- Facturas (FC) con emisión electrónica ---------- */}
      {tab === 'facturas' ? (
        invoices.items.length === 0 ? (
          <EmptyState icon="receipt" title={t('billing.invEmpty')} sub={t('billing.invEmptySub')} action={<Button variant="primary" icon="plus" onClick={() => ctx.go('invoiceNew')}>{t('billing.newInvoice')}</Button>} />
        ) : (
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('billing.thInvoice')}</th>
                    <th>{t('billing.thReceptor')}</th>
                    <th>{t('billing.thTotal')}</th>
                    <th>{t('billing.thEStatus')}</th>
                    <th>{t('billing.thConsecutive')}</th>
                    <th style={{ textAlign: 'right' }}>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.items.map((inv) => {
                    const sent = !!inv.isElectronicBillSend;
                    const emitible = !sent && !!inv.receptorId;
                    const statusLabel = inv.electronicBillStatus ? t('gti.st.' + inv.electronicBillStatus, { defaultValue: inv.electronicBillStatus }) : t('gti.st.PENDING');
                    return (
                      <tr key={inv.id} style={{ cursor: 'pointer' }} onClick={() => ctx.go('invoiceDetail', { id: inv.id })}>
                        <td className="mono" style={{ fontWeight: 700 }}>{inv.num}<div style={{ fontSize: 11, color: 'var(--text-3)' }}>{inv.itemCount} ítem(s)</div></td>
                        <td>{inv.receptorId ? clientName(inv.receptorId) : <span style={{ color: 'var(--st-rech-fg)' }}>{t('billing.noReceptor')}</span>}</td>
                        <td className="mono">{formatMoney(inv.total, inv.currency)}</td>
                        <td><StatusPill status={inv.electronicBillStatus} label={statusLabel} /></td>
                        <td className="mono" style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{inv.referenceNumber || '—'}</td>
                        <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap', alignItems: 'center' }}>
                            <button className="icon-btn" style={{ width: 30, height: 30 }} title={t('invoice.viewDetail')} onClick={() => ctx.go('invoiceDetail', { id: inv.id })}><Icon name="eye" size={14} /></button>
                            {emitible && (
                              <Button size="sm" variant="gold" icon="send" disabled={acting === inv.id} onClick={() => emit(inv)}>{t('billing.emit')}</Button>
                            )}
                            {!sent && fiscalTone(inv.electronicBillStatus) === 'err' && (
                              <Button size="sm" variant="ghost" icon="refresh" disabled={acting === inv.id} onClick={() => emit(inv)}>{t('billing.retry')}</Button>
                            )}
                            {sent && (
                              <>
                                <button className="icon-btn" style={{ width: 30, height: 30 }} title={t('billing.checkStatus')} disabled={acting === inv.id} onClick={() => checkStatus(inv)}><Icon name="refresh" size={14} /></button>
                                <button className="icon-btn" style={{ width: 30, height: 30 }} title={t('billing.resend')} disabled={acting === inv.id} onClick={() => resend(inv)}><Icon name="mail" size={14} /></button>
                                {!inv.creditNoteId && (
                                  <button className="icon-btn" style={{ width: 30, height: 30, color: 'var(--st-rech-fg)' }} title={t('billing.creditNote')} onClick={() => { setNcFor(inv); setNcAmount(String(inv.total ?? '')); }}><Icon name="x" size={14} /></button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : !loading && filtered.length === 0 ? (
        <EmptyState icon="checkCircle" title={t('billing.empty')} sub={t('billing.emptySub')} />
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  {tab === 'pendiente' && (
                    <th style={{ width: 36 }}>
                      <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(filtered.map((i) => i.id)))} />
                    </th>
                  )}
                  <th>{t('serviceOrders.thNum')}</th>
                  <th>{t('serviceOrders.thClient')}</th>
                  <th className="hide-sm">{t('serviceOrders.thEquipment')}</th>
                  <th>{t('billing.thServiceDate')}</th>
                  {tab === 'facturado' && <th>{t('billing.thInvoiced')}</th>}
                  <th style={{ textAlign: 'right' }}>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((i) => (
                  <tr key={i.id}>
                    {tab === 'pendiente' && (
                      <td><input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)} /></td>
                    )}
                    <td className="mono" style={{ fontWeight: 700 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        {i.soNum}
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99, letterSpacing: '.02em', ...(itemMode(i) === 'demanda' ? { background: 'var(--gold-50)', color: 'var(--gold-600)' } : { background: 'var(--surface-2)', color: 'var(--text-2)' }) }}>
                          {t('serviceOrders.mode_' + itemMode(i))}
                        </span>
                      </span>
                    </td>
                    <td>{i.clientName}</td>
                    <td className="hide-sm" style={{ fontSize: 12.5 }}>{i.equipmentSummary}</td>
                    <td className="mono" style={{ fontSize: 12.5 }}>{i.serviceDate}</td>
                    {tab === 'facturado' && <td className="mono" style={{ fontSize: 12 }}>{i.invoicedAt || '—'}</td>}
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                        {tab === 'pendiente' && <Button size="sm" variant="gold" icon="receipt" onClick={() => billItems([i.id])}>{t('billing.bill')}</Button>}
                        {i.serviceOrderId && (
                          <button className="icon-btn" style={{ width: 30, height: 30 }} title={t('nav.orders')} onClick={() => ctx.go('soDetail', { id: i.serviceOrderId })}>
                            <Icon name="external" size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={!!ncFor} onClose={() => setNcFor(null)} title={t('billing.ncTitle', { num: ncFor?.num || '' })} sub={t('billing.ncSub')}
        footer={<>
          <Button variant="ghost" onClick={() => setNcFor(null)}>{t('common.cancel')}</Button>
          <Button variant="primary" icon="send" onClick={submitNc} disabled={busy}>{busy ? '…' : t('billing.ncEmit')}</Button>
        </>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label={t('billing.ncAmount')} hint={t('billing.ncAmountHint')}>
            <Input type="number" value={ncAmount} onChange={(e: any) => setNcAmount(e.target.value)} />
          </Field>
          <Field label={t('billing.ncReason')} required>
            <Input value={ncReason} onChange={(e: any) => setNcReason(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
