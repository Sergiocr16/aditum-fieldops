/* © 2026 Aditum — Aditum FieldOps — Admin dashboard */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, Avatar, Button, StatusBadge, PriorityChip, SOStatusBadge } from '../../components/ui';
import { STATUS, statusCounts, SO_ACTIVE_STATUSES } from '../../lib/config';
import { useServiceOrdersRange, useBillingOrders } from '../../lib/serviceOrders';
import { useContracts } from '../../lib/contracts';
import { useInventory } from '../../lib/inventory';
import { addDays, monthOf } from '../../lib/dates';
import { today } from '../../lib/time';
import { CorrectiveModal } from './ServiceOrders';
import { canSeeModule } from '../../lib/modules';
import { useAuth } from '../../lib/auth';
import { useTenant } from '../../lib/tenant';
import { ChartCard, ChartEmpty, DonutChart, CategoryBars, StackedBars, TrendChart, Sparkline } from '../../components/charts';
import * as A from '../../lib/analytics';
import { PERIODS, type PeriodKey } from '../../lib/analytics';
import { PRIORITY_COLOR } from '../../lib/config';
import { formatDate } from '../../lib/time';
import type { AppCtx } from '../../lib/ctx';
import type { ServiceOrder } from '../../lib/types';

const SERIES_COLORS = { preventivo: '#27a35a', correctivo: '#e0911f', creados: '#2f7ad1', resueltos: '#27a35a', cumplimiento: '#8b5cf0', facturado: '#27a35a', pendiente: '#e0911f' };
const DOT = { pend: '#8a93a1', asig: '#2f7ad1', proc: '#e0911f', revi: '#8b5cf0', apro: '#27a35a', rech: '#e04545', cerr: '#56636f' };
const NAVY = '#002A42', GOLD = '#DEB66E';

/** KPI tile — una sola vocabulary para todo el dashboard. */
function Kpi({ label, value, suffix, dot, accent, spark, sparkColor, onClick }: {
  label: string; value: string | number; suffix?: string; dot?: string; accent?: boolean;
  spark?: { value: number }[]; sparkColor?: string; onClick?: () => void;
}) {
  return (
    <div className={'kpi' + (accent ? ' kpi--accent' : '') + (onClick ? ' kpi--link' : '')} onClick={onClick}>
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        {dot && !accent && <span className="kpi-dot" style={{ background: dot }} />}
      </div>
      <div className="kpi-foot">
        <div className="kpi-val">{value}{suffix && <span className="u">{suffix}</span>}</div>
        {spark && spark.length > 1 && <div style={{ width: 84 }}><Sparkline data={spark} color={sparkColor || (accent ? GOLD : NAVY)} height={30} /></div>}
      </div>
    </div>
  );
}

function SecHead({ title, meta }: { title: string; meta?: React.ReactNode }) {
  return (
    <div className="sec-head">
      <span className="bar" />
      <h2>{title}</h2>
      <span className="rule" />
      {meta && <span className="meta">{meta}</span>}
    </div>
  );
}

