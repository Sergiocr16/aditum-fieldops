/* © 2026 Aditum — Aditum FieldOps — App root & routing */
import { useMemo, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { useData } from './lib/store';
import { Icon, Toaster } from './components/ui';
import { publicUrl, makePublicToken } from './lib/ctx';
import { now } from './lib/time';
import type { AppCtx } from './lib/ctx';
import type { Ticket } from './lib/types';

import Login from './screens/Login';
import AdminShell from './screens/admin/AdminShell';
import AdminDashboard from './screens/admin/Dashboard';
import TechniciansScreen from './screens/admin/Technicians';
import TicketsList from './screens/admin/TicketsList';
import TicketForm from './screens/admin/TicketForm';
import TicketDetailAdmin from './screens/admin/TicketDetail';
import { ApproveModal, RejectModal, ReassignModal } from './screens/admin/modals';
import { approveTicket, rejectTicket, reassignTicket, generateLink } from './lib/actions';
import WikiListAdmin from './screens/admin/WikiList';
import WikiEditor from './screens/admin/WikiEditor';
import Inventory from './screens/admin/Inventory';
import TechDashboard from './screens/mobile/MobileDashboard';
import TechTicketDetail from './screens/mobile/MobileTicket';
import { TechWikiList, TechWikiPage } from './screens/mobile/MobileWiki';
import PublicView from './screens/public/PublicView';
import { toast } from './components/ui';

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
  const data = useData();
  const [route, setRoute] = useState(user!.role === 'admin' ? 'dashboard' : 'techDashboard');
  const [params, setParams] = useState<any>({});
  const [hist, setHist] = useState<{ route: string; params: any }[]>([]);
  const [listModal, setListModal] = useState<any>(null);

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
      openPublic: (ticket: Ticket) => {
        let token = ticket.share?.token;
        if (!token) {
          token = makePublicToken();
          data.updateTicket(ticket.id, {
            share: { active: true, token, url: publicUrl(token), created: now(), lastVisit: null, createdBy: user!.uid },
          });
        }
        window.open(publicUrl(token), '_blank');
      },
    }),
    [data.tickets, data.technicians, data.loading, route, params, user]
  );

  if (user!.role === 'admin') {
    let inner: React.ReactNode = null;
    if (route === 'dashboard') inner = <AdminDashboard ctx={ctx} />;
    else if (route === 'tickets')
      inner = <TicketsList ctx={ctx} onApprove={(t) => setListModal({ type: 'approve', t })} onReject={(t) => setListModal({ type: 'reject', t })} onReassign={(t) => setListModal({ type: 'reassign', t })} />;
    else if (route === 'technicians') inner = <TechniciansScreen ctx={ctx} openCreate={params.create} />;
    else if (route === 'ticketForm') inner = <TicketForm ctx={ctx} mode={params.mode} id={params.id} />;
    else if (route === 'ticketDetail') inner = <TicketDetailAdmin ctx={ctx} id={params.id} />;
    else if (route === 'wiki') inner = <WikiListAdmin ctx={ctx} />;
    else if (route === 'wikiForm') inner = <WikiEditor ctx={ctx} mode={params.mode} id={params.id} />;
    else if (route === 'inventory') inner = <Inventory ctx={ctx} />;
    return (
      <>
        <AdminShell ctx={ctx} route={route}>
          {inner}
        </AdminShell>
        {listModal?.type === 'approve' && <ApproveModal open onClose={() => setListModal(null)} onConfirm={(c: string) => { approveTicket(ctx, listModal.t, c); setListModal(null); }} />}
        {listModal?.type === 'reject' && <RejectModal open onClose={() => setListModal(null)} onConfirm={(c: string) => { rejectTicket(ctx, listModal.t, c); setListModal(null); }} />}
        {listModal?.type === 'reassign' && <ReassignModal open ticket={listModal.t} ctx={ctx} onClose={() => setListModal(null)} onConfirm={(tid: string) => { reassignTicket(ctx, listModal.t, tid); setListModal(null); }} />}
      </>
    );
  }

  // technician (mobile, full screen)
  let techScreen: React.ReactNode;
  if (route === 'techTicket') techScreen = <TechTicketDetail ctx={ctx} id={params.id} />;
  else if (route === 'techWiki') techScreen = <TechWikiList ctx={ctx} />;
  else if (route === 'techWikiPage') techScreen = <TechWikiPage ctx={ctx} id={params.id} />;
  else techScreen = <TechDashboard ctx={ctx} />;
  return (
    <div style={{ height: '100vh', maxWidth: 480, margin: '0 auto', boxShadow: '0 0 0 1px var(--border)' }}>
      {techScreen}
    </div>
  );
}

function Root() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Login />;
  return <AuthedApp />;
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/p/:token" element={<PublicView />} />
        <Route path="*" element={<Root />} />
      </Routes>
      <Toaster />
    </>
  );
}
