/* © 2026 Aditum — Aditum FieldOps — Editor de marca (white-label) para el admin del tenant.
   Visible solo si el tenant tiene whiteLabel habilitado (lo controla el superadmin).
   Elige primario + acento (la app deriva la escala) y sube su logo a tamaño fijo. */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { storage, functions } from '../../lib/firebase';
import { useTenant } from '../../lib/tenant';
import { Icon, Button, Field, Input, toast } from '../../components/ui';
import { brandVars, isValidHex, ADITUM_PRIMARY, ADITUM_ACCENT } from '../../lib/branding';

export default function BrandingSettings() {
  const { t } = useTranslation();
  const { tenant, tid } = useTenant();
  const b = tenant?.branding;
  const [primary, setPrimary] = useState(b?.primaryColor || ADITUM_PRIMARY);
  const [accent, setAccent] = useState(b?.accentColor || ADITUM_ACCENT);
  const [logoUrl, setLogoUrl] = useState(b?.logoUrl || '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const vars = brandVars(primary, accent);
  const okColors = isValidHex(primary) && isValidHex(accent);

  const onLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !tid) return;
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) {
      toast(t('branding.logoType'), 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast(t('branding.logoSize'), 'error');
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `tenants/${tid}/branding/logo-${Date.now()}.${ext}`;
      const snap = await uploadBytes(storageRef(storage, path), file, { contentType: file.type });
      setLogoUrl(await getDownloadURL(snap.ref));
      toast(t('branding.logoUploaded'), 'success');
    } catch (err: any) {
      toast(err?.message || 'Error', 'error');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!tid || !okColors) return;
    setSaving(true);
    try {
      await httpsCallable(functions, 'updateTenant')({ tenantId: tid, branding: { primaryColor: primary, accentColor: accent, logoUrl } });
      toast(t('common.saved'), 'success');
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    } finally {
      setSaving(false);
    }
  };

  const ColorRow = ({ label, value, set }: { label: string; value: string; set: (v: string) => void }) => (
    <Field label={label} error={isValidHex(value) ? undefined : t('branding.hexInvalid')}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input type="color" value={isValidHex(value) ? value : '#000000'} onChange={(e) => set(e.target.value)} style={{ width: 44, height: 38, padding: 2, border: '1px solid var(--border)', borderRadius: 8, background: '#fff', cursor: 'pointer' }} />
        <Input value={value} onChange={(e: any) => set(e.target.value)} placeholder="#0A3D62" style={{ maxWidth: 140 }} />
      </div>
    </Field>
  );

  return (
    <div className="card card-pad" style={{ marginBottom: 16 }}>
      <div className="section-label" style={{ marginBottom: 6 }}>{t('branding.title')}</div>
      <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 16px', lineHeight: 1.5 }}>{t('branding.intro')}</p>

      <div className="form-grid">
        <ColorRow label={t('branding.primary')} value={primary} set={setPrimary} />
        <ColorRow label={t('branding.accent')} value={accent} set={setAccent} />
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label={t('branding.logo')} hint={t('branding.logoHint')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Button variant="ghost" icon="upload" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? '…' : t('branding.logoUpload')}
              </Button>
              {logoUrl && (
                <button onClick={() => setLogoUrl('')} className="icon-btn" title={t('common.delete')} style={{ width: 34, height: 34 }}>
                  <Icon name="trash" size={15} />
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" style={{ display: 'none' }} onChange={onLogo} />
            </div>
          </Field>
        </div>
      </div>

      {/* Vista previa: logo a tamaño fijo sobre el primario + escala derivada */}
      <div style={{ marginTop: 8, borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)' }}>
        <div style={{ background: vars['--navy-800'], padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12, minHeight: 64 }}>
          {logoUrl ? (
            <img src={logoUrl} alt="" style={{ height: 30, width: 'auto', maxWidth: 180, objectFit: 'contain', display: 'block' }} />
          ) : (
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>{b?.appName || tenant?.name}</span>
          )}
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7, background: vars['--gold'], color: vars['--navy-900'], fontWeight: 700, fontSize: 12.5, padding: '5px 12px', borderRadius: 99 }}>
            <Icon name="checkCircle" size={14} /> {t('branding.previewTag')}
          </span>
        </div>
        <div style={{ display: 'flex', background: '#fff' }}>
          {['--navy-900', '--navy-800', '--navy-700', '--navy-600', '--navy-500', '--gold-600', '--gold', '--gold-100'].map((k) => (
            <div key={k} title={vars[k]} style={{ flex: 1, height: 26, background: vars[k] }} />
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <Button onClick={save} disabled={saving || !okColors}>{saving ? '…' : t('common.save')}</Button>
      </div>
    </div>
  );
}
