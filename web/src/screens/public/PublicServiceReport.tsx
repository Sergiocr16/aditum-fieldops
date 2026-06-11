/* © 2026 Aditum — Aditum FieldOps — Public read-only service report (/r/:token) */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { BrandLogo, Icon, SOStatusBadge, MediaGallery, LangSwitcher } from '../../components/ui';
import { brandVars } from '../../lib/branding';
import DynamicChecklist from '../../components/DynamicChecklist';
import { PublicError } from './PublicView';

export default function PublicServiceReport() {
  const { t } = useTranslation();
  const { token } = useParams();
  const [report, setReport] = useState<any>(null);
  const [branding, setBranding] = useState<any>(null);
  const [err, setErr] = useState<'desactivado' | 'expirado' | '404' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fn = httpsCallable(functions, 'getPublicServiceReport');
        const res: any = await fn({ token });
        if (!cancelled) { setReport(res.data.report); setBranding(res.data.branding || null); }
      } catch (e: any) {
        if (cancelled) return;
        const code = e?.details?.reason || '404';
        setErr(code === 'disabled' || code === 'used' ? 'desactivado' : code === 'expired' ? 'expirado' : '404');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (loading)
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)' }}>
        <span className="spin" style={{ marginRight: 10 }}><Icon name="refresh" size={18} /></span>
        {t('public.loading')}
      </div>
    );
  if (err || !report) return <PublicError type={err || '404'} />;

  const eq = report.equipment || {};
  const photos = (report.photos || []).map((p: any, i: number) => ({ id: 'p' + i, file: p.url, type: 'image' as const, desc: p.desc || '', date: p.at || '' }));

  const Field = ({ label, value }: { label: string; value?: string | null }) => (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14.5, fontWeight: 500, lineHeight: 1.5 }}>{value || '—'}</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', ...brandVars(branding?.primaryColor, branding?.accentColor) } as React.CSSProperties}>
      <div style={{ background: 'var(--navy-900)', color: '#fff' }}>
        <div style={{ maxWidth: 880, margin: '0 auto', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <BrandLogo logoUrl={branding?.logoUrl} variant="dark" height={32} withLockup lockupColor="#fff" dark />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <LangSwitcher dark />
            <span className="mono" style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', background: 'rgba(255,255,255,.1)', padding: '5px 11px', borderRadius: 7 }}>{report.num}</span>
            <SOStatusBadge status={report.status} />
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 880, margin: '0 auto', padding: '28px 24px 60px' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700 }}>{t('publicReport.title')}</h1>
        <p style={{ margin: '0 0 24px', fontSize: 14, color: 'var(--text-2)' }}>
          {t('publicReport.sub', { type: t('serviceOrders.type_' + report.type) })}
        </p>

        <div className="card card-pad" style={{ marginBottom: 20 }}>
          <div className="public-summary">
            <Field label={t('publicReport.client')} value={report.clientName} />
            <Field label={t('publicReport.equipment')} value={[eq.typeName, eq.brand, eq.model].filter(Boolean).join(' ')} />
            <Field label={t('publicReport.serial')} value={eq.serial} />
            <Field label={t('publicReport.location')} value={eq.location} />
            <Field label={t('publicReport.tech')} value={report.techName} />
            <Field label={t('publicReport.date')} value={report.finishedAt || report.scheduledDate} />
          </div>
        </div>

        {(report.checklist || []).length > 0 && (
          <div className="card card-pad" style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 12px' }}>
              {t('publicReport.checklist')}
            </h2>
            <DynamicChecklist items={report.checklist} mode="readonly" />
          </div>
        )}

        {photos.length > 0 && (
          <div className="card card-pad" style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 12px' }}>
              {t('publicReport.photos')}
            </h2>
            <MediaGallery items={photos} />
          </div>
        )}

        {report.observations && (
          <div className="card card-pad" style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 10px' }}>
              {t('publicReport.observations')}
            </h2>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{report.observations}</p>
          </div>
        )}

        {report.signature && (
          <div className="card card-pad">
            <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 12px' }}>
              {t('publicReport.signature')}
            </h2>
            <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
              <img src={report.signature.url} alt="Firma" style={{ height: 100, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: 8 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 15.5 }}>{report.signature.name}</div>
                <div className="mono" style={{ fontSize: 13, color: 'var(--text-2)' }}>{report.signature.idNumber}</div>
                <div className="mono" style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{report.signature.at}</div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, color: 'var(--st-apro-fg)', fontSize: 13, fontWeight: 600 }}>
                <Icon name="checkCircle" size={17} />
                {t('publicReport.accepted')}
              </div>
            </div>
          </div>
        )}

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-3)', marginTop: 32 }}>{t('brand.developedBy')}</p>
      </div>

    </div>
  );
}
