/* © 2026 Aditum — Aditum FieldOps — Dynamic checklist renderer (typed items per equipment type).
   Modes: execute (technician fills), readonly (admin/public report), preview (template editor). */
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './ui';
import type { SOChecklistEntry } from '../lib/types';

export type ChecklistMode = 'execute' | 'readonly' | 'preview';

/** Alert level for a numeric answer against the item config. */
export function alertLevel(item: SOChecklistEntry, value: number | null): 'ok' | 'warn' | 'out' {
  if (value === null || value === undefined || Number.isNaN(value)) return 'ok';
  const c = item.config || {};
  if ((c.min != null && value < c.min) || (c.max != null && value > c.max)) return 'out';
  if ((c.alertMin != null && value < c.alertMin) || (c.alertMax != null && value > c.alertMax)) return 'warn';
  return 'ok';
}

/** Validates required items; returns missing labels. */
export function validateChecklist(items: SOChecklistEntry[]): { ok: boolean; missing: string[]; alerts: string[] } {
  const missing: string[] = [];
  const alerts: string[] = [];
  for (const it of items) {
    const empty = it.type === 'foto' ? !it.photoUrl : it.answer === null || it.answer === undefined || it.answer === '';
    if (it.required && empty) missing.push(it.label);
    if (it.alert) alerts.push(it.label);
  }
  return { ok: missing.length === 0, missing, alerts };
}

const ALERT_STYLE: Record<'warn' | 'out', { bg: string; fg: string }> = {
  warn: { bg: 'var(--st-proc-bg)', fg: 'var(--st-proc-fg)' },
  out: { bg: 'var(--st-rech-bg)', fg: 'var(--st-rech-fg)' },
};

