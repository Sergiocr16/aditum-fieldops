/* © 2026 Aditum — Aditum FieldOps — Tech mobile app shell: header de identidad + barra inferior.
   Reemplaza el header recargado (pills + iconos sueltos) por una navegación inferior alcanzable
   con el pulgar. Los destinos se arman según las features de la empresa, así que el chrome es
   idéntico tenga tickets, mantenimiento, ambos, y/o wiki. */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, Avatar, confirmDialog } from '../../components/ui';
import { useTenant } from '../../lib/tenant';
import { tenantHasFeature } from '../../lib/modules';
import { useMyServiceOrders } from '../../lib/serviceOrders';
import type { AppCtx } from '../../lib/ctx';

export type TechTab = 'tickets' | 'orders' | 'calendar' | 'wiki';

const ACTIVE_TICKET = (s: string) => s !== 'aprobado' && s !== 'cerrado';
const ACTIVE_SO = ['PROGRAMADA', 'NOTIFICADA', 'CONFIRMADA', 'REAGENDADA', 'EN_PROGRESO'];

export function TechShell({ ctx, active, children }: { ctx: AppCtx; active: TechTab; children: React.ReactNode }) {
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const { orders } = useMyServiceOrders();
  const featTickets = tenantHasFeature('tickets', tenant?.features);
  const featMaint = tenantHasFeature('maintenance', tenant?.features);
  const featWiki = tenantHasFeature('wiki', tenant?.features);

  const ticketBadge = featTickets ? ctx.db.tickets.filter((x) => ACTIVE_TICKET(x.status)).length : 0;
  const orderBadge = featMaint ? orders.filter((o) => ACTIVE_SO.includes(o.status)).length : 0;

  const tabs = [
    featTickets && { key: 'tickets' as const, route: 'techDashboard', icon: 'clipboard', label: t('nav.ticketsShort'), badge: ticketBadge },
    featMaint && { key: 'orders' as const, route: 'techOrders', icon: 'wrench', label: t('mobileOrders.navShort'), badge: orderBadge },
    { key: 'calendar' as const, route: 'techCalendar', icon: 'calendar', label: t('techCal.nav'), badge: 0 },
    featWiki && { key: 'wiki' as const, route: 'techWiki', icon: 'book', label: t('wiki.nav'), badge: 0 },
  ].filter(Boolean) as { key: TechTab; route: string; icon: string; label: string; badge: number }[];

  const first = ctx.admin.name.split(' ')[0];
  const activeLabel = tabs.find((tb) => tb.key === active)?.label;
  useEffect(() => { if (activeLabel) document.title = activeLabel; }, [activeLabel]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* Header de identidad: idéntico en todas las pestañas */}
      <div style={{ background: 'var(--navy-800)', color: '#fff', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 11, flex: 'none' }}>
        <Avatar initials={ctx.admin.initials} size={40} gold />
        <div style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)' }}>{t('mobile.hi')}</div>
          <div style={{ fontSize: 17, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{first}</div>
        </div>
        <button onClick={async () => { if (await confirmDialog({ title: t('common.logout'), message: t('common.logoutConfirm'), tone: 'danger', confirmLabel: t('common.logout'), confirmIcon: 'logout' })) ctx.logout(); }} aria-label={t('common.logout')} style={{ border: 'none', background: 'rgba(255,255,255,.12)', color: '#fff', width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <Icon name="logout" size={18} />
        </button>
      </div>

      {/* Cuerpo de la pantalla (chips + lista) */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>{children}</div>

      {/* Barra inferior: destinos primarios */}
      <nav style={{ flex: 'none', display: 'flex', background: 'var(--navy-900)', borderTop: '1px solid rgba(255,255,255,.08)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {tabs.map((tb) => {
          const on = tb.key === active;
          return (
            <button
              key={tb.key}
              onClick={() => !on && ctx.go(tb.route)}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '9px 4px 10px', border: 'none', background: 'transparent', cursor: 'pointer', color: on ? 'var(--gold)' : 'rgba(255,255,255,.55)' }}
            >
              <span style={{ position: 'relative', display: 'flex' }}>
                <Icon name={tb.icon} size={21} />
                {tb.badge > 0 && (
                  <span style={{ position: 'absolute', top: -5, right: -9, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 99, background: 'var(--gold)', color: 'var(--navy-900)', fontSize: 10.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 2px var(--navy-900)' }}>
                    {tb.badge > 9 ? '9+' : tb.badge}
                  </span>
                )}
              </span>
              <span style={{ fontSize: 10.5, fontWeight: on ? 700 : 500 }}>{tb.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
