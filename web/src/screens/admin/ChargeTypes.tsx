/* © 2026 Aditum — Aditum FieldOps — Tipos de cargo facturables (CABYS / IVA) */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, Button, Input, Field, Modal, Toggle, SearchSelect, EmptyState, toast, confirmDialog } from '../../components/ui';
import { PageHeader } from './AdminShell';
import { useChargeTypes } from '../../lib/chargeTypes';
import { useCabys } from '../../lib/fiscalCatalogs';
import type { AppCtx } from '../../lib/ctx';
import type { ChargeType } from '../../lib/types';

export default function ChargeTypes({ ctx }: { ctx: AppCtx }) {
  const { t } = useTranslation();
  const ct = useChargeTypes();
  const cabys = useCabys();
  const [edit, setEdit] = useState<Partial<ChargeType> | null>(null);

  const save = async () => {
    if (!edit?.name?.trim()) {
      toast(t('chargeTypes.requiredName'), 'error');
      return;
    }
    if (edit.id) await ct.update(edit.id, edit);
    else await ct.create(edit);
    toast(edit.id ? t('common.saved') : t('chargeTypes.created'), 'success');
    setEdit(null);
  };

  return (
    <div className="fade-in">
      <PageHeader
        title={t('chargeTypes.title')}
        sub={t('chargeTypes.sub')}
        back={() => ctx.go('fiscalHub')}
        action={<Button variant="primary" icon="plus" onClick={() => setEdit({ emitIva: true, issuesDocument: true })}>{t('chargeTypes.add')}</Button>}
      />

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('chargeTypes.name')}</th>
                <th>{t('chargeTypes.code')}</th>
                <th>{t('chargeTypes.cabys')}</th>
                <th>{t('chargeTypes.iva')}</th>
                <th>{t('chargeTypes.issues')}</th>
                <th style={{ textAlign: 'right' }}>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {ct.items.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState icon="receipt" title={t('chargeTypes.emptyTitle')} sub={t('chargeTypes.emptySub')} />
                  </td>
                </tr>
              ) : (
                ct.items.map((c) => (
                  <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setEdit({ ...c })}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td className="mono" style={{ color: 'var(--text-2)' }}>{c.code || '—'}</td>
                    <td className="mono" style={{ color: 'var(--text-2)' }}>{c.cabysCode || '—'}</td>
                    <td><span className="tag">{c.emitIva ? t('chargeTypes.ivaTaxed') : t('chargeTypes.ivaExempt')}</span></td>
                    <td style={{ color: 'var(--text-2)' }}>{c.issuesDocument ? t('common.yes') : t('common.no')}</td>
                    <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="icon-btn" title={t('common.edit')} onClick={() => setEdit({ ...c })}><Icon name="edit" size={16} /></button>
                        <button className="icon-btn" style={{ color: 'var(--st-rech-fg)' }} title={t('common.delete')} onClick={async () => { if (await confirmDialog({ title: t('common.delete'), message: t('chargeTypes.deleteConfirm'), tone: 'danger', confirmLabel: t('common.delete'), confirmIcon: 'trash' })) { ct.remove(c.id); toast(t('common.deleted')); } }}><Icon name="trash" size={16} /></button>
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
        width={460}
        title={edit?.id ? t('chargeTypes.edit') : t('chargeTypes.create')}
        footer={<><Button variant="ghost" onClick={() => setEdit(null)}>{t('common.cancel')}</Button><Button variant="primary" icon="check" onClick={save}>{t('common.save')}</Button></>}
      >
        {edit && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label={t('chargeTypes.name')} required>
              <Input placeholder={t('chargeTypes.namePh')} value={edit.name || ''} onChange={(e: any) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <div className="form-grid">
              <Field label={t('chargeTypes.code')} hint={t('chargeTypes.codeHint')}>
                <Input value={edit.code || ''} onChange={(e: any) => setEdit({ ...edit, code: e.target.value })} />
              </Field>
              <Field label={t('chargeTypes.cabys')} hint={t('chargeTypes.cabysHint')}>
                <SearchSelect
                  value={edit.cabysCode || ''}
                  items={cabys.rows}
                  search={(q: string) => cabys.search(q)}
                  toCode={(it: any) => it.c}
                  toLabel={(it: any) => it.d}
                  placeholder={t('chargeTypes.cabysSearch')}
                  loadingHint={t('common.loading')}
                  onPick={(it: any) => setEdit((cur) => (it ? { ...cur, cabysCode: it.c, emitIva: (it.t ?? 0) > 0 } : { ...cur, cabysCode: '' }))}
                />
              </Field>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('chargeTypes.iva')}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('chargeTypes.ivaHint')}</div>
              </div>
              <Toggle on={edit.emitIva !== false} onClick={() => setEdit({ ...edit, emitIva: !(edit.emitIva !== false) })} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('chargeTypes.issues')}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('chargeTypes.issuesHint')}</div>
              </div>
              <Toggle on={edit.issuesDocument !== false} onClick={() => setEdit({ ...edit, issuesDocument: !(edit.issuesDocument !== false) })} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
