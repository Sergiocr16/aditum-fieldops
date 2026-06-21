/* © 2026 Aditum — Aditum FieldOps — Shared UI components (ported from Claude Design) */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { STATUS, SO_STATUS, PRIORITY, PRIORITY_COLOR, TIMELINE_COLOR } from '../lib/config';
import { setLang } from '../i18n';
import type { Evidence, HistoryEntry, ShareLink } from '../lib/types';

/* ---------------- Icons (linear, 1.7 stroke) ---------------- */
export const ICONS: Record<string, string> = {
  dashboard: 'M3 13h7V3H3v10Zm0 8h7v-6H3v6Zm11 0h7V11h-7v10Zm0-18v6h7V3h-7Z',
  ticket:
    'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V6ZM13 4v3M13 11v2M13 17v3',
  users:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35',
  filter: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3Z',
  check: 'M20 6 9 17l-5-5',
  checkCircle: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3',
  circle: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  x: 'M18 6 6 18M6 6l12 12',
  xCircle: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM15 9l-6 6M9 9l6 6',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 2',
  mapPin: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  camera:
    'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2v11Z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  video: 'M23 7l-7 5 7 5V7Z M14 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  copy:
    'M20 9H11a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2Z M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  link:
    'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  chevronDown: 'M6 9l6 6 6-6',
  chevronRight: 'M9 18l6-6-6-6',
  chevronLeft: 'M15 18l-6-6 6-6',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z',
  dots: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM12 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM12 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  calendar: 'M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2ZM16 2v4M8 2v4M3 10h18',
  alert: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0ZM12 9v4M12 17h.01',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  play: 'M5 3l14 9-14 9V3Z',
  grip:
    'M9 5a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM9 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM15 5a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM15 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM15 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  trash: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z M22 6 12 13 2 6',
  phone:
    'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z',
  lock: 'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2ZM7 11V7a5 5 0 0 1 10 0v4',
  refresh: 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  building: 'M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01',
  arrowLeft: 'M19 12H5M12 19l-7-7 7-7',
  menu: 'M3 12h18M3 6h18M3 18h18',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z',
  external: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z M14 2v6h6',
  wrench: 'M7 10h3V7L6.5 3.5a6 6 0 0 1 8 8l6 6a2 2 0 0 1-3 3l-6-6a6 6 0 0 1-8-8L7 10',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  zap: 'M13 2 3 14h9l-1 8 10-12h-9l1-8Z',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z',
  clipboard: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z M9.5 14.5l2 2 3.5-3.5',
  cpu: 'M4 4h16v16H4z M9 9h6v6H9z M9 1v3 M15 1v3 M9 20v3 M15 20v3 M20 9h3 M20 14h3 M1 9h3 M1 14h3',
  box: 'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z M3.3 7 12 12l8.7-5 M12 22V12',
  receipt: 'M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z M8 8h8 M8 12h8 M8 16h6',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z',
  sliders: 'M20 7h-9 M14 17H5 M17 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z M7 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
};

export function Icon({ name, size = 18, stroke = 1.7, fill = 'none', className = '', style }: any) {
  const d = ICONS[name];
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block', ...style }}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

/* ---------------- Logo ---------------- */
export function Logo({ variant = 'horizontal', height = 30, withLockup = true, lockupColor = 'var(--text)', dark = false }: any) {
  const src = variant === 'stacked' ? '/assets/aditum-stacked.png' : '/assets/aditum-horizontal.png';
  const imgStyle: any = { height, display: 'block', width: 'auto' };
  if (variant === 'dark') imgStyle.filter = 'brightness(0) invert(1)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <img src={src} alt="Aditum" style={imgStyle} />
      {withLockup && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            paddingLeft: 10,
            marginLeft: 1,
            borderLeft: '1.5px solid ' + (dark ? 'rgba(255,255,255,.25)' : 'var(--border-strong)'),
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: Math.max(4, Math.round(height * 0.16)), fontWeight: 700, fontSize: height * 0.55, letterSpacing: '-.01em', color: 'var(--gold-600)', lineHeight: 1 }}>
            <img src="/service-icon.png" alt="" style={{ height: Math.round(height * 0.78), width: 'auto', display: 'block' }} />
            Service
          </span>
        </span>
      )}
    </span>
  );
}

