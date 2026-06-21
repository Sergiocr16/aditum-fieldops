/* © 2026 Aditum — Aditum FieldOps — Reporte de horas trabajadas (fichaje por demanda) */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getDocs } from 'firebase/firestore';
import { useTenant } from '../../lib/tenant';
import { PageHeader } from './AdminShell';
import { Field, Input, Select, EmptyState, Icon } from '../../components/ui';
import { ChartCard, CategoryBars, ChartEmpty } from '../../components/charts';
import { today, minutesBetween, fmtDuration } from '../../lib/time';
import { formatDate } from '../../lib/time';
import type { AppCtx } from '../../lib/ctx';

const addDays = (d: string, n: number) => { const [y, m, dd] = d.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, dd + n)); return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`; };
const GOLD = '#DEB66E';
const NAVY = '#002A42';

interface Session { orderId: string; num: string; techId: string; techName: string; date: string; start: string; end: string; min: number; }

export default function HoursReport({ ctx }: { ctx: AppCtx }) {
  const { t } = useTranslation();
  const { tcol } = useTenant();
  const [from, setFrom] = useState(addDays(today(), -30));
  const [to, setTo] = useState(today());
  const [fTech, setFTech] = useState('');
  const [groupBy, setGroupBy] = useState<'tech' | 'order'>('tech');
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

  // Lista plana de sesiones (tramos cerrados) de órdenes por demanda en el rango
  const sessions = useMemo<Session[]>(() => {
    const out: Session[] = [];
    for (const o of orders) {
      if ((o.mode || 'periodico') !== 'demanda') continue;
      for (const v of o.visits || []) {
        if (!v.date || v.date < from || v.date > to) continue;
        const tId = v.techId || o.techId || '—';
        if (fTech && tId !== fTech) continue;
        for (const s of v.segments || []) {
          if (!s.end) continue;
          const min = minutesBetween(s.start, s.end);
          if (!min) continue;
          out.push({ orderId: o.id, num: o.num, techId: tId, techName: v.techName || techName(tId), date: v.date, start: s.start, end: s.end, min });
        }
      }
    }
    return out.sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
  }, [orders, from, to, fTech]);

  const totalMin = sessions.reduce((a, s) => a + s.min, 0);

  // Agregación para el gráfico + tarjetas (por técnico o por orden)
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; min: number; children: Map<string, number> }>();
    for (const s of sessions) {
      const key = groupBy === 'tech' ? s.techId : s.orderId;
      const label = groupBy === 'tech' ? s.techName : s.num;
      const childKey = groupBy === 'tech' ? s.num : s.techName;
      const cur = map.get(key) || { key, label, min: 0, children: new Map() };
      cur.min += s.min;
      cur.children.set(childKey, (cur.children.get(childKey) || 0) + s.min);
      map.set(key, cur);
    }
    return [...map.values()].map((g) => ({ ...g, children: [...g.children.entries()].map(([k, m]) => ({ k, m })).sort((a, b) => b.m - a.m) })).sort((a, b) => b.min - a.min);
  }, [sessions, groupBy]);

  const chartData = groups.slice(0, 12).map((g) => ({ label: g.label, value: Math.round((g.min / 60) * 10) / 10, color: groupBy === 'tech' ? NAVY : GOLD }));

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
        <div className="seg" role="tablist" style={{ marginLeft: 'auto' }}>
          <button className={groupBy === 'tech' ? 'on' : ''} onClick={() => setGroupBy('tech')}>{t('hoursReport.byTech')}</button>
          <button className={groupBy === 'order' ? 'on' : ''} onClick={() => setGroupBy('order')}>{t('hoursReport.byOrder')}</button>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{t('hoursReport.total')}: {fmtDuration(totalMin)}</div>
      </div>

      {!loading && sessions.length === 0 ? (
        <EmptyState icon="clock" title={t('hoursReport.empty')} sub={t('hoursReport.emptySub')} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* gráfico */}
          <ChartCard title={groupBy === 'tech' ? t('hoursReport.byTech') : t('hoursReport.byOrder')} sub={t('hoursReport.chartSub')} height={Math.max(180, chartData.length * 38 + 30)}>
            {chartData.length ? <CategoryBars data={chartData} horizontal suffix=" h" /> : <ChartEmpty label={t('hoursReport.empty')} />}
          </ChartCard>

          {/* tarjetas por grupo, con drill-down a la orden */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {groups.map((g) => (
              <div className="card card-pad" key={g.key}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <button
                    onClick={() => groupBy === 'order' && ctx.go('soDetail', { id: g.key })}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15, border: 'none', background: 'transparent', cursor: groupBy === 'order' ? 'pointer' : 'default', color: groupBy === 'order' ? 'var(--navy-700)' : 'var(--text)' }}>
                    <Icon name={groupBy === 'tech' ? 'users' : 'clipboard'} size={16} style={{ color: 'var(--text-3)' }} />
                    <span className={groupBy === 'order' ? 'mono' : ''}>{g.label}</span>
                  </button>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--gold-600)' }}>{fmtDuration(g.min)}</div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {g.children.map((c) => (
                    <span key={c.k} className="badge" style={{ fontSize: 11.5 }}>{c.k} · {fmtDuration(c.m)}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* tabla de sesiones (cada tiempo → su orden) */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="section-label" style={{ padding: '14px 16px 6px' }}>{t('hoursReport.sessions')}</div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('hoursReport.colDate')}</th>
                    <th>{t('hoursReport.colOrder')}</th>
                    <th className="hide-sm">{t('hoursReport.colTech')}</th>
                    <th>{t('hoursReport.colSpan')}</th>
                    <th>{t('hoursReport.colDuration')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s, i) => (
                    <tr key={i} style={{ cursor: 'pointer' }} onClick={() => ctx.go('soDetail', { id: s.orderId })}>
                      <td className="mono" style={{ fontSize: 12.5 }}>{formatDate(s.date)}</td>
                      <td className="mono" style={{ fontWeight: 700, color: 'var(--navy-700)' }}>{s.num}</td>
                      <td className="hide-sm" style={{ fontSize: 13 }}>{s.techName}</td>
                      <td className="mono" style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{s.start.slice(11)} → {s.end.slice(11)}</td>
                      <td style={{ fontWeight: 600 }}>{fmtDuration(s.min)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
