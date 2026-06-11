/* © 2026 Aditum — Aditum FieldOps — Clientes receptores (datos fiscales) */
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';
import { Icon, Button, Input, Field, Select, Modal, SearchSelect, EmptyState, toast, confirmDialog } from '../../components/ui';
import { PageHeader } from './AdminShell';
import { useClients } from '../../lib/clients';
import { IDENT_TYPES } from '../../lib/fiscal';
import { useActivity, useTerritorial } from '../../lib/fiscalCatalogs';
import type { AppCtx } from '../../lib/ctx';
import type { Client } from '../../lib/types';

/** Cascada Provincia→Cantón→Distrito→Barrio. Guarda el `fiscal_id` numérico de cada nivel. */
function TerritorialPicker({ value, onChange }: { value: Partial<Client>; onChange: (patch: Partial<Client>) => void }) {
  const { t } = useTranslation();
  const ter = useTerritorial();
  const provRow = ter.findChild(null, value.province as any);
  const cantRow = provRow ? ter.findChild(provRow.id, value.canton as any) : undefined;
  const distRow = cantRow ? ter.findChild(cantRow.id, value.district as any) : undefined;
  const barRow = distRow ? ter.findChild(distRow.id, value.neighborhood as any) : undefined;
  const numOf = (row: any) => (row ? Number(row.fid) : null);

  const Level = ({ label, options, selected, disabled, onPick }: any) => (
    <Field label={label}>
      <Select value={selected ? String(selected.id) : ''} disabled={disabled} onChange={(e: any) => onPick(options.find((r: any) => String(r.id) === e.target.value) || null)}>
        <option value="">{disabled ? '—' : t('clients.locSelect')}</option>
        {options.map((r: any) => <option key={r.id} value={r.id}>{r.n}</option>)}
      </Select>
    </Field>
  );

  return (
    <div>
      <div className="section-label" style={{ marginBottom: 8 }}>{t('clients.location')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        <Level label={t('clients.province')} options={ter.provinces()} selected={provRow}
          onPick={(r: any) => onChange({ province: numOf(r), canton: null, district: null, neighborhood: null })} />
        <Level label={t('clients.canton')} options={provRow ? ter.childrenOf(provRow.id) : []} selected={cantRow} disabled={!provRow}
          onPick={(r: any) => onChange({ canton: numOf(r), district: null, neighborhood: null })} />
        <Level label={t('clients.district')} options={cantRow ? ter.childrenOf(cantRow.id) : []} selected={distRow} disabled={!cantRow}
          onPick={(r: any) => onChange({ district: numOf(r), neighborhood: null })} />
        <Level label={t('clients.neighborhood')} options={distRow ? ter.childrenOf(distRow.id) : []} selected={barRow} disabled={!distRow}
          onPick={(r: any) => onChange({ neighborhood: numOf(r) })} />
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>{t('clients.locationHint')}</div>
    </div>
  );
}

export const identLabel = (t: any, code?: number) => {
  const m = IDENT_TYPES.find((x) => x.code === Number(code));
  return m ? t('clients.identType_' + m.key) : '—';
};

/** Lee una celda buscando por coincidencia parcial de encabezado (tolerante a acentos/variantes). */
const COL = (row: any, ...keys: string[]) => {
  for (const k of Object.keys(row)) {
    const norm = k.trim().toLowerCase();
    if (keys.some((x) => norm.includes(x))) return row[k];
  }
  return undefined;
};

/** Acepta el tipo de identificación como número (1-4) o texto (fisica/juridica/dimex/nite). */
const parseIdentType = (v: any): number => {
  const n = Number(v);
  if ([1, 2, 3, 4].includes(n)) return n;
  const s = String(v || '').toLowerCase();
  if (s.includes('jurid')) return 2;
  if (s.includes('dimex')) return 3;
  if (s.includes('nite')) return 4;
  return 1; // por defecto cédula física
};

export default function Clients({ ctx }: { ctx: AppCtx }) {
  const { t } = useTranslation();
  const clients = useClients();
  const activity = useActivity();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Partial<Client> | null>(null);
  const [importRows, setImportRows] = useState<Partial<Client>[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
        const parsed: Partial<Client>[] = json
          .map((r) => ({
            name: String(COL(r, 'nombre', 'name', 'razon') ?? '').trim(),
            identType: parseIdentType(COL(r, 'tipo', 'type')),
            identNumber: String(COL(r, 'identif', 'cedula', 'id') ?? '').trim(),
            email: String(COL(r, 'correo', 'email', 'mail') ?? '').trim(),
            comercialName: String(COL(r, 'comercial', 'trade') ?? '').trim(),
            activityCode: String(COL(r, 'actividad', 'activity') ?? '').trim(),
            ccEmails: String(COL(r, 'copia', 'cc') ?? '').trim(),
            direction: String(COL(r, 'direcc', 'address', 'señas', 'senas') ?? '').trim(),
            province: COL(r, 'provincia', 'province'),
            canton: COL(r, 'canton', 'cantón'),
            district: COL(r, 'distrito', 'district'),
            neighborhood: COL(r, 'barrio', 'neighborhood'),
            internalCode: String(COL(r, 'interno', 'internal', 'codigo', 'código') ?? '').trim(),
          }))
          .filter((r) => r.name && r.identNumber);
        if (!parsed.length) {
          toast(t('clients.noRows'), 'error');
          return;
        }
        setImportRows(parsed);
      } catch {
        toast(t('clients.importErr'), 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      { Nombre: '', 'Tipo identificación': '1 (física) / 2 (jurídica) / 3 (DIMEX) / 4 (NITE)', 'Identificación': '', Correo: '', 'Nombre comercial': '', 'Código actividad': '', 'Correos copia': '', 'Dirección': '', Provincia: '', 'Cantón': '', Distrito: '', Barrio: '', 'Código interno': '' },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
    XLSX.writeFile(wb, 'plantilla-clientes.xlsx');
  };

  const confirmImport = async () => {
    if (!importRows) return;
    const res = await clients.bulkUpsert(importRows);
    setImportRows(null);
    toast(t('clients.imported', res), 'success');
  };

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return clients.items;
    return clients.items.filter((c) => [c.name, c.identNumber, c.email, c.comercialName].some((x) => (x || '').toLowerCase().includes(s)));
  }, [clients.items, q]);

  const save = async () => {
    if (!edit?.name?.trim()) return toast(t('clients.requiredName'), 'error');
    if (!String(edit?.identNumber || '').trim()) return toast(t('clients.requiredId'), 'error');
    if (!edit?.email?.trim() || !/.+@.+\..+/.test(edit.email)) return toast(t('clients.requiredEmail'), 'error');
    if (edit.id) await clients.update(edit.id, edit);
    else await clients.create(edit);
    toast(edit.id ? t('common.saved') : t('clients.created'), 'success');
    setEdit(null);
  };

  return (
    <div className="fade-in">
      <PageHeader
        title={t('clients.title')}
        sub={t('clients.sub')}
        back={() => ctx.go('fiscalHub')}
        action={
          <>
            <Button variant="ghost" icon="download" onClick={downloadTemplate}>{t('clients.downloadTemplate')}</Button>
            <Button variant="ghost" icon="upload" onClick={() => fileRef.current?.click()}>{t('clients.import')}</Button>
            <Button variant="primary" icon="plus" onClick={() => setEdit({ identType: 1 })}>{t('clients.add')}</Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={onFile} />
          </>
        }
      />

      <div className="card" style={{ padding: '12px 14px', marginBottom: 14 }}>
        <div style={{ maxWidth: 320 }}>
          <Input icon="search" placeholder={t('clients.search')} value={q} onChange={(e: any) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('clients.name')}</th>
                <th>{t('clients.identType')}</th>
                <th>{t('clients.identNumber')}</th>
                <th>{t('clients.email')}</th>
                <th style={{ textAlign: 'right' }}>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5}><EmptyState icon="building" title={t('clients.emptyTitle')} sub={t('clients.emptySub')} /></td></tr>
              ) : (
                rows.map((c) => (
                  <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setEdit({ ...c })}>
                    <td style={{ fontWeight: 600 }}>{c.name}{c.comercialName ? <span style={{ color: 'var(--text-3)', fontWeight: 400 }}> · {c.comercialName}</span> : null}</td>
                    <td style={{ color: 'var(--text-2)' }}>{identLabel(t, c.identType)}</td>
                    <td className="mono" style={{ color: 'var(--text-2)' }}>{c.identNumber}</td>
                    <td style={{ color: 'var(--text-2)' }}>{c.email}</td>
                    <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="icon-btn" title={t('common.edit')} onClick={() => setEdit({ ...c })}><Icon name="edit" size={16} /></button>
                        <button className="icon-btn" style={{ color: 'var(--st-rech-fg)' }} title={t('common.delete')} onClick={async () => { if (await confirmDialog({ title: t('common.delete'), message: t('clients.deleteConfirm'), tone: 'danger', confirmLabel: t('common.delete'), confirmIcon: 'trash' })) { clients.remove(c.id); toast(t('common.deleted')); } }}><Icon name="trash" size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        width={560}
        title={edit?.id ? t('clients.edit') : t('clients.create')}
        sub={t('clients.formSub')}
        footer={<><Button variant="ghost" onClick={() => setEdit(null)}>{t('common.cancel')}</Button><Button variant="primary" icon="check" onClick={save}>{t('common.save')}</Button></>}
      >
        {edit && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label={t('clients.name')} required hint={t('clients.nameHint')}>
              <Input value={edit.name || ''} onChange={(e: any) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <div className="form-grid">
              <Field label={t('clients.identType')} required>
                <Select value={edit.identType ?? 1} onChange={(e: any) => setEdit({ ...edit, identType: Number(e.target.value) })}>
                  {IDENT_TYPES.map((it) => <option key={it.code} value={it.code}>{t('clients.identType_' + it.key)}</option>)}
                </Select>
              </Field>
              <Field label={t('clients.identNumber')} required>
                <Input value={edit.identNumber || ''} onChange={(e: any) => setEdit({ ...edit, identNumber: e.target.value })} />
              </Field>
            </div>
            <div className="form-grid">
              <Field label={t('clients.email')} required>
                <Input type="email" value={edit.email || ''} onChange={(e: any) => setEdit({ ...edit, email: e.target.value })} />
              </Field>
              <Field label={t('clients.ccEmails')} hint={t('clients.ccEmailsHint')}>
                <Input value={edit.ccEmails || ''} onChange={(e: any) => setEdit({ ...edit, ccEmails: e.target.value })} />
              </Field>
            </div>
            <div className="form-grid">
              <Field label={t('clients.comercialName')} hint={t('clients.comercialNameHint')}>
                <Input value={edit.comercialName || ''} onChange={(e: any) => setEdit({ ...edit, comercialName: e.target.value })} />
              </Field>
              <Field label={t('clients.activityCode')} hint={t('clients.activityCodeHint')}>
                <SearchSelect
                  value={edit.activityCode || ''}
                  items={activity.rows}
                  search={(s: string) => activity.search(s)}
                  toCode={(it: any) => it.c}
                  toLabel={(it: any) => it.n}
                  placeholder={t('gti.activitySearch')}
                  loadingHint={t('common.loading')}
                  onPick={(it: any) => setEdit((cur) => ({ ...cur, activityCode: it ? it.c : '' }))}
                />
              </Field>
            </div>
            <Field label={t('clients.direction')}>
              <Input value={edit.direction || ''} onChange={(e: any) => setEdit({ ...edit, direction: e.target.value })} />
            </Field>
            <TerritorialPicker value={edit} onChange={(patch) => setEdit((cur) => ({ ...cur, ...patch }))} />
            <Field label={t('clients.internalCode')}>
              <Input value={edit.internalCode || ''} onChange={(e: any) => setEdit({ ...edit, internalCode: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        open={!!importRows}
        onClose={() => setImportRows(null)}
        width={620}
        title={t('clients.importTitle')}
        sub={t('clients.importHint')}
        footer={<><Button variant="ghost" onClick={() => setImportRows(null)}>{t('common.cancel')}</Button><Button variant="primary" icon="upload" onClick={confirmImport}>{t('clients.confirmImport', { count: importRows?.length || 0 })}</Button></>}
      >
        {importRows && (
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 8 }}>{t('clients.rowsDetected', { count: importRows.length })}</div>
            <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
              <table className="data-table">
                <thead><tr><th>{t('clients.name')}</th><th>{t('clients.identType')}</th><th>{t('clients.identNumber')}</th><th>{t('clients.email')}</th></tr></thead>
                <tbody>
                  {importRows.slice(0, 100).map((r, i) => (
                    <tr key={i}><td style={{ fontWeight: 600 }}>{r.name}</td><td style={{ color: 'var(--text-2)' }}>{identLabel(t, r.identType)}</td><td className="mono">{r.identNumber}</td><td className="truncate" style={{ maxWidth: 180, color: 'var(--text-2)' }}>{r.email || '—'}</td></tr>
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
