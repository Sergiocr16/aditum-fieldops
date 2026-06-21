/* © 2026 Aditum — Aditum FieldOps — Equipment: global list, form modal, types manager, CSV import */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, Button, Modal, Field, Input, Select, EmptyState, EquipmentConditionBadge, CONDITIONS, toast, confirmDialog } from '../../components/ui';
import CsvImport from '../../components/CsvImport';
import { PageHeader } from './AdminShell';
import { useContracts, PERIODICITY_OPTIONS } from '../../lib/contracts';
import { useEquipment } from '../../lib/equipment';
import { perLabel } from './Contracts';
import { now, formatDate } from '../../lib/time';
import type { AppCtx } from '../../lib/ctx';
import type { Equipment } from '../../lib/types';

export const EQUIPMENT_CSV_COLUMNS = [
  { key: 'typeName', label: 'Tipo', required: true, aliases: ['tipo', 'tipo de equipo', 'type'] },
  { key: 'brand', label: 'Marca', aliases: ['brand'] },
  { key: 'model', label: 'Modelo', aliases: ['model'] },
  { key: 'serial', label: 'Serie', aliases: ['serie', 'serial', 'no. serie', 'numero de serie'] },
  { key: 'location', label: 'Ubicación', aliases: ['ubicacion', 'location', 'servicio'] },
  { key: 'technician', label: 'Técnico', aliases: ['tecnico', 'technician', 'ingeniero'] },
  { key: 'periodicityMonths', label: 'Periodicidad (meses)', aliases: ['periodicidad', 'meses', 'frecuencia'] },
  { key: 'nextScheduledDate', label: 'Próxima visita', aliases: ['proxima visita', 'proxima fecha', 'next'] },
  { key: 'notes', label: 'Notas', aliases: ['notas', 'observaciones'] },
];