/* ---------------- Brand logo (white-label) ----------------
   Si el tenant subió su logo, se muestra a una ALTURA FIJA con object-fit:contain
   (cualquier imagen entra en el slot sin descalzar el layout). Si no, cae al logo Aditum.
   El logo del tenant se muestra tal cual (sin invertir): debe verse bien sobre su color primario. */
export function BrandLogo({ logoUrl, height = 30, variant = 'horizontal', withLockup = true, lockupColor = 'var(--text)', dark = false }: any) {
  if (logoUrl) {
    return <img src={logoUrl} alt="" style={{ height, width: 'auto', maxWidth: height * 6, objectFit: 'contain', display: 'block' }} />;
  }
  return <Logo variant={variant} height={height} withLockup={withLockup} lockupColor={lockupColor} dark={dark} />;
}

/* ---------------- Status badge / Priority chip ---------------- */
export function StatusBadge({ status, size }: any) {
  const { t } = useTranslation();
  const s = STATUS[status as keyof typeof STATUS];
  if (!s) return null;
  return (
    <span className={'badge ' + (size || '') + ' bg-' + s.cls}>
      <span className="dot" />
      {t('status.' + status)}
    </span>
  );
}
export function SOStatusBadge({ status, size }: any) {
  const { t } = useTranslation();
  const s = SO_STATUS[status as keyof typeof SO_STATUS];
  if (!s) return null;
  return (
    <span className={'badge ' + (size || '') + ' bg-' + s.cls}>
      <span className="dot" />
      {t('soStatus.' + status)}
    </span>
  );
}
/** Estados de equipo + clase de color (reusa --st-*). */
export const CONDITIONS = ['operativo', 'mal_estado', 'en_reparacion', 'fuera_servicio'] as const;
const CONDITION_CLS: Record<string, string> = { operativo: 'apro', mal_estado: 'revi', en_reparacion: 'asig', fuera_servicio: 'rech' };
export function EquipmentConditionBadge({ condition, size }: { condition?: string; size?: string }) {
  const { t } = useTranslation();
  const c = condition || 'operativo';
  return (
    <span className={'badge ' + (size || '') + ' bg-' + (CONDITION_CLS[c] || 'pend')}>
      <span className="dot" />
      {t('equipment.cond_' + c)}
    </span>
  );
}
export function PriorityChip({ priority }: any) {
  const { t } = useTranslation();
  const p = PRIORITY[priority as keyof typeof PRIORITY];
  if (!p) return null;
  const color = PRIORITY_COLOR[priority as keyof typeof PRIORITY_COLOR];
  return (
    <span className={'chip ' + p.cls}>
      <span className="tri" style={{ borderBottom: '7px solid ' + color }} />
      {t('priority.' + priority)}
    </span>
  );
}

/* ---------------- Avatar ---------------- */
export function Avatar({ initials, size = 34, gold = false }: any) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flex: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.38,
        fontWeight: 700,
        letterSpacing: '.02em',
        background: gold ? 'var(--gold)' : 'var(--navy-700)',
        color: gold ? 'var(--navy-900)' : '#fff',
      }}
    >
      {initials}
    </span>
  );
}

/* ---------------- Button ---------------- */
export function Button({ variant = 'ghost', size, icon, iconRight, block, children, ...rest }: any) {
  const cls = ['btn', 'btn-' + variant, size ? 'btn-' + size : '', block ? 'btn-block' : ''].filter(Boolean).join(' ');
  return (
    <button className={cls} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 15 : 17} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 15 : 17} />}
    </button>
  );
}

