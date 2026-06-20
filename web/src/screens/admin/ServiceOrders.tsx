/* © 2026 Aditum — Aditum FieldOps — Service orders list (admin) + corrective creation */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, Button, Modal, Field, Input, Select, Textarea, EmptyState, SOStatusBadge, toast } from '../../components/ui';
import ChecklistEditor, { type ChecklistEditorItem } from '../../components/ChecklistEditor';
import { PageHeader } from './AdminShell';
import { useContracts } from '../../lib/contracts';
import { useEquipment } from '../../lib/equipment';
import { useServiceOrdersRange, useServiceOrderActions, soEquipments } from '../../lib/serviceOrders';
import { today } from '../../lib/time';
import type { AppCtx } from '../../lib/ctx';

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export function CorrectiveModal({ open, onClose, ctx, onCreated }: { open: boolean; onClose: () => void; ctx: AppCtx; onCreated?: (id: string) => void }) {
  const { t } = useTranslation();
  const { contracts } = useContracts();
  const actions = useServiceOrderActions();
  const [contractId, setContractId] = useState('');
  const eq = useEquipment(contractId || undefined);
  const [equipmentIds, setEquipmentIds] = useState<string[]>([]);
  const [f, setF] = useState({ techId: '', scheduledDate: today(), scheduledTime: '08:00', notes: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setContractId('');
      setEquipmentIds([]);
      setF({ techId: '', scheduledDate: today(), scheduledTime: '08:00', notes: '' });
    }
  }, [open]);

  const contract = contracts.find((c) => c.id === contractId);
  const toggleEq = (id: string) => setEquipmentIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const create = async () => {
    const chosen = eq.equipment.filter((e) => equipmentIds.includes(e.id));
    if (!contract || !chosen.length || !f.scheduledDate) {
      toast(t('serviceOrders.requiredErr'), 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await actions.createCorrective({
        contractId: contract.id,
        equipments: chosen.map((equipment) => ({
          equipmentId: equipment.id,
          equipmentSnapshot: {
            typeId: equipment.typeId,
            typeName: eq.typeName(equipment.typeId),
            brand: equipment.brand || '',
            model: equipment.model || '',
            serial: equipment.serial || '',
            location: equipment.location || '',
          },
        })),
        client: { name: contract.clientName, email: contract.clientEmail || '', phone: contract.clientPhone || '' },
        techId: f.techId || contract.defaultTechId || null,
        scheduledDate: f.scheduledDate,
        scheduledTime: f.scheduledTime,
        notes: f.notes,
      });
      toast(t('serviceOrders.correctiveCreated', { num: res.num }), 'success');
      onClose();
      onCreated?.(res.id);
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('serviceOrders.newCorrective')} sub={t('serviceOrders.newCorrectiveSub')} width={620}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
        <Button onClick={create} disabled={busy}>{busy ? '…' : t('common.create')}</Button>
      </>}>
      <div className="form-grid">
        <Field label={t('equipment.fContract')} required>
          <Select value={contractId} onChange={(e: any) => { setContractId(e.target.value); setEquipmentIds([]); }}>
            <option value="">—</option>
            {contracts.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.num} · {c.clientName}</option>)}
          </Select>
        </Field>
        <Field label={t('serviceOrders.fDate')} required>
          <Input type="date" value={f.scheduledDate} onChange={(e: any) => setF((p) => ({ ...p, scheduledDate: e.target.value }))} />
        </Field>
        <Field label={t('serviceOrders.fTime')}>
          <Input type="time" value={f.scheduledTime} onChange={(e: any) => setF((p) => ({ ...p, scheduledTime: e.target.value }))} />
        </Field>
        <Field label={t('serviceOrders.fTech')} hint={t('equipment.fTechHint')}>
          <Select value={f.techId} onChange={(e: any) => setF((p) => ({ ...p, techId: e.target.value }))}>
            <option value="">{t('equipment.contractDefault')}</option>
            {ctx.db.technicians.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field label={t('serviceOrders.fEquipments')} required hint={t('serviceOrders.fEquipmentsHint')}>
        {!contractId ? (
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{t('serviceOrders.pickContractFirst')}</div>
        ) : eq.equipment.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{t('serviceOrders.noEquipment')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
            {eq.equipment.map((e) => (
              <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid ' + (equipmentIds.includes(e.id) ? 'var(--gold)' : 'var(--border)'), borderRadius: 10, cursor: 'pointer', background: equipmentIds.includes(e.id) ? 'var(--gold-50)' : 'transparent' }}>
                <input type="checkbox" checked={equipmentIds.includes(e.id)} onChange={() => toggleEq(e.id)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{eq.typeName(e.typeId)}</div>
                  <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{e.serial || e.location || e.id.slice(0, 6)}</div>
                </div>
              </label>
            ))}
          </div>
        )}
      </Field>
      <Field label={t('serviceOrders.fNotes')} hint={t('serviceOrders.fNotesHint')}>
        <Textarea rows={3} value={f.notes} onChange={(e: any) => setF((p) => ({ ...p, notes: e.target.value }))} />
      </Field>
    </Modal>
  );
}

