/* © 2026 Aditum — Aditum FieldOps — Reporte de horas trabajadas (fichaje por demanda) */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getDocs } from 'firebase/firestore';
import { useTenant } from '../../lib/tenant';
import { PageHeader } from './AdminShell';
import { Field, Input, Select, EmptyState, Icon } from '../../components/ui';
import { today, minutesBetween, fmtDuration } from '../../lib/time';
import type { AppCtx } from '../../lib/ctx';

const addDays = (d: string, n: number) => { const [y, m, dd] = d.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, dd + n)); return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`; };

export default function HoursReport({ ctx }: { ctx: AppCtx }) {
  const { t } = useTranslation();
  const { tcol } = useTenant();
  const [from, setFrom] = useState(addDays(today(), -30));
  const [to, setTo] = useState(today());
  const [fTech, setFTech] = useState('');
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getDocs(tcol('serviceOrders'))
      .then((s) => setOrders(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, []);

  const techName = (id?: string | null) => ctx.db.technicians.find((x) => x.id === id)?.name || '—';

  const { rows, totalMin } = useMemo(() => {
    const map = new Map<string, { name: string; min: number; orders: Map<string, number> }>();
    for (const o of orders) {
      if ((o.mode || 'periodico') !== 'demanda') continue;
      for (const v of o.visits || []) {
        if (!v.date || v.date < from || v.date > to) continue;
        const segMin = (v.segments || []).reduce((a: number, s: any) => a + (s.end ? minutesBetween(s.start, s.end) : 0), 0);
        if (!segMin) continue;
        const key = v.techId || o.techId || '—';
        if (fTech && key !== fTech) continue;
        const name = v.techName || techName(key);
        const cur = map.get(key) || { name, min: 0, orders: new Map() };
        cur.min += segMin;
        cur.orders.set(o.num, (cur.orders.get(o.num) || 0) + segMin);
        map.set(key, cur);
      }
    }
    const rows = [...map.entries()].map(([id, v]) => ({ id, name: v.name, min: v.min, orders: [...v.orders.entries()].map(([num, min]) => ({ num, min })).sort((a, b) => b.min - a.min) })).sort((a, b) => b.min - a.min);
    return { rows, totalMin: rows.reduce((a, r) => a + r.min, 0) };
  }, [orders, from, to, fTech]);

  return (
    <div className="fade-in">
      <PageHeader title={t('hoursReport.title')} sub={t('hoursReport.sub')} />

      <div className="card" style={{ marginBottom: 16, padding: '12px 16px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <Input type="date" value={from} onChange={(e: any) => setFrom(e.target.value)} style={{ width: 150 }} />
        <span style={{ color: 'var(--text-3)' }}>→</span>
        <Input type="date" value={to} onChange={(e: any) => setTo(e.target.value)} style={{ width: 150 }} />
        <div style={{ width: 200 }}>
          <Select value={fTech} onChange={(e: any) => setFTech(e.target.value)}>
            <option value="">{t('hoursReport.allTechs')}</option>
            {ctx.db.technicians.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 700 }}>
          {t('hoursReport.total')}: {fmtDuration(totalMin)}
        </div>
      </div>

      {loading ? null : rows.length === 0 ? (
        <EmptyState icon="clock" title={t('hoursReport.empty')} sub={t('hoursReport.emptySub')} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map((r) => (
            <div className="card card-pad" key={r.id}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15 }}>
                  <Icon name="users" size={16} style={{ color: 'var(--text-3)' }} />
                  {r.name}
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--gold-600)' }}>{fmtDuration(r.min)}</div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {r.orders.map((o) => (
                  <span key={o.num} className="badge" style={{ fontSize: 11.5 }}>
                    <span className="mono">{o.num}</span> · {fmtDuration(o.min)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
