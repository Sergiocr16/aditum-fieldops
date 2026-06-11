/* © 2026 Aditum — Aditum FieldOps — Acordeón de visitas (trabajo por día), compartido
   por el móvil del técnico, el detalle admin y el reporte público. */
import { useTranslation } from 'react-i18next';
import { Icon } from './ui';

const MON_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MON_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Parte una fecha YYYY-MM-DD en piezas legibles (día, mes corto, fecha larga). */
export function visitDateParts(dateStr: string, lang = 'es') {
  const [y, m, d] = (dateStr || '').split('-').map(Number);
  const ok = !!(y && m && d);
  const en = lang.startsWith('en');
  const dd = ok ? String(d) : '—';
  const mon = ok ? (en ? MON_EN : MON_ES)[m - 1] || '' : '';
  let long = dateStr || '';
  if (ok) {
    try {
      long = new Date(y, m - 1, d).toLocaleDateString(en ? 'en-US' : 'es-CR', { weekday: 'short', day: 'numeric', month: 'short' });
      long = long.charAt(0).toUpperCase() + long.slice(1);
    } catch {
      /* fallback al string crudo */
    }
  }
  return { dd, mon, long };
}

/** Chip de fecha estilo calendario (día grande + mes). Reemplaza al borde lateral. */
export function VisitDayChip({ dateStr, size = 46, lang = 'es' }: { dateStr: string; size?: number; lang?: string }) {
  const { dd, mon } = visitDateParts(dateStr, lang);
  return (
    <div style={{ width: size, height: size, borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 'none', lineHeight: 1 }}>
      <span style={{ fontSize: size * 0.37, fontWeight: 800, color: 'var(--navy-800)', letterSpacing: '-.02em' }}>{dd}</span>
      <span style={{ fontSize: size * 0.2, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-3)', marginTop: 1 }}>{mon}</span>
    </div>
  );
}

/** Cabecera colapsable de una visita: chip + "Día N" + resumen + chevron. */
export function VisitBar({
  index,
  dateStr,
  meta,
  preview,
  count,
  open,
  onToggle,
}: {
  index: number;
  dateStr: string;
  meta?: string;
  preview?: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { long } = visitDateParts(dateStr, i18n.language);
  const sub = [long, meta, count ? t('ticketDetail.nPhotos', { count }) : '', !open && preview ? preview : ''].filter(Boolean).join(' · ');
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 13, padding: '12px 14px', background: open ? 'var(--surface-2)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background .15s ease' }}
    >
      <VisitDayChip dateStr={dateStr} lang={i18n.language} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--text)' }}>{t('ticketDetail.dayN', { n: index + 1 })}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{sub || t('ticketDetail.noNote')}</div>
      </div>
      <span style={{ display: 'flex', color: 'var(--text-3)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .25s cubic-bezier(.2,.8,.2,1)', flex: 'none' }}>
        <Icon name="chevronDown" size={18} />
      </span>
    </button>
  );
}
