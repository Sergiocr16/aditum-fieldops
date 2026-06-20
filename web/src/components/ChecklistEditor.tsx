/* © 2026 Aditum — Aditum FieldOps — editor de checklist configurable (drag-drop).
   Compartido por la creación de órdenes por demanda (ítems ad-hoc {id,text,done}). */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './ui';

export interface ChecklistEditorItem {
  id: string;
  text: string;
  done?: boolean;
}

export default function ChecklistEditor({ items, setItems }: { items: ChecklistEditorItem[]; setItems: (v: ChecklistEditorItem[]) => void }) {
  const { t } = useTranslation();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const add = () => setItems([...items, { id: 'n' + Math.random().toString(36).slice(2), text: '', done: false }]);
  const remove = (id: string) => setItems(items.filter((i) => i.id !== id));
  const edit = (id: string, text: string) => setItems(items.map((i) => (i.id === id ? { ...i, text } : i)));
  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setOverId(null);
      return;
    }
    const arr = [...items];
    const from = arr.findIndex((i) => i.id === dragId);
    const to = arr.findIndex((i) => i.id === targetId);
    const [m] = arr.splice(from, 1);
    arr.splice(to, 0, m);
    setItems(arr);
    setDragId(null);
    setOverId(null);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((it, i) => (
        <div
          key={it.id}
          draggable
          onDragStart={() => setDragId(it.id)}
          onDragOver={(e) => {
            e.preventDefault();
            setOverId(it.id);
          }}
          onDragLeave={() => setOverId(null)}
          onDrop={() => onDrop(it.id)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: overId === it.id ? 'var(--gold-50)' : 'var(--bg)', border: '1px solid ' + (overId === it.id ? 'var(--gold)' : 'var(--border)'), borderRadius: 10, padding: '6px 8px 6px 6px', opacity: dragId === it.id ? 0.4 : 1, transition: 'background .12s' }}
        >
          <button className="grip" title={t('ticketForm.dragReorder')} style={{ cursor: 'grab', color: 'var(--text-3)', border: 'none', background: 'transparent', padding: '4px 2px', display: 'flex' }}>
            <Icon name="grip" size={16} />
          </button>
          <span className="mono" style={{ fontSize: 12, color: 'var(--text-3)', width: 18, textAlign: 'center', flex: 'none' }}>{i + 1}</span>
          <input className="input" style={{ border: 'none', background: 'transparent', padding: '7px 4px', flex: 1 }} placeholder={t('ticketForm.itemPlaceholder')} value={it.text} onChange={(e) => edit(it.id, e.target.value)} />
          <button className="icon-btn" onClick={() => remove(it.id)} title={t('common.delete')} style={{ color: 'var(--text-3)' }}>
            <Icon name="trash" size={15} />
          </button>
        </div>
      ))}
      <button onClick={add} className="add-item-btn">
        <Icon name="plus" size={16} />
        {t('ticketForm.addItem')}
      </button>
    </div>
  );
}