export default function AdminDashboard({ ctx }: { ctx: AppCtx }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { tenant } = useTenant();
  // El dashboard refleja módulos de la empresa (features) + lo visible del usuario.
  const sees = (m: string) => canSeeModule(m, user?.roles, user?.modules, tenant?.features);
  const showMaintenance = sees('serviceOrders') || sees('contracts') || sees('equipment') || sees('calendar');
  const showBilling = sees('billing');

  /* ---- mantenimiento: un solo rango cubre KPIs, próximas visitas y alertas ---- */
  const d = today();
  const range = useMemo(() => ({ from: addDays(d, -30), to: addDays(d, 7) }), [d]);
  const { orders } = useServiceOrdersRange(range.from, range.to);
  const { items: pendingBilling } = useBillingOrders('pendiente');
  const { items: invoicedBilling } = useBillingOrders('facturado');
  const { contracts } = useContracts();
  const inv = useInventory();

  /* ---- analítica: ventana más amplia para tendencias (según período) ---- */
  const lang = i18n.language;
  const [period, setPeriod] = useState<PeriodKey>('90d');
  const P = PERIODS.find((p) => p.key === period)!;
  const analyticsRange = useMemo(() => ({ from: addDays(d, -P.days), to: addDays(d, 7) }), [d, P.days]);
  const { orders: anOrders } = useServiceOrdersRange(analyticsRange.from, analyticsRange.to);
  // gráficos de mantenimiento
  const chSoStatus = useMemo(() => A.soByStatus(anOrders), [anOrders]);
  const chPrevCorr = useMemo(() => A.preventiveVsCorrectiveByMonth(anOrders, P.months, d, lang), [anOrders, P.months, d, lang]);
  const chCompliance = useMemo(() => A.complianceByMonth(anOrders, P.months, d, lang), [anOrders, P.months, d, lang]);
  const chSoType = useMemo(() => A.soByEquipmentType(anOrders), [anOrders]);
  const chSoTech = useMemo(() => A.soByTech(anOrders, ctx.db.technicians), [anOrders, ctx.db.technicians]);
  const kPrevRate = useMemo(() => A.preventiveRate(anOrders), [anOrders]);
  const sparkSoDone = useMemo(() => A.soDoneByWeek(anOrders, P.weeks, d), [anOrders, P.weeks, d]);

  // facturación
  const chBilling = useMemo(() => A.billingByMonth(pendingBilling, invoicedBilling, P.months, d, lang), [pendingBilling, invoicedBilling, P.months, d, lang]);
  const facturadoMes = useMemo(() => invoicedBilling.filter((i) => monthOf(i.invoicedAt || i.serviceDate) === monthOf(d)).length, [invoicedBilling, d]);
  const [correctiveOpen, setCorrectiveOpen] = useState(false);

  const isActive = (o: ServiceOrder) => SO_ACTIVE_STATUSES.includes(o.status);
  const kpi = useMemo(() => {
    const week = addDays(d, 7);
    const month = monthOf(d);
    const monthOrders = orders.filter((o) => monthOf(o.scheduledDate) === month && o.status !== 'CANCELADA');
    const monthDone = monthOrders.filter((o) => ['SERVICIO_TERMINADO', 'PENDIENTE_FACTURAR', 'FACTURADA'].includes(o.status));
    return {
      hoy: orders.filter((o) => isActive(o) && o.scheduledDate === d).length,
      semana: orders.filter((o) => isActive(o) && o.scheduledDate > d && o.scheduledDate <= week).length,
      vencidas: orders.filter((o) => isActive(o) && o.status !== 'EN_PROGRESO' && o.scheduledDate < d).length,
      sinConfirmar: orders.filter((o) => o.status === 'NOTIFICADA' && o.scheduledDate <= addDays(d, 3)).length,
      cumplimiento: monthOrders.length ? Math.round((monthDone.length / monthOrders.length) * 100) : null,
    };
  }, [orders, d]);

  const upcoming = useMemo(
    () => orders.filter((o) => isActive(o) && o.scheduledDate >= d).slice(0, 6),
    [orders, d]
  );

  const alerts = useMemo(() => {
    const out: { icon: string; text: string; sub: string; tone: 'rech' | 'proc'; go: () => void }[] = [];
    // mediciones fuera de rango en servicios recientes
    orders
      .filter((o) => ['SERVICIO_TERMINADO', 'PENDIENTE_FACTURAR', 'FACTURADA'].includes(o.status))
      .forEach((o) => {
        ((o.checklist || []) as any[]).filter((it) => it.alert).forEach((it: any) => {
          out.push({
            icon: 'alert',
            text: `${it.label}: ${it.answer ?? '—'} ${it.unit || ''}`.trim(),
            sub: `${o.equipmentSnapshot?.typeName || ''} · ${o.equipmentSnapshot?.serial || ''} · ${o.num}`,
            tone: 'rech',
            go: () => ctx.go('soDetail', { id: o.id }),
          });
        });
      });
    // inventario bajo mínimo
    inv.items
      .filter((i) => (i.minQty || 0) > 0 && (i.quantity || 0) <= i.minQty)
      .forEach((i) => {
        out.push({ icon: 'building', text: t('dashboard.lowStock', { name: i.name }), sub: t('dashboard.lowStockSub', { q: i.quantity, min: i.minQty }), tone: 'proc', go: () => ctx.go('inventory') });
      });
    // contratos por vencer (< 60 días)
    contracts
      .filter((x) => x.active && x.endDate && x.endDate >= d && x.endDate <= addDays(d, 60))
      .forEach((x) => {
        out.push({ icon: 'file', text: t('dashboard.contractExpiring', { num: x.num, client: x.clientName }), sub: t('dashboard.contractExpiringSub', { date: x.endDate }), tone: 'proc', go: () => ctx.go('contractDetail', { id: x.id }) });
      });
    return out.slice(0, 8);
  }, [orders, inv.items, contracts, d]);

  const techName = (id: string | null) => ctx.db.technicians.find((x) => x.id === id)?.name?.split(' ')[0] || '—';

  const greeting = ctx.admin.name?.split(' ')[0] || '';

  return (
    <div className="dash fade-in">
      {/* ---------- header band ---------- */}
      <div className="dash-head">
        <div>
          <div className="dash-eyebrow">{formatDate(d, lang)}</div>
          <div className="dash-title">{t('dashboard.greeting')}{greeting ? ', ' + greeting : ''}</div>
        </div>
        <div className="dash-tools">
          {(showMaintenance || showBilling) && (
            <div className="seg" role="tablist" aria-label={t('dashboard.charts.period')}>
              {PERIODS.map((p) => (
                <button key={p.key} className={period === p.key ? 'on' : ''} onClick={() => setPeriod(p.key)}>
                  {t('dashboard.charts.period_' + p.key)}
                </button>
              ))}
            </div>
          )}
          {showMaintenance && <Button variant="ghost" icon="zap" onClick={() => setCorrectiveOpen(true)}>{t('serviceOrders.newCorrective')}</Button>}
        </div>
      </div>

      {/* ---------- mantenimiento ---------- */}
      {showMaintenance && (
        <section className="dash-section">
          <SecHead title={t('dashboard.maintenanceTitle')} meta={t('dashboard.charts.preventiveRate') + ': ' + (kPrevRate === null ? '—' : kPrevRate + '%')} />
          <div className="kpi-row">
            <Kpi accent label={t('dashboard.monthCompliance')} value={kpi.cumplimiento === null ? '—' : kpi.cumplimiento} suffix={kpi.cumplimiento === null ? '' : '%'} spark={sparkSoDone} />
            <Kpi label={t('dashboard.visitsToday')} value={kpi.hoy} dot={DOT.asig} />
            <Kpi label={t('dashboard.visitsWeek')} value={kpi.semana} dot={DOT.proc} />
            <Kpi label={t('dashboard.overdue')} value={kpi.vencidas} dot={DOT.rech} />
            <Kpi label={t('dashboard.unconfirmed')} value={kpi.sinConfirmar} dot={DOT.revi} />
          </div>

          <div className="bento">
            <div className="col-4">
              <ChartCard title={t('dashboard.charts.soStatus')} height={210}>
                {chSoStatus.length ? <DonutChart data={chSoStatus.map((x) => ({ ...x, label: t('soStatus.' + x.key) }))} totalLabel={t('dashboard.charts.orders')} /> : <ChartEmpty label={t('dashboard.charts.empty')} />}
              </ChartCard>
            </div>
            <div className="col-8">
              <ChartCard title={t('dashboard.charts.compliance')} sub={t('dashboard.charts.byMonth')} height={210}>
                {anOrders.length ? <TrendChart data={chCompliance} kind="line" suffix="%" series={[{ key: 'cumplimiento', label: t('dashboard.monthCompliance'), color: SERIES_COLORS.cumplimiento }]} /> : <ChartEmpty label={t('dashboard.charts.empty')} />}
              </ChartCard>
            </div>
            <div className="col-4">
              <ChartCard title={t('dashboard.charts.prevCorr')} sub={t('dashboard.charts.byMonth')} height={200}>
                {anOrders.length ? <StackedBars data={chPrevCorr} series={[{ key: 'preventivo', label: t('serviceOrders.type_preventivo'), color: SERIES_COLORS.preventivo }, { key: 'correctivo', label: t('serviceOrders.type_correctivo'), color: SERIES_COLORS.correctivo }]} /> : <ChartEmpty label={t('dashboard.charts.empty')} />}
              </ChartCard>
            </div>
            <div className="col-4">
              <ChartCard title={t('dashboard.charts.soByType')} height={200}>
                {chSoType.length ? <CategoryBars data={chSoType} horizontal color="#1f5fa8" /> : <ChartEmpty label={t('dashboard.charts.empty')} />}
              </ChartCard>
            </div>
            <div className="col-4">
              <ChartCard title={t('dashboard.charts.soByTech')} height={200}>
                {chSoTech.length ? <CategoryBars data={chSoTech} horizontal color="#002A42" /> : <ChartEmpty label={t('dashboard.charts.empty')} />}
              </ChartCard>
            </div>
          </div>

          <div className="bento">
            <div className={alerts.length ? 'col-8' : 'col-12'}>
              <div className="panel">
                <div className="panel-head">
                  <h3>{t('dashboard.upcomingVisits')}</h3>
                  <button className="link-more" onClick={() => ctx.go('calendar')}>{t('dashboard.viewCalendar')} <Icon name="chevronRight" size={15} /></button>
                </div>
                {upcoming.length === 0 ? (
                  <div style={{ padding: '22px 20px', fontSize: 13.5, color: 'var(--text-3)' }}>{t('dashboard.noUpcoming')}</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                      <tbody>
                        {upcoming.map((o) => (
                          <tr key={o.id} onClick={() => ctx.go('soDetail', { id: o.id })} style={{ cursor: 'pointer' }}>
                            <td className="mono" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                              <b>{o.scheduledDate === d ? t('dashboard.todayShort') : o.scheduledDate.slice(5)}</b> {o.scheduledTime}
                            </td>
                            <td style={{ fontWeight: 600 }}>{o.equipmentSnapshot?.typeName || o.num}</td>
                            <td style={{ color: 'var(--text-2)', fontSize: 12.5 }}>{o.client?.name}</td>
                            <td style={{ fontSize: 12.5 }}>{techName(o.techId)}</td>
                            <td><SOStatusBadge status={o.status} size="sm" /></td>
                            <td><Icon name="chevronRight" size={15} style={{ color: 'var(--text-3)' }} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {alerts.length > 0 && (
              <div className="col-4">
                <div className="panel">
                  <div className="panel-head">
                    <h3><Icon name="alert" size={16} style={{ color: 'var(--st-rech-fg)' }} /> {t('dashboard.alerts')}</h3>
                    <span className="badge" style={{ background: 'var(--st-rech-bg)', color: 'var(--st-rech-fg)' }}>{alerts.length}</span>
                  </div>
                  {alerts.map((a, i) => (
                    <button key={i} className="alert-row" onClick={a.go} style={i === 0 ? { borderTop: 'none' } : undefined}>
                      <span style={{ width: 30, height: 30, borderRadius: 8, flex: 'none', background: `var(--st-${a.tone}-bg)`, color: `var(--st-${a.tone}-fg)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name={a.icon} size={15} />
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>{a.text}</span>
                        <span style={{ display: 'block', fontSize: 12, color: 'var(--text-3)' }} className="truncate">{a.sub}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ---------- facturación (sección propia: facturación-only la ve) ---------- */}
      {showBilling && (
        <section className="dash-section">
          <SecHead title={t('billing.nav')} />
          <div className="bento">
            <div className="col-4">
              <div className="kpi-row" style={{ gridTemplateColumns: '1fr' }}>
                <Kpi accent label={t('dashboard.pendingBilling')} value={pendingBilling.length} onClick={() => ctx.go('billing')} />
                <Kpi label={t('dashboard.charts.invoicedMonth')} value={facturadoMes} dot={DOT.apro} />
              </div>
            </div>
            <div className="col-8">
              <ChartCard title={t('dashboard.charts.billing')} sub={chBilling.useAmount ? t('dashboard.charts.amount') : t('dashboard.charts.count')} height={220}>
                {(pendingBilling.length || invoicedBilling.length) ? <StackedBars data={chBilling.data} series={[{ key: 'facturado', label: t('billing.facturado'), color: SERIES_COLORS.facturado }, { key: 'pendiente', label: t('billing.pendiente'), color: SERIES_COLORS.pendiente }]} /> : <ChartEmpty label={t('dashboard.charts.empty')} />}
              </ChartCard>
            </div>
          </div>
        </section>
      )}

      <CorrectiveModal open={correctiveOpen} onClose={() => setCorrectiveOpen(false)} ctx={ctx} onCreated={(id) => ctx.go('soDetail', { id })} />
    </div>
  );
}
