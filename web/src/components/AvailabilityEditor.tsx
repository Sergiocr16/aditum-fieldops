/* © 2026 Aditum — Aditum FieldOps — Editor de disponibilidad (horario semanal + bloqueos).
   Reutilizable: lo usa el técnico (su propia, si la empresa lo habilita) y el admin/coordinador. */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { doc, onSnapshot, query, where, addDoc, deleteDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { useTenant } from '../lib/tenant';
import { Icon, Button, Field, Input, Toggle, toast } from './ui';
import { now, today } from '../lib/time';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DEFAULT_RANGE = { start: '08:00', end: '17:00' };

export default function AvailabilityEditor({ techId, canEdit }: { techId: string; canEdit: boolean }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { tid, tcol, tdoc } = useTenant();
  const [weekly, setWeekly] = useState<Record<string, { start: string; end: string }[]>>({});
  const [blocks, setBlocks] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [newBlock, setNewBlock] = useState({ date: today(), allDay: true, startTime: '08:00', endTime: '17:00', reason: '' });

  useEffect(() => {
    if (!tid || !techId) return;
    const unsubU = onSnapshot(doc(db, 'users', techId), (snap) => {
      const wh = snap.exists() ? (snap.data() as any).availability?.weeklyHours : null;
      setWeekly(wh || { mon: [DEFAULT_RANGE], tue: [DEFAULT_RANGE], wed: [DEFAULT_RANGE], thu: [DEFAULT_RANGE], fri: [DEFAULT_RANGE], sat: [], sun: [] });
    });
    const qB = query(tcol('availabilityBlocks'), where('techId', '==', techId));
    const unsubB = onSnapshot(qB, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      list.sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''));
      setBlocks(list.filter((b: any) => b.date >= today()));
    });
    return () => { unsubU(); unsubB(); };
  }, [tid, techId]);

  const setDay = (day: string, ranges: { start: string; end: string }[]) => setWeekly((w) => ({ ...w, [day]: ranges }));

  const save = async () => {
    setSaving(true);
    try {
      await httpsCallable(functions, 'setTechnicianAvailability')({ techId, weeklyHours: weekly });
      toast(t('availability.saved'), 'success');
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    } finally {
      setSaving(false);
    }
  };

  const addBlock = async () => {
    if (!newBlock.date) return;
    try {
      await addDoc(tcol('availabilityBlocks'), {
        techId,
        date: newBlock.date,
        allDay: newBlock.allDay,
        startTime: newBlock.allDay ? null : newBlock.startTime,
        endTime: newBlock.allDay ? null : newBlock.endTime,
        reason: newBlock.reason.trim(),
        createdAt: now(),
        createdBy: user!.uid,
      });
      setNewBlock({ date: today(), allDay: true, startTime: '08:00', endTime: '17:00', reason: '' });
      toast(t('availability.blockAdded'), 'success');
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card" style={{ padding: '14px 15px' }}>
        <div className="section-label" style={{ marginBottom: 12 }}>{t('availability.weeklyTitle')}</div>
        {DAYS.map((day) => {
          const ranges = weekly[day] || [];
          const active = ranges.length > 0;
          const r = ranges[0] || DEFAULT_RANGE;
          return (
            <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ width: 42, fontSize: 13, fontWeight: 700 }}>{t('availability.day_' + day)}</span>
              <Toggle on={active} onClick={() => canEdit && setDay(day, active ? [] : [DEFAULT_RANGE])} />
              {active ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                  <input type="time" disabled={!canEdit} className="input" style={{ width: 100, padding: '6px 8px' }} value={r.start} onChange={(e) => setDay(day, [{ ...r, start: e.target.value }])} />
                  <span style={{ color: 'var(--text-3)' }}>–</span>
                  <input type="time" disabled={!canEdit} className="input" style={{ width: 100, padding: '6px 8px' }} value={r.end} onChange={(e) => setDay(day, [{ ...r, end: e.target.value }])} />
                </div>
              ) : (
                <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--text-3)' }}>{t('availability.dayOff')}</span>
              )}
            </div>
          );
        })}
        {canEdit && (
          <Button block variant="primary" onClick={save} disabled={saving} style={{ marginTop: 14 }}>
            {saving ? '…' : t('availability.saveBtn')}
          </Button>
        )}
      </div>

      <div className="card" style={{ padding: '14px 15px' }}>
        <div className="section-label" style={{ marginBottom: 12 }}>{t('availability.blocksTitle')}</div>
        {blocks.map((b) => (
          <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <Icon name="clock" size={15} style={{ color: 'var(--text-3)' }} />
            <div style={{ flex: 1 }}>
              <div className="mono" style={{ fontSize: 13, fontWeight: 700 }}>
                {b.date} {b.allDay ? `· ${t('availability.allDay')}` : `· ${b.startTime}–${b.endTime}`}
              </div>
              {b.reason && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{b.reason}</div>}
            </div>
            {canEdit && (
              <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => deleteDoc(tdoc('availabilityBlocks', b.id))}>
                <Icon name="trash" size={13} />
              </button>
            )}
          </div>
        ))}
        {!blocks.length && <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-3)' }}>{t('availability.noBlocks')}</p>}

        {canEdit && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label={t('availability.fDate')}>
              <Input type="date" min={today()} value={newBlock.date} onChange={(e: any) => setNewBlock((p) => ({ ...p, date: e.target.value }))} />
            </Field>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Toggle on={newBlock.allDay} onClick={() => setNewBlock((p) => ({ ...p, allDay: !p.allDay }))} />
              <span style={{ fontSize: 13 }}>{t('availability.allDay')}</span>
              {!newBlock.allDay && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                  <input type="time" className="input" style={{ width: 100, padding: '6px 8px' }} value={newBlock.startTime} onChange={(e) => setNewBlock((p) => ({ ...p, startTime: e.target.value }))} />
                  <span>–</span>
                  <input type="time" className="input" style={{ width: 100, padding: '6px 8px' }} value={newBlock.endTime} onChange={(e) => setNewBlock((p) => ({ ...p, endTime: e.target.value }))} />
                </div>
              )}
            </div>
            <Field label={t('availability.fReason')}>
              <Input placeholder={t('availability.fReasonPh')} value={newBlock.reason} onChange={(e: any) => setNewBlock((p) => ({ ...p, reason: e.target.value }))} />
            </Field>
            <Button variant="ghost" icon="plus" onClick={addBlock}>{t('availability.addBlock')}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
