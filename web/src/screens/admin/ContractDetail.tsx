/* © 2026 Aditum — Aditum FieldOps — Contract detail: info, equipment, activity (admin) */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, Button, EmptyState, toast, confirmDialog } from '../../components/ui';
import CsvImport from '../../components/CsvImport';
import { PageHeader } from './AdminShell';
import { useContracts } from '../../lib/contracts';
import { useEquipment } from '../../lib/equipment';
import { useContractServiceOrders } from '../../lib/serviceOrders';
import { SOStatusBadge } from '../../components/ui';
import { perLabel } from './Contracts';
import { EquipmentFormModal, EQUIPMENT_CSV_COLUMNS } from './Equipment';
import { formatDate } from '../../lib/time';
import type { AppCtx } from '../../lib/ctx';
import type { Equipment } from '../../lib/types';

function InfoRow({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{label}</span>
      <span className={mono ? 'mono' : ''} style={{ fontSize: 13, fontWeight: 600, textAlign: 'right' }}>{value || '—'}</span>
    </div>
  );
}

export default function ContractDetail({ ctx, id }: { ctx: AppCtx; id: string }) {
  const { t, i18n } = useTranslation();
  const { contracts, updateContract } = useContracts();
  const eq = useEquipment(id);
  const contract = contracts.find((c) => c.id === id);
  const serviceOrders = useContractServiceOrders(id);
  const [tab, setTab] = useState<'equipment' | 'orders' | 'activity'>('equipment');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Equipment | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  if (!contract) return <EmptyState icon="file" title={t('contracts.notFound')} sub="" />;

  const techName = (tid: string | null) => ctx.db.technicians.find((x) => x.id === tid)?.name || '—';

  const toggleActive = async () => {
    const ok = await confirmDialog({
      title: contract.active ? t('contracts.deactivateTitle') : t('contracts.activateTitle'),
      message: contract.active ? t('contracts.deactivateMsg') : t('contracts.activateMsg'),
      tone: contract.active ? 'danger' : 'info',
      confirmLabel: contract.active ? t('contracts.deactivate') : t('contracts.activate'),
    });
    if (!ok) return;
    await updateContract(contract.id, { active: !contract.active }, contract.active ? t('contracts.histDeactivated') : t('contracts.histActivated'));
    toast(t('common.saved'), 'success');
  };

  const removeEquipment = async (e: Equipment) => {
    const ok = await confirmDialog({ title: t('equipment.deleteTitle'), message: t('equipment.deleteMsg'), tone: 'danger', confirmLabel: t('common.delete') });
    if (ok) {
      await eq.deleteEquipment(e.id);
      toast(t('equipment.deleted'), 'success');
    }
  };

  return (
    <div className="fade-in">
      <PageHeader
        title={contract.clientName}
        sub={<span className="mono">{contract.num} · {contract.licitacionNum}</span> as any}
        back={() => ctx.back()}
        action={
          <>
            <Button variant="ghost" icon="edit" onClick={() => ctx.go('contractForm', { mode: 'edit', id: contract.id })}>{t('common.edit')}</Button>
            <Button variant={contract.active ? 'danger' : 'success'} onClick={toggleActive}>
              {contract.active ? t('contracts.deactivate') : t('contracts.activate')}
            </Button>
          </>
        }
      />

      <div className="detail-grid">
        <div>
          <div className="seg" role="tablist" style={{ marginBottom: 14 }}>
            <button role="tab" aria-selected={tab === 'equipment'} className={tab === 'equipment' ? 'on' : ''} onClick={() => setTab('equipment')}>
              {t('contracts.tabEquipment', { n: eq.equipment.length })}
            </button>
            <button role="tab" aria-selected={tab === 'orders'} className={tab === 'orders' ? 'on' : ''} onClick={() => setTab('orders')}>
              {t('contracts.tabOrders', { n: serviceOrders.length })}
            </button>
            <button role="tab" aria-selected={tab === 'activity'} className={tab === 'activity' ? 'on' : ''} onClick={() => setTab('activity')}>
              {t('contracts.tabActivity')}
            </button>
          </div>

          {tab === 'orders' && (
            <div className="card" style={{ overflow: 'hidden' }}>
              {serviceOrders.length === 0 ? (
                <div style={{ padding: 10 }}>
                  <EmptyState icon="calendar" title={t('serviceOrders.empty')} sub={t('serviceOrders.contractEmptySub')} />
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('serviceOrders.thNum')}</th>
                      <th>{t('serviceOrders.thDate')}</th>
                      <th>{t('serviceOrders.thEquipment')}</th>
                      <th>{t('serviceOrders.thType')}</th>
                      <th>{t('serviceOrders.thStatus')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {serviceOrders.map((o) => (
                      <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => ctx.go('soDetail', { id: o.id })}>
                        <td className="mono" style={{ fontWeight: 700 }}>{o.num}</td>
                        <td className="mono" style={{ fontSize: 12.5 }}>{o.scheduledDate} {o.scheduledTime}</td>
                        <td>{o.equipmentSnapshot?.typeName} <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{o.equipmentSnapshot?.serial}</span></td>
                        <td>{t('serviceOrders.type_' + o.type)}</td>
                        <td><SOStatusBadge status={o.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'equipment' && (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                <Button size="sm" variant="ghost" icon="upload" onClick={() => setImportOpen(true)}>{t('equipment.importBtn')}</Button>
                <Button size="sm" icon="plus" onClick={() => { setEditing(null); setFormOpen(true); }}>{t('equipment.new')}</Button>
              </div>
              {eq.equipment.length === 0 ? (
                <div style={{ padding: 10 }}>
                  <EmptyState icon="wrench" title={t('equipment.empty')} sub={t('contracts.equipmentEmptySub')} />
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('equipment.thType')}</th>
                      <th>{t('equipment.thBrandModel')}</th>
                      <th>{t('equipment.thSerial')}</th>
                      <th>{t('equipment.thLocation')}</th>
                      <th>{t('equipment.thTech')}</th>
                      <th>{t('equipment.thPeriodicity')}</th>
                      <th>{t('equipment.thNext')}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {eq.equipment.map((e) => (
                      <tr key={e.id}>
                        <td style={{ fontWeight: 600 }}>{eq.typeName(e.typeId)}</td>
                        <td>{[e.brand, e.model].filter(Boolean).join(' ') || '—'}</td>
                        <td className="mono" style={{ fontSize: 12.5 }}>{e.serial || '—'}</td>
                        <td>{e.location || '—'}</td>
                        <td style={{ fontSize: 12.5 }}>{techName(e.assignedTechId || contract.defaultTechId)}</td>
                        <td>{perLabel(t, e.periodicityMonths ?? contract.defaultPeriodicityMonths)}</td>
                        <td className="mono" style={{ fontSize: 12.5 }}>{e.nextScheduledDate || '—'}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => { setEditing(e); setFormOpen(true); }}>
                            <Icon name="edit" size={14} />
                          </button>
                          <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => removeEquipment(e)}>
                            <Icon name="trash" size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'activity' && (
            <div className="card card-pad">
              {(contract.history || []).length === 0 ? (
                <EmptyState icon="clock" title={t('contracts.noActivity')} sub="" />
              ) : (
                [...(contract.history || [])].reverse().map((h, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                    <Icon name="clock" size={15} style={{ color: 'var(--text-3)', marginTop: 2 }} />
                    <div>
                      <div style={{ fontSize: 13.5 }}>{h.note || '—'}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }} className="mono">{h.at} · {h.by}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card card-pad">
            <div className="section-label" style={{ marginBottom: 10 }}>{t('contracts.secContract')}</div>
            <InfoRow label={t('contracts.thStatus')} value={contract.active ? t('contracts.active') : t('contracts.inactive')} />
            <InfoRow label={t('contracts.fLicitacion')} value={contract.licitacionNum} mono />
            <InfoRow label={t('contracts.fStart')} value={contract.startDate ? formatDate(contract.startDate, i18n.language) : ''} />
            <InfoRow label={t('contracts.fEnd')} value={contract.endDate ? formatDate(contract.endDate, i18n.language) : ''} />
            <InfoRow label={t('contracts.fPeriodicity')} value={perLabel(t, contract.defaultPeriodicityMonths)} />
            <InfoRow
              label={t('contracts.fTeam')}
              value={
                (contract.techIds?.length ? contract.techIds : contract.defaultTechId ? [contract.defaultTechId] : [])
                  .map((id) => techName(id).split(' ')[0])
                  .join(', ') || '—'
              }
            />
            <InfoRow label={t('contracts.fNotice')} value={contract.noticeDaysBefore != null ? String(contract.noticeDaysBefore) + ' ' + t('contracts.days') : t('contracts.noticeDefault')} />
          </div>

          <div className="card card-pad">
            <div className="section-label" style={{ marginBottom: 10 }}>{t('contracts.secClient')}</div>
            <InfoRow label={t('contracts.fClient')} value={contract.clientName} />
            <InfoRow label={t('contracts.fClientEmail')} value={contract.clientEmail} mono />
            <InfoRow label={t('contracts.fClientPhone')} value={contract.clientPhone} mono />
            {contract.notes && (
              <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{contract.notes}</div>
            )}
          </div>
        </div>
      </div>

      <EquipmentFormModal open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} ctx={ctx} contractIdFixed={contract.id} editing={editing} />

      <CsvImport
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title={t('equipment.importTitle', { contract: contract.num })}
        columns={EQUIPMENT_CSV_COLUMNS}
        templateName="plantilla-equipos"
        onImport={(rows) => eq.importRows(contract.id, rows as any)}
      />
    </div>
  );
}
