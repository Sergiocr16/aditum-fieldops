/* © 2026 Aditum — Aditum FieldOps — Admin shell (sidebar + topbar) */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Logo, Icon, Avatar, Button, LangSwitcher } from '../../components/ui';
import { MODULES, visibleModules } from '../../lib/modules';
import { useAuth } from '../../lib/auth';
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  // Sidebar = módulos visibles para el rol (admin: su lista `modules`; coordinador/facturación: set fijo).
  const nav = visibleModules(user?.role, user?.modules).map((m) => ({ key: m.key, label: t(m.labelKey), icon: m.icon, route: m.route }));
  const activeKey = MODULES.find((m) => m.routes.includes(route))?.key || '';
  const titles: any = { dashboard: t('nav.dashboard'), tickets: t('nav.tickets'), technicians: t('nav.technicians'), ticketForm: t('nav.ticket'), ticketDetail: t('nav.ticketDetail'), inventory: t('inventory.title'), wiki: t('wiki.title'), wikiForm: t('wiki.title'), tenantSettings: t('tenantSettings.title'), contracts: t('contracts.title'), contractForm: t('contracts.title'), contractDetail: t('contracts.title'), equipment: t('equipment.title'), serviceOrders: t('serviceOrders.title'), soDetail: t('serviceOrders.title'), templateEditor: t('templates.navTitle'), billing: t('billing.title'), notifySettings: t('notifySettings.title'), calendar: t('calendar.title') };
  const admin = ctx.admin;

  return (
    <div className="admin-shell">
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
          <div style={{ marginTop: 18, padding: '0 12px' }}>
            <button className="btn btn-gold btn-block" onClick={() => ctx.go('ticketForm', { mode: 'new' })} style={{ height: 42 }}>
              <Icon name="plus" size={17} />
              {t('dashboard.createTicket')}
            </button>
          </div>
        </nav>
        <div className="sidebar-foot">
          <div className="sidebar-user">
            <Avatar initials={admin.initials} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{admin.name}</div>
              <div style={{ fontSize: 11.5, color: 'rgba(238,243,247,.5)' }}>{admin.role}</div>
            </div>
            <button onClick={ctx.logout} title={t('common.logout')} style={{ border: 'none', background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.8)', width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Icon name="logout" size={16} />
            </button>
          </div>
          <div style={{ textAlign: 'center', fontSize: 10.5, color: 'rgba(238,243,247,.35)', marginTop: 8 }}>{t('brand.developedBy')}</div>
        </div>
      </aside>

      <div className="admin-main">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="icon-btn" onClick={() => setMenuOpen((o) => !o)} style={{ display: 'none' }}>
              <Icon name="menu" size={18} />
            </button>
            <span style={{ fontWeight: 700, fontSize: 16 }}>{titles[route] || 'Aditum Service'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <LangSwitcher />
            <div style={{ position: 'relative' }}>
              <button className="user-menu-btn" onClick={() => setUserMenu((o) => !o)}>
                <Avatar initials={admin.initials} size={32} />
                <div style={{ textAlign: 'left' }} className="hide-sm">
                  <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>{admin.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{admin.email}</div>
                </div>
                <Icon name="chevronDown" size={15} style={{ color: 'var(--text-3)' }} />
              </button>
              {userMenu && (
                <div className="menu-pop fade-in" style={{ minWidth: 200 }} onClick={() => setUserMenu(false)}>
                  <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', marginBottom: 5 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{admin.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)' }} className="mono">{admin.email}</div>
                  </div>
                  <button className="menu-item" style={{ color: 'var(--st-rech-fg)' }} onClick={ctx.logout}>
                    <Icon name="logout" size={15} />
                    {t('common.logout')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="content">
          <div className="content-inner">{children}</div>
        </div>
      </div>
    </div>
  );
}
