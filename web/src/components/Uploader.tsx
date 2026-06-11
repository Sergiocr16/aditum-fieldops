/* © 2026 Aditum — Aditum FieldOps — Resumable evidence uploader (Firebase Storage) */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ref as storageRef, uploadBytes, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';
import { useTenant } from '../lib/tenant';
import { now } from '../lib/time';
import { Icon, toast } from './ui';
import type { AppCtx } from '../lib/ctx';
import type { Evidence, EvidenceType, Ticket } from '../lib/types';

const LIMITS = {
  image: { accept: 'image/jpeg,image/png,image/webp', max: 20 * 1024 * 1024 },
  video: { accept: 'video/mp4,video/quicktime,video/webm', max: 200 * 1024 * 1024 },
  pdf: { accept: 'application/pdf', max: 25 * 1024 * 1024 },
};

// El emulador de Storage no maneja bien las subidas resumables; en local subimos directo.
const USE_EMULATORS = import.meta.env.VITE_USE_EMULATORS === 'true';

function typeOf(file: File): EvidenceType {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type === 'application/pdf') return 'pdf';
  return 'image';
}

export default function Uploader({ ticket, ctx, kind, by, visitId }: { ticket: Ticket; ctx: AppCtx; kind: 'photo' | 'video'; by: string; visitId?: string | null }) {
  const { t } = useTranslation();
  const { tid } = useTenant();
  const isVideo = kind === 'video';
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [phase, setPhase] = useState<'upload' | 'finalize'>('upload');

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const evType = typeOf(file);
    const lim = LIMITS[evType];
    if (lim && file.size > lim.max) {
      toast(`${file.name}: > ${Math.round(lim.max / 1024 / 1024)}MB`, 'error');
      return;
    }
    const fileId = Math.random().toString(36).slice(2) + '-' + Date.now();
    const path = `tenants/${tid}/tickets/${ticket.id}/${fileId}-${file.name.replace(/[^\w.\-]/g, '_')}`;
    const sref = storageRef(storage, path);
    const metadata = { contentType: file.type, customMetadata: { ticketId: ticket.id, uploadedBy: by, evidenceId: fileId } };
    setProgress(0);
    setPhase('upload');
    // try/catch: si getDownloadURL o updateTicket fallan, mostramos el error y
    // limpiamos el progreso en vez de dejar el spinner colgado para siempre.
    const finalize = async () => {
      try {
        if (isVideo) setPhase('finalize'); // server function compresses & generates thumbnail
        const url = await getDownloadURL(sref);
        const entry: Evidence = {
          id: fileId,
          path,
          file: url,
          type: evType,
          name: file.name,
          size: file.size,
          desc: isVideo ? t('mobile.videoUploaded') : t('mobile.photoUploaded'),
          by,
          date: now(),
          status: evType === 'video' ? 'processing' : 'ready',
          visitId: visitId ?? null,
        };
        await ctx.updateTicket(ticket.id, { evidence: [...ticket.evidence, entry] });
        toast(isVideo ? t('mobile.videoUploaded') : t('mobile.photoUploaded'), 'success');
      } catch (e: any) {
        toast(e?.message || 'Error', 'error');
      } finally {
        setProgress(null);
      }
    };
    if (USE_EMULATORS) {
      // El emulador de Storage cuelga las subidas resumables (multi-chunk): se quedan en un
      // porcentaje bajo. En local subimos en una sola request. En producción se usa resumable.
      setPhase('finalize');
      uploadBytes(sref, file, metadata).then(finalize).catch((err: any) => { setProgress(null); toast(err.message, 'error'); });
      return;
    }
    const task = uploadBytesResumable(sref, file, metadata);
    task.on(
      'state_changed',
      (snap) => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      (err) => {
        setProgress(null);
        toast(err.message, 'error');
      },
      finalize
    );
  };

  return (
    <div>
      <input ref={inputRef} type="file" accept={isVideo ? LIMITS.video.accept : LIMITS.image.accept + ',' + LIMITS.pdf.accept} capture={isVideo ? undefined : undefined} style={{ display: 'none' }} onChange={onFile} />
      <button onClick={() => inputRef.current?.click()} className="m-upload-btn" disabled={progress !== null}>
        <span style={{ width: 42, height: 42, borderRadius: 11, background: 'var(--navy-800)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <Icon name={isVideo ? 'video' : 'camera'} size={21} />
        </span>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{isVideo ? t('mobile.uploadVideo') : t('mobile.takePhoto')}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{isVideo ? t('mobile.videoHint') : t('mobile.photoHint')}</div>
        </div>
        <Icon name="upload" size={18} style={{ marginLeft: 'auto', color: 'var(--text-3)' }} />
      </button>
      {progress !== null && (
        <div style={{ marginTop: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 11, padding: '10px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 7 }}>
            <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              {phase === 'finalize' ? (
                <>
                  <span className="spin"><Icon name="refresh" size={14} /></span>
                  {t('mobile.optimizing')}
                </>
              ) : (
                <>
                  <Icon name={isVideo ? 'video' : 'camera'} size={14} />
                  {t('mobile.uploading')}
                </>
              )}
            </span>
            <span className="mono" style={{ color: 'var(--text-2)' }}>{phase === 'finalize' ? '' : progress + '%'}</span>
          </div>
          <div style={{ height: 7, borderRadius: 5, background: 'var(--border)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: phase === 'finalize' ? '100%' : progress + '%',
                background: phase === 'finalize' ? 'var(--gold)' : 'var(--navy-700)',
                borderRadius: 5,
                transition: 'width .2s',
                ...(phase === 'finalize' ? { backgroundImage: 'linear-gradient(90deg,var(--gold) 25%,var(--gold-600) 37%,var(--gold) 63%)', backgroundSize: '400% 100%', animation: 'sk 1.1s ease infinite' } : {}),
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
