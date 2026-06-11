/* © 2026 Aditum — Aditum FieldOps — Public read-only ticket report */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { Logo, BrandLogo, Icon, StatusBadge, Lightbox, VideoPlayer, LangSwitcher } from '../../components/ui';
import { brandVars } from '../../lib/branding';
import type { Evidence } from '../../lib/types';

type ErrType = 'desactivado' | 'expirado' | '404';

function PublicHeader({ ticket, logoUrl }: any) {
  return (
    <div style={{ background: 'var(--navy-900)', color: '#fff' }}>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <BrandLogo logoUrl={logoUrl} variant="dark" height={32} withLockup lockupColor="#fff" dark />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LangSwitcher dark />
          <span className="mono" style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', background: 'rgba(255,255,255,.1)', padding: '5px 11px', borderRadius: 7 }}>{ticket.num}</span>
          <StatusBadge status={ticket.status} />
        </div>
      </div>
    </div>
  );
}
function PSection({ title, children }: any) {
  return (
    <section style={{ marginBottom: 26 }}>
      <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 12px', paddingBottom: 8, borderBottom: '2px solid var(--border)' }}>{title}</h2>
      {children}
    </section>
  );
}
function PField({ label, value, full }: any) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : 'auto' }}>
      <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14.5, color: 'var(--text)', fontWeight: 500, lineHeight: 1.5 }}>{value || '—'}</div>
    </div>
  );
}

