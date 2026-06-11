/* © 2026 Aditum — Aditum FieldOps — Login */
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import { Logo, Icon, Field, Input, Button, Modal, LangSwitcher, toast } from '../components/ui';
import { useAuth, InactiveUserError } from '../lib/auth';

const LOGIN_IMAGES = ['/login/login-1.jpg', '/login/login-2.jpg', '/login/login-3.jpg', '/login/login-4.jpg', '/login/login-5.jpg', '/login/login-6.jpg'];

export default function Login() {
  const { t } = useTranslation();
  const { login } = useAuth();
  useEffect(() => { document.title = t('auth.signIn'); }, [t]);
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % LOGIN_IMAGES.length), 8500);
    return () => clearInterval(id);
  }, []);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);

  const sendForgot = async () => {
    if (!forgotEmail.trim()) return;
    setForgotBusy(true);
    try {
      await httpsCallable(functions, 'requestPasswordReset')({ email: forgotEmail.trim() });
    } catch {
      /* anti-enumeración: mostramos éxito igual */
    } finally {
      setForgotBusy(false);
      setForgotOpen(false);
      toast(t('auth.forgotSent'), 'success');
    }
  };

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
    <div style={{ minHeight: '100dvh', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'row-reverse', alignItems: 'stretch', background: 'var(--navy-900)' }}>
      {/* Carrusel a pantalla completa SOLO en móvil (detrás de la card) */}
      <div className="login-carousel-mobile" style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        {LOGIN_IMAGES.map((src, i) => (
          <div key={src} aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: `url(${src})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: i === slide ? 1 : 0, transition: 'opacity 1.4s ease' }} />
        ))}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, rgba(0,18,30,.5) 0%, rgba(0,18,30,.68) 100%)' }} />
      </div>

      {/* Idioma: claro sobre el panel plano (desktop) / oscuro sobre el carrusel (móvil) */}
      <div className="login-lang-desktop" style={{ position: 'absolute', top: 22, left: 26, zIndex: 4 }}><LangSwitcher /></div>
      <div className="login-lang-mobile" style={{ position: 'absolute', top: 20, right: 22, zIndex: 4 }}><LangSwitcher dark /></div>

      {/* Banner del carrusel con la marca (a la derecha; el carrusel va contenido al panel — sin zoom; oculto en móvil) */}
      <div className="login-brand" style={{ flex: '1 1 60%', position: 'relative', overflow: 'hidden', zIndex: 2 }}>
        {LOGIN_IMAGES.map((src, i) => (
          <div key={src} aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: `url(${src})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: i === slide ? 1 : 0, transition: 'opacity 1.4s ease' }} />
        ))}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, rgba(0,18,30,.42) 0%, rgba(0,18,30,.62) 100%)' }} />
        <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '48px 52px', color: '#fff' }}>
          {/* Logo fijado arriba-derecha (banner solo-desktop) */}
          <div style={{ position: 'absolute', top: 48, right: 52 }}>
            <Logo variant="dark" height={36} withLockup={false} dark />
          </div>
          {/* Hero centrado en el medio del carrusel (más ancho) */}
          <div style={{ maxWidth: 560 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(255,255,255,.14)', border: '1px solid rgba(255,255,255,.24)', color: '#fff', padding: '5px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, marginBottom: 22, backdropFilter: 'blur(2px)' }}>
              <Icon name="wrench" size={14} />
              {t('auth.heroBadge')}
            </div>
            <h1 style={{ fontSize: 38, lineHeight: 1.13, margin: '0 0 14px', fontWeight: 700, letterSpacing: '-.025em', color: '#fff' }}>{t('auth.heroTitle')}</h1>
            <p style={{ fontSize: 16, lineHeight: 1.6, color: 'rgba(255,255,255,.82)', margin: 0 }}>{t('auth.heroText')}</p>
          </div>
          {/* © fijado abajo-derecha */}
          <div style={{ position: 'absolute', bottom: 48, right: 52, textAlign: 'right', fontSize: 12.5, color: 'rgba(255,255,255,.6)' }}>© {new Date().getFullYear()} Aditum</div>
        </div>
      </div>

      {/* Derecha: panel plano con el formulario (desktop) / card sobre el carrusel (móvil) */}
      <div className="login-right" style={{ flex: '1 1 40%', position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div className="login-formwrap fade-in">
        <div style={{ marginBottom: 26 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
            <span style={{ width: 26, height: 2, borderRadius: 2, background: 'var(--text-3)' }} />
            <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--text-3)' }}>{t('auth.serviceCenter')}</span>
          </div>
          <h2 style={{ fontSize: 27, fontWeight: 700, margin: '0 0 7px', letterSpacing: '-.025em', lineHeight: 1.1 }}>{t('auth.signIn')}</h2>
          <p style={{ fontSize: 14.5, color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>{t('auth.signInSub')}</p>
        </div>

        {err && (
          <div className="fade-in" style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: 'var(--st-rech-bg)', border: '1px solid #f3cfcf', color: 'var(--st-rech-fg)', padding: '11px 13px', borderRadius: 12, fontSize: 13, marginBottom: 18, lineHeight: 1.4 }}>
            <Icon name="alert" size={16} style={{ marginTop: 1, flex: 'none' }} />
            <span>{err}</span>
          </div>
        )}

        <form onSubmit={submit} className="login-form" style={{ display: 'flex', flexDirection: 'column', gap: 17 }}>
            <Field label={t('auth.email')}>
              <Input icon="mail" type="email" placeholder={t('auth.emailPlaceholder')} value={email} onChange={(e: any) => setEmail(e.target.value)} error={!!err && !email} />
            </Field>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 7 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t('auth.password')}</label>
                <button type="button" onClick={() => { setForgotEmail(email); setForgotOpen(true); }} style={{ border: 'none', background: 'transparent', color: 'var(--navy-700)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}>{t('auth.forgot')}</button>
              </div>
              <div className="input-ico">
                <Icon name="lock" size={16} />
                <input className={'input' + (!!err && !pass ? ' err' : '')} type={showPass ? 'text' : 'password'} placeholder="••••••••" value={pass} onChange={(e) => setPass(e.target.value)} style={{ paddingRight: 44 }} />
                <button type="button" onClick={() => setShowPass((s) => !s)} aria-label={showPass ? 'Ocultar' : 'Mostrar'} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: 'var(--text-3)', padding: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="eye" size={17} />
                </button>
              </div>
            </div>
            <button type="submit" className="login-cta" disabled={loading} style={{ marginTop: 6 }}>
              {loading ? <span className="mono" style={{ fontSize: 13.5 }}>{t('auth.verifying')}</span> : <>{t('auth.signIn')}<Icon name="chevronRight" size={18} /></>}
            </button>
          </form>

          <p style={{ marginTop: 30, fontSize: 11.5, color: 'var(--text-3)', textAlign: 'center' }}>{t('copyright', { year: new Date().getFullYear() })}</p>
        </div>
        {/* Logo plateado (claro/translúcido) pequeño FUERA de la tarjeta, abajo, sobre el carrusel (solo móvil) */}
        <div className="login-mobile-foot" style={{ display: 'none', justifyContent: 'center', marginTop: 22, opacity: 0.7 }}>
          <Logo variant="dark" height={20} withLockup={false} dark />
        </div>
      </div>

      <Modal
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        width={420}
        title={t('auth.forgotTitle')}
        sub={t('auth.forgotSub')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setForgotOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" icon="send" onClick={sendForgot} disabled={forgotBusy || !forgotEmail.trim()}>{forgotBusy ? '…' : t('auth.forgotSend')}</Button>
          </>
        }
      >
        <Field label={t('auth.email')}>
          <Input icon="mail" type="email" placeholder={t('auth.forgotEmailPh')} value={forgotEmail} onChange={(e: any) => setForgotEmail(e.target.value)} onKeyDown={(e: any) => { if (e.key === 'Enter') sendForgot(); }} />
        </Field>
      </Modal>
    </div>
  );
}
