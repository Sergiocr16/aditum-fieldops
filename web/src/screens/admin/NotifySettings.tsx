/* © 2026 Aditum — Aditum FieldOps — Maintenance & notification parameters (admin) */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { onSnapshot, setDoc } from 'firebase/firestore';
import { useTenant } from '../../lib/tenant';
import { Button, Field, Input, Toggle, toast } from '../../components/ui';
import { PageHeader } from './AdminShell';
import { now } from '../../lib/time';
import type { AppCtx } from '../../lib/ctx';

const DEFAULTS = {
  horizonDays: 60,
  defaultNoticeDaysBefore: 3,
  reminderEnabled: true,
  slotDurationMin: 60,
  holdMinutes: 15,
  tokenTtlDays: 14,
};

export default function NotifySettings(_props: { ctx: AppCtx }) {
  const { t } = useTranslation();
  const { tdoc } = useTenant();
  const [f, setF] = useState<any>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return onSnapshot(tdoc('settings', 'maintenance'), (snap) => {
      if (snap.exists() && !loaded) setF({ ...DEFAULTS, ...(snap.data() as any) });
      setLoaded(true);
    });
  }, []);

  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const num = (k: string, min: number, max: number) => (e: any) => {
    const v = e.target.value === '' ? '' : Math.max(min, Math.min(max, Number(e.target.value)));
    set(k, v);
  };

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(tdoc('settings', 'maintenance'), {
        horizonDays: Number(f.horizonDays) || DEFAULTS.horizonDays,
        defaultNoticeDaysBefore: Number(f.defaultNoticeDaysBefore) ?? DEFAULTS.defaultNoticeDaysBefore,
        reminderEnabled: !!f.reminderEnabled,
        slotDurationMin: Number(f.slotDurationMin) || DEFAULTS.slotDurationMin,
        holdMinutes: Number(f.holdMinutes) || DEFAULTS.holdMinutes,
        tokenTtlDays: Number(f.tokenTtlDays) || DEFAULTS.tokenTtlDays,
        updatedAt: now(),
      }, { merge: true });
      toast(t('common.saved'), 'success');
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fade-in" >
      <PageHeader title={t('notifySettings.title')} sub={t('notifySettings.sub')} />

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="section-label" style={{ marginBottom: 14 }}>{t('notifySettings.secScheduling')}</div>
        <div className="form-grid">
          <Field label={t('notifySettings.fHorizon')} hint={t('notifySettings.fHorizonHint')}>
            <Input type="number" min={7} max={365} value={f.horizonDays} onChange={num('horizonDays', 7, 365)} />
          </Field>
          <Field label={t('notifySettings.fNotice')} hint={t('notifySettings.fNoticeHint')}>
            <Input type="number" min={0} max={30} value={f.defaultNoticeDaysBefore} onChange={num('defaultNoticeDaysBefore', 0, 30)} />
          </Field>
          <Field label={t('notifySettings.fReminder')} hint={t('notifySettings.fReminderHint')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 42 }}>
              <Toggle on={!!f.reminderEnabled} onClick={() => set('reminderEnabled', !f.reminderEnabled)} />
              <span style={{ fontSize: 13.5, color: 'var(--text-2)' }}>{f.reminderEnabled ? t('common.yes') : t('common.no')}</span>
            </div>
          </Field>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="section-label" style={{ marginBottom: 14 }}>{t('notifySettings.secSlots')}</div>
        <div className="form-grid">
          <Field label={t('notifySettings.fSlot')} hint={t('notifySettings.fSlotHint')}>
            <Input type="number" min={15} max={240} step={15} value={f.slotDurationMin} onChange={num('slotDurationMin', 15, 240)} />
          </Field>
          <Field label={t('notifySettings.fHold')} hint={t('notifySettings.fHoldHint')}>
            <Input type="number" min={5} max={60} value={f.holdMinutes} onChange={num('holdMinutes', 5, 60)} />
          </Field>
          <Field label={t('notifySettings.fTtl')} hint={t('notifySettings.fTtlHint')}>
            <Input type="number" min={1} max={90} value={f.tokenTtlDays} onChange={num('tokenTtlDays', 1, 90)} />
          </Field>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={save} disabled={saving}>{saving ? '…' : t('common.save')}</Button>
      </div>
    </div>
  );
}
