/* © 2026 Aditum — Aditum FieldOps — Public read-only service report (/r/:token) */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import { BrandLogo, Icon, SOStatusBadge, MediaGallery, LangSwitcher, EquipmentConditionBadge } from '../../components/ui';
import { brandVars } from '../../lib/branding';
import DynamicChecklist from '../../components/DynamicChecklist';
import { VisitBar } from '../../components/visits';
import { fmtDuration } from '../../lib/time';
import { PublicError } from './PublicView';

function PublicVisits({ visits, evidence }: { visits: any[]; evidence: any[] }) {
  const { t } = useTranslation();
  const lastId = visits.length ? visits[visits.length - 1].id : '';
  const [over, setOver] = useState<Record<string, boolean>>({});
  const isOpen = (vid: string) => (vid in over ? over[vid] : vid === lastId);
  const toggle = (vid: string) => setOver((p) => ({ ...p, [vid]: !isOpen(vid) }));
  const totalMin = visits.reduce((a, v) => a + (v.minutes || 0), 0);
  return (
    <div className="card" style={{ overflow: 'hidden', marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 16px 4px' }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', margin: 0 }}>{t('ticketDetail.visitsTitle', { count: visits.length })}</h2>
        {totalMin > 0 && <span style={{ fontSize: 13, fontWeight: 700 }}>{t('serviceOrders.totalHours')}: {fmtDuration(totalMin)}</span>}
      </div>
      {visits.map((v: any, idx: number) => {
        const photos = evidence.filter((e) => e.visitId === v.id).map((e: any, i: number) => ({ id: 'v' + idx + '-' + i, file: e.file, type: e.type, desc: e.desc || '', date: e.date || '', name: e.name }));
        const open = isOpen(v.id);
        return (
          <div key={v.id}>
            <VisitBar index={idx} dateStr={v.date} meta={v.minutes ? fmtDuration(v.minutes) : v.techName} preview={v.note} count={photos.length} open={open} onToggle={() => toggle(v.id)} />
            {open && (
              <div className="fade-in" style={{ padding: '0 16px 16px 73px' }}>
                {v.minutes ? <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700 }}>{fmtDuration(v.minutes)}</p> : null}
                {v.note ? <p style={{ margin: '0 0 10px', fontSize: 14, lineHeight: 1.55 }}>{v.note}</p> : null}
                {photos.length > 0 && <MediaGallery items={photos} />}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

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
  const isDemand = (report.mode || 'periodico') === 'demanda';
  const equipments = report.equipments || [];
  const visits = report.visits || [];
  const photos = (report.photos || []).map((p: any, i: number) => ({ id: 'p' + i, file: p.url, type: 'image' as const, desc: p.desc || '', date: p.at || '' }));
  // Evidencia suelta (sin día): la de cada visita se muestra en el acordeón de visitas.
  const looseEvidence = (report.evidence || []).filter((e: any) => !e.visitId);
  const evidence = looseEvidence.map((e: any, i: number) => ({ id: 'e' + i, file: e.file, type: e.type, desc: e.desc || '', date: e.date || '', name: e.name }));

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
          {isDemand ? (report.title || t('publicReport.title')) : t('publicReport.sub', { type: t('serviceOrders.type_' + report.type) })}
        </p>

        <div className="card card-pad" style={{ marginBottom: 20 }}>
          <div className="public-summary">
            <Field label={t('publicReport.client')} value={report.clientName} />
            {isDemand ? (
              <Field label={t('serviceOrders.fSite')} value={report.site || report.address} />
            ) : equipments.length > 1 ? (
              <Field label={t('publicReport.equipment')} value={t('serviceOrders.nEquipment', { count: equipments.length })} />
            ) : (
              <>
                <Field label={t('publicReport.equipment')} value={[eq.typeName, eq.brand, eq.model].filter(Boolean).join(' ')} />
                <Field label={t('publicReport.serial')} value={eq.serial} />
                <Field label={t('publicReport.location')} value={eq.location} />
              </>
            )}
            <Field label={t('publicReport.tech')} value={report.techName} />
            <Field label={t('publicReport.date')} value={report.finishedAt || report.scheduledDate} />
          </div>
          {isDemand && report.description && (
            <p style={{ margin: '14px 0 0', fontSize: 14, lineHeight: 1.6, color: 'var(--text-2)' }}>{report.description}</p>
          )}
        </div>

        {/* Demanda: checklist ad-hoc */}
        {isDemand && (report.checklist || []).length > 0 && (
          <div className="card card-pad" style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 12px' }}>
              {t('publicReport.checklist')}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {report.checklist.map((it: any, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                  <Icon name={it.done ? 'checkCircle' : 'circle'} size={16} style={{ color: it.done ? 'var(--st-apro-fg)' : 'var(--text-3)' }} />
                  <span style={{ textDecoration: it.done ? 'line-through' : 'none', color: it.done ? 'var(--text-3)' : 'inherit' }}>{it.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Periódico/correctivo: una sección de checklist por equipo */}
        {!isDemand && equipments.map((e: any, i: number) => (
          (e.checklist || []).length > 0 && (
            <div className="card card-pad" style={{ marginBottom: 20 }} key={i}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, margin: '0 0 4px' }}>
                <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', margin: 0 }}>
                  {e.equipmentSnapshot?.typeName || t('publicReport.equipment')}
                </h2>
                <EquipmentConditionBadge condition={e.condition} size="sm" />
              </div>
              <div className="mono" style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 12px' }}>
                {[e.equipmentSnapshot?.brand, e.equipmentSnapshot?.model].filter(Boolean).join(' ')}{e.equipmentSnapshot?.serial ? ` · S/N ${e.equipmentSnapshot.serial}` : ''}{e.equipmentSnapshot?.location ? ` · ${e.equipmentSnapshot.location}` : ''}
              </div>
              <DynamicChecklist items={e.checklist} mode="readonly" />
            </div>
          )
        ))}

        {isDemand && visits.length > 0 && <PublicVisits visits={visits} evidence={report.evidence || []} />}

        {evidence.length > 0 && (
          <div className="card card-pad" style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 12px' }}>
              {t('serviceOrders.evidence')}
            </h2>
            <MediaGallery items={evidence} />
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