export function PublicError({ type }: { type: ErrType }) {
  const { t } = useTranslation();
  const cfg: any = {
    desactivado: ['lock', t('publicError.disabledTitle'), t('publicError.disabledMsg'), 'var(--st-cerr-fg)', 'var(--st-cerr-bg)'],
    expirado: ['clock', t('publicError.expiredTitle'), t('publicError.expiredMsg'), 'var(--st-proc-fg)', 'var(--st-proc-bg)'],
    '404': ['alert', t('publicError.notFoundTitle'), t('publicError.notFoundMsg'), 'var(--st-rech-fg)', 'var(--st-rech-bg)'],
  }[type];
  const [icon, title, msg, fg, bg] = cfg;
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <div style={{ background: 'var(--navy-900)', padding: '18px 24px' }}>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <Logo variant="dark" height={30} withLockup lockupColor="#fff" dark />
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="card card-pad fade-in" style={{ maxWidth: 420, textAlign: 'center', padding: '40px 32px' }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
            <Icon name={icon} size={30} />
          </div>
          <h1 style={{ margin: '0 0 8px', fontSize: 21, fontWeight: 700 }}>{title}</h1>
          <p style={{ margin: 0, fontSize: 14.5, color: 'var(--text-2)', lineHeight: 1.6 }}>{msg}</p>
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)', fontSize: 12.5, color: 'var(--text-3)' }}>
            {t('publicError.help')} <span style={{ color: 'var(--navy-700)', fontWeight: 600 }}>soporte@aditum.cr</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PublicView() {
  const { t } = useTranslation();
  const { token } = useParams();
  const [tk, setTk] = useState<any>(null);
  const [branding, setBranding] = useState<any>(null);
  const [err, setErr] = useState<ErrType | null>(null);
  const [loading, setLoading] = useState(true);
  const [lb, setLb] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fn = httpsCallable(functions, 'getPublicTicket');
        const res: any = await fn({ token });
        if (cancelled) return;
        setTk(res.data.ticket);
        setBranding(res.data.branding || null);
      } catch (e: any) {
        if (cancelled) return;
        const code = e?.details?.reason || e?.message || '404';
        setErr(code === 'disabled' ? 'desactivado' : code === 'expired' ? 'expirado' : '404');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading)
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)' }}>
        <span className="spin" style={{ marginRight: 10 }}>
          <Icon name="refresh" size={18} />
        </span>
        {t('public.loading')}
      </div>
    );
  if (err || !tk) return <PublicError type={err || '404'} />;

  const images: Evidence[] = tk.evidence || [];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', ...brandVars(branding?.primaryColor, branding?.accentColor) } as React.CSSProperties}>
      <PublicHeader ticket={tk} logoUrl={branding?.logoUrl} />
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '28px 24px 60px' }}>
        <div style={{ marginBottom: 26 }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="file" size={14} />
            {t('public.reportLabel')}
          </div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-.01em', lineHeight: 1.2 }}>{tk.title}</h1>
        </div>

        <div className="card card-pad" style={{ marginBottom: 26 }}>
          <div className="public-summary">
            <PField label={t('public.ticketNum')} value={tk.num} />
            <PField label={t('public.client')} value={tk.client} />
            <PField label={t('public.site')} value={tk.site} />
            <PField label={t('public.address')} value={tk.address} full />
            <PField label={t('public.tech')} value={tk.techName} />
            <PField label={t('public.createdDate')} value={(tk.created || '').split(' ')[0]} />
            <PField label={t('public.finishedDate')} value={tk.readyAt ? tk.readyAt.split(' ')[0] : t('public.inProgress')} />
          </div>
        </div>

        <PSection title={t('public.requested')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <PField label={t('public.description')} value={tk.description} full />
            <PField label={t('public.instructions')} value={tk.instructions} full />
            <PField label={t('public.expected')} value={tk.expected} full />
            {tk.observations && <PField label={t('public.observations')} value={tk.observations} full />}
          </div>
        </PSection>

        {tk.techNote && (
          <PSection title={t('public.workDone')}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <PField label={t('public.techDesc')} value={tk.techNote} full />
              {tk.techObs && <PField label={t('public.techObs')} value={tk.techObs} full />}
              {tk.readyAt && <PField label={t('public.markedReady')} value={tk.readyAt} full />}
            </div>
          </PSection>
        )}

        <PSection title={t('public.checklistDone', { done: (tk.checklist || []).filter((c: any) => c.done).length, total: (tk.checklist || []).length })}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {(tk.checklist || []).map((c: any, i: number) => (
              <div key={i} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ flex: 'none', marginTop: 1, color: c.done ? 'var(--st-apro-dot)' : 'var(--text-3)' }}>
                  <Icon name={c.done ? 'checkCircle' : 'xCircle'} size={19} />
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, color: c.done ? 'var(--text)' : 'var(--text-3)' }}>{c.text}</div>
                  {c.done && c.at && <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{c.at}</div>}
                </div>
              </div>
            ))}
          </div>
        </PSection>

        {images.length > 0 && (
          <PSection title={`${t('public.evidence')} · ${images.length}`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {images.map((ev, i) =>
                ev.type === 'video' ? (
                  <div key={i}>
                    <VideoPlayer src={ev.file} label={ev.desc} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7, fontSize: 12.5 }}>
                      <span style={{ color: 'var(--text)', fontWeight: 500 }}>{ev.desc}</span>
                      <span className="mono" style={{ color: 'var(--text-3)' }}>{ev.date}</span>
                    </div>
                  </div>
                ) : ev.type === 'pdf' ? (
                  <a key={i} href={ev.file} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--border)', borderRadius: 12, padding: '13px 15px', textDecoration: 'none', color: 'var(--text)', background: '#fff' }}>
                    <span style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--st-rech-bg)', color: 'var(--st-rech-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                      <Icon name="file" size={18} />
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{ev.name || ev.desc}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>PDF</div>
                    </div>
                    <Icon name="download" size={18} style={{ color: 'var(--text-3)' }} />
                  </a>
                ) : (
                  <div key={i}>
                    <button onClick={() => setLb(i)} style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', padding: 0, cursor: 'pointer', display: 'block', width: '100%', background: '#08283d' }}>
                      <img src={ev.file} style={{ width: '100%', display: 'block' }} />
                    </button>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7, fontSize: 12.5 }}>
                      <span style={{ color: 'var(--text)', fontWeight: 500 }}>{ev.desc}</span>
                      <span className="mono" style={{ color: 'var(--text-3)' }}>{ev.date}</span>
                    </div>
                  </div>
                )
              )}
            </div>
          </PSection>
        )}

        {tk.approval && (
          <PSection title={t('public.approval')}>
            <div style={{ display: 'flex', gap: 13, background: 'var(--st-apro-bg)', border: '1px solid #bfe4cd', borderRadius: 14, padding: '16px 18px' }}>
              <span style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--st-apro-dot)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <Icon name="checkCircle" size={21} />
              </span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--st-apro-fg)' }}>{t('public.approvedTitle')}</div>
                <div style={{ fontSize: 13, color: '#2f7a52', margin: '2px 0 8px' }} className="mono">{tk.approval.at} · {tk.approval.by}</div>
                <p style={{ margin: 0, fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>{tk.approval.comment}</p>
              </div>
            </div>
          </PSection>
        )}

        <div style={{ textAlign: 'center', paddingTop: 24, borderTop: '1px solid var(--border)', marginTop: 10 }}>
          <Logo height={28} />
          <p style={{ fontSize: 14, color: 'var(--navy-700)', fontWeight: 700, margin: '12px 0 4px' }}>{t('brand.developedBy')}</p>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 4px' }}>{t('public.footer')}</p>
          <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: 0 }}>{t('copyright', { year: new Date().getFullYear() })}</p>
        </div>
      </div>
      {lb != null && <Lightbox items={images.filter((e) => e.type !== 'pdf')} index={lb} onClose={() => setLb(null)} onIndex={setLb} />}
    </div>
  );
}