/* ---------------- Modal ---------------- */
export function Modal({ open, onClose, title, sub, children, footer, width = 520, tone }: any) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose && onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      onMouseDown={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,30,47,.45)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="fade-in"
        style={{
          background: '#fff',
          borderRadius: 16,
          boxShadow: 'var(--sh-pop)',
          width: '100%',
          maxWidth: typeof width === 'number' ? Math.min(Math.round(width * 1.9), 1140) : width,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {title && (
          <div style={{ padding: '20px 22px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            {tone && (
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  flex: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: tone === 'danger' ? 'var(--st-rech-bg)' : tone === 'success' ? 'var(--st-apro-bg)' : 'var(--st-asig-bg)',
                  color: tone === 'danger' ? 'var(--st-rech-fg)' : tone === 'success' ? 'var(--st-apro-fg)' : 'var(--st-asig-fg)',
                }}
              >
                <Icon name={tone === 'danger' ? 'alert' : tone === 'success' ? 'checkCircle' : 'link'} size={20} />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{title}</h3>
              {sub && <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.45 }}>{sub}</p>}
            </div>
            <button className="btn-quiet" onClick={onClose} style={{ border: 'none', background: 'transparent', padding: 6, borderRadius: 8, color: 'var(--text-3)' }}>
              <Icon name="x" size={18} />
            </button>
          </div>
        )}
        <div style={{ padding: '18px 22px', overflowY: 'auto' }}>{children}</div>
        {footer && (
          <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end', background: 'var(--surface-2)' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Toast ---------------- */
let _toastFn: ((msg: string, tone?: string) => void) | null = null;
export function toast(msg: string, tone = 'default') {
  _toastFn && _toastFn(msg, tone);
}
export function Toaster() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    _toastFn = (msg, tone) => {
      const id = Math.random().toString(36).slice(2);
      setItems((x) => [...x, { id, msg, tone }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3200);
    };
    return () => {
      _toastFn = null;
    };
  }, []);
  return (
    <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 2000, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
      {items.map((i) => (
        <div
          key={i.id}
          className="fade-in"
          style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--navy-900)', color: '#fff', padding: '11px 16px', borderRadius: 12, boxShadow: 'var(--sh-pop)', fontSize: 14, fontWeight: 500, maxWidth: 380 }}
        >
          <span style={{ color: i.tone === 'success' ? '#5fd391' : i.tone === 'error' ? '#ff8a8a' : 'var(--gold)', display: 'flex' }}>
            <Icon name={i.tone === 'error' ? 'alert' : 'checkCircle'} size={18} />
          </span>
          {i.msg}
        </div>
      ))}
    </div>
  );
}

/* ---------------- Confirm dialog (styled, promise-based) ---------------- */
interface ConfirmOpts {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'success' | 'info';
  confirmIcon?: string;
}
let _confirmFn: ((opts: ConfirmOpts, resolve: (v: boolean) => void) => void) | null = null;
export function confirmDialog(opts: ConfirmOpts): Promise<boolean> {
  if (_confirmFn) return new Promise((resolve) => _confirmFn!(opts, resolve));
  return Promise.resolve(typeof window !== 'undefined' ? window.confirm(opts.message || opts.title) : false);
}
export function ConfirmRoot() {
  const { t } = useTranslation();
  const [state, setState] = useState<{ opts: ConfirmOpts; resolve: (v: boolean) => void } | null>(null);
  useEffect(() => {
    _confirmFn = (opts, resolve) => setState({ opts, resolve });
    return () => {
      _confirmFn = null;
    };
  }, []);
  if (!state) return null;
  const { opts, resolve } = state;
  const done = (v: boolean) => {
    resolve(v);
    setState(null);
  };
  return (
    <Modal
      open
      onClose={() => done(false)}
      width={420}
      tone={opts.tone || 'info'}
      title={opts.title}
      footer={
        <>
          <Button variant="ghost" onClick={() => done(false)}>
            {opts.cancelLabel || t('common.cancel')}
          </Button>
          <Button variant={opts.tone === 'danger' ? 'danger' : opts.tone === 'success' ? 'success' : 'primary'} icon={opts.confirmIcon} onClick={() => done(true)}>
            {opts.confirmLabel || t('common.confirm')}
          </Button>
        </>
      }
    >
      <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.5 }}>{opts.message}</div>
    </Modal>
  );
}

/* ---------------- Empty state ---------------- */
export function EmptyState({ icon = 'ticket', title, sub, action }: any) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 60, height: 60, borderRadius: 16, background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', marginBottom: 6 }}>
        <Icon name={icon} size={26} />
      </div>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{title}</h3>
      {sub && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-2)', maxWidth: 340, lineHeight: 1.5 }}>{sub}</p>}
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  );
}

