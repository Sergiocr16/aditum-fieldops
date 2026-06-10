/* © 2026 Aditum — Aditum FieldOps — Public page: reschedule a visit picking a real slot (/reschedule/:token) */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { Icon, Button } from '../../components/ui';
import SlotPicker, { type DaySlots } from '../../components/SlotPicker';
import { PublicError } from './PublicView';
import { PublicShell, VisitCard } from './PublicConfirm';

export default function PublicReschedule() {
  const { t } = useTranslation();
  const { token } = useParams();
  const [order, setOrder] = useState<any>(null);
  const [slots, setSlots] = useState<DaySlots[]>([]);
  const [picked, setPicked] = useState<{ date: string; time: string } | null>(null);
  const [err, setErr] = useState<'desactivado' | 'expirado' | '404' | null>(null);
  const [used, setUsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ date: string; time: string } | null>(null);
  const [slotGone, setSlotGone] = useState(false);

  const handleErr = (e: any) => {
    const code = e?.details?.reason || '404';
    if (code === 'used') setUsed(true);
    else if (code === 'slot') setSlotGone(true);
    else setErr(code === 'disabled' ? 'desactivado' : code === 'expired' ? 'expirado' : '404');
  };

  const loadSlots = async () => {
    setSlotsLoading(true);
    try {
      const fn = httpsCallable(functions, 'getTechnicianSlots');
      const res: any = await fn({ token, days: 14 });
      setSlots(res.data.slots || []);
    } catch (e: any) {
      handleErr(e);
    } finally {
      setSlotsLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fn = httpsCallable(functions, 'getPublicServiceOrder');
        const res: any = await fn({ token, purpose: 'so_reschedule' });
        if (cancelled) return;
        setOrder(res.data.order);
        await loadSlots();
      } catch (e: any) {
        if (!cancelled) handleErr(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const pick = async (v: { date: string; time: string }) => {
    setPicked(v);
    setSlotGone(false);
    // bloqueo optimista del slot (reduce carreras; la transacción final garantiza)
    try {
      await httpsCallable(functions, 'holdSlot')({ token, date: v.date, time: v.time });
    } catch { /* el hold es best-effort */ }
  };

  const save = async () => {
    if (!picked) return;
    setSaving(true);
    try {
      const fn = httpsCallable(functions, 'rescheduleServiceOrder');
      const res: any = await fn({ token, date: picked.date, time: picked.time });
      setDone({ date: res.data.date, time: res.data.time });
    } catch (e: any) {
      handleErr(e);
      if (e?.details?.reason === 'slot') {
        setPicked(null);
        await loadSlots();
      }
    } finally {
      setSaving(false);
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
          <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700 }}>{t('publicReschedule.doneTitle')}</h1>
          <p style={{ margin: 0, fontSize: 14.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
            {t('publicReschedule.doneMsg', { date: done.date, time: done.time })}
          </p>
        </div>
      </PublicShell>
    );

  return (
    <PublicShell>
      <div className="card card-pad fade-in" style={{ padding: '28px 26px' }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 21, fontWeight: 700 }}>{t('publicReschedule.title')}</h1>
        <p style={{ margin: '0 0 18px', fontSize: 14, color: 'var(--text-2)', lineHeight: 1.55 }}>
          {t('publicReschedule.intro', { tech: order.techName || '' })}
        </p>
        <VisitCard order={order} />

        <div className="section-label" style={{ margin: '4px 0 12px' }}>{t('publicReschedule.pickSlot')}</div>
        <SlotPicker slots={slots} value={picked} onChange={pick} loading={slotsLoading} />

        {slotGone && (
          <div style={{ marginTop: 12, background: 'var(--st-proc-bg)', color: 'var(--st-proc-fg)', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
            {t('publicReschedule.slotGone')}
          </div>
        )}

        {picked && (
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 14, marginBottom: 12, textAlign: 'center' }}>
              {t('publicReschedule.summary')} <b className="mono">{picked.date} · {picked.time}</b>
            </div>
            <Button block variant="gold" icon="check" onClick={save} disabled={saving} style={{ height: 50, fontSize: 15.5 }}>
              {saving ? '…' : t('publicReschedule.confirmBtn')}
            </Button>
          </div>
        )}
      </div>
    </PublicShell>
  );
}
