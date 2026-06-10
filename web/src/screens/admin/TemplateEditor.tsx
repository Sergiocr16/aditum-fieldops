/* © 2026 Aditum — Aditum FieldOps — Checklist template builder (per equipment type, versioned) */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, Button, Field, Input, Select, Toggle, EmptyState, toast } from '../../components/ui';
import DynamicChecklist from '../../components/DynamicChecklist';
import { PageHeader } from './AdminShell';
import { useEquipment } from '../../lib/equipment';
import { useTemplates } from '../../lib/templates';
import type { AppCtx } from '../../lib/ctx';
import type { TemplateItem, TemplateItemKind, TemplateSection, SOChecklistEntry } from '../../lib/types';

const KINDS: TemplateItemKind[] = ['si_no', 'numero', 'texto', 'seleccion', 'foto'];
const rid = () => Math.random().toString(36).slice(2, 9);

export default function TemplateEditor({ ctx, typeId }: { ctx: AppCtx; typeId: string }) {
  const { t } = useTranslation();
  const eq = useEquipment();
  const { templates, loading, publishVersion } = useTemplates(typeId);
  const type = eq.types.find((x) => x.id === typeId);
  const latest = templates[0];

  const [sections, setSections] = useState<TemplateSection[]>([]);
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [seeded, setSeeded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || seeded) return;
    if (latest) {
      setSections(latest.sections || []);
      setItems((latest.items || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0)));
    } else {
      const sid = rid();
      setSections([{ id: sid, title: t('templates.defaultSection'), order: 0 }]);
      setItems([]);
    }
    setSeeded(true);
  }, [loading, latest?.id, seeded]);

  const set = <T,>(arr: T[], idx: number, patch: Partial<T>): T[] => arr.map((x, i) => (i === idx ? { ...x, ...patch } : x));

  const addSection = () => setSections((s) => [...s, { id: rid(), title: '', order: s.length }]);
  const removeSection = (sid: string) => {
    setSections((s) => s.filter((x) => x.id !== sid));
    setItems((it) => it.filter((x) => x.sectionId !== sid));
  };
  const addItem = (sid: string) =>
    setItems((it) => [...it, { id: rid(), sectionId: sid, order: it.length, label: '', type: 'si_no', required: true, config: {} }]);
  const removeItem = (iid: string) => setItems((it) => it.filter((x) => x.id !== iid));
  const moveItem = (iid: string, dir: -1 | 1) => {
    setItems((it) => {
      const idx = it.findIndex((x) => x.id === iid);
      if (idx < 0) return it;
      const sid = it[idx].sectionId;
      const sibling = it.map((x, i) => ({ x, i })).filter((p) => p.x.sectionId === sid);
      const pos = sibling.findIndex((p) => p.i === idx);
      const swapWith = sibling[pos + dir];
      if (!swapWith) return it;
      const next = it.slice();
      [next[idx], next[swapWith.i]] = [next[swapWith.i], next[idx]];
      return next;
    });
  };

  const previewItems: SOChecklistEntry[] = useMemo(() => {
    const stitle = new Map(sections.map((s) => [s.id, s.title]));
    return items
      .filter((it) => it.label.trim())
      .map((it) => ({
        id: it.id,
        sectionId: it.sectionId,
        sectionTitle: it.sectionId ? stitle.get(it.sectionId) || null : null,
        label: it.label,
        type: it.type,
        required: it.required,
        config: it.config || {},
        unit: it.config?.unit || null,
        answer: null,
        alert: false,
        photoPath: null,
        photoUrl: null,
        at: null,
        by: null,
      }));
  }, [items, sections]);

  const publish = async () => {
    const valid = items.filter((it) => it.label.trim());
    if (!valid.length) {
      toast(t('templates.emptyErr'), 'error');
      return;
    }
    const badSelect = valid.find((it) => it.type === 'seleccion' && !(it.config?.options || []).length);
    if (badSelect) {
      toast(t('templates.optionsErr', { label: badSelect.label }), 'error');
      return;
    }
    setBusy(true);
    try {
      // re-secuenciar order global respetando secciones
      const ordered: TemplateItem[] = [];
      sections.forEach((s) => {
        items.filter((it) => it.sectionId === s.id && it.label.trim()).forEach((it) => ordered.push({ ...it, order: ordered.length }));
      });
      const v = await publishVersion(typeId, sections.filter((s) => s.title.trim() || items.some((it) => it.sectionId === s.id)), ordered);
      toast(t('templates.published', { v }), 'success');
      ctx.back();
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!type) return <EmptyState icon="wrench" title={t('templates.typeNotFound')} sub="" />;

  return (
    <div className="fade-in">
      <PageHeader
        title={t('templates.title', { type: type.name })}
        sub={latest ? t('templates.currentVersion', { v: latest.version }) : t('templates.noVersion')}
        back={() => ctx.back()}
        action={<Button variant="gold" icon="check" onClick={publish} disabled={busy}>{busy ? '…' : t('templates.publish')}</Button>}
      />

      <div className="detail-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sections.map((s, si) => (
            <div key={s.id} className="card card-pad">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                <Icon name="grip" size={16} style={{ color: 'var(--text-3)' }} />
                <div style={{ flex: 1 }}>
                  <Input placeholder={t('templates.sectionPh')} value={s.title} onChange={(e: any) => setSections((arr) => set(arr, si, { title: e.target.value }))} />
                </div>
                <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={() => removeSection(s.id)} title={t('common.delete')}>
                  <Icon name="trash" size={14} />
                </button>
              </div>

              {items.filter((it) => it.sectionId === s.id).map((it) => {
                const idx = items.findIndex((x) => x.id === it.id);
                return (
                  <div key={it.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <button className="icon-btn" style={{ width: 22, height: 18 }} onClick={() => moveItem(it.id, -1)}><Icon name="chevronDown" size={12} style={{ transform: 'rotate(180deg)' }} /></button>
                        <button className="icon-btn" style={{ width: 22, height: 18 }} onClick={() => moveItem(it.id, 1)}><Icon name="chevronDown" size={12} /></button>
                      </div>
                      <div style={{ flex: '1 1 220px' }}>
                        <Input placeholder={t('templates.itemPh')} value={it.label} onChange={(e: any) => setItems((arr) => set(arr, idx, { label: e.target.value }))} />
                      </div>
                      <div style={{ width: 150 }}>
                        <Select value={it.type} onChange={(e: any) => setItems((arr) => set(arr, idx, { type: e.target.value as TemplateItemKind, config: {} }))}>
                          {KINDS.map((k) => <option key={k} value={k}>{t('templates.kind_' + k)}</option>)}
                        </Select>
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-2)' }}>
                        <Toggle on={it.required} onClick={() => setItems((arr) => set(arr, idx, { required: !it.required }))} />
                        {t('templates.required')}
                      </label>
                      <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => removeItem(it.id)}>
                        <Icon name="trash" size={13} />
                      </button>
                    </div>

                    {it.type === 'numero' && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('templates.range')}:</span>
                        <Input type="number" placeholder="min" style={{ width: 80 }} value={it.config?.min ?? ''} onChange={(e: any) => setItems((arr) => set(arr, idx, { config: { ...it.config, min: e.target.value === '' ? null : Number(e.target.value) } }))} />
                        <Input type="number" placeholder="max" style={{ width: 80 }} value={it.config?.max ?? ''} onChange={(e: any) => setItems((arr) => set(arr, idx, { config: { ...it.config, max: e.target.value === '' ? null : Number(e.target.value) } }))} />
                        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('templates.alertRange')}:</span>
                        <Input type="number" placeholder="min" style={{ width: 80 }} value={it.config?.alertMin ?? ''} onChange={(e: any) => setItems((arr) => set(arr, idx, { config: { ...it.config, alertMin: e.target.value === '' ? null : Number(e.target.value) } }))} />
                        <Input type="number" placeholder="max" style={{ width: 80 }} value={it.config?.alertMax ?? ''} onChange={(e: any) => setItems((arr) => set(arr, idx, { config: { ...it.config, alertMax: e.target.value === '' ? null : Number(e.target.value) } }))} />
                        <Input placeholder={t('templates.unit')} style={{ width: 80 }} value={it.config?.unit ?? ''} onChange={(e: any) => setItems((arr) => set(arr, idx, { config: { ...it.config, unit: e.target.value } }))} />
                      </div>
                    )}
                    {it.type === 'seleccion' && (
                      <div style={{ marginTop: 8 }}>
                        <Input
                          placeholder={t('templates.optionsPh')}
                          value={(it.config?.options || []).join(', ')}
                          onChange={(e: any) => setItems((arr) => set(arr, idx, { config: { ...it.config, options: e.target.value.split(',').map((x: string) => x.trim()).filter(Boolean) } }))}
                        />
                      </div>
                    )}
                  </div>
                );
              })}

              <Button size="sm" variant="ghost" icon="plus" onClick={() => addItem(s.id)}>{t('templates.addItem')}</Button>
            </div>
          ))}

          <Button variant="ghost" icon="plus" onClick={addSection}>{t('templates.addSection')}</Button>

          {templates.length > 0 && (
            <div className="card card-pad">
              <div className="section-label" style={{ marginBottom: 8 }}>{t('templates.versions')}</div>
              {templates.map((v) => (
                <div key={v.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', fontSize: 12.5 }}>
                  <span className="mono" style={{ fontWeight: 700 }}>v{v.version}</span>
                  <span className="badge" style={{ fontSize: 11 }}>{t('templates.status_' + v.status)}</span>
                  <span style={{ color: 'var(--text-3)' }} className="mono">{v.createdAt} · {v.createdBy}</span>
                  <span style={{ color: 'var(--text-3)' }}>{(v.items || []).length} ítems</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="card card-pad" style={{ position: 'sticky', top: 12 }}>
            <div className="section-label" style={{ marginBottom: 12 }}>
              <Icon name="eye" size={14} style={{ display: 'inline-block', verticalAlign: -2, marginRight: 6 }} />
              {t('templates.preview')}
            </div>
            {previewItems.length === 0 ? (
              <EmptyState icon="file" title={t('templates.previewEmpty')} sub={t('templates.previewEmptySub')} />
            ) : (
              <DynamicChecklist items={previewItems} mode="preview" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