/* ---------------- Field / Input wrappers ---------------- */
export function Field({ label, hint, error, required, children }: any) {
  return (
    <div className="field">
      {label && (
        <label>
          {label}
          {required && <span style={{ color: 'var(--st-rech-fg)' }}> *</span>}
        </label>
      )}
      {children}
      {error ? <span className="hint" style={{ color: 'var(--st-rech-fg)' }}>{error}</span> : hint && <span className="hint">{hint}</span>}
    </div>
  );
}
export function Input({ icon, error, ...rest }: any) {
  if (icon)
    return (
      <div className="input-ico">
        <Icon name={icon} size={16} />
        <input className={'input' + (error ? ' err' : '')} {...rest} />
      </div>
    );
  return <input className={'input' + (error ? ' err' : '')} {...rest} />;
}
export function Textarea({ error, ...rest }: any) {
  return <textarea className={'textarea' + (error ? ' err' : '')} {...rest} />;
}
export function Select({ children, ...rest }: any) {
  return (
    <div style={{ position: 'relative' }}>
      <select className="select" style={{ appearance: 'none', paddingRight: 36 }} {...rest}>
        {children}
      </select>
      <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-3)' }}>
        <Icon name="chevronDown" size={16} />
      </span>
    </div>
  );
}
export function Toggle({ on, onClick }: any) {
  return <button className={'toggle' + (on ? ' on' : '')} onClick={onClick} aria-pressed={on} />;
}

