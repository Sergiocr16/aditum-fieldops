/* © 2026 Aditum — Aditum FieldOps — Admin wiki list */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, Button, Input, EmptyState, Modal, Field, toast, confirmDialog } from '../../components/ui';
import { PageHeader } from './AdminShell';
import { useWiki } from '../../lib/wiki';
import type { AppCtx } from '../../lib/ctx';
import type { WikiStatus } from '../../lib/types';

const STATUS_CLS: Record<WikiStatus, string> = { DRAFT: 'bg-proc', PUBLISHED: 'bg-apro', INACTIVE: 'bg-cerr' };

export default function WikiListAdmin({ ctx }: { ctx: AppCtx }) {
  const { t } = useTranslation();
  const wiki = useWiki();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [catModal, setCatModal] = useState(false);
  const [catName, setCatName] = useState('');

  const statusLabel = (s: WikiStatus) => (s === 'DRAFT' ? t('wiki.statusDraft') : s === 'PUBLISHED' ? t('wiki.statusPublished') : t('wiki.statusInactive'));
  const catName_ = (id: string | null) => wiki.categories.find((c) => c.id === id)?.name || t('wiki.uncategorized');

  const rows = wiki.pages.filter((p) => {
    if (q && !p.title.toLowerCase().includes(q.toLowerCase()) && !(p.contentMarkdown || '').toLowerCase().includes(q.toLowerCase())) return false;
    if (cat && p.categoryId !== cat) return false;
    return true;
  });

  return (
    <div className="fade-in">
      <PageHeader
        title={t('wiki.title')}
        sub={t('wiki.subtitle')}
        action={
          <>
            <Button variant="ghost" icon="plus" onClick={() => setCatModal(true)}>{t('wiki.manageCategories')}</Button>
            <Button variant="primary" icon="plus" onClick={() => ctx.go('wikiForm', { mode: 'new' })}>{t('wiki.create')}</Button>
          </>
        }
      />

      <div className="card" style={{ padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 240px', minWidth: 200 }}>
            <Input icon="search" placeholder={t('wiki.search')} value={q} onChange={(e: any) => setQ(e.target.value)} />
          </div>
          <div style={{ position: 'relative' }}>
            <select value={cat} onChange={(e) => setCat(e.target.value)} className="filter-select" style={{ appearance: 'none' }}>
              <option value="">{t('wiki.allCategories')}</option>
              {wiki.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <span style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-3)' }}>
              <Icon name="chevronDown" size={15} />
            </span>
          </div>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('wiki.colTitle')}</th>
                <th>{t('wiki.colCategory')}</th>
                <th>{t('wiki.colStatus')}</th>
                <th>{t('wiki.colUpdated')}</th>
                <th style={{ textAlign: 'right' }}>{t('wiki.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState icon="file" title={t('wiki.emptyTitle')} sub={t('wiki.emptySub')} action={<Button variant="primary" icon="plus" onClick={() => ctx.go('wikiForm', { mode: 'new' })}>{t('wiki.create')}</Button>} />
                  </td>
                </tr>
              ) : (
                rows.map((p) => (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => ctx.go('wikiForm', { mode: 'edit', id: p.id })}>
                    <td style={{ fontWeight: 600, maxWidth: 280 }}>
                      <div className="truncate">{p.title || '—'}</div>
                    </td>
                    <td style={{ color: 'var(--text-2)' }}>{catName_(p.categoryId)}</td>
                    <td>
                      <span className={'badge sm ' + STATUS_CLS[p.status]}>
                        <span className="dot" />
                        {statusLabel(p.status)}
                      </span>
                    </td>
                    <td className="mono" style={{ color: 'var(--text-2)', fontSize: 12.5 }}>{(p.updatedAt || '').split(' ')[0]}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="icon-btn" title={t('common.edit')} onClick={() => ctx.go('wikiForm', { mode: 'edit', id: p.id })}>
                          <Icon name="edit" size={16} />
                        </button>
                        {p.status !== 'PUBLISHED' ? (
                          <button className="icon-btn" title={t('wiki.publish')} onClick={() => { wiki.setPageStatus(p.id, 'PUBLISHED'); toast(t('wiki.published'), 'success'); }}>
                            <Icon name="checkCircle" size={16} />
                          </button>
                        ) : (
                          <button className="icon-btn" title={t('wiki.deactivate')} onClick={() => { wiki.setPageStatus(p.id, 'INACTIVE'); toast(t('wiki.deactivated')); }}>
                            <Icon name="xCircle" size={16} />
                          </button>
                        )}
                        <button className="icon-btn" title={t('wiki.delete')} style={{ color: 'var(--st-rech-fg)' }} onClick={async () => { if (await confirmDialog({ title: t('wiki.delete'), message: t('wiki.deleteConfirm'), tone: 'danger', confirmLabel: t('wiki.delete'), confirmIcon: 'trash' })) { wiki.deletePage(p.id); toast(t('wiki.deleted')); } }}>
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={catModal}
        onClose={() => setCatModal(false)}
        width={460}
        title={t('wiki.manageCategories')}
        footer={<Button variant="ghost" onClick={() => setCatModal(false)}>{t('common.close')}</Button>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <Input placeholder={t('wiki.categoryName')} value={catName} onChange={(e: any) => setCatName(e.target.value)} />
            </div>
            <Button
              variant="primary"
              icon="plus"
              onClick={() => {
                if (catName.trim()) {
                  wiki.createCategory(catName.trim());
                  setCatName('');
                }
              }}
            >
              {t('common.create')}
            </Button>
          </div>
          <div className="divider" />
          {wiki.categories.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>—</div>
          ) : (
            wiki.categories.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</span>
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
}
