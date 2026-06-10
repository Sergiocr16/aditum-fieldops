/* © 2026 Aditum — Aditum FieldOps — Wiki data hook (Firestore) */
import { useEffect, useState } from 'react';
import { doc, onSnapshot, query, where, addDoc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { useAuth } from './auth';
import { useTenant } from './tenant';
import { now } from './time';
import type { WikiCategory, WikiPage, WikiStatus } from './types';

export function useWiki() {
  const { user } = useAuth();
  const { tid, tcol, tdoc } = useTenant();
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [categories, setCategories] = useState<WikiCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !tid) return;
    const isAdmin = user.role === 'admin';
    const pagesQ = isAdmin ? query(tcol('wikiPages')) : query(tcol('wikiPages'), where('status', '==', 'PUBLISHED'));
    const unsubP = onSnapshot(pagesQ, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as WikiPage[];
      list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      setPages(list);
      setLoading(false);
    });
    const unsubC = onSnapshot(tcol('wikiCategories'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as WikiCategory[];
      list.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0) || a.name.localeCompare(b.name));
      setCategories(list);
    });
    return () => {
      unsubP();
      unsubC();
    };
  }, [user?.uid, user?.role, tid]);

  const by = user?.name || '';

  return {
    pages,
    categories,
    loading,
    createPage: async (data: Partial<WikiPage>) => {
      const ts = now();
      const ref = await addDoc(tcol('wikiPages'), {
        title: data.title || '',
        categoryId: data.categoryId || null,
        contentMarkdown: data.contentMarkdown || '',
        status: data.status || 'DRAFT',
        attachments: data.attachments || [],
        createdBy: by,
        updatedBy: by,
        createdAt: ts,
        updatedAt: ts,
        publishedAt: data.status === 'PUBLISHED' ? ts : null,
      });
      return ref.id;
    },
    updatePage: async (id: string, patch: Partial<WikiPage>) => {
      await updateDoc(tdoc('wikiPages', id), { ...patch, updatedBy: by, updatedAt: now() } as any);
    },
    /** Upsert (create-or-update) a page by a known id — used by the editor. */
    newPageId: () => doc(tcol('wikiPages')).id,
    savePage: async (id: string, data: Partial<WikiPage>, isNew: boolean) => {
      const ts = now();
      const base: any = { ...data, updatedBy: by, updatedAt: ts };
      if (data.status === 'PUBLISHED') base.publishedAt = ts;
      if (isNew) {
        base.createdBy = by;
        base.createdAt = ts;
        if (!base.attachments) base.attachments = [];
      }
      await setDoc(tdoc('wikiPages', id), base, { merge: true });
    },
    setPageStatus: async (id: string, status: WikiStatus) => {
      const patch: any = { status, updatedBy: by, updatedAt: now() };
      if (status === 'PUBLISHED') patch.publishedAt = now();
      await updateDoc(tdoc('wikiPages', id), patch);
    },
    deletePage: async (id: string) => {
      await deleteDoc(tdoc('wikiPages', id));
    },
    createCategory: async (name: string, description = '') => {
      await addDoc(tcol('wikiCategories'), { name, description, active: true, orderIndex: 0, createdAt: now(), updatedAt: now() });
    },
    updateCategory: async (id: string, patch: Partial<WikiCategory>) => {
      await updateDoc(tdoc('wikiCategories', id), { ...patch, updatedAt: now() } as any);
    },
  };
}
