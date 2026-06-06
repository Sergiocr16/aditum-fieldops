/* © 2026 Aditum — Aditum FieldOps — Admin wiki editor (Markdown + attachments) */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../../lib/firebase';
import { Icon, Button, Field, Input, Select, Textarea, toast } from '../../components/ui';
import { PageHeader } from './AdminShell';
import Markdown from '../../components/Markdown';
import { useWiki } from '../../lib/wiki';
import { now } from '../../lib/time';
import type { AppCtx } from '../../lib/ctx';
import type { WikiAttachment, EvidenceType } from '../../lib/types';

function refFor(att: WikiAttachment): string {
  if (att.type === 'image') return `![${att.name}](${att.file})`;
  if (att.type === 'video') return `@[video](${att.file})`;
  return `[${att.name}](${att.file})`;
}

export default function WikiEditor({ ctx, mode, id }: { ctx: AppCtx; mode: string; id?: string }) {
  const { t } = useTranslation();
  const wiki = useWiki();
  const editing = mode === 'edit';
  const existing = editing ? wiki.pages.find((p) => p.id === id) : null;
  const [pageId] = useState(() => id || wiki.newPageId());
  const [title, setTitle] = useState(existing?.title || '');
  const [categoryId, setCategoryId] = useState(existing?.categoryId || '');
  const [content, setContent] = useState(existing?.contentMarkdown || '');
  const [attachments, setAttachments] = useState<WikiAttachment[]>(existing?.attachments || []);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const evType: EvidenceType = file.type.startsWith('video/') ? 'video' : file.type === 'application/pdf' ? 'pdf' : 'image';
    const fileId = Math.random().toString(36).slice(2);
    const path = `wiki/${pageId}/${fileId}-${file.name.replace(/[^\w.\-]/g, '_')}`;
    setUploading(true);
    const task = uploadBytesResumable(storageRef(storage, path), file, { contentType: file.type });
    task.on(
      'state_changed',
      undefined,
      (err) => { setUploading(false); toast(err.message, 'error'); },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        const att: WikiAttachment = { id: fileId, path, file: url, type: evType, name: file.name, size: file.size, by: ctx.admin.name, date: now() };
        setAttachments((a) => [...a, att]);
        setUploading(false);
        toast(t('wiki.saved'), 'success');
      }
    );
  };

  const save = async (status: 'DRAFT' | 'PUBLISHED') => {
    if (!title.trim()) {
      toast(t('wiki.requiredTitle'), 'error');
      return;
    }
    await wiki.savePage(pageId, { title: title.trim(), categoryId: categoryId || null, contentMarkdown: content, status, attachments }, !editing && !existing);
    toast(status === 'PUBLISHED' ? t('wiki.published') : t('wiki.saved'), 'success');
    ctx.go('wiki');
  };

  return (
    <div className="fade-in" style={{ maxWidth: 980, margin: '0 auto' }}>
      <PageHeader title={editing ? t('wiki.edit') : t('wiki.create')} sub={t('wiki.newPage')} back={() => ctx.back()} />

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="form-grid">
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label={t('wiki.fTitle')} required>
              <Input placeholder={t('wiki.fTitlePh')} value={title} onChange={(e: any) => setTitle(e.target.value)} />
            </Field>
          </div>
          <Field label={t('wiki.fCategory')}>
            <Select value={categoryId} onChange={(e: any) => setCategoryId(e.target.value)}>
              <option value="">{t('wiki.uncategorized')}</option>
              {wiki.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          {(['write', 'preview'] as const).map((tb) => (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              style={{ border: 'none', background: tab === tb ? '#fff' : 'transparent', borderBottom: tab === tb ? '2px solid var(--navy-700)' : '2px solid transparent', padding: '12px 18px', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', color: tab === tb ? 'var(--text)' : 'var(--text-2)' }}
            >
              {tb === 'write' ? t('wiki.write') : t('wiki.preview')}
            </button>
          ))}
        </div>
        <div style={{ padding: 18 }}>
          {tab === 'write' ? (
            <Textarea value={content} onChange={(e: any) => setContent(e.target.value)} placeholder={t('wiki.contentPh')} style={{ minHeight: 360, fontFamily: "'JetBrains Mono',monospace", fontSize: 13.5 }} />
          ) : (
            <div style={{ minHeight: 360 }}>
              <Markdown source={content} />
            </div>
          )}
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div className="section-label" style={{ margin: 0 }}>{t('wiki.attachments')}</div>
          <Button variant="ghost" size="sm" icon="upload" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? t('wiki.uploadingAttachment') : t('wiki.addAttachment')}
          </Button>
          <input ref={fileRef} type="file" accept="image/*,video/*,application/pdf" style={{ display: 'none' }} onChange={onUpload} />
        </div>
        {attachments.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>—</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {attachments.map((att) => (
              <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px' }}>
                <span style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)', flex: 'none' }}>
                  <Icon name={att.type === 'video' ? 'video' : att.type === 'pdf' ? 'file' : 'camera'} size={16} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="truncate" style={{ fontSize: 13, fontWeight: 600 }}>{att.name}</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{refFor(att)}</div>
                </div>
                <Button variant="ghost" size="sm" icon="plus" onClick={() => setContent((c) => c + '\n\n' + refFor(att) + '\n')}>{t('wiki.insertRef')}</Button>
                <Button variant="quiet" size="sm" icon="copy" onClick={() => { navigator.clipboard?.writeText(refFor(att)); toast(t('common.copied'), 'success'); }} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, position: 'sticky', bottom: 0, background: 'var(--bg)', padding: '12px 0', borderTop: '1px solid var(--border)' }}>
        <Button variant="ghost" onClick={() => ctx.back()}>{t('common.cancel')}</Button>
        <Button variant="ghost" icon="file" onClick={() => save('DRAFT')}>{t('wiki.saveDraft')}</Button>
        <Button variant="primary" icon="checkCircle" onClick={() => save('PUBLISHED')}>{t('wiki.publishPage')}</Button>
      </div>
    </div>
  );
}
