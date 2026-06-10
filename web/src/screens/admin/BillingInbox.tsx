/* © 2026 Aditum — Aditum FieldOps — Billing inbox: orders pending invoice */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { Icon, Button, Modal, Field, Input, EmptyState, toast } from '../../components/ui';
import { PageHeader } from './AdminShell';
import { useBillingOrders } from '../../lib/serviceOrders';
import { useContracts } from '../../lib/contracts';
import type { AppCtx } from '../../lib/ctx';

export default function BillingInbox({ ctx }: { ctx: AppCtx }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'pendiente' | 'facturado'>('pendiente');
  const { items, loading } = useBillingOrders(tab);
  const { contracts } = useContracts();
  const [fContract, setFContract] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceNote, setInvoiceNote] = useState('');
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => (fContract ? items.filter((i) => i.contractId === fContract) : items), [items, fContract]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const allSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.id));

  const markInvoiced = async () => {
    setBusy(true);
    try {
      // consolida en una factura FC-#### y marca items + órdenes (transacción server-side)
      const res: any = await httpsCallable(functions, 'consolidateInvoiceItems')({ itemIds: [...selected], note: invoiceNote.trim() });
      toast(t('billing.consolidated', { num: res.data.num, n: selected.size }), 'success');
      setSelected(new Set());
      setInvoiceOpen(false);
      setInvoiceNote('');
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
            <Button variant="ghost" icon="download" onClick={exportXlsx} disabled={!filtered.length}>{t('billing.export')}</Button>
            {tab === 'pendiente' && selected.size > 0 && (
              <Button variant="gold" icon="check" onClick={() => setInvoiceOpen(true)}>{t('billing.markBtn', { n: selected.size })}</Button>
            )}
          </>
        }
      />

      <div className="card" style={{ marginBottom: 16, padding: '12px 16px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['pendiente', 'facturado'] as const).map((k) => (
            <button key={k} className="chip" style={tab === k ? { background: 'var(--navy-800)', color: '#fff', cursor: 'pointer' } : { cursor: 'pointer' }} onClick={() => { setTab(k); setSelected(new Set()); }}>
              {t('billing.tab_' + k)}
            </button>
          ))}
        </div>
        <div style={{ width: 260, marginLeft: 'auto' }}>
          <select className="input" value={fContract} onChange={(e) => setFContract(e.target.value)}>
            <option value="">{t('equipment.allContracts')}</option>
            {contracts.map((c) => <option key={c.id} value={c.id}>{c.num} · {c.clientName}</option>)}
          </select>
        </div>
      </div>

      {!loading && filtered.length === 0 ? (
        <EmptyState icon="checkCircle" title={t('billing.empty')} sub={t('billing.emptySub')} />
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                {tab === 'pendiente' && (
                  <th style={{ width: 36 }}>
                    <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(filtered.map((i) => i.id)))} />
                  </th>
                )}
                <th>{t('serviceOrders.thNum')}</th>
                <th>{t('billing.thContract')}</th>
                <th>{t('serviceOrders.thClient')}</th>
                <th className="hide-sm">{t('serviceOrders.thEquipment')}</th>
                <th>{t('billing.thServiceDate')}</th>
                {tab === 'facturado' && <th>{t('billing.thInvoiced')}</th>}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id}>
                  {tab === 'pendiente' && (
                    <td><input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)} /></td>
                  )}
                  <td className="mono" style={{ fontWeight: 700 }}>{i.soNum}</td>
                  <td className="mono" style={{ fontSize: 12.5 }}>
                    {contracts.find((c) => c.id === i.contractId)?.num || '—'}
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{i.licitacionNum}</div>
                  </td>
                  <td>{i.clientName}</td>
                  <td className="hide-sm" style={{ fontSize: 12.5 }}>{i.equipmentSummary}</td>
                  <td className="mono" style={{ fontSize: 12.5 }}>{i.serviceDate}</td>
                  {tab === 'facturado' && <td className="mono" style={{ fontSize: 12 }}>{i.invoicedAt || '—'}</td>}
                  <td style={{ textAlign: 'right' }}>
                    {i.serviceOrderId && (
                      <button className="icon-btn" style={{ width: 30, height: 30 }} title={t('serviceOrders.title')} onClick={() => ctx.go('soDetail', { id: i.serviceOrderId })}>
                        <Icon name="external" size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={invoiceOpen} onClose={() => setInvoiceOpen(false)} title={t('billing.markTitle', { n: selected.size })} sub={t('billing.markSub')}
        footer={<>
          <Button variant="ghost" onClick={() => setInvoiceOpen(false)}>{t('common.cancel')}</Button>
          <Button onClick={markInvoiced} disabled={busy}>{busy ? '…' : t('common.confirm')}</Button>
        </>}>
        <Field label={t('billing.fNote')} hint={t('billing.fNoteHint')}>
          <Input placeholder="FC-0001 / referencia" value={invoiceNote} onChange={(e: any) => setInvoiceNote(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}
