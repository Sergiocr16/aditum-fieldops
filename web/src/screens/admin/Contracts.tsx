/* © 2026 Aditum — Aditum FieldOps — Contracts list (admin) */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, Button, Input, EmptyState } from '../../components/ui';
import { PageHeader } from './AdminShell';
import { useContracts } from '../../lib/contracts';
import { useEquipment } from '../../lib/equipment';
import { formatDate } from '../../lib/time';
import type { AppCtx } from '../../lib/ctx';

export function perLabel(t: any, months: number | null | undefined): string {
  if (!months) return '—';
  return t('contracts.per_' + months);
}

export default function Contracts({ ctx }: { ctx: AppCtx }) {
  const { t, i18n } = useTranslation();
  const { contracts, loading } = useContracts();
  const { equipment } = useEquipment();
  const [search, setSearch] = useState('');

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    equipment.forEach((e) => m.set(e.contractId, (m.get(e.contractId) || 0) + 1));
    return m;
  }, [equipment]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contracts;
    return contracts.filter((c) => [c.num, c.licitacionNum, c.clientName].some((x) => (x || '').toLowerCase().includes(q)));
  }, [contracts, search]);

  const techName = (id: string | null) => ctx.db.technicians.find((x) => x.id === id)?.name || '—';

  return (
    <div className="fade-in">
      <PageHeader
        title={t('contracts.title')}
        sub={t('contracts.sub')}
        action={<Button icon="plus" variant="gold" onClick={() => ctx.go('contractForm', { mode: 'new' })}>{t('contracts.new')}</Button>}
      />

      <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
        <Input icon="search" placeholder={t('contracts.searchPh')} value={search} onChange={(e: any) => setSearch(e.target.value)} />
      </div>

      {!loading && filtered.length === 0 ? (
        <EmptyState icon="file" title={t('contracts.empty')} sub={t('contracts.emptySub')} action={<Button icon="plus" onClick={() => ctx.go('contractForm', { mode: 'new' })}>{t('contracts.new')}</Button>} />
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('contracts.thContract')}</th>
                <th>{t('contracts.thClient')}</th>
                <th className="hide-sm">{t('contracts.thValidity')}</th>
                <th>{t('contracts.thPeriodicity')}</th>
                <th className="hide-sm">{t('contracts.thTech')}</th>
                <th>{t('contracts.thEquipment')}</th>
                <th>{t('contracts.thStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => ctx.go('contractDetail', { id: c.id })}>
                  <td>
                    <div style={{ fontWeight: 700 }} className="mono">{c.num}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }} className="mono">{c.licitacionNum}</div>
                  </td>
                  <td style={{ fontWeight: 600 }}>{c.clientName}</td>
                  <td className="hide-sm" style={{ fontSize: 12.5 }}>
                    {c.startDate ? formatDate(c.startDate, i18n.language) : '—'} → {c.endDate ? formatDate(c.endDate, i18n.language) : '—'}
                  </td>
                  <td>{perLabel(t, c.defaultPeriodicityMonths)}</td>
                  <td className="hide-sm">
                    {(c.techIds?.length ? c.techIds : c.defaultTechId ? [c.defaultTechId] : []).length
                      ? (c.techIds?.length ? c.techIds : [c.defaultTechId!]).map((id) => techName(id).split(' ')[0]).join(', ')
                      : '—'}
                  </td>
                  <td>
                    <span className="badge">
                      <Icon name="wrench" size={12} />
                      {counts.get(c.id) || 0}
                    </span>
                  </td>
                  <td>
                    <span className="badge" style={{ background: c.active ? 'var(--st-apro-bg)' : 'var(--st-pend-bg)', color: c.active ? 'var(--st-apro-fg)' : 'var(--st-pend-fg)' }}>
                      {c.active ? t('contracts.active') : t('contracts.inactive')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
