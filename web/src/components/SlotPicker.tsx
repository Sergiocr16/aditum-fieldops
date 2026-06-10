/* © 2026 Aditum — Aditum FieldOps — Slot picker (days strip + hour grid), public & admin */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './ui';

export interface DaySlots {
  date: string; // YYYY-MM-DD
  times: string[]; // 'HH:mm'
}

export default function SlotPicker({
  slots,
  value,
  onChange,
  loading,
}: {
  slots: DaySlots[];
  value: { date: string; time: string } | null;
  onChange: (v: { date: string; time: string }) => void;
  loading?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [day, setDay] = useState<string>('');

  useEffect(() => {
    if (!day && slots.length) setDay(slots[0].date);
    if (day && !slots.some((s) => s.date === day) && slots.length) setDay(slots[0].date);
  }, [slots, day]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 30, color: 'var(--text-2)' }}>
        <span className="spin"><Icon name="refresh" size={16} /></span>
        {t('common.loading')}
      </div>
    );
  }
  if (!slots.length) {
    return (
      <div style={{ textAlign: 'center', padding: 26, color: 'var(--text-2)', fontSize: 14 }}>
        {t('publicReschedule.noSlots')}
      </div>
    );
  }

  const fmtDay = (d: string) => {
    const [y, m, dd] = d.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, dd));
    return {
      weekday: dt.toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'es-CR', { weekday: 'short', timeZone: 'UTC' }),
      day: dd,
      month: dt.toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'es-CR', { month: 'short', timeZone: 'UTC' }),
    };
  };

  const current = slots.find((s) => s.date === day);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 14 }}>
        {slots.map((s) => {
          const f = fmtDay(s.date);
          const active = s.date === day;
          return (
            <button
              key={s.date}
              onClick={() => setDay(s.date)}
              style={{
                flex: 'none',
                minWidth: 64,
                padding: '9px 10px',
                borderRadius: 12,
                border: '1.5px solid ' + (active ? 'var(--navy-800)' : 'var(--border)'),
                background: active ? 'var(--navy-800)' : 'var(--surface)',
                color: active ? '#fff' : 'var(--text)',
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 11, textTransform: 'uppercase', opacity: 0.7 }}>{f.weekday}</div>
              <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.15 }}>{f.day}</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>{f.month}</div>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(86px, 1fr))', gap: 8 }}>
        {(current?.times || []).map((time) => {
          const active = value?.date === day && value?.time === time;
          return (
            <button
              key={time}
              onClick={() => onChange({ date: day, time })}
              className="mono"
              style={{
                padding: '11px 6px',
                borderRadius: 10,
                border: '1.5px solid ' + (active ? 'var(--gold)' : 'var(--border)'),
                background: active ? 'var(--gold)' : 'var(--surface)',
                color: active ? 'var(--navy-900)' : 'var(--text)',
                fontWeight: active ? 800 : 600,
                fontSize: 13.5,
                cursor: 'pointer',
              }}
            >
              {time}
            </button>
          );
        })}
      </div>
    </div>
  );
}
