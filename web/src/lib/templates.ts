/* © 2026 Aditum — Aditum FieldOps — Checklist templates per equipment type (versioned, immutable) */
import { useEffect, useState } from 'react';
import { onSnapshot, query, where, setDoc, writeBatch, doc } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './auth';
import { useTenant } from './tenant';
import { now } from './time';
import type { ChecklistTemplate, TemplateItem, TemplateSection } from './types';

/** Templates of one equipment type (all versions, newest first). */
export function useTemplates(typeId?: string) {
  const { user } = useAuth();
  const { tid, tcol, tdoc } = useTenant();
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !tid || !typeId) {
      setTemplates([]);
      setLoading(false);
      return;
    }
    const q = query(tcol('checklistTemplates'), where('typeId', '==', typeId));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as ChecklistTemplate[];
      list.sort((a, b) => b.version - a.version);
      setTemplates(list);
      setLoading(false);
    }, () => setLoading(false));
  }, [user?.uid, tid, typeId]);

  const by = user?.name || '';

  return {
    templates,
    loading,
    /** Publishes a NEW immutable version: writes {typeId}_v{n+1}, marks the previous
        active version as superseded and moves the type pointer. */
    publishVersion: async (typeId: string, sections: TemplateSection[], items: TemplateItem[]) => {
      const current = templates.filter((t) => t.status === 'active');
      const nextVersion = (templates[0]?.version || 0) + 1;
      const batch = writeBatch(db);
      const newRef = tdoc('checklistTemplates', `${typeId}_v${nextVersion}`);
      batch.set(newRef, {
        typeId,
        version: nextVersion,
        status: 'active',
        sections,
        items,
        createdAt: now(),
        createdBy: by,
      });
      for (const c of current) {
        batch.update(tdoc('checklistTemplates', c.id), { status: 'superseded', updatedAt: now() });
      }
      batch.update(tdoc('equipmentTypes', typeId), { activeTemplateVersion: nextVersion, updatedAt: now() });
      await batch.commit();
      return nextVersion;
    },
  };
}
