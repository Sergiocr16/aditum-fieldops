/* © 2026 Aditum — Aditum FieldOps — Public page: confirm a maintenance visit (/confirm/:token) */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { Logo, Icon, Button, LangSwitcher } from '../../components/ui';
import { PublicError } from './PublicView';

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <div style={{ background: 'var(--navy-900)', padding: '18px 24px' }}>
        <div style={{ maxWidth: 620, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Logo variant="dark" height={30} withLockup lockupColor="#fff" dark />
          <LangSwitcher dark />
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 18px' }}>
        <div style={{ width: '100%', maxWidth: 620 }}>{children}</div>
      </div>
    </div>
  );
}

export function VisitCard({ order }: { order: any }) {
  const { t } = useTranslation();
  const eq = order.equipment || {};
  const Row = ({ icon, label, value }: any) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <Icon name={icon} size={16} style={{ color: 'var(--text-3)', flex: 'none' }} />
      <span style={{ fontSize: 13, color: 'var(--text-2)', width: 110, flex: 'none' }}>{label}</span>
      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{value || '—'}</span>
    </div>
  );
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span className="mono badge" style={{ fontWeight: 700 }}>{order.num}</span>
      </div>
      <Row icon="calendar" label={t('publicConfirm.date')} value={`${order.scheduledDate} · ${order.scheduledTime}`} />
      <Row icon="wrench" label={t('publicConfirm.equipment')} value={[eq.typeName, eq.brand, eq.model].filter(Boolean).join(' ')} />
      <Row icon="mapPin" label={t('publicConfirm.location')} value={eq.location} />
      <Row icon="users" label={t('publicConfirm.tech')} value={order.techName} />
    </div>
  );
}

export default function PublicConfirm() {
  const { t } = useTranslation();
  const { token } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [err, setErr] = useState<'desactivado' | 'expirado' | '404' | null>(null);
  const [used, setUsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<{ date: string; time: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fn = httpsCallable(functions, 'getPublicServiceOrder');
        const res: any = await fn({ token, purpose: 'so_confirm' });
        if (!cancelled) setOrder(res.data.order);
      } catch (e: any) {
        if (cancelled) return;
        const code = e?.details?.reason || '404';
        if (code === 'used') setUsed(true);
        else setErr(code === 'disabled' ? 'desactivado' : code === 'expired' ? 'expirado' : '404');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const confirm = async () => {
    setConfirming(true);
    try {
      const fn = httpsCallable(functions, 'confirmServiceOrder');
      const res: any = await fn({ token });
      setDone({ date: res.data.scheduledDate, time: res.data.scheduledTime });
    } catch (e: any) {
      const code = e?.details?.reason;
      if (code === 'used') setUsed(true);
      else setErr(code === 'expired' ? 'expirado' : code === 'disabled' ? 'desactivado' : '404');
    } finally {
      setConfirming(false);
    }
  };

  if (loading)
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)' }}>
        <span className="spin" style={{ marginRight: 10 }}><Icon name="refresh" size={18} /></span>
        {t('public.loading')}
      </div>
    );

  if (used)
    return (
      <PublicShell>
        <div className="card card-pad fade-in" style={{ textAlign: 'center', padding: '40px 28px' }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--st-apro-bg)', color: 'var(--st-apro-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Icon name="checkCircle" size={30} />
          </div>
          <h1 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700 }}>{t('publicConfirm.usedTitle')}</h1>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-2)' }}>{t('publicConfirm.usedMsg')}</p>
        </div>
      </PublicShell>
    );

  if (err || !order) return <PublicError type={err || '404'} />;

  if (done)
    return (
      <PublicShell>
        <div className="card card-pad fade-in" style={{ textAlign: 'center', padding: '44px 28px' }}>
          <div style={{ width: 70, height: 70, borderRadius: 18, background: 'var(--st-apro-bg)', color: 'var(--st-apro-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
            <Icon name="checkCircle" size={34} />
          </div>
          <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700 }}>{t('publicConfirm.doneTitle')}</h1>
          <p style={{ margin: 0, fontSize: 14.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
            {t('publicConfirm.doneMsg', { date: done.date, time: done.time })}
          </p>
        </div>
      </PublicShell>
    );

  return (
    <PublicShell>
      <div className="card card-pad fade-in" style={{ padding: '28px 26px' }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 21, fontWeight: 700 }}>{t('publicConfirm.title')}</h1>
        <p style={{ margin: '0 0 18px', fontSize: 14, color: 'var(--text-2)', lineHeight: 1.55 }}>
          {t('publicConfirm.intro', { client: order.clientName })}
        </p>
        <VisitCard order={order} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Button block variant="success" icon="check" onClick={confirm} disabled={confirming} style={{ height: 50, fontSize: 15.5 }}>
            {confirming ? '…' : t('publicConfirm.confirmBtn')}
          </Button>
          {order.rescheduleToken ? (
            <Button block variant="ghost" icon="calendar" onClick={() => navigate(`/reschedule/${order.rescheduleToken}`)} style={{ height: 46 }}>
              {t('publicConfirm.rescheduleBtn')}
            </Button>
          ) : (
            <p style={{ margin: 0, textAlign: 'center', fontSize: 13, color: 'var(--text-2)' }}>
              {t('publicConfirm.rescheduleHint')}
            </p>
          )}
        </div>
      </div>
    </PublicShell>
  );
}