function FieldRow({
  item,
  mode,
  onAnswer,
  onPhoto,
}: {
  item: SOChecklistEntry;
  mode: ChecklistMode;
  onAnswer?: (id: string, answer: any, alert: boolean) => void;
  onPhoto?: (id: string, file: File) => void;
}) {
  const { t } = useTranslation();
  const editable = mode === 'execute';
  const c = item.config || {};
  const lvl = item.type === 'numero' ? alertLevel(item, typeof item.answer === 'number' ? item.answer : item.answer ? Number(item.answer) : null) : 'ok';

  const answerView = () => {
    switch (item.type) {
      case 'si_no':
        if (!editable) {
          return item.answer === null || item.answer === undefined ? <span style={{ color: 'var(--text-3)' }}>—</span> : (
            <span className="badge" style={item.answer ? { background: 'var(--st-apro-bg)', color: 'var(--st-apro-fg)' } : { background: 'var(--st-rech-bg)', color: 'var(--st-rech-fg)' }}>
              {item.answer ? t('common.yes') : t('common.no')}
            </span>
          );
        }
        return (
          <div style={{ display: 'flex', gap: 8 }}>
            {[true, false].map((v) => (
              <button
                key={String(v)}
                onClick={() => onAnswer?.(item.id, v, false)}
                className="btn btn-sm"
                style={{
                  minWidth: 60,
                  background: item.answer === v ? (v ? 'var(--st-apro-bg)' : 'var(--st-rech-bg)') : 'var(--bg)',
                  color: item.answer === v ? (v ? 'var(--st-apro-fg)' : 'var(--st-rech-fg)') : 'var(--text-2)',
                  border: '1px solid var(--border)',
                  fontWeight: 700,
                }}
              >
                {v ? t('common.yes') : t('common.no')}
              </button>
            ))}
          </div>
        );
      case 'numero': {
        const chip = lvl !== 'ok' && (
          <span className="badge" style={{ background: ALERT_STYLE[lvl as 'warn' | 'out'].bg, color: ALERT_STYLE[lvl as 'warn' | 'out'].fg, marginLeft: 8 }}>
            <Icon name="alert" size={12} />
            {t(lvl === 'out' ? 'checklist.outOfRange' : 'checklist.nearLimit')}
          </span>
        );
        if (!editable) {
          return (
            <span>
              <span className="mono" style={{ fontWeight: 700 }}>{item.answer ?? '—'}</span>
              {item.unit ? <span style={{ color: 'var(--text-3)', marginLeft: 4 }}>{item.unit}</span> : null}
              {chip}
            </span>
          );
        }
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number"
              className="input"
              style={{ width: 110, textAlign: 'right' }}
              value={item.answer === null || item.answer === undefined ? '' : String(item.answer)}
              onChange={(e) => {
                const raw = e.target.value;
                const num = raw === '' ? null : Number(raw);
                const lv = num === null ? 'ok' : alertLevel(item, num);
                onAnswer?.(item.id, num, lv !== 'ok');
              }}
            />
            {item.unit && <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{item.unit}</span>}
            {chip}
          </div>
        );
      }
      case 'seleccion':
        if (!editable) return <span style={{ fontWeight: 600 }}>{(item.answer as string) || '—'}</span>;
        return (
          <select className="input" style={{ width: 180 }} value={(item.answer as string) || ''} onChange={(e) => onAnswer?.(item.id, e.target.value || null, false)}>
            <option value="">—</option>
            {(c.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        );
      case 'foto':
        if (item.photoUrl) {
          return <img src={item.photoUrl} alt={item.label} style={{ height: 64, borderRadius: 8, objectFit: 'cover', cursor: 'pointer' }} onClick={() => window.open(item.photoUrl!, '_blank')} />;
        }
        if (!editable) return <span style={{ color: 'var(--text-3)' }}>—</span>;
        return (
          <label className="btn btn-sm btn-ghost" style={{ cursor: 'pointer' }}>
            <Icon name="camera" size={15} />
            {t('checklist.takePhoto')}
            <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPhoto?.(item.id, f); }} />
          </label>
        );
      default: // texto
        if (!editable) return <span style={{ fontSize: 13 }}>{(item.answer as string) || '—'}</span>;
        return (
          <input className="input" style={{ width: '100%', maxWidth: 280 }} value={(item.answer as string) || ''} placeholder="…"
            onChange={(e) => onAnswer?.(item.id, e.target.value || null, false)} />
        );
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 200px', minWidth: 160 }}>
        <span style={{ fontSize: 13.5, fontWeight: 500 }}>
          {item.label}
          {item.required && <span style={{ color: 'var(--st-rech-fg)', marginLeft: 3 }}>*</span>}
        </span>
        {item.type === 'numero' && (c.min != null || c.max != null) && (
          <div style={{ fontSize: 11.5, color: 'var(--text-3)' }} className="mono">
            {c.min ?? '−∞'} – {c.max ?? '∞'} {c.unit || ''}
          </div>
        )}
      </div>
      <div>{answerView()}</div>
    </div>
  );
}

export default function DynamicChecklist({
  items,
  mode,
  onAnswer,
  onPhoto,
}: {
  items: SOChecklistEntry[];
  mode: ChecklistMode;
  onAnswer?: (id: string, answer: any, alert: boolean) => void;
  onPhoto?: (id: string, file: File) => void;
}) {
  // agrupar por sección preservando el orden
  const groups: { title: string | null; items: SOChecklistEntry[] }[] = [];
  for (const it of items) {
    const last = groups[groups.length - 1];
    if (last && last.title === (it.sectionTitle || null)) last.items.push(it);
    else groups.push({ title: it.sectionTitle || null, items: [it] });
  }

  return (
    <div>
      {groups.map((g, gi) => (
        <Fragment key={gi}>
          {g.title && (
            <div className="section-label" style={{ margin: gi === 0 ? '0 0 4px' : '16px 0 4px', color: 'var(--gold-600)' }}>{g.title}</div>
          )}
          {g.items.map((it) => (
            <FieldRow key={it.id} item={it} mode={mode} onAnswer={onAnswer} onPhoto={onPhoto} />
          ))}
        </Fragment>
      ))}
    </div>
  );
}
