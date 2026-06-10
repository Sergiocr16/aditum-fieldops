/* © 2026 Aditum — Aditum FieldOps — Technician mobile: client signature & service close */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../../lib/firebase';
import { useTenant } from '../../lib/tenant';
import { Icon, Button, Field, Input, EmptyState, toast } from '../../components/ui';
import SignaturePad, { type SignaturePadHandle } from '../../components/SignaturePad';
import { MobileHeader } from './MobileDashboard';
import { useServiceOrder, useServiceOrderActions } from '../../lib/serviceOrders';
import type { AppCtx } from '../../lib/ctx';

export default function MobileSignature({ ctx, id }: { ctx: AppCtx; id: string }) {
  const { t } = useTranslation();
  const { tid } = useTenant();
  const { order: so, loading } = useServiceOrder(id);
  const actions = useServiceOrderActions();
  const padRef = useRef<SignaturePadHandle>(null);
  const [name, setName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [empty, setEmpty] = useState(true);
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (!so) return <EmptyState icon="calendar" title={t('serviceOrders.notFound')} sub="" />;
  if (so.status !== 'EN_PROGRESO') {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
        <MobileHeader title={so.num} onBack={() => ctx.back()} />
        <div style={{ marginTop: 40 }}>
          <EmptyState icon="checkCircle" title={t('signature.alreadyDone')} sub="" />
        </div>
      </div>
    );
  }

  const confirm = async () => {
    if (!name.trim() || !idNumber.trim()) {
      toast(t('signature.fieldsErr'), 'error');
      return;
    }
    if (empty || !padRef.current || padRef.current.isEmpty()) {
      toast(t('signature.emptyErr'), 'error');
      return;
    }
    setBusy(true);
    try {
      const blob = await padRef.current.toBlob();
      if (!blob) throw new Error('No se pudo capturar la firma');
      const path = `tenants/${tid}/serviceOrders/${so.id}/firma-${Date.now()}.png`;
      const url = await new Promise<string>((resolve, reject) => {
        const task = uploadBytesResumable(storageRef(storage, path), blob, { contentType: 'image/png' });
        task.on('state_changed', undefined, reject, async () => resolve(await getDownloadURL(task.snapshot.ref)));
      });
      await actions.complete(so.id, { name: name.trim(), idNumber: idNumber.trim(), path, url }, so.observations);
      toast(t('signature.done'), 'success');
      ctx.go('techOrders');
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    } finally {
      setBusy(false);
    }
  };

  const eq = so.equipmentSnapshot || ({} as any);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <MobileHeader title={t('signature.title')} sub={so.num} onBack={() => ctx.back()} />

      <div className="m-scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px 14px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="card" style={{ padding: '13px 15px' }}>
          <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{t('signature.intro')}</div>
          <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 12.5 }} className="mono">
            <span style={{ fontWeight: 700 }}>{so.num}</span>
            <span style={{ color: 'var(--text-2)' }}>{eq.typeName}</span>
            <span style={{ color: 'var(--text-3)' }}>{so.scheduledDate}</span>
          </div>
        </div>

        <Field label={t('signature.fName')} required>
          <Input value={name} onChange={(e: any) => setName(e.target.value)} placeholder={t('signature.fNamePh')} autoComplete="off" />
        </Field>
        <Field label={t('signature.fId')} required>
          <Input value={idNumber} onChange={(e: any) => setIdNumber(e.target.value)} placeholder="1-2345-6789" autoComplete="off" />
        </Field>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{t('signature.fSign')} <span style={{ color: 'var(--st-rech-fg)' }}>*</span></span>
            <button onClick={() => padRef.current?.clear()} style={{ border: 'none', background: 'none', color: 'var(--text-2)', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <Icon name="refresh" size={13} />
              {t('signature.clear')}
            </button>
          </div>
          <SignaturePad ref={padRef} height={230} onChange={setEmpty} />
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 5, textAlign: 'center' }}>{t('signature.hint')}</div>
        </div>

        <Button block variant="gold" icon="check" onClick={confirm} disabled={busy} style={{ height: 52, fontSize: 15.5 }}>
          {busy ? '…' : t('signature.confirmBtn')}
        </Button>
      </div>
    </div>
  );
}
