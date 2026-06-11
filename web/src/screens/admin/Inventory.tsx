/* © 2026 Aditum — Aditum Service — Admin inventory */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';
import { Icon, Button, Input, Field, Modal, EmptyState, toast, confirmDialog } from '../../components/ui';
import { PageHeader } from './AdminShell';
import { useInventory } from '../../lib/inventory';
import type { AppCtx } from '../../lib/ctx';
import type { InventoryItem } from '../../lib/types';

const COL = (row: any, ...keys: string[]) => {
  for (const k of Object.keys(row)) {
    const norm = k.trim().toLowerCase();
    if (keys.some((x) => norm.includes(x))) return row[k];
  }
  return undefined;
};

export default function Inventory({ ctx }: { ctx: AppCtx }) {
  const { t } = useTranslation();
  const inv = useInventory();
  const [tab, setTab] = useState<'products' | 'history'>('products');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Partial<InventoryItem> | null>(null);
  const [importRows, setImportRows] = useState<Partial<InventoryItem>[] | null>(null);
  const [histProduct, setHistProduct] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const low = inv.items.filter((i) => i.minQty > 0 && i.quantity <= i.minQty).sort((a, b) => a.quantity - b.quantity);
  const rows = inv.items.filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase()));
  const movements = inv.movements.filter((m) => !histProduct || m.productId === histProduct);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        const parsed = json
          .map((r) => ({
            name: String(COL(r, 'nombre', 'name', 'producto') ?? '').trim(),
            quantity: Number(COL(r, 'cantidad', 'quantity', 'stock') ?? 0) || 0,
            purchaseLink: String(COL(r, 'link', 'compra', 'url') ?? '').trim(),
            description: String(COL(r, 'descrip', 'observ', 'notas', 'description') ?? '').trim(),
            minQty: Number(COL(r, 'mínimo', 'minimo', 'min', 'recomend') ?? 0) || 0,
          }))
          .filter((r) => r.name);
        if (!parsed.length) {
          toast(t('inventory.noRows'), 'error');
          return;
        }
        setImportRows(parsed);
      } catch {
        toast(t('inventory.importErr'), 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([{ Nombre: '', Cantidad: 0, 'Link de compra': '', 'Descripción': '', 'Mínimo recomendado': 0 }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
    XLSX.writeFile(wb, 'plantilla-inventario.xlsx');
  };

  const confirmImport = async () => {
    if (!importRows) return;
    const res = await inv.bulkUpsert(importRows);
    setImportRows(null);
    toast(t('inventory.imported', res), 'success');
  };

  const saveItem = async () => {
    if (!edit?.name?.trim()) {
      toast(t('inventory.requiredName'), 'error');
      return;
    }
    if (edit.id) await inv.updateItem(edit.id, edit);
    else await inv.upsertItem(edit);
    toast(edit.id ? t('inventory.updated') : t('inventory.created'), 'success');
    setEdit(null);
  };

  return (
    <div className="fade-in">
      <PageHeader
        title={t('inventory.title')}
        sub={t('inventory.subtitle')}
        action={
          <>
            <Button variant="ghost" icon="download" onClick={downloadTemplate}>{t('inventory.downloadTemplate')}</Button>
            <Button variant="ghost" icon="upload" onClick={() => fileRef.current?.click()}>{t('inventory.import')}</Button>
            <Button variant="primary" icon="plus" onClick={() => setEdit({ quantity: 0, minQty: 0 })}>{t('inventory.addProduct')}</Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={onFile} />
          </>
        }
      />

      {/* Recomendación de compra */}
      <div className="card card-pad" style={{ marginBottom: 16, borderColor: low.length ? '#f3cccc' : 'var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: low.length ? 12 : 0 }}>
          <span style={{ color: low.length ? 'var(--st-rech-fg)' : 'var(--st-apro-fg)', display: 'flex' }}>
            <Icon name={low.length ? 'alert' : 'checkCircle'} size={18} />
          </span>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{t('inventory.restockTitle')}</span>
        </div>
        {low.length === 0 ? (
          <div style={{ fontSize: 13.5, color: 'var(--text-2)' }}>{t('inventory.restockOk')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {low.map((i) => (
              <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 14, flex: '1 1 160px' }}>{i.name}</span>
                <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{t('inventory.available')}: <b style={{ color: i.quantity === 0 ? 'var(--st-rech-fg)' : 'var(--text)' }}>{i.quantity}</b></span>
                <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{t('inventory.min')}: <b>{i.minQty}</b></span>
                <span className="tag">{t('inventory.needed')}: {Math.max(0, i.minQty - i.quantity)}</span>
                {i.purchaseLink ? (
                  <a href={i.purchaseLink} target="_blank" rel="noreferrer" className="btn btn-gold btn-sm" style={{ textDecoration: 'none' }}>
                    <Icon name="external" size={14} />{t('inventory.buy')}
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {(['products', 'history'] as const).map((tb) => (
          <button key={tb} onClick={() => setTab(tb)} className={'m-chip' + (tab === tb ? ' active' : '')}>
            {tb === 'products' ? t('inventory.tabProducts') : t('inventory.tabHistory')}
          </button>
        ))}
      </div>

      {tab === 'products' ? (
        <>
          <div className="card" style={{ padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ maxWidth: 320 }}>
              <Input icon="search" placeholder={t('inventory.search')} value={q} onChange={(e: any) => setQ(e.target.value)} />
            </div>
          </div>
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('inventory.name')}</th>
                    <th>{t('inventory.quantity')}</th>
                    <th>{t('inventory.minQty')}</th>
                    <th>{t('inventory.link')}</th>
                    <th>{t('inventory.description')}</th>
                    <th style={{ textAlign: 'right' }}>{t('inventory.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <EmptyState icon="box" title={t('inventory.emptyTitle')} sub={t('inventory.emptySub')} />
                      </td>
                    </tr>
                  ) : (
                    rows.map((i) => {
                      const lowItem = i.minQty > 0 && i.quantity <= i.minQty;
                      return (
                        <tr key={i.id} style={{ cursor: 'pointer' }} onClick={() => setEdit({ ...i })}>
                          <td style={{ fontWeight: 600 }}>{i.name}</td>
                          <td><span style={{ color: lowItem ? 'var(--st-rech-fg)' : 'var(--text)', fontWeight: 600 }}>{i.quantity}</span></td>
                          <td style={{ color: 'var(--text-2)' }}>{i.minQty || '—'}</td>
                          <td onClick={(e) => e.stopPropagation()}>
                            {i.purchaseLink ? <a href={i.purchaseLink} target="_blank" rel="noreferrer" style={{ color: 'var(--navy-700)', fontWeight: 600 }}><Icon name="external" size={15} /></a> : '—'}
                          </td>
                          <td style={{ color: 'var(--text-2)', maxWidth: 240 }}><div className="truncate">{i.description || '—'}</div></td>
                          <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button className="icon-btn" title={t('common.edit')} onClick={() => setEdit({ ...i })}><Icon name="edit" size={16} /></button>
                              <button className="icon-btn" style={{ color: 'var(--st-rech-fg)' }} title={t('common.delete')} onClick={async () => { if (await confirmDialog({ title: t('common.delete'), message: t('inventory.deleteConfirm'), tone: 'danger', confirmLabel: t('common.delete'), confirmIcon: 'trash' })) { inv.deleteItem(i.id); toast(t('inventory.deleted')); } }}><Icon name="trash" size={16} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ position: 'relative', maxWidth: 280 }}>
              <select value={histProduct} onChange={(e) => setHistProduct(e.target.value)} className="filter-select" style={{ appearance: 'none', width: '100%' }}>
                <option value="">{t('inventory.filterAllProducts')}</option>
                {inv.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
              <span style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-3)' }}><Icon name="chevronDown" size={15} /></span>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('inventory.histDate')}</th>
                  <th>{t('inventory.histProduct')}</th>
                  <th>{t('inventory.histQty')}</th>
                  <th>{t('inventory.histTicket')}</th>
                  <th>{t('inventory.histLocation')}</th>
                  <th>{t('inventory.histTech')}</th>
                </tr>
              </thead>
              <tbody>
                {movements.length === 0 ? (
                  <tr><td colSpan={6}><EmptyState icon="clock" title={t('inventory.tabHistory')} sub={t('inventory.histEmpty')} /></td></tr>
                ) : (
                  movements.map((m) => (
                    <tr key={m.id}>
                      <td className="mono" style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{m.at}</td>
                      <td style={{ fontWeight: 600 }}>{m.productName}</td>
                      <td><span className="tag">-{m.qty}</span></td>
                      <td>
                        <button
                          className="mono"
                          onClick={() => ctx.go('ticketDetail', { id: m.ticketId })}
                          style={{ border: 'none', background: 'transparent', color: 'var(--navy-700)', fontWeight: 600, cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          {m.ticketNum}
                          <Icon name="external" size={13} />
                        </button>
                      </td>
                      <td style={{ color: 'var(--text-2)' }}>{[m.client, m.site].filter(Boolean).join(' · ') || '—'}</td>
                      <td style={{ color: 'var(--text-2)' }}>{m.techName || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal crear/editar */}
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        width={460}
        title={edit?.id ? t('inventory.edit') : t('inventory.create')}
        footer={<><Button variant="ghost" onClick={() => setEdit(null)}>{t('common.cancel')}</Button><Button variant="primary" icon="check" onClick={saveItem}>{t('inventory.save')}</Button></>}
      >
        {edit && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label={t('inventory.name')} required>
              <Input placeholder={t('inventory.namePh')} value={edit.name || ''} onChange={(e: any) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <div className="form-grid">
              <Field label={t('inventory.quantity')}>
                <Input type="number" value={edit.quantity ?? 0} onChange={(e: any) => setEdit({ ...edit, quantity: Number(e.target.value) })} />
              </Field>
              <Field label={t('inventory.minQty')}>
                <Input type="number" value={edit.minQty ?? 0} onChange={(e: any) => setEdit({ ...edit, minQty: Number(e.target.value) })} />
              </Field>
            </div>
            <Field label={t('inventory.link')}>
              <Input icon="link" placeholder={t('inventory.linkPh')} value={edit.purchaseLink || ''} onChange={(e: any) => setEdit({ ...edit, purchaseLink: e.target.value })} />
            </Field>
            <Field label={t('inventory.description')}>
              <Input placeholder={t('inventory.descPh')} value={edit.description || ''} onChange={(e: any) => setEdit({ ...edit, description: e.target.value })} />
            </Field>
            {edit.id && (
              <div>
                <div className="section-label" style={{ marginBottom: 8 }}>{t('inventory.productHistory')}</div>
                {inv.movements.filter((m) => m.productId === edit.id).slice(0, 6).map((m) => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-2)' }}>
                      <button onClick={() => { setEdit(null); ctx.go('ticketDetail', { id: m.ticketId }); }} className="mono" style={{ border: 'none', background: 'transparent', color: 'var(--navy-700)', fontWeight: 600, cursor: 'pointer', padding: 0 }}>{m.ticketNum}</button>
                      {' · '}{[m.client, m.site].filter(Boolean).join(' · ')}
                    </span>
                    <span><b>-{m.qty}</b> <span className="mono" style={{ color: 'var(--text-3)' }}>{(m.at || '').split(' ')[0]}</span></span>
                  </div>
                ))}
                {inv.movements.filter((m) => m.productId === edit.id).length === 0 && <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>—</div>}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal importar */}
      <Modal
        open={!!importRows}
        onClose={() => setImportRows(null)}
        width={620}
        title={t('inventory.importTitle')}
        sub={t('inventory.importHint')}
        footer={<><Button variant="ghost" onClick={() => setImportRows(null)}>{t('common.cancel')}</Button><Button variant="primary" icon="upload" onClick={confirmImport}>{t('inventory.confirmImport', { count: importRows?.length || 0 })}</Button></>}
      >
        {importRows && (
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 8 }}>{t('inventory.rowsDetected', { count: importRows.length })}</div>
            <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
              <table className="data-table">
                <thead><tr><th>{t('inventory.name')}</th><th>{t('inventory.quantity')}</th><th>{t('inventory.minQty')}</th><th>{t('inventory.link')}</th></tr></thead>
                <tbody>
                  {importRows.slice(0, 100).map((r, i) => (
                    <tr key={i}><td style={{ fontWeight: 600 }}>{r.name}</td><td>{r.quantity}</td><td>{r.minQty}</td><td className="truncate" style={{ maxWidth: 180, color: 'var(--text-2)' }}>{r.purchaseLink || '—'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
