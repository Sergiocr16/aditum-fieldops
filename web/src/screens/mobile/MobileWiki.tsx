/* © 2026 Aditum — Aditum FieldOps — Technician mobile wiki */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, Input, EmptyState } from '../../components/ui';
import { MobileHeader } from './MobileDashboard';
import Markdown from '../../components/Markdown';
import { useWiki } from '../../lib/wiki';
import type { AppCtx } from '../../lib/ctx';

export function TechWikiList({ ctx }: { ctx: AppCtx }) {
  const { t } = useTranslation();
  const wiki = useWiki();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const catName = (id: string | null) => wiki.categories.find((c) => c.id === id)?.name || t('wiki.uncategorized');
  const list = wiki.pages.filter((p) => {
    if (q && !p.title.toLowerCase().includes(q.toLowerCase()) && !(p.contentMarkdown || '').toLowerCase().includes(q.toLowerCase())) return false;
    if (cat && p.categoryId !== cat) return false;
    return true;
  });
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <MobileHeader title={t('wiki.title')} onBack={() => ctx.go('techDashboard')} />
      <div style={{ padding: '12px 14px', background: '#fff', borderBottom: '1px solid var(--border)' }}>
        <Input icon="search" placeholder={t('wiki.search')} value={q} onChange={(e: any) => setQ(e.target.value)} />
      </div>
      {wiki.categories.length > 0 && (
        <div className="m-chips">
          <button onClick={() => setCat('')} className={'m-chip' + (cat === '' ? ' active' : '')}>{t('wiki.allCategories')}</button>
          {wiki.categories.map((c) => (
            <button key={c.id} onClick={() => setCat(c.id)} className={'m-chip' + (cat === c.id ? ' active' : '')}>
              {c.name}
            </button>
          ))}
        </div>
      )}
      <div className="m-scroll" style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 24px', gap: 10 }}>
        {list.length ? (
          list.map((p) => (
            <button key={p.id} onClick={() => ctx.go('techWikiPage', { id: p.id })} className="m-ticket-card">
              <div style={{ fontSize: 15.5, fontWeight: 700, lineHeight: 1.3, marginBottom: 6, textAlign: 'left' }}>{p.title}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="tag">{catName(p.categoryId)}</span>
                <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{(p.updatedAt || '').split(' ')[0]}</span>
              </div>
            </button>
          ))
        ) : (
          <div style={{ marginTop: 30 }}>
            <EmptyState icon="file" title={t('wiki.emptyTechTitle')} sub={t('wiki.emptyTechSub')} />
          </div>
        )}
      </div>
    </div>
  );
}

export function TechWikiPage({ ctx, id }: { ctx: AppCtx; id: string }) {
  const { t } = useTranslation();
  const wiki = useWiki();
  const page = wiki.pages.find((p) => p.id === id);
  const catName = page ? wiki.categories.find((c) => c.id === page.categoryId)?.name || t('wiki.uncategorized') : '';
  if (!page) return <MobileHeader title={t('wiki.title')} onBack={() => ctx.go('techWiki')} />;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <MobileHeader title={page.title} onBack={() => ctx.go('techWiki')} />
      <div className="m-scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 40px', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span className="tag">{catName}</span>
          <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{t('wiki.lastUpdated')}: {(page.updatedAt || '').split(' ')[0]}</span>
        </div>
        <div className="card card-pad">
          <Markdown source={page.contentMarkdown} />
        </div>
        {page.attachments.filter((a) => a.type === 'pdf').length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {page.attachments.filter((a) => a.type === 'pdf').map((a) => (
              <a key={a.id} href={a.file} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--border)', borderRadius: 12, padding: '13px 15px', textDecoration: 'none', color: 'var(--text)', background: '#fff' }}>
                <span style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--st-rech-bg)', color: 'var(--st-rech-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                  <Icon name="file" size={18} />
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>PDF</div>
                </div>
                <Icon name="download" size={18} style={{ color: 'var(--text-3)' }} />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