/* ---------------- SearchSelect (combobox con búsqueda, para catálogos grandes) ---------------- */
export function SearchSelect({ value, items = [], search, toCode, toLabel, placeholder, onPick, emptyHint, loadingHint }: any) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = value ? (items as any[]).find((it) => toCode(it) === value) : null;
  const selectedLabel = selected ? `${toCode(selected)} · ${toLabel(selected)}` : (value || '');
  const results: any[] = open ? search(q) : [];

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div className="input-ico">
        <Icon name="search" size={16} />
        <input
          className="input"
          placeholder={placeholder}
          value={open ? q : selectedLabel}
          onFocus={() => { setQ(''); setOpen(true); }}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        />
      </div>
      {value && !open && (
        <button type="button" onMouseDown={(e) => { e.preventDefault(); onPick(null); }} aria-label="clear"
          style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
          <Icon name="x" size={14} />
        </button>
      )}
      {open && (
        <div style={{ position: 'absolute', zIndex: 30, left: 0, right: 0, top: 'calc(100% + 4px)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(15,23,42,.14)', maxHeight: 300, overflowY: 'auto' }}>
          {results.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text-3)' }}>{q ? (emptyHint || '—') : (items.length ? '' : (loadingHint || '…'))}</div>
          ) : (
            results.map((it) => (
              <button key={toCode(it)} type="button"
                onMouseDown={(e) => { e.preventDefault(); onPick(it); setOpen(false); setQ(''); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: '9px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--border)' }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--surface-2)')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
                <span className="mono" style={{ color: 'var(--navy-700)', fontWeight: 600 }}>{toCode(it)}</span>
                <span style={{ color: 'var(--text-2)', marginLeft: 8 }}>{toLabel(it)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- Stepper (− value +) ---------------- */
export function Stepper({ value, onChange, min = 1, max, size = 40 }: any) {
  const clamp = (n: number) => {
    if (isNaN(n)) n = min;
    if (n < min) n = min;
    if (max != null && n > max) n = max;
    return n;
  };
  const btn: React.CSSProperties = {
    width: size,
    height: size,
    border: 'none',
    background: 'transparent',
    color: 'var(--navy-700)',
    fontSize: size * 0.5,
    fontWeight: 700,
    cursor: 'pointer',
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--border-strong)', borderRadius: 10, overflow: 'hidden', background: '#fff', flex: 'none' }}>
      <button type="button" onClick={() => onChange(clamp(value - 1))} style={btn} aria-label="−">−</button>
      <input
        value={value}
        onChange={(e) => onChange(clamp(parseInt(e.target.value.replace(/\D/g, ''), 10)))}
        inputMode="numeric"
        style={{ width: 40, height: size, textAlign: 'center', border: 'none', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)', fontWeight: 700, fontSize: 15, color: 'var(--text)', background: 'transparent', padding: 0 }}
      />
      <button type="button" onClick={() => onChange(clamp(value + 1))} style={btn} aria-label="+">+</button>
    </div>
  );
}

/* ---------------- Language switcher ---------------- */
export function LangSwitcher({ dark = false }: { dark?: boolean }) {
  const { i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || 'es').slice(0, 2);
  const base: any = {
    display: 'inline-flex',
    border: '1px solid ' + (dark ? 'rgba(255,255,255,.2)' : 'var(--border)'),
    borderRadius: 999,
    overflow: 'hidden',
    background: dark ? 'rgba(255,255,255,.06)' : '#fff',
  };
  const btn = (l: string) => ({
    border: 'none',
    background: lang === l ? (dark ? 'rgba(255,255,255,.18)' : 'var(--navy-800)') : 'transparent',
    color: lang === l ? (dark ? '#fff' : '#fff') : dark ? 'rgba(255,255,255,.7)' : 'var(--text-2)',
    fontSize: 12,
    fontWeight: 700,
    padding: '5px 11px',
    cursor: 'pointer',
  });
  return (
    <div style={base} title="Idioma / Language">
      <button style={btn('es')} onClick={() => setLang('es')}>
        ES
      </button>
      <button style={btn('en')} onClick={() => setLang('en')}>
        EN
      </button>
    </div>
  );
}

/* ---------------- Evidence thumb ---------------- */
export function EvidenceThumb({ src, type, onClick, h = 120 }: any) {
  return (
    <button
      onClick={onClick}
      style={{ position: 'relative', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', padding: 0, cursor: 'pointer', height: h, background: '#08283d', display: 'block', width: '100%' }}
    >
      {type === 'video' ? (
        <video src={src + '#t=0.1'} preload="metadata" muted playsInline tabIndex={-1} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : type === 'pdf' ? (
        <span style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.85)' }}>
          <Icon name="file" size={26} />
        </span>
      ) : (
        <img src={src} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      )}
      {type === 'video' && (
        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(180deg,rgba(0,18,30,.04),rgba(0,18,30,.4))' }}>
          <span style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(0,30,47,.55)', border: '2px solid rgba(255,255,255,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', paddingLeft: 3 }}>
            <Icon name="play" size={18} fill="#fff" />
          </span>
        </span>
      )}
    </button>
  );
}

/* ---------------- Lightbox ---------------- */
export function Lightbox({ items, index, onClose, onIndex }: { items: Evidence[]; index: number; onClose: () => void; onIndex: (i: number) => void }) {
  const { t } = useTranslation();
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onIndex((index + 1) % items.length);
      if (e.key === 'ArrowLeft') onIndex((index - 1 + items.length) % items.length);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [index, items, onClose, onIndex]);
  if (index == null) return null;
  const it = items[index];
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1500, background: 'rgba(0,16,26,.92)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', color: '#fff' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          {it.desc} <span style={{ color: 'rgba(255,255,255,.5)', fontWeight: 400, marginLeft: 8 }}>{it.date}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,.6)' }} className="mono">
            {index + 1} / {items.length}
          </span>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.12)', border: 'none', color: '#fff', width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={20} />
          </button>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px 20px', minHeight: 0 }} onClick={(e) => e.stopPropagation()}>
        <button onClick={() => onIndex((index - 1 + items.length) % items.length)} className="lb-nav">
          <Icon name="chevronLeft" size={24} />
        </button>
        <div style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', maxWidth: 1000 }}>
          {it.type === 'video' ? (
            <video key={it.file} src={it.file} controls playsInline preload="metadata" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 12, display: 'block', background: '#000' }}>
              {t('public.playVideo')}
            </video>
          ) : it.type === 'pdf' ? (
            <a href={it.file} target="_blank" rel="noreferrer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, color: '#fff', textDecoration: 'none' }}>
              <span style={{ width: 72, height: 72, borderRadius: 16, background: 'rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="file" size={32} />
              </span>
              <span className="btn" style={{ background: '#fff', color: 'var(--navy-900)' }}>
                <Icon name="download" size={16} /> {it.name || 'PDF'}
              </span>
            </a>
          ) : (
            <img src={it.file} style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 12, display: 'block', objectFit: 'contain' }} />
          )}
        </div>
        <button onClick={() => onIndex((index + 1) % items.length)} className="lb-nav">
          <Icon name="chevronRight" size={24} />
        </button>
      </div>
    </div>
  );
}

/* ---------------- Media gallery (evidence) ----------------
   Grid de miniaturas con tope de tamaño + lightbox interno. Imágenes y videos
   van como tiles (el video muestra su primer frame con overlay de play); los PDF
   se listan como filas de archivo. Reúsalo en admin y reporte público para que
   las fotos no se vean a ancho completo. */
export function MediaGallery({ items, captions = false, ratio = '4 / 3' }: { items: Evidence[]; captions?: boolean; ratio?: string }) {
  const { t } = useTranslation();
  const [lb, setLb] = useState<number | null>(null);
  if (!items || !items.length) return null;
  const media = items.filter((e) => e.type !== 'pdf');
  const files = items.filter((e) => e.type === 'pdf');
  return (
    <>
      {media.length > 0 && (
        <div className="media-grid">
          {media.map((ev, i) => {
            const processing = ev.type === 'video' && ev.status === 'processing';
            const tile = (
              <button
                className="media-tile"
                style={{ aspectRatio: ratio }}
                onClick={() => setLb(i)}
                aria-label={ev.desc || (ev.type === 'video' ? t('common.video') : t('common.photo'))}
              >
                {ev.type === 'video' ? (
                  <video src={ev.file + '#t=0.1'} preload="metadata" muted playsInline tabIndex={-1} />
                ) : (
                  <img src={ev.file} alt={ev.desc || ''} loading="lazy" />
                )}
                {ev.type === 'video' && (
                  <span className="media-play">
                    <span className="media-play-btn">
                      {processing ? <span className="spin"><Icon name="refresh" size={15} /></span> : <Icon name="play" size={16} fill="#fff" />}
                    </span>
                  </span>
                )}
              </button>
            );
            return captions ? (
              <div key={ev.id || i}>
                {tile}
                {(ev.desc || ev.date) && (
                  <div className="media-cap">
                    {ev.desc && <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.3 }}>{ev.desc}</div>}
                    {ev.date && <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{ev.date}</div>}
                  </div>
                )}
              </div>
            ) : (
              <span key={ev.id || i} style={{ display: 'contents' }}>{tile}</span>
            );
          })}
        </div>
      )}
      {files.length > 0 && (
        <div className="media-files">
          {files.map((ev, i) => (
            <a key={ev.id || 'f' + i} href={ev.file} target="_blank" rel="noreferrer" className="media-file">
              <span style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--st-rech-bg)', color: 'var(--st-rech-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <Icon name="file" size={17} />
              </span>
              <span style={{ flex: 1, fontWeight: 600, fontSize: 13.5 }}>{ev.name || ev.desc || 'PDF'}</span>
              <Icon name="download" size={17} style={{ color: 'var(--text-3)' }} />
            </a>
          ))}
        </div>
      )}
      {lb != null && <Lightbox items={media} index={lb} onClose={() => setLb(null)} onIndex={setLb} />}
    </>
  );
}