export function DemandModal({ open, onClose, ctx, onCreated }: { open: boolean; onClose: () => void; ctx: AppCtx; onCreated?: (id: string) => void }) {
  const { t } = useTranslation();
  const actions = useServiceOrderActions();
  const empty = { title: '', clientName: '', clientEmail: '', clientPhone: '', site: '', address: '', priority: 'media', techId: '', scheduledDate: today(), scheduledTime: '08:00', description: '', requiresInvoice: false };
  const [f, setF] = useState(empty);
  const [checklist, setChecklist] = useState<ChecklistEditorItem[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => { if (!open) { setF(empty); setChecklist([]); } }, [open]);

  const create = async () => {
    if (!f.title.trim() || !f.clientName.trim()) {
      toast(t('serviceOrders.demandRequiredErr'), 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await actions.createDemand({
        title: f.title.trim(),
        client: { name: f.clientName.trim(), email: f.clientEmail.trim(), phone: f.clientPhone.trim() },
        site: f.site.trim(),
        address: f.address.trim(),
        priority: f.priority,
        techId: f.techId || null,
        scheduledDate: f.scheduledDate,
        scheduledTime: f.scheduledTime,
        description: f.description.trim(),
        checklistItems: checklist.map((c) => c.text.trim()).filter(Boolean),
        requiresReview: true,
        requiresInvoice: f.requiresInvoice,
      });
      toast(t('serviceOrders.demandCreated', { num: res.num }), 'success');
      onClose();
      onCreated?.(res.id);
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('serviceOrders.newDemand')} sub={t('serviceOrders.newDemandSub')} width={620}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
        <Button onClick={create} disabled={busy}>{busy ? '…' : t('common.create')}</Button>
      </>}>
      <div className="form-grid">
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label={t('serviceOrders.fTitle')} required>
            <Input value={f.title} onChange={(e: any) => set('title', e.target.value)} />
          </Field>
        </div>
        <Field label={t('serviceOrders.fClientName')} required>
          <Input value={f.clientName} onChange={(e: any) => set('clientName', e.target.value)} />
        </Field>
        <Field label={t('serviceOrders.fClientEmail')}>
          <Input type="email" value={f.clientEmail} onChange={(e: any) => set('clientEmail', e.target.value)} />
        </Field>
        <Field label={t('serviceOrders.fSite')}>
          <Input value={f.site} onChange={(e: any) => set('site', e.target.value)} />
        </Field>
        <Field label={t('serviceOrders.fAddress')}>
          <Input value={f.address} onChange={(e: any) => set('address', e.target.value)} />
        </Field>
        <Field label={t('serviceOrders.fPriority')}>
          <Select value={f.priority} onChange={(e: any) => set('priority', e.target.value)}>
            {['baja', 'media', 'alta', 'urgente'].map((p) => <option key={p} value={p}>{t('priority.' + p)}</option>)}
          </Select>
        </Field>
        <Field label={t('serviceOrders.fTech')}>
          <Select value={f.techId} onChange={(e: any) => set('techId', e.target.value)}>
            <option value="">—</option>
            {ctx.db.technicians.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </Field>
        <Field label={t('serviceOrders.fDate')} required>
          <Input type="date" value={f.scheduledDate} onChange={(e: any) => set('scheduledDate', e.target.value)} />
        </Field>
        <Field label={t('serviceOrders.fTime')}>
          <Input type="time" value={f.scheduledTime} onChange={(e: any) => set('scheduledTime', e.target.value)} />
        </Field>
      </div>
      <Field label={t('serviceOrders.fDescription')}>
        <Textarea rows={3} value={f.description} onChange={(e: any) => set('description', e.target.value)} />
      </Field>
      <div style={{ marginTop: 12 }}>
        <div className="section-label" style={{ marginBottom: 8 }}>{t('serviceOrders.checklist')}</div>
        <ChecklistEditor items={checklist} setItems={setChecklist} />
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, cursor: 'pointer', fontSize: 13.5 }}>
        <input type="checkbox" checked={f.requiresInvoice} onChange={(e: any) => set('requiresInvoice', e.target.checked)} />
        {t('serviceOrders.fRequiresInvoice')}
      </label>
    </Modal>
  );
}