/* ------------ equipment form modal (shared with ContractDetail) ------------ */
export function EquipmentFormModal({
  open,
  onClose,
  ctx,
  contractIdFixed,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  ctx: AppCtx;
  contractIdFixed?: string;
  editing?: Equipment | null;
}) {
  const { t } = useTranslation();
  const { contracts } = useContracts();
  const eq = useEquipment();
  const [f, setF] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  // re-initialize whenever the modal opens (editing target changes between opens)
  useEffect(() => {
    if (!open) {
      setF(null);
      return;
    }
    setF({
      contractId: editing?.contractId || contractIdFixed || '',
      typeId: editing?.typeId || '',
      brand: editing?.brand || '',
      model: editing?.model || '',
      serial: editing?.serial || '',
      location: editing?.location || '',
      assignedTechId: editing?.assignedTechId || '',
      periodicityMonths: editing?.periodicityMonths ?? '',
      nextScheduledDate: editing?.nextScheduledDate || '',
      condition: editing?.condition || 'operativo',
      notes: editing?.notes || '',
    });
  }, [open, editing?.id, contractIdFixed]);

  if (!open || !f) return null;

  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.contractId || !f.typeId) {
      toast(t('equipment.requiredErr'), 'error');
      return;
    }
    setBusy(true);
    try {
      const payload: Partial<Equipment> = {
        contractId: f.contractId,
        typeId: f.typeId,
        brand: f.brand.trim(),
        model: f.model.trim(),
        serial: f.serial.trim(),
        location: f.location.trim(),
        assignedTechId: f.assignedTechId || null,
        periodicityMonths: f.periodicityMonths === '' ? null : (Number(f.periodicityMonths) as any),
        nextScheduledDate: f.nextScheduledDate || null,
        condition: f.condition,
        notes: f.notes,
      };
      if (editing) {
        // Si el admin cambió la condición, registrar entrada en el historial.
        if ((editing.condition || 'operativo') !== f.condition) {
          payload.conditionHistory = [...(editing.conditionHistory || []), { condition: f.condition, at: now(), by: 'Admin · ' + (ctx.admin?.name || ''), note: t('equipment.changedManually') }];
        }
        await eq.updateEquipment(editing.id, payload);
        toast(t('equipment.savedEdit'), 'success');
      } else {
        await eq.addEquipment(payload);
        toast(t('equipment.savedNew'), 'success');
      }
      onClose();
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={editing ? t('equipment.editTitle') : t('equipment.newTitle')} width={620}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
        <Button onClick={save} disabled={busy}>{busy ? '…' : t('common.save')}</Button>
      </>}>
      <div className="form-grid">
        {!contractIdFixed && (
          <Field label={t('equipment.fContract')} required>
            <Select value={f.contractId} onChange={(e: any) => set('contractId', e.target.value)}>
              <option value="">—</option>
              {contracts.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.num} · {c.clientName}</option>)}
            </Select>
          </Field>
        )}
        <Field label={t('equipment.fType')} required>
          <Select value={f.typeId} onChange={(e: any) => set('typeId', e.target.value)}>
            <option value="">—</option>
            {eq.types.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </Field>
        <Field label={t('equipment.fBrand')}>
          <Input value={f.brand} onChange={(e: any) => set('brand', e.target.value)} />
        </Field>
        <Field label={t('equipment.fModel')}>
          <Input value={f.model} onChange={(e: any) => set('model', e.target.value)} />
        </Field>
        <Field label={t('equipment.fSerial')}>
          <Input value={f.serial} onChange={(e: any) => set('serial', e.target.value)} />
        </Field>
        <Field label={t('equipment.fLocation')} hint={t('equipment.fLocationHint')}>
          <Input value={f.location} onChange={(e: any) => set('location', e.target.value)} />
        </Field>
        <Field label={t('equipment.fTech')} hint={t('equipment.fTechHint')}>
          <Select value={f.assignedTechId} onChange={(e: any) => set('assignedTechId', e.target.value)}>
            <option value="">{t('equipment.contractDefault')}</option>
            {ctx.db.technicians.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </Field>
        <Field label={t('equipment.fNext')} hint={t('equipment.fNextHint')}>
          <Input type="date" value={f.nextScheduledDate} onChange={(e: any) => set('nextScheduledDate', e.target.value)} />
        </Field>
        <Field label={t('equipment.condition')}>
          <Select value={f.condition} onChange={(e: any) => set('condition', e.target.value)}>
            {CONDITIONS.map((c) => <option key={c} value={c}>{t('equipment.cond_' + c)}</option>)}
          </Select>
        </Field>
        <Field label={t('equipment.fNotes')}>
          <Input value={f.notes} onChange={(e: any) => set('notes', e.target.value)} />
        </Field>
      </div>
      {editing && (editing.conditionHistory || []).length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="section-label" style={{ marginBottom: 8 }}>{t('equipment.history')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[...(editing.conditionHistory || [])].reverse().map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                <EquipmentConditionBadge condition={h.condition} size="sm" />
                <span className="mono" style={{ color: 'var(--text-3)' }}>{formatDate(h.at)}{h.orderNum ? ' · ' + h.orderNum : ''}</span>
                <span style={{ color: 'var(--text-3)' }}>{h.by}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ------------ types manager (pantalla propia) ------------ */
export function EquipmentTypesScreen({ ctx }: { ctx: AppCtx }) {
  const { t } = useTranslation();
  const eq = useEquipment();
  const [name, setName] = useState('');

  const [adding, setAdding] = useState(false);
  const add = async () => {
    const n = name.trim();
    if (!n) {
      toast(t('equipment.typeNameRequired'), 'error');
      return;
    }
    const exists = eq.types.some((x) => (x.name || '').trim().toLowerCase() === n.toLowerCase());
    if (exists) {
      toast(t('equipment.typeExists'), 'error');
      return;
    }
    setAdding(true);
    try {
      await eq.addType(n);
      setName('');
      toast(t('equipment.typeAdded'), 'success');
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="fade-in">
      <PageHeader title={t('equipment.typesTitle')} sub={t('equipment.typesSub')} back={() => ctx.go('equipment')} />
      <div className="card card-pad">
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, maxWidth: 520 }}>
          <div style={{ flex: 1 }}>
            <Input placeholder={t('equipment.typePh')} value={name} onChange={(e: any) => setName(e.target.value)} onKeyDown={(e: any) => e.key === 'Enter' && add()} />
          </div>
          <Button icon="plus" onClick={add} disabled={adding}>{adding ? '…' : t('common.create')}</Button>
        </div>
        {eq.types.length === 0 ? (
          <EmptyState icon="cpu" title={t('equipment.noTypes')} sub={t('equipment.noTypesSub')} />
        ) : (
          eq.types.map((x) => (
            <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
              <Icon name="cpu" size={16} style={{ color: 'var(--text-3)' }} />
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600, textDecoration: x.active ? 'none' : 'line-through', color: x.active ? 'var(--text)' : 'var(--text-3)' }}>{x.name}</span>
              <span style={{ fontSize: 11.5, color: 'var(--text-3)' }} className="mono">
                {x.activeTemplateVersion > 0 ? `checklist v${x.activeTemplateVersion}` : t('equipment.noTemplate')}
              </span>
              <Button size="sm" variant="ghost" icon="edit" onClick={() => ctx.go('templateEditor', { typeId: x.id })}>
                {t('equipment.editTemplate')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => eq.updateType(x.id, { active: !x.active })}>
                {x.active ? t('equipment.typeDisable') : t('equipment.typeEnable')}
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ------------ main screen ------------ */
export default function EquipmentScreen({ ctx }: { ctx: AppCtx }) {
  const { t } = useTranslation();
  const { contracts } = useContracts();
  const eq = useEquipment();
  const [search, setSearch] = useState('');
  const [fContract, setFContract] = useState('');
  const [fType, setFType] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Equipment | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importContract, setImportContract] = useState('');

  const contractOf = (id: string) => contracts.find((c) => c.id === id);
  const techName = (id: string | null) => ctx.db.technicians.find((x) => x.id === id)?.name;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return eq.equipment.filter((e) => {
      if (fContract && e.contractId !== fContract) return false;
      if (fType && e.typeId !== fType) return false;
      if (q && ![e.brand, e.model, e.serial, e.location, eq.typeName(e.typeId)].some((x) => (x || '').toLowerCase().includes(q))) return false;
      return true;
    });
  }, [eq.equipment, search, fContract, fType, eq.types]);

  const remove = async (e: Equipment) => {
    const ok = await confirmDialog({ title: t('equipment.deleteTitle'), message: t('equipment.deleteMsg'), tone: 'danger', confirmLabel: t('common.delete') });
    if (ok) {
      await eq.deleteEquipment(e.id);
      toast(t('equipment.deleted'), 'success');
    }
  };

  return (
    <div className="fade-in">
      <PageHeader
        title={t('equipment.title')}
        sub={t('equipment.sub')}
        action={
          <>
            <Button variant="ghost" icon="settings" onClick={() => ctx.go('equipmentTypes')}>{t('equipment.typesBtn')}</Button>
            <Button variant="ghost" icon="upload" onClick={() => setImportOpen(true)}>{t('equipment.importBtn')}</Button>
            <Button icon="plus" variant="gold" onClick={() => { setEditing(null); setFormOpen(true); }}>{t('equipment.new')}</Button>
          </>
        }
      />

      <div className="card" style={{ marginBottom: 16, padding: '12px 16px', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 220px' }}>
          <Input icon="search" placeholder={t('equipment.searchPh')} value={search} onChange={(e: any) => setSearch(e.target.value)} />
        </div>
        <div style={{ width: 220 }}>
          <Select value={fContract} onChange={(e: any) => setFContract(e.target.value)}>
            <option value="">{t('equipment.allContracts')}</option>
            {contracts.map((c) => <option key={c.id} value={c.id}>{c.num} · {c.clientName}</option>)}
          </Select>
        </div>
        <div style={{ width: 200 }}>
          <Select value={fType} onChange={(e: any) => setFType(e.target.value)}>
            <option value="">{t('equipment.allTypes')}</option>
            {eq.types.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </div>
      </div>

      {!eq.loading && filtered.length === 0 ? (
        <EmptyState icon="wrench" title={t('equipment.empty')} sub={t('equipment.emptySub')} />
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('equipment.thType')}</th>
                <th>{t('equipment.thBrandModel')}</th>
                <th>{t('equipment.thSerial')}</th>
                <th className="hide-sm">{t('equipment.thLocation')}</th>
                <th className="hide-sm">{t('equipment.thContract')}</th>
                <th>{t('equipment.thTech')}</th>
                <th>{t('equipment.thState')}</th>
                <th>{t('equipment.thNext')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const c = contractOf(e.contractId);
                return (
                  <tr key={e.id}>
                    <td style={{ fontWeight: 600 }}>{eq.typeName(e.typeId)}</td>
                    <td>{[e.brand, e.model].filter(Boolean).join(' ') || '—'}</td>
                    <td className="mono" style={{ fontSize: 12.5 }}>{e.serial || '—'}</td>
                    <td className="hide-sm">{e.location || '—'}</td>
                    <td className="hide-sm">
                      <span className="mono" style={{ fontSize: 12.5 }}>{c?.num || '—'}</span>
                      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{c?.clientName}</div>
                    </td>
                    <td style={{ fontSize: 12.5 }}>{techName(e.assignedTechId) || (c && techName(c.defaultTechId)) || '—'}</td>
                    <td><EquipmentConditionBadge condition={e.condition} size="sm" /></td>
                    <td className="mono" style={{ fontSize: 12.5 }}>{e.nextScheduledDate || '—'}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="icon-btn" style={{ width: 30, height: 30 }} title={t('common.edit')} onClick={() => { setEditing(e); setFormOpen(true); }}>
                        <Icon name="edit" size={14} />
                      </button>
                      <button className="icon-btn" style={{ width: 30, height: 30 }} title={t('common.delete')} onClick={() => remove(e)}>
                        <Icon name="trash" size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <EquipmentFormModal open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} ctx={ctx} editing={editing} />

      <Modal open={importOpen && !importContract} onClose={() => setImportOpen(false)} title={t('equipment.importBtn')} sub={t('equipment.importPickContract')} width={480}
        footer={<Button variant="ghost" onClick={() => setImportOpen(false)}>{t('common.cancel')}</Button>}>
        <Field label={t('equipment.fContract')} required>
          <Select value={importContract} onChange={(e: any) => setImportContract(e.target.value)}>
            <option value="">—</option>
            {contracts.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.num} · {c.clientName}</option>)}
          </Select>
        </Field>
      </Modal>

      <CsvImport
        open={importOpen && !!importContract}
        onClose={() => { setImportOpen(false); setImportContract(''); }}
        title={t('equipment.importTitle', { contract: contractOf(importContract)?.num || '' })}
        columns={EQUIPMENT_CSV_COLUMNS}
        templateName="plantilla-equipos"
        onImport={(rows) => eq.importRows(importContract, rows as any)}
      />
    </div>
  );
}
