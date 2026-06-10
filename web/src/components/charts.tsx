/* © 2026 Aditum — Aditum FieldOps — primitivas de gráficos (wrappers Recharts + tokens).
   Las pantallas NO usan Recharts directo: siempre estas primitivas, para un estilo único. */
import {
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, AreaChart, Area, LineChart, Line,
} from 'recharts';
import { Icon } from './ui';

const AXIS = '#8a93a1';
const GRID = '#eef0f3';
const NAVY = '#002A42';
const GOLD = '#DEB66E';

/* ---------------- shell ---------------- */
export function ChartCard({ title, sub, action, children, height = 240 }: { title: string; sub?: string; action?: React.ReactNode; children: React.ReactNode; height?: number }) {
  return (
    <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, gap: 10 }}>
        <div>
          <div className="section-label" style={{ margin: 0 }}>{title}</div>
          {sub && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>}
        </div>
        {action}
      </div>
      {/* altura DEFINIDA (px): ResponsiveContainer height="100%" necesita un padre con
          altura resuelta, si no mide 0 y el gráfico no se ve. */}
      <div style={{ height, width: '100%' }}>{children}</div>
    </div>
  );
}

export function ChartEmpty({ label }: { label: string }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-3)' }}>
      <Icon name="dashboard" size={26} />
      <span style={{ fontSize: 13 }}>{label}</span>
    </div>
  );
}

/* ---------------- tooltip compartido ---------------- */
function TipBox({ rows, label }: { rows: { name: string; value: any; color?: string }[]; label?: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--sh-md)', padding: '8px 11px', fontSize: 12.5 }}>
      {label && <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--text)' }}>{label}</div>}
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text-2)' }}>
          {r.color && <span style={{ width: 9, height: 9, borderRadius: 3, background: r.color, flex: 'none' }} />}
          <span>{r.name}</span>
          <b style={{ marginLeft: 'auto', color: 'var(--text)' }}>{r.value}</b>
        </div>
      ))}
    </div>
  );
}
const CustomTooltip = (suffix = '') => ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return <TipBox label={label != null && label !== '' ? String(label) : undefined} rows={payload.map((p: any) => ({ name: p.name, value: `${p.value}${suffix}`, color: p.color || p.fill || p.payload?.color }))} />;
};

/* ---------------- donut ---------------- */
export function DonutChart({ data, total, totalLabel }: { data: { label: string; value: number; color: string }[]; total?: number; totalLabel?: string }) {
  const sum = total ?? data.reduce((a, b) => a + b.value, 0);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: '100%' }}>
      <div style={{ position: 'relative', width: 150, height: 150, flex: 'none' }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={48} outerRadius={70} paddingAngle={2} stroke="none">
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip content={CustomTooltip()} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1 }}>{sum}</div>
          {totalLabel && <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{totalLabel}</div>}
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: d.color, flex: 'none' }} />
            <span style={{ color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.label}</span>
            <b style={{ marginLeft: 'auto' }}>{d.value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- barras categóricas ---------------- */
export function CategoryBars({ data, horizontal, color = NAVY, suffix }: { data: { label: string; value: number; color?: string }[]; horizontal?: boolean; color?: string; suffix?: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 4, right: 8, bottom: 0, left: horizontal ? 4 : -18 }}>
        <CartesianGrid stroke={GRID} horizontal={!horizontal} vertical={horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="label" tick={{ fill: AXIS, fontSize: 11.5 }} axisLine={false} tickLine={false} width={78} />
          </>
        ) : (
          <>
            <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11.5 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
          </>
        )}
        <Tooltip content={CustomTooltip(suffix)} cursor={{ fill: 'rgba(0,42,66,.05)' }} />
        <Bar dataKey="value" name="Total" radius={horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]} maxBarSize={46}>
          {data.map((d, i) => <Cell key={i} fill={d.color || color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ---------------- barras apiladas ---------------- */
export function StackedBars({ data, series, suffix }: { data: any[]; series: { key: string; label: string; color: string }[]; suffix?: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11.5 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip content={CustomTooltip(suffix)} cursor={{ fill: 'rgba(0,42,66,.05)' }} />
        <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={s.color} radius={i === series.length - 1 ? [5, 5, 0, 0] : [0, 0, 0, 0]} maxBarSize={46} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ---------------- tendencia (línea/área) ---------------- */
export function TrendChart({ data, series, kind = 'area', suffix }: { data: any[]; series: { key: string; label: string; color: string }[]; kind?: 'line' | 'area'; suffix?: string }) {
  if (kind === 'line') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip content={CustomTooltip(suffix)} />
          {series.length > 1 && <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2.4} dot={{ r: 2.5 }} activeDot={{ r: 4 }} />)}
        </LineChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: -18 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={'g-' + s.key} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip content={CustomTooltip(suffix)} />
        {series.length > 1 && <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s) => <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2.4} fill={`url(#g-${s.key})`} />)}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ---------------- sparkline (KPI tiles) ---------------- */
export function Sparkline({ data, color = GOLD, height = 34 }: { data: { value: number }[]; color?: string; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={'sp-' + color.replace('#', '')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#sp-${color.replace('#', '')})`} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------------- KPI tile con sparkline ---------------- */
export function StatTile({ label, value, suffix, spark, sparkColor, tone = 'navy' }: { label: string; value: string | number; suffix?: string; spark?: { value: number }[]; sparkColor?: string; tone?: 'navy' | 'gold' | 'plain' }) {
  const big = tone === 'navy';
  return (
    <div className="card card-pad" style={{ minHeight: 118, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', ...(big ? { background: 'var(--navy-800)', border: 'none', color: '#fff' } : {}) }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: big ? 'rgba(255,255,255,.7)' : 'var(--text-2)' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1 }}>
          {value}{suffix && <span style={{ fontSize: 16, fontWeight: 700 }}>{suffix}</span>}
        </div>
        {spark && spark.length > 1 && <div style={{ width: 96 }}><Sparkline data={spark} color={sparkColor || (big ? GOLD : NAVY)} /></div>}
      </div>
    </div>
  );
}