export default function ServiceOrders({ ctx }: { ctx: AppCtx }) {
  const { t } = useTranslation();
  const [range, setRange] = useState({ from: addDays(today(), -30), to: addDays(today(), 60) });
  const [fStatus, setFStatus] = useState('');
  const [fTech, setFTech] = useState('');
  const [search, setSearch] = useState('');
  const [correctiveOpen, setCorrectiveOpen] = useState(false);
  const [demandOpen, setDemandOpen] = useState(false);
  const [fMode, setFMode] = useState('');
  const [schedBusy, setSchedBusy] = useState(false);
  const { orders, loading } = useServiceOrdersRange(range.from, range.to);
  const actions = useServiceOrderActions();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (fStatus && o.status !== fStatus) return false;
      if (fTech && o.techId !== fTech) return false;
      if (fMode && (o.mode || 'periodico') !== fMode) return false;
      const eqText = soEquipments(o).map((e) => [e.equipmentSnapshot?.typeName, e.equipmentSnapshot?.serial, e.equipmentSnapshot?.location].join(' ')).join(' ');
      if (q && ![o.num, o.client?.name, o.title, eqText].some((x) => (x || '').toLowerCase().includes(q))) return false;
      return true;
    });
  }, [orders, fStatus, fTech, fMode, search]);

  const techName = (id: string | null) => ctx.db.technicians.find((x) => x.id === id)?.name || '—';

  const runScheduler = async () => {
    setSchedBusy(true);
    try {
      const res = await actions.runScheduler();
      const s = res.stats?.[0]?.generate;
      toast(t('serviceOrders.schedulerDone', { created: s?.created ?? 0 }), 'success');
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    } finally {
      setSchedBusy(false);
    }
  };

  const STATUSES = ['PROGRAMADA', 'NOTIFICADA', 'CONFIRMADA', 'REAGENDADA', 'EN_PROGRESO', 'SERVICIO_TERMINADO', 'EN_REVISION', 'PENDIENTE_FACTURAR', 'FACTURADA', 'CERRADA', 'CANCELADA'];

  return (
    <div className="fade-in">
      <PageHeader
        title={t('serviceOrders.title')}
        sub={t('serviceOrders.sub')}
        action={
          <>
            <Button variant="ghost" icon="refresh" onClick={runScheduler} disabled={schedBusy}>{schedBusy ? '…' : t('serviceOrders.runScheduler')}</Button>
            <Button icon="plus" onClick={() => setCorrectiveOpen(true)}>{t('serviceOrders.newCorrective')}</Button>
            <Button icon="plus" variant="gold" onClick={() => setDemandOpen(true)}>{t('serviceOrders.newDemand')}</Button>
          </>
        }
      />

      <div className="card" style={{ marginBottom: 16, padding: '12px 16px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 200px' }}>
          <Input icon="search" placeholder={t('serviceOrders.searchPh')} value={search} onChange={(e: any) => setSearch(e.target.value)} />
        </div>
        <div style={{ width: 190 }}>
          <Select value={fStatus} onChange={(e: any) => setFStatus(e.target.value)}>
            <option value="">{t('serviceOrders.allStatuses')}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t('soStatus.' + s)}</option>)}
          </Select>
        </div>
        <div style={{ width: 180 }}>
          <Select value={fTech} onChange={(e: any) => setFTech(e.target.value)}>
            <option value="">{t('serviceOrders.allTechs')}</option>
            {ctx.db.technicians.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </div>
        <div style={{ width: 160 }}>
          <Select value={fMode} onChange={(e: any) => setFMode(e.target.value)}>
            <option value="">{t('serviceOrders.allModes')}</option>
            <option value="periodico">{t('serviceOrders.mode_periodico')}</option>
            <option value="demanda">{t('serviceOrders.mode_demanda')}</option>
          </Select>
        </div>
        <Input type="date" value={range.from} onChange={(e: any) => setRange((r) => ({ ...r, from: e.target.value }))} style={{ width: 150 }} />
        <span style={{ color: 'var(--text-3)' }}>→</span>
        <Input type="date" value={range.to} onChange={(e: any) => setRange((r) => ({ ...r, to: e.target.value }))} style={{ width: 150 }} />
      </div>

      {!loading && filtered.length === 0 ? (
        <EmptyState icon="calendar" title={t('serviceOrders.empty')} sub={t('serviceOrders.emptySub')} />
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('serviceOrders.thNum')}</th>
                <th>{t('serviceOrders.thDate')}</th>
                <th>{t('serviceOrders.thEquipment')}</th>
                <th className="hide-sm">{t('serviceOrders.thClient')}</th>
                <th className="hide-sm">{t('serviceOrders.thTech')}</th>
                <th>{t('serviceOrders.thType')}</th>
                <th>{t('serviceOrders.thStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => ctx.go('soDetail', { id: o.id })}>
                  <td className="mono" style={{ fontWeight: 700 }}>{o.num}</td>
                  <td className="mono" style={{ fontSize: 12.5 }}>{o.scheduledDate} {o.scheduledTime}</td>
                  <td>
                    {(() => {
                      const eqs = soEquipments(o);
                      if (!eqs.length) return <><div style={{ fontWeight: 600 }}>{o.title || '—'}</div><div style={{ fontSize: 11.5, color: 'var(--text-3)' }} className="mono">{o.site || ''}</div></>;
                      return <>
                        <div style={{ fontWeight: 600 }}>{eqs[0].equipmentSnapshot?.typeName || '—'}{eqs.length > 1 ? ` +${eqs.length - 1}` : ''}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-3)' }} className="mono">{eqs.length > 1 ? t('serviceOrders.nEquipment', { count: eqs.length }) : (eqs[0].equipmentSnapshot?.serial || eqs[0].equipmentSnapshot?.location || '')}</div>
                      </>;
                    })()}
                  </td>
                  <td className="hide-sm">{o.client?.name}</td>
                  <td className="hide-sm" style={{ fontSize: 12.5 }}>{techName(o.techId)}</td>
                  <td>
                    <span className="badge" style={{ fontSize: 11.5 }}>
                      <Icon name={(o.mode || 'periodico') === 'demanda' ? 'zap' : 'refresh'} size={12} />
                      {t('serviceOrders.mode_' + (o.mode || 'periodico'))}
                    </span>
                  </td>
                  <td><SOStatusBadge status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CorrectiveModal open={correctiveOpen} onClose={() => setCorrectiveOpen(false)} ctx={ctx} onCreated={(id) => ctx.go('soDetail', { id })} />
      <DemandModal open={demandOpen} onClose={() => setDemandOpen(false)} ctx={ctx} onCreated={(id) => ctx.go('soDetail', { id })} />
    </div>
  );
}
