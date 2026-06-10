/* © 2026 Aditum — Aditum FieldOps — Admins del tenant + configuración de módulos visibles */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../lib/firebase';
import { useAuth } from '../../lib/auth';
import { useTenant } from '../../lib/tenant';
import { CONFIGURABLE_MODULES } from '../../lib/modules';
import { Icon, Avatar, Button, Modal, Toggle, EmptyState, toast } from '../../components/ui';
import type { AppUser } from '../../lib/types';

export default function AdminModules() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { tid } = useTenant();
  const [admins, setAdmins] = useState<AppUser[]>([]);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [allOn, setAllOn] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!tid) return;
    const q = query(collection(db, 'users'), where('tenantId', '==', tid), where('role', '==', 'admin'));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as AppUser[];
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setAdmins(list);
    }, () => {});
  }, [tid]);

  const open = (a: AppUser) => {
    const hasCustom = Array.isArray(a.modules) && a.modules.length > 0;
    setAllOn(!hasCustom);
    setSel(new Set(hasCustom ? a.modules : CONFIGURABLE_MODULES.map((m) => m.key)));
    setEditing(a);
  };

  const toggle = (key: string) =>
    setSel((s) => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      // allOn => lista vacía (ve todos); si no, la selección concreta
      const modules = allOn ? [] : [...sel];
      await httpsCallable(functions, 'setAdminModules')({ adminId: editing.id, modules });
      toast(t('adminModules.saved'), 'success');
      setEditing(null);
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    } finally {
      setBusy(false);
    }
  };

  const summary = (a: AppUser) => {
    if (!Array.isArray(a.modules) || a.modules.length === 0) return t('adminModules.allModules');
    return t('adminModules.someModules', { n: a.modules.length, total: CONFIGURABLE_MODULES.length });
  };

  const effectiveSel = useMemo(() => (allOn ? new Set(CONFIGURABLE_MODULES.map((m) => m.key)) : sel), [allOn, sel]);

  return (
    <div className="card card-pad">
      <div className="section-label" style={{ marginBottom: 6 }}>{t('adminModules.title')}</div>
      <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 14px', lineHeight: 1.5 }}>{t('adminModules.intro')}</p>

      {admins.length === 0 ? (
        <EmptyState icon="users" title={t('adminModules.none')} sub="" />
      ) : (
        admins.map((a) => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <Avatar initials={a.initials} size={34} gold />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {a.name}
                {a.id === user?.uid && <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 6 }}>· {t('adminModules.you')}</span>}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{summary(a)}</div>
            </div>
            <Button size="sm" variant="ghost" icon="settings" onClick={() => open(a)}>{t('adminModules.configure')}</Button>
          </div>
        ))
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={t('adminModules.modalTitle')} sub={editing?.name} width={520}
        footer={<>
          <Button variant="ghost" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
          <Button onClick={save} disabled={busy}>{busy ? '…' : t('common.save')}</Button>
        </>}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg)', borderRadius: 10, marginBottom: 14 }}>
          <Toggle on={allOn} onClick={() => setAllOn((v) => !v)} />
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('adminModules.allToggle')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('adminModules.allToggleHint')}</div>
          </div>
        </div>

        <div style={{ opacity: allOn ? 0.5 : 1, pointerEvents: allOn ? 'none' : 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {CONFIGURABLE_MODULES.map((m) => {
              const on = effectiveSel.has(m.key);
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => toggle(m.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                    border: '1.5px solid ' + (on ? 'var(--navy-800)' : 'var(--border)'),
                    background: on ? 'var(--navy-800)' : 'var(--surface)', color: on ? '#fff' : 'var(--text-2)',
                  }}
                >
                  <Icon name={m.icon} size={16} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{t(m.labelKey)}</span>
                  {on && <Icon name="check" size={14} style={{ marginLeft: 'auto' }} />}
                </button>
              );
            })}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '12px 0 0' }}>{t('adminModules.lockedNote')}</p>
        </div>
      </Modal>
    </div>
  );
}