/* ---------------- Embedded video player (public view) ---------------- */
export function VideoPlayer({ src, label }: { src: string; label: string }) {
  return (
    <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#08283d', border: '1px solid var(--border)' }}>
      <video src={src} controls preload="metadata" style={{ width: '100%', display: 'block', background: '#000' }} />
      <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-2)', background: 'var(--surface)' }}>
        <Icon name="video" size={15} />
        <span style={{ fontSize: 12.5, fontWeight: 500 }}>{label}</span>
      </div>
    </div>
  );
}

/* ---------------- Status history timeline ---------------- */
export function Timeline({ history }: { history: HistoryEntry[] }) {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {history.map((h, i) => {
        const s = STATUS[h.status];
        const color = TIMELINE_COLOR[s.cls];
        const last = i === history.length - 1;
        return (
          <div key={i} style={{ display: 'flex', gap: 12, minHeight: last ? 'auto' : 52 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ width: 13, height: 13, borderRadius: '50%', background: color, border: '2.5px solid #fff', boxShadow: '0 0 0 1.5px ' + color, marginTop: 2 }} />
              {!last && <span style={{ flex: 1, width: 2, background: 'var(--border)', marginTop: 2 }} />}
            </div>
            <div style={{ paddingBottom: last ? 0 : 14 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{t('status.' + h.status)}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }} className="mono">
                {h.at}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>
                {h.by}
                {h.note ? ' · ' + h.note : ''}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Credentials card ---------------- */
export function CredentialsCard({ name, email, password }: { name: string; email: string; password: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const txt = t('credentials.clipboard', { email, password, url: window.location.origin });
    navigator.clipboard && navigator.clipboard.writeText(txt);
    setCopied(true);
    toast(t('credentials.copied'), 'success');
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div style={{ border: '1.5px solid var(--gold)', borderRadius: 14, overflow: 'hidden', background: 'var(--gold-50)' }}>
      <div style={{ padding: '14px 16px', background: 'var(--gold-100)', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #ecdcb8' }}>
        <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--gold)', color: 'var(--navy-900)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="checkCircle" size={18} />
        </span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy-900)' }}>{t('credentials.title')}</div>
          <div style={{ fontSize: 12.5, color: '#8a6a26' }}>{t('credentials.share', { name: name.split(' ')[0] })}</div>
        </div>
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600 }}>{t('credentials.user')}</span>
          <span className="mono" style={{ fontSize: 13, color: 'var(--navy-900)' }}>{email}</span>
        </div>
        <div className="divider" />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600 }}>{t('credentials.password')}</span>
          <span className="mono" style={{ fontSize: 13, color: 'var(--navy-900)', letterSpacing: '.04em' }}>{password}</span>
        </div>
        <Button variant="gold" block icon={copied ? 'check' : 'copy'} onClick={copy} style={{ marginTop: 4 }}>
          {copied ? t('common.copied') : t('credentials.copy')}
        </Button>
        <p style={{ margin: 0, fontSize: 11.5, color: '#8a6a26', textAlign: 'center', lineHeight: 1.4 }}>{t('credentials.warning')}</p>
      </div>
    </div>
  );
}

/* ---------------- Share link panel ---------------- */
export function SharePanel({ ticket, onGenerate, onRegenerate, onToggle, onCopy, onSendEmail }: any) {
  const { t } = useTranslation();
  const sh: ShareLink = ticket.share || {};
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const doSend = async () => {
    if (!to.trim() || !onSendEmail) return;
    setSending(true);
    try {
      await onSendEmail({ to: to.trim(), cc: cc.trim(), message: msg.trim() });
      setTo('');
      setCc('');
      setMsg('');
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="link" size={16} />
          <span style={{ fontWeight: 700, fontSize: 14 }}>{t('share.title')}</span>
        </div>
        <span className={'badge sm ' + (sh.active ? 'bg-apro' : 'bg-pend')}>
          <span className="dot" />
          {sh.active ? t('share.active') : t('share.inactive')}
        </span>
      </div>
      {sh.url ? (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="mono" style={{ flex: 1, minWidth: 0, fontSize: 12.5, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9, padding: '9px 11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-2)' }}>
              {sh.url}
            </div>
            <Button variant="ghost" size="sm" icon="copy" onClick={onCopy}>
              {t('common.copy')}
            </Button>
          </div>
          <div style={{ display: 'flex', gap: 18, fontSize: 12.5, color: 'var(--text-2)' }}>
            <span>
              {t('share.created')}: <b style={{ color: 'var(--text)', fontWeight: 600 }}>{sh.created}</b>
            </span>
            <span>
              {t('share.lastVisit')}: <b style={{ color: 'var(--text)', fontWeight: 600 }}>{sh.lastVisit || '—'}</b>
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <Button variant="ghost" size="sm" icon="refresh" onClick={onRegenerate}>
              {t('share.regenerate')}
            </Button>
            <Button variant={sh.active ? 'danger' : 'ghost'} size="sm" icon={sh.active ? 'xCircle' : 'checkCircle'} onClick={onToggle}>
              {sh.active ? t('share.disable') : t('share.activate')}
            </Button>
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{t('share.none')}</p>
          <Button variant="primary" size="sm" icon="link" onClick={onGenerate}>
            {t('share.generate')}
          </Button>
        </div>
      )}

      {onSendEmail && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="mail" size={15} />
            <span style={{ fontWeight: 700, fontSize: 13.5 }}>{t('share.sendByEmail')}</span>
          </div>
          <input className="input" style={{ fontSize: 13 }} placeholder={t('share.recipientsPh')} value={to} onChange={(e) => setTo(e.target.value)} />
          <input className="input" style={{ fontSize: 13 }} placeholder={t('share.ccPh')} value={cc} onChange={(e) => setCc(e.target.value)} />
          <textarea className="textarea" style={{ fontSize: 13, minHeight: 60 }} placeholder={t('share.messagePh')} value={msg} onChange={(e) => setMsg(e.target.value)} />
          <Button variant="primary" size="sm" icon="send" onClick={doSend} disabled={sending || !to.trim()}>
            {sending ? t('share.sending') : t('share.send')}
          </Button>
        </div>
      )}
    </div>
  );
}
