/* © 2026 Aditum — Aditum FieldOps — Página propia de reseteo de contraseña (/reset?oobCode=...) */
import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { Logo, Icon, Field, Button } from '../../components/ui';

type Phase = 'verifying' | 'invalid' | 'form' | 'done';

export default function PublicReset() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const oobCode = params.get('oobCode') || '';

  const [phase, setPhase] = useState<Phase>('verifying');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!oobCode) { setPhase('invalid'); return; }
      try {
        const mail = await verifyPasswordResetCode(auth, oobCode);
        if (!cancelled) { setEmail(mail); setPhase('form'); }
      } catch {
        if (!cancelled) setPhase('invalid');
      }
    })();
    return () => { cancelled = true; };
  }, [oobCode]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setErr('');
    if (pass.length < 6) { setErr(t('reset.weak')); return; }
    if (pass !== confirm) { setErr(t('reset.mismatch')); return; }
    setSaving(true);
    try {
      await confirmPasswordReset(auth, oobCode, pass);
      setPhase('done');
    } catch (ex: any) {
      if (ex?.code === 'auth/weak-password') setErr(t('reset.weak'));
      else { setPhase('invalid'); }
    } finally {
      setSaving(false);
    }
  };

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '24px' }}>
      <div className="card fade-in" style={{ width: '100%', maxWidth: 400, padding: '34px 30px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <Logo height={30} withLockup={false} />
        </div>
        {children}
      </div>
    </div>
  );

  if (phase === 'verifying') {
    return (
      <Shell>
        <div style={{ textAlign: 'center', color: 'var(--text-2)', padding: '16px 0' }}>
          <span className="spin"><Icon name="refresh" size={20} /></span>
          <div style={{ marginTop: 10, fontSize: 14 }}>{t('reset.verifying')}</div>
        </div>
      </Shell>
    );
  }

  if (phase === 'invalid') {
    return (
      <Shell>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 60, height: 60, borderRadius: 15, background: 'var(--st-rech-bg)', color: 'var(--st-rech-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Icon name="alert" size={28} />
          </div>
          <h1 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700 }}>{t('reset.invalidTitle')}</h1>
          <p style={{ margin: '0 0 22px', fontSize: 14, color: 'var(--text-2)', lineHeight: 1.55 }}>{t('reset.invalidMsg')}</p>
          <Button variant="primary" block onClick={() => navigate('/')}>{t('reset.backToLogin')}</Button>
        </div>
      </Shell>
    );
  }

  if (phase === 'done') {
    return (
      <Shell>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 60, height: 60, borderRadius: 15, background: 'var(--st-apro-bg)', color: 'var(--st-apro-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Icon name="checkCircle" size={28} />
          </div>
          <h1 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700 }}>{t('reset.successTitle')}</h1>
          <p style={{ margin: '0 0 22px', fontSize: 14, color: 'var(--text-2)', lineHeight: 1.55 }}>{t('reset.successMsg')}</p>
          <Button variant="primary" block onClick={() => navigate('/')}>{t('reset.backToLogin')}</Button>
        </div>
      </Shell>
    );
  }

  // form
  return (
    <Shell>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, textAlign: 'center' }}>{t('reset.title')}</h1>
      <p style={{ margin: '0 0 22px', fontSize: 13.5, color: 'var(--text-2)', textAlign: 'center', lineHeight: 1.5 }}>{t('reset.sub', { email })}</p>

      {err && (
        <div className="fade-in" style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: 'var(--st-rech-bg)', border: '1px solid #f3cfcf', color: 'var(--st-rech-fg)', padding: '11px 13px', borderRadius: 10, fontSize: 13, marginBottom: 16, lineHeight: 1.4 }}>
          <Icon name="alert" size={16} style={{ marginTop: 1, flex: 'none' }} />
          <span>{err}</span>
        </div>
      )}

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label={t('reset.newPassword')}>
          <div className="input-ico">
            <Icon name="lock" size={16} />
            <input className="input" type={show ? 'text' : 'password'} placeholder="••••••••" value={pass} onChange={(e) => setPass(e.target.value)} style={{ paddingRight: 40 }} autoFocus />
            <button type="button" onClick={() => setShow((s) => !s)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: 'var(--text-3)', padding: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="eye" size={16} />
            </button>
          </div>
        </Field>
        <Field label={t('reset.confirmPassword')}>
          <div className="input-ico">
            <Icon name="lock" size={16} />
            <input className="input" type={show ? 'text' : 'password'} placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={{ paddingRight: 12 }} />
          </div>
        </Field>
        <Button variant="primary" size="lg" block type="submit" disabled={saving}>
          {saving ? '…' : t('reset.save')}
        </Button>
      </form>
    </Shell>
  );
}
