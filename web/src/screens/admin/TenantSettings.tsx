/* © 2026 Aditum — Aditum FieldOps — Tenant settings (SMTP + branding) for the tenant admin */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { useTenant } from '../../lib/tenant';
import { Icon, Button, Field, Input, toast } from '../../components/ui';
import { PageHeader } from './AdminShell';
import AdminModules from './AdminModules';
import type { AppCtx } from '../../lib/ctx';

interface SmtpMeta {
  user?: string;
  fromName?: string;
  fromAddr?: string;
  passCiphertext?: string;
  lastTestAt?: string | null;
  lastError?: string | null;
}

export default function TenantSettings({ ctx }: { ctx: AppCtx }) {
  const { t } = useTranslation();
  const { tenant, tdoc } = useTenant();
  const [meta, setMeta] = useState<SmtpMeta | null>(null);
  const [user, setUser] = useState('');
  const [fromName, setFromName] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState('');

  useEffect(() => {
    return onSnapshot(tdoc('settings', 'smtp'), (snap) => {
      const d = snap.exists() ? (snap.data() as SmtpMeta) : null;
      setMeta(d);
      if (d) {
        setUser((u) => u || d.user || '');
        setFromName((f) => f || d.fromName || '');
      }
    }, () => {});
  }, []);

  const hasPass = !!meta?.passCiphertext;

  const save = async () => {
    if (!user.trim()) {
      toast(t('tenantSettings.userRequired'), 'error');
      return;
    }
    if (!hasPass && !password.trim()) {
      toast(t('tenantSettings.passRequired'), 'error');
      return;
    }
    setSaving(true);
    try {
      await httpsCallable(functions, 'saveSmtpConfig')({ user: user.trim(), fromName: fromName.trim(), password: password.trim() || undefined });
      setPassword('');
      toast(t('common.saved'), 'success');
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      await httpsCallable(functions, 'testSmtpConfig')({ to: testTo.trim() || undefined });
      toast(t('tenantSettings.testOk'), 'success');
    } catch (e: any) {
      toast(e?.message || t('tenantSettings.testErr'), 'error');
    } finally {
      setTesting(false);
    }
  };

  const status = tenant?.smtpStatus || 'unset';
  const statusColor = status === 'verified' ? 'var(--st-apro-fg)' : status === 'error' ? 'var(--st-rech-fg)' : 'var(--text-3)';

  return (
    <div className="fade-in" >
      <PageHeader title={t('tenantSettings.title')} sub={t('tenantSettings.sub')} />

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div className="section-label">{t('tenantSettings.smtpSection')}</div>
          <span className="badge" style={{ color: statusColor, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name={status === 'verified' ? 'checkCircle' : status === 'error' ? 'xCircle' : 'clock'} size={14} />
            {t('tenantSettings.status_' + status)}
          </span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 16px', lineHeight: 1.5 }}>{t('tenantSettings.smtpIntro')}</p>
        <div className="form-grid">
          <Field label={t('tenantSettings.fUser')} required hint={t('tenantSettings.fUserHint')}>
            <Input type="email" placeholder="service@cliente.com" value={user} onChange={(e: any) => setUser(e.target.value)} />
          </Field>
          <Field label={t('tenantSettings.fFromName')} hint={t('tenantSettings.fFromNameHint')}>
            <Input placeholder={tenant?.branding?.appName || 'Aditum Service'} value={fromName} onChange={(e: any) => setFromName(e.target.value)} />
          </Field>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label={t('tenantSettings.fPass')} required={!hasPass} hint={hasPass ? t('tenantSettings.fPassKeep') : t('tenantSettings.fPassHint')}>
              <Input type="password" placeholder={hasPass ? '••••••••••••••••' : 'abcd efgh ijkl mnop'} value={password} onChange={(e: any) => setPassword(e.target.value)} autoComplete="new-password" />
            </Field>
          </div>
        </div>
        {meta?.lastError && (
          <div style={{ marginTop: 12, background: 'var(--st-rech-bg)', color: 'var(--st-rech-fg)', borderRadius: 10, padding: '10px 12px', fontSize: 12.5 }}>
            {t('tenantSettings.lastError')}: {meta.lastError}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <Button onClick={save} disabled={saving}>{saving ? '…' : t('common.save')}</Button>
        </div>
      </div>

      <div className="card card-pad">
        <div className="section-label" style={{ marginBottom: 10 }}>{t('tenantSettings.testSection')}</div>
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 12px' }}>{t('tenantSettings.testIntro')}</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <Input type="email" placeholder={ctx.admin.email} value={testTo} onChange={(e: any) => setTestTo(e.target.value)} />
          </div>
          <Button variant="ghost" icon="send" onClick={test} disabled={testing}>{testing ? '…' : t('tenantSettings.sendTest')}</Button>
        </div>
        {meta?.lastTestAt && (
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '10px 0 0' }} className="mono">{t('tenantSettings.lastTest')}: {meta.lastTestAt}</p>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <AdminModules />
      </div>
    </div>
  );
}
