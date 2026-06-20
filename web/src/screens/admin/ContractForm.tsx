/* © 2026 Aditum — Aditum FieldOps — Contract create/edit form (admin) */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Field, Input, Select, Textarea, toast } from '../../components/ui';
import { PageHeader } from './AdminShell';
import { useContracts, PERIODICITY_OPTIONS } from '../../lib/contracts';
import { perLabel } from './Contracts';
import type { AppCtx } from '../../lib/ctx';

export default function ContractForm({ ctx, mode, id }: { ctx: AppCtx; mode: string; id?: string }) {
  const { t } = useTranslation();
  const { contracts, addContract, updateContract } = useContracts();
  const editing = mode === 'edit';
  const existing = editing ? contracts.find((c) => c.id === id) : null;

  const [f, setF] = useState<any>(() => ({
    licitacionNum: existing?.licitacionNum || '',
    clientName: existing?.clientName || '',
    clientEmail: existing?.clientEmail || '',
    clientPhone: existing?.clientPhone || '',
    modality: existing?.modality || 'periodico',
    startDate: existing?.startDate || '',
    endDate: existing?.endDate || '',
    defaultPeriodicityMonths: existing?.defaultPeriodicityMonths || 3,
    techIds: existing?.techIds?.length ? existing.techIds : existing?.defaultTechId ? [existing.defaultTechId] : [],
    noticeDaysBefore: existing?.noticeDaysBefore ?? '',
    notes: existing?.notes || '',
  }));
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.licitacionNum.trim() || !f.clientName.trim()) {
      toast(t('contracts.requiredErr'), 'error');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        licitacionNum: f.licitacionNum.trim(),
        clientName: f.clientName.trim(),
        clientEmail: f.clientEmail.trim(),
        clientPhone: f.clientPhone.trim(),
        modality: f.modality,
        startDate: f.startDate,
        endDate: f.endDate,
        defaultPeriodicityMonths: Number(f.defaultPeriodicityMonths) as any,
        techIds: f.techIds,
        defaultTechId: f.techIds[0] || null,
        noticeDaysBefore: f.noticeDaysBefore === '' ? null : Number(f.noticeDaysBefore),
        notes: f.notes,
      };
      if (editing && existing) {
        await updateContract(existing.id, payload, t('contracts.histEdited'));
        toast(t('contracts.savedEdit'), 'success');
        ctx.go('contractDetail', { id: existing.id });
      } else {
        const res = await addContract(payload);
        toast(t('contracts.savedNew', { num: res.num }), 'success');
        ctx.go('contractDetail', { id: res.id });
      }
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fade-in" >
      <PageHeader
        title={editing ? t('contracts.editTitle') : t('contracts.newTitle')}
        sub={editing ? existing?.num : t('contracts.newSub')}
        back={() => ctx.back()}
      />

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="section-label" style={{ marginBottom: 14 }}>{t('contracts.secContract')}</div>
        <div className="form-grid">
          <Field label={t('contracts.fLicitacion')} required hint={t('contracts.fLicitacionHint')}>
            <Input placeholder="2025LD-000021-0001102202" value={f.licitacionNum} onChange={(e: any) => set('licitacionNum', e.target.value)} />
          </Field>
          <Field label={t('contracts.fModality')} hint={t('contracts.fModalityHint')}>
            <Select value={f.modality} onChange={(e: any) => set('modality', e.target.value)}>
              <option value="periodico">{t('contracts.modality_periodico')}</option>
              <option value="demanda">{t('contracts.modality_demanda')}</option>
            </Select>
          </Field>
          {f.modality !== 'demanda' && (
            <Field label={t('contracts.fPeriodicity')} hint={t('contracts.fPeriodicityHint')}>
              <Select value={f.defaultPeriodicityMonths} onChange={(e: any) => set('defaultPeriodicityMonths', e.target.value)}>
                {PERIODICITY_OPTIONS.map((p) => <option key={p} value={p}>{perLabel(t, p)}</option>)}
              </Select>
            </Field>
          )}
          <Field label={t('contracts.fStart')}>
            <Input type="date" value={f.startDate} onChange={(e: any) => set('startDate', e.target.value)} />
          </Field>
          <Field label={t('contracts.fEnd')}>
            <Input type="date" value={f.endDate} onChange={(e: any) => set('endDate', e.target.value)} />
          </Field>
          <Field label={t('contracts.fNotice')} hint={t('contracts.fNoticeHint')}>
            <Input type="number" min={0} max={30} placeholder="3" value={f.noticeDaysBefore} onChange={(e: any) => set('noticeDaysBefore', e.target.value)} />
          </Field>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label={t('contracts.fTeam')} hint={t('contracts.fTeamHint')}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {ctx.db.technicians.filter((x) => x.active).map((x) => {
                  const idx = f.techIds.indexOf(x.id);
                  const selected = idx >= 0;
                  return (
                    <button
                      key={x.id}
                      type="button"
                      onClick={() => set('techIds', selected ? f.techIds.filter((id: string) => id !== x.id) : [...f.techIds, x.id])}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px 7px 8px',
                        borderRadius: 99, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                        border: '1.5px solid ' + (selected ? 'var(--navy-800)' : 'var(--border)'),
                        background: selected ? 'var(--navy-800)' : 'var(--surface)',
                        color: selected ? '#fff' : 'var(--text-2)',
                      }}
                    >
                      <Avatar initials={x.initials} size={24} gold={idx === 0} />
                      {x.name.split(' ')[0]}
                      {idx === 0 && <span style={{ fontSize: 10.5, color: 'var(--gold)', fontWeight: 700 }}>{t('contracts.teamPrimary')}</span>}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="section-label" style={{ marginBottom: 14 }}>{t('contracts.secClient')}</div>
        <div className="form-grid">
          <Field label={t('contracts.fClient')} required>
            <Input placeholder="CCSS — Hospital San Juan de Dios" value={f.clientName} onChange={(e: any) => set('clientName', e.target.value)} />
          </Field>
          <Field label={t('contracts.fClientEmail')} hint={t('contracts.fClientEmailHint')}>
            <Input type="email" placeholder="contacto@cliente.com" value={f.clientEmail} onChange={(e: any) => set('clientEmail', e.target.value)} />
          </Field>
          <Field label={t('contracts.fClientPhone')}>
            <Input placeholder="+506 ..." value={f.clientPhone} onChange={(e: any) => set('clientPhone', e.target.value)} />
          </Field>
        </div>
        <Field label={t('contracts.fNotes')}>
          <Textarea rows={3} value={f.notes} onChange={(e: any) => set('notes', e.target.value)} />
        </Field>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <Button variant="ghost" onClick={() => ctx.back()}>{t('common.cancel')}</Button>
        <Button onClick={save} disabled={busy}>{busy ? '…' : editing ? t('common.saveChanges') : t('contracts.createBtn')}</Button>
      </div>
    </div>
  );
}
