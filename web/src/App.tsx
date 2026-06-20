/* © 2026 Aditum — Aditum FieldOps — App root & routing */
import { useMemo, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { useData } from './lib/store';
import { Icon, Toaster, ConfirmRoot, toast } from './components/ui';
import { publicUrl } from './lib/ctx';
import type { AppCtx } from './lib/ctx';
import type { Ticket } from './lib/types';
import SuperAdminApp from './screens/superadmin/SuperAdminApp';
import { canAccessRoute, tenantHasFeature } from './lib/modules';
import { useTenant } from './lib/tenant';

import Login from './screens/Login';
import AdminShell from './screens/admin/AdminShell';
import AdminDashboard from './screens/admin/Dashboard';
import TechniciansScreen from './screens/admin/Technicians';
import WikiListAdmin from './screens/admin/WikiList';
import WikiEditor from './screens/admin/WikiEditor';
import Inventory from './screens/admin/Inventory';
import TenantSettings from './screens/admin/TenantSettings';
import Contracts from './screens/admin/Contracts';
import ContractForm from './screens/admin/ContractForm';
import ContractDetail from './screens/admin/ContractDetail';
import EquipmentScreen, { EquipmentTypesScreen } from './screens/admin/Equipment';
import ServiceOrders from './screens/admin/ServiceOrders';
import ServiceOrderDetail from './screens/admin/ServiceOrderDetail';
import TemplateEditor from './screens/admin/TemplateEditor';
import BillingInbox from './screens/admin/BillingInbox';
import FiscalHub from './screens/admin/FiscalHub';
import InvoiceComposer from './screens/admin/InvoiceComposer';
import InvoiceDetail from './screens/admin/InvoiceDetail';
import Clients from './screens/admin/Clients';
import GtiSettings from './screens/admin/GtiSettings';
import ChargeTypes from './screens/admin/ChargeTypes';
import MobileServiceOrders from './screens/mobile/MobileServiceOrders';
import MobileServiceOrder from './screens/mobile/MobileServiceOrder';
import MobileCalendar from './screens/mobile/MobileCalendar';
import MobileSignature from './screens/mobile/MobileSignature';
import PublicServiceReport from './screens/public/PublicServiceReport';
import PublicConfirm from './screens/public/PublicConfirm';
import PublicReschedule from './screens/public/PublicReschedule';
import PublicReset from './screens/public/PublicReset';
import MobileAvailability from './screens/mobile/MobileAvailability';
import NotifySettings from './screens/admin/NotifySettings';
import ServiceCalendar from './screens/admin/ServiceCalendar';
import HoursReport from './screens/admin/HoursReport';
import TechDashboard from './screens/mobile/MobileDashboard';
import { TechWikiList, TechWikiPage } from './screens/mobile/MobileWiki';
import PublicView from './screens/public/PublicView';

function Spinner() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)' }}>
      <span className="spin">
        <Icon name="refresh" size={20} />
      </span>
    </div>
  );
}

