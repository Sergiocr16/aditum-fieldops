/* © 2026 Aditum — Aditum FieldOps — Configuración de facturación electrónica (GTI) */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { useTenant } from '../../lib/tenant';
import { Icon, Button, Field, Input, Select, Toggle, SearchSelect, toast } from '../../components/ui';
import { PageHeader } from './AdminShell';
import { FISCAL_CURRENCIES } from '../../lib/fiscal';
import { useActivity } from '../../lib/fiscalCatalogs';
import type { AppCtx } from '../../lib/ctx';

interface GtiMeta {
  accountNumber?: string;
  username?: string;
  activityCode?: string;
  terminal?: number;
  defaultCurrency?: 'CRC' | 'USD';
  environment?: 'sandbox' | 'production';
  enabled?: boolean;
  passCiphertext?: string;
  status?: 'unset' | 'verified' | 'error';
  lastTestAt?: string | null;
  lastError?: string | null;
}

// La clave viaja en query string: GTI no admite estos caracteres.
const PASS_BAD = /[#?&%/]/;

export default function GtiSettings({ ctx }: { ctx: AppCtx }) {
  const { t } = useTranslation();
  const { tdoc } = useTenant();
  const activity = useActivity();
  const [meta, setMeta] = useState<GtiMeta | null>(null);
  const [accountNumber, setAccountNumber] = useState('');
  const [username, setUsername] = useState('');
  const [activityCode, setActivityCode] = useState('');
  const [terminal, setTerminal] = useState('1');
  const [defaultCurrency, setDefaultCurrency] = useState<'CRC' | 'USD'>('CRC');
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox');
  const [enabled, setEnabled] = useState(false);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    return onSnapshot(tdoc('settings', 'gti'), (snap) => {
      const d = snap.exists() ? (snap.data() as GtiMeta) : null;
      setMeta(d);
      if (d) {
        setAccountNumber((v) => v || d.accountNumber || '');
        setUsername((v) => v || d.username || '');
        setActivityCode((v) => v || d.activityCode || '');
        setTerminal((v) => (v && v !== '1' ? v : String(d.terminal || 1)));
        setDefaultCurrency(d.defaultCurrency || 'CRC');
        setEnvironment(d.environment || 'sandbox');
        setEnabled(!!d.enabled);
      }
    }, () => {});
  }, []);

  const hasPass = !!meta?.passCiphertext;
  const status = meta?.status || 'unset';
  const statusColor = status === 'verified' ? 'var(--st-apro-fg)' : status === 'error' ? 'var(--st-rech-fg)' : 'var(--text-3)';

  const save = async () => {
    if (!accountNumber.trim()) return toast(t('gti.requiredAccount'), 'error');
    if (!username.trim()) return toast(t('gti.requiredUser'), 'error');
    if (!hasPass && !password.trim()) return toast(t('gti.requiredPass'), 'error');
    if (password && PASS_BAD.test(password)) return toast(t('gti.passBadChars'), 'error');
    setSaving(true);
    try {
      await httpsCallable(functions, 'saveGtiConfig')({
        accountNumber: accountNumber.trim(),
        username: username.trim(),
        activityCode: activityCode.trim(),
        terminal: Number(terminal) || 1,
        defaultCurrency,
        environment,
        enabled,
        password: password.trim() || undefined,
      });
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
      await httpsCallable(functions, 'testGtiConfig')({});
      toast(t('gti.testOk'), 'success');
    } catch (e: any) {
      toast(e?.message || t('gti.testErr'), 'error');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fade-in">
      <PageHeader
        title={t('gti.title')}
        sub={t('gti.sub')}
        back={() => ctx.go('fiscalHub')}
      />

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div className="section-label">{t('gti.credsSection')}</div>
          <span className="badge" style={{ color: statusColor, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name={status === 'verified' ? 'checkCircle' : status === 'error' ? 'xCircle' : 'clock'} size={14} />
            {t('gti.status_' + status)}
          </span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 16px', lineHeight: 1.5 }}>{t('gti.intro')}</p>
        <div className="form-grid">
          <Field label={t('gti.accountNumber')} required>
            <Input value={accountNumber} onChange={(e: any) => setAccountNumber(e.target.value)} />
          </Field>
          <Field label={t('gti.username')} required>
            <Input value={username} onChange={(e: any) => setUsername(e.target.value)} autoComplete="off" />
          </Field>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label={t('gti.password')} required={!hasPass} hint={hasPass ? t('gti.passKeep') : t('gti.passHint')} error={password && PASS_BAD.test(password) ? t('gti.passBadChars') : undefined}>
              <Input type="password" placeholder={hasPass ? '••••••••••••' : ''} value={password} onChange={(e: any) => setPassword(e.target.value)} autoComplete="new-password" />
            </Field>
          </div>
          <Field label={t('gti.activityCode')} hint={t('gti.activityCodeHint')}>
            <SearchSelect
              value={activityCode}
              items={activity.rows}
              search={(q: string) => activity.search(q)}
              toCode={(it: any) => it.c}
              toLabel={(it: any) => it.n}
              placeholder={t('gti.activitySearch')}
              loadingHint={t('common.loading')}
              onPick={(it: any) => setActivityCode(it ? it.c : '')}
            />
          </Field>
          <Field label={t('gti.terminal')}>
            <Input type="number" value={terminal} onChange={(e: any) => setTerminal(e.target.value)} />
          </Field>
          <Field label={t('gti.defaultCurrency')}>
            <Select value={defaultCurrency} onChange={(e: any) => setDefaultCurrency(e.target.value)}>
              {FISCAL_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label={t('gti.environment')} hint={t('gti.environmentHint')}>
            <Select value={environment} onChange={(e: any) => setEnvironment(e.target.value)}>
              <option value="sandbox">{t('gti.envSandbox')}</option>
              <option value="production">{t('gti.envProduction')}</option>
            </Select>
          </Field>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('gti.enabled')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('gti.enabledHint')}</div>
          </div>
          <Toggle on={enabled} onClick={() => setEnabled((v) => !v)} />
        </div>

        {meta?.lastError && (
          <div style={{ marginTop: 12, background: 'var(--st-rech-bg)', color: 'var(--st-rech-fg)', borderRadius: 10, padding: '10px 12px', fontSize: 12.5 }}>
            {t('gti.lastError')}: {meta.lastError}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
          <Button variant="ghost" icon="zap" onClick={test} disabled={testing}>{testing ? '…' : t('gti.testBtn')}</Button>
          <Button variant="primary" onClick={save} disabled={saving}>{saving ? '…' : t('common.save')}</Button>
        </div>
        {meta?.lastTestAt && <p className="mono" style={{ fontSize: 12, color: 'var(--text-3)', margin: '10px 0 0' }}>{t('gti.lastTest')}: {meta.lastTestAt}</p>}
      </div>
    </div>
  );
}
