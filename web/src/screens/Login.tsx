/* © 2026 Aditum — Aditum FieldOps — Login */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Logo, Icon, Field, Input, Button, LangSwitcher } from '../components/ui';
import { useAuth, InactiveUserError } from '../lib/auth';

export default function Login() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const submit = async (e?: React.FormEvent) => {
    e && e.preventDefault();
    setErr('');
    if (!email || !pass) {
      setErr(t('auth.errEmpty'));
      return;
    }
    setLoading(true);
    try {
      await login(email, pass);
      // navigation handled by route guards once auth state updates
    } catch (ex: any) {
      if (ex instanceof InactiveUserError) setErr(t('auth.errInactive'));
      else setErr(t('auth.errInvalid'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--bg)' }}>
      <div
        className="login-brand"
        style={{ flex: '1 1 46%', background: 'linear-gradient(160deg,var(--navy-900),var(--navy-700))', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '48px 52px', color: '#fff' }}
      >
        <div style={{ position: 'absolute', inset: 0, opacity: 0.06, backgroundImage: 'repeating-linear-gradient(135deg,#fff 0 1px,transparent 1px 26px)' }} />
        <div style={{ position: 'relative' }}>
          <Logo variant="dark" height={36} withLockup lockupColor="#fff" dark />
        </div>
        <div style={{ position: 'relative', maxWidth: 420 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(222,182,110,.15)', border: '1px solid rgba(222,182,110,.3)', color: 'var(--gold)', padding: '5px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, marginBottom: 22 }}>
            <Icon name="wrench" size={14} />
            {t('auth.heroBadge')}
          </div>
          <h1 style={{ fontSize: 34, lineHeight: 1.15, margin: '0 0 14px', fontWeight: 700, letterSpacing: '-.02em' }}>{t('auth.heroTitle')}</h1>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: 'rgba(238,243,247,.7)', margin: 0 }}>{t('auth.heroText')}</p>
        </div>
        <div style={{ position: 'relative', fontSize: 12.5, color: 'rgba(238,243,247,.55)', display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span>{t('auth.heroMeta')} · Costa Rica</span>
          <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{t('brand.developedBy')}</span>
          <span style={{ color: 'rgba(238,243,247,.4)' }}>© {new Date().getFullYear()} Aditum Service</span>
        </div>
      </div>

      <div style={{ flex: '1 1 54%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 20, right: 24 }}>
          <LangSwitcher />
        </div>
        <div style={{ width: '100%', maxWidth: 380 }} className="fade-in">
          <div className="login-mobile-logo" style={{ display: 'none', marginBottom: 28, justifyContent: 'center' }}>
            <Logo height={34} />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-.01em' }}>{t('auth.signIn')}</h2>
          <p style={{ fontSize: 14, color: 'var(--text-2)', margin: '0 0 26px' }}>{t('auth.signInSub')}</p>

          {err && (
            <div className="fade-in" style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: 'var(--st-rech-bg)', border: '1px solid #f3cfcf', color: 'var(--st-rech-fg)', padding: '11px 13px', borderRadius: 10, fontSize: 13, marginBottom: 18, lineHeight: 1.4 }}>
              <Icon name="alert" size={16} style={{ marginTop: 1, flex: 'none' }} />
              <span>{err}</span>
            </div>
          )}

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label={t('auth.email')}>
              <Input icon="mail" type="email" placeholder={t('auth.emailPlaceholder')} value={email} onChange={(e: any) => setEmail(e.target.value)} error={!!err && !email} />
            </Field>
            <Field label={t('auth.password')}>
              <div className="input-ico">
                <Icon name="lock" size={16} />
                <input className={'input' + (!!err && !pass ? ' err' : '')} type={showPass ? 'text' : 'password'} placeholder="••••••••" value={pass} onChange={(e) => setPass(e.target.value)} style={{ paddingRight: 40 }} />
                <button type="button" onClick={() => setShowPass((s) => !s)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: 'var(--text-3)', padding: 4, cursor: 'pointer' }}>
                  <Icon name="eye" size={16} />
                </button>
              </div>
            </Field>
            <Button variant="primary" size="lg" block type="submit" disabled={loading}>
              {loading ? <span className="mono" style={{ fontSize: 13 }}>{t('auth.verifying')}</span> : t('auth.signIn')}
            </Button>
          </form>

          <p style={{ marginTop: 28, fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>{t('copyright', { year: new Date().getFullYear() })}</p>
        </div>
      </div>
    </div>
  );
}