function AuthedApp() {
  const { user, logout } = useAuth();
  const { tenant } = useTenant();
  const data = useData();
  const desktopRole = user!.role === 'admin' || user!.role === 'coordinador' || user!.role === 'facturacion';
  // Técnico: su home es la bandeja de órdenes de servicio (o el dashboard si no hay mantenimiento).
  const techHome = tenantHasFeature('maintenance', tenant?.features) ? 'techOrders' : 'techDashboard';
  const [route, setRoute] = useState(desktopRole ? 'dashboard' : techHome);
  const [params, setParams] = useState<any>({});
  const [hist, setHist] = useState<{ route: string; params: any }[]>([]);

  const ctx: AppCtx = useMemo(
    () => ({
      db: { tickets: data.tickets, technicians: data.technicians },
      admin: {
        name: user!.name,
        email: user!.email,
        role: user!.role === 'admin' ? 'Administrador' : 'Técnico',
        initials: user!.initials,
        uid: user!.uid,
      },
      loading: data.loading,
      updateTicket: data.updateTicket,
      addTicket: data.addTicket,
      addTechnician: data.addTechnician,
      updateTechnician: data.updateTechnician,
      resetTechnicianPassword: data.resetTechnicianPassword,
      sendPublicLink: data.sendPublicLink,
      ensurePublicLink: data.ensurePublicLink,
      go: (name, p = {}) => {
        setHist((h) => [...h, { route, params }]);
        setRoute(name);
        setParams(p);
        const c = document.querySelector('.content');
        if (c) c.scrollTop = 0;
      },
      back: () => {
        setHist((h) => {
          if (!h.length) return h;
          const prev = h[h.length - 1];
          setRoute(prev.route);
          setParams(prev.params);
          return h.slice(0, -1);
        });
      },
      logout,
      openPublic: async (ticket: Ticket) => {
        const token = ticket.share?.active ? ticket.share?.token : null;
        if (token) {
          window.open(publicUrl(token), '_blank');
          return;
        }
        try {
          const res = await data.ensurePublicLink(ticket.id, 'generate');
          window.open(res.url, '_blank');
        } catch (e: any) {
          toast(e?.message || 'Error', 'error');
        }
      },
    }),
    [data.tickets, data.technicians, data.loading, route, params, user]
  );

  const isDesktop = user!.role === 'admin' || user!.role === 'coordinador' || user!.role === 'facturacion';
  if (isDesktop) {
    // Guard de módulos: si el rol/empresa no tiene acceso a la ruta, lo mandamos al dashboard.
    if (!canAccessRoute(route, user!.roles, user!.modules, tenant?.features)) {
      return (
        <AdminShell ctx={ctx} route="dashboard">
          <AdminDashboard ctx={ctx} />
        </AdminShell>
      );
    }
    let inner: React.ReactNode = null;
    if (route === 'dashboard') inner = <AdminDashboard ctx={ctx} />;
    else if (route === 'technicians') inner = <TechniciansScreen ctx={ctx} openCreate={params.create} />;
    else if (route === 'wiki') inner = <WikiListAdmin ctx={ctx} />;
    else if (route === 'wikiForm') inner = <WikiEditor ctx={ctx} mode={params.mode} id={params.id} />;
    else if (route === 'inventory') inner = <Inventory ctx={ctx} />;
    else if (route === 'tenantSettings') inner = <TenantSettings ctx={ctx} />;
    else if (route === 'contracts') inner = <Contracts ctx={ctx} />;
    else if (route === 'contractForm') inner = <ContractForm ctx={ctx} mode={params.mode} id={params.id} />;
    else if (route === 'contractDetail') inner = <ContractDetail ctx={ctx} id={params.id} />;
    else if (route === 'equipment') inner = <EquipmentScreen ctx={ctx} />;
    else if (route === 'equipmentTypes') inner = <EquipmentTypesScreen ctx={ctx} />;
    else if (route === 'serviceOrders') inner = <ServiceOrders ctx={ctx} />;
    else if (route === 'soDetail') inner = <ServiceOrderDetail ctx={ctx} id={params.id} />;
    else if (route === 'templateEditor') inner = <TemplateEditor ctx={ctx} typeId={params.typeId} />;
    else if (route === 'billing') inner = <BillingInbox ctx={ctx} />;
    else if (route === 'invoiceNew') inner = <InvoiceComposer ctx={ctx} itemIds={params.itemIds} />;
    else if (route === 'invoiceDetail') inner = <InvoiceDetail ctx={ctx} id={params.id} />;
    else if (route === 'fiscalHub') inner = <FiscalHub ctx={ctx} />;
    else if (route === 'clients') inner = <Clients ctx={ctx} />;
    else if (route === 'gtiSettings') inner = <GtiSettings ctx={ctx} />;
    else if (route === 'chargeTypes') inner = <ChargeTypes ctx={ctx} />;
    else if (route === 'notifySettings') inner = <NotifySettings ctx={ctx} />;
    else if (route === 'calendar') inner = <ServiceCalendar ctx={ctx} />;
    else if (route === 'hoursReport') inner = <HoursReport ctx={ctx} />;
    return (
      <AdminShell ctx={ctx} route={route}>
        {inner}
      </AdminShell>
    );
  }

  // technician (mobile, full screen)
  let techScreen: React.ReactNode;
  if (route === 'techWiki') techScreen = <TechWikiList ctx={ctx} />;
  else if (route === 'techWikiPage') techScreen = <TechWikiPage ctx={ctx} id={params.id} />;
  else if (route === 'techOrders') techScreen = <MobileServiceOrders ctx={ctx} />;
  else if (route === 'techCalendar') techScreen = <MobileCalendar ctx={ctx} />;
  else if (route === 'techOrder') techScreen = <MobileServiceOrder ctx={ctx} id={params.id} />;
  else if (route === 'techSignature') techScreen = <MobileSignature ctx={ctx} id={params.id} />;
  else if (route === 'techAvailability') techScreen = <MobileAvailability ctx={ctx} />;
  else techScreen = <TechDashboard ctx={ctx} />;
  return (
    <div style={{ height: '100dvh', maxWidth: 480, margin: '0 auto', boxShadow: '0 0 0 1px var(--border)' }}>
      {techScreen}
    </div>
  );
}

function Root() {
  const { user, loading } = useAuth();
  const { loading: tenantLoading } = useTenant();
  if (loading) return <Spinner />;
  if (!user) return <Login />;
  if (user.role === 'superadmin') return <SuperAdminApp />;
  // Esperar a que cargue la marca del tenant antes de pintar el shell: así no se ve
  // un color/azul previo durante la carga (la pantalla de carga queda neutra).
  if (tenantLoading) return <Spinner />;
  return <AuthedApp />;
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/p/:token" element={<PublicView />} />
        <Route path="/r/:token" element={<PublicServiceReport />} />
        <Route path="/confirm/:token" element={<PublicConfirm />} />
        <Route path="/reschedule/:token" element={<PublicReschedule />} />
        <Route path="/reset" element={<PublicReset />} />
        <Route path="*" element={<Root />} />
      </Routes>
      <Toaster />
      <ConfirmRoot />
    </>
  );
}
