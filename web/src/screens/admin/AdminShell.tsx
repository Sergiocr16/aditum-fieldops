/* © 2026 Aditum — Aditum FieldOps — Admin shell (sidebar + topbar) */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Logo, Icon, Avatar, confirmDialog } from '../../components/ui';
import { MODULES, visibleModules } from '../../lib/modules';
import { useAuth } from '../../lib/auth';
import { useTenant } from '../../lib/tenant';
import type { AppCtx } from '../../lib/ctx';

export function PageHeader({ title, sub, action, back }: any) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {back && (
          <button className="icon-btn" onClick={back} style={{ width: 38, height: 38 }}>
            <Icon name="arrowLeft" size={18} />
          </button>
        )}
        <div>
          <h1 style={{ margin: 0, fontSize: 23, fontWeight: 700, letterSpacing: '-.01em' }}>{title}</h1>
          {sub && <p style={{ margin: '3px 0 0', fontSize: 13.5, color: 'var(--text-2)' }}>{sub}</p>}
        </div>
      </div>
      {action && <div style={{ display: 'flex', gap: 10 }}>{action}</div>}
    </div>
  );
}

export default function AdminShell({ ctx, route, children }: { ctx: AppCtx; route: string; children: React.ReactNode }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { tenant } = useTenant();
  const [menuOpen, setMenuOpen] = useState(false);
  const confirmLogout = async () => {
    const ok = await confirmDialog({ title: t('common.logout'), message: t('common.logoutConfirm'), tone: 'danger', confirmLabel: t('common.logout'), confirmIcon: 'logout' });
    if (ok) ctx.logout();
  };
  // Sidebar = módulos que usa la empresa (features) ∩ rol ∩ (admin) su lista `modules`.
  const nav = visibleModules(user?.role, user?.modules, tenant?.features).map((m) => ({ key: m.key, label: t(m.labelKey), icon: m.icon, route: m.route }));
  const activeKey = MODULES.find((m) => m.routes.includes(route))?.key || '';
  const titles: any = { dashboard: t('nav.dashboard'), tickets: t('nav.tickets'), technicians: t('nav.technicians'), ticketForm: t('nav.ticket'), ticketDetail: t('nav.ticketDetail'), inventory: t('inventory.title'), wiki: t('wiki.title'), wikiForm: t('wiki.title'), tenantSettings: t('tenantSettings.title'), contracts: t('contracts.title'), contractForm: t('contracts.title'), contractDetail: t('contracts.title'), equipment: t('equipment.title'), serviceOrders: t('serviceOrders.title'), soDetail: t('serviceOrders.title'), templateEditor: t('templates.navTitle'), billing: t('billing.title'), notifySettings: t('notifySettings.title'), calendar: t('calendar.title') };
  const admin = ctx.admin;

  return (
    <div className="admin-shell">
      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}
      <aside className={'sidebar' + (menuOpen ? ' open' : '')}>
        <div className="sidebar-logo">
          <Logo variant="dark" height={30} withLockup lockupColor="#fff" dark />
        </div>
        <nav className="sidebar-nav">
          {nav.map((n) => (
            <button
              key={n.key}
              className={'nav-item' + (activeKey === n.key ? ' active' : '')}
              onClick={() => {
                ctx.go(n.route);
                setMenuOpen(false);
              }}
            >
              <span className="nav-ic">
                <Icon name={n.icon} size={19} />
              </span>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 9, marginBottom: 10 }}>
            <Avatar initials={admin.initials} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{admin.name}</div>
              <div style={{ fontSize: 11.5, color: 'rgba(238,243,247,.5)' }}>{admin.role}</div>
            </div>
            <button onClick={confirmLogout} title={t('common.logout')} aria-label={t('common.logout')} style={{ border: 'none', background: 'rgba(255,255,255,.08)', color: 'rgba(238,243,247,.8)', width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none' }}>
              <Icon name="logout" size={16} />
            </button>
          </div>
          <div style={{ textAlign: 'center', fontSize: 10.5, color: 'rgba(238,243,247,.4)', lineHeight: 1.5 }}>
            © {new Date().getFullYear()} Aditum
            <div style={{ fontSize: 10, color: 'rgba(238,243,247,.3)' }}>{t('brand.developedBy')}</div>
          </div>
        </div>
      </aside>

      <div className="admin-main">
        <header className="topbar">
          <button className="icon-btn menu-toggle" onClick={() => setMenuOpen((o) => !o)} aria-label={t('nav.menu')}>
            <Icon name="menu" size={18} />
          </button>
          <span style={{ fontWeight: 700, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titles[route] || 'Aditum Service'}</span>
        </header>
        <div className="content">
          <div className="content-inner">{children}</div>
        </div>
      </div>
    </div>
  );
}
