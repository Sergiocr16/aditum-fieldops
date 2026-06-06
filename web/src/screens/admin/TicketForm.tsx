/* © 2026 Aditum — Aditum FieldOps — Create / edit ticket */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, Button, Field, Input, Textarea, Select, toast } from '../../components/ui';
import { PageHeader } from './AdminShell';
import { PRIORITY } from '../../lib/config';
import { buildNewTicket } from '../../lib/store';
import type { AppCtx } from '../../lib/ctx';

function FormSection({ letter, title, sub, children }: any) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center', background: 'var(--surface-2)' }}>
        <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--navy-800)', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flex: 'none' }}>{letter}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
          {sub && <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 1 }}>{sub}</div>}
        </div>
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

function ChecklistEditor({ items, setItems }: any) {
  const { t } = useTranslation();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const add = () => setItems([...items, { id: 'n' + Math.random().toString(36).slice(2), text: '', done: false }]);
  const remove = (id: string) => setItems(items.filter((i: any) => i.id !== id));
  const edit = (id: string, text: string) => setItems(items.map((i: any) => (i.id === id ? { ...i, text } : i)));
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
      {items.map((it: any, i: number) => (
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

export default function TicketForm({ ctx, mode, id }: { ctx: AppCtx; mode: string; id?: string }) {
  const { t } = useTranslation();
  const editing = mode === 'edit';
  const existing = editing ? ctx.db.tickets.find((x) => x.id === id) : null;
  const [f, setF] = useState<any>(() =>
    existing
      ? { ...existing }
      : { title: '', client: '', site: '', address: '', priority: 'media', techId: '', scheduled: '', deadline: '', description: '', instructions: '', expected: '', doneConditions: '', observations: '', evidenceReq: '', checklist: [{ id: 'a', text: '', done: false }] }
  );
  const [err, setErr] = useState<any>({});
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));

  const save = async () => {
    const e: any = {};
    if (!f.title.trim()) e.title = t('common.required');
    if (!f.client.trim()) e.client = t('common.required');
    if (!f.priority) e.priority = t('common.required');
    setErr(e);
    if (Object.keys(e).length) {
      toast(t('ticketForm.errRequired'), 'error');
      return;
    }
    if (editing && id) {
      await ctx.updateTicket(id, {
        title: f.title,
        client: f.client,
        site: f.site,
        address: f.address,
        priority: f.priority,
        scheduled: f.scheduled,
        deadline: f.deadline,
        description: f.description,
        instructions: f.instructions,
        expected: f.expected,
        doneConditions: f.doneConditions,
        observations: f.observations,
        evidenceReq: f.evidenceReq,
        checklist: f.checklist.filter((c: any) => c.text.trim()),
      });
      toast(t('ticketForm.updated'), 'success');
      ctx.go('ticketDetail', { id });
    } else {
      const techName = ctx.db.technicians.find((x) => x.id === f.techId)?.name;
      const payload = buildNewTicket(f, ctx.admin.name, techName);
      const num = await ctx.addTicket(payload);
      toast(t('ticketForm.created', { num }), 'success');
      ctx.go('tickets');
    }
  };

  return (
    <div className="fade-in" style={{ maxWidth: 860, margin: '0 auto' }}>
      <PageHeader title={editing ? t('ticketForm.editTitle') : t('ticketForm.createTitle')} sub={editing ? existing?.num : t('ticketForm.newSub')} back={() => ctx.back()} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <FormSection letter="A" title={t('ticketForm.secA')}>
          <div className="form-grid">
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label={t('ticketForm.fTitle')} required error={err.title}>
                <Input placeholder={t('ticketForm.fTitlePh')} value={f.title} onChange={(e: any) => set('title', e.target.value)} error={!!err.title} />
              </Field>
            </div>
            <Field label={t('ticketForm.fClient')} required error={err.client}>
              <Input icon="building" placeholder={t('ticketForm.fClientPh')} value={f.client} onChange={(e: any) => set('client', e.target.value)} error={!!err.client} />
            </Field>
            <Field label={t('ticketForm.fSite')}>
              <Input icon="mapPin" placeholder={t('ticketForm.fSitePh')} value={f.site} onChange={(e: any) => set('site', e.target.value)} />
            </Field>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label={t('ticketForm.fAddress')}>
                <Input placeholder={t('ticketForm.fAddressPh')} value={f.address} onChange={(e: any) => set('address', e.target.value)} />
              </Field>
            </div>
            <Field label={t('ticketForm.fPriority')} required>
              <Select value={f.priority} onChange={(e: any) => set('priority', e.target.value)}>
                {Object.values(PRIORITY).map((p) => (
                  <option key={p.key} value={p.key}>
                    {t('priority.' + p.key)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('ticketForm.fTech')}>
              <Select value={f.techId} onChange={(e: any) => set('techId', e.target.value)}>
                <option value="">{t('common.unassigned')}</option>
                {ctx.db.technicians.filter((x) => x.active).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('ticketForm.fScheduled')}>
              <Input type="date" value={f.scheduled} onChange={(e: any) => set('scheduled', e.target.value)} />
            </Field>
            <Field label={t('ticketForm.fDeadline')}>
              <Input type="date" value={f.deadline} onChange={(e: any) => set('deadline', e.target.value)} />
            </Field>
          </div>
        </FormSection>

        <FormSection letter="B" title={t('ticketForm.secB')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            <Field label={t('ticketForm.fDescription')}>
              <Textarea placeholder={t('ticketForm.fDescriptionPh')} value={f.description} onChange={(e: any) => set('description', e.target.value)} />
            </Field>
            <Field label={t('ticketForm.fInstructions')} hint={t('ticketForm.fInstructionsHint')}>
              <Textarea placeholder={t('ticketForm.fInstructionsPh')} value={f.instructions} onChange={(e: any) => set('instructions', e.target.value)} />
            </Field>
            <div className="form-grid">
              <Field label={t('ticketForm.fExpected')}>
                <Textarea placeholder={t('ticketForm.fExpectedPh')} value={f.expected} onChange={(e: any) => set('expected', e.target.value)} />
              </Field>
              <Field label={t('ticketForm.fDone')}>
                <Textarea placeholder={t('ticketForm.fDonePh')} value={f.doneConditions} onChange={(e: any) => set('doneConditions', e.target.value)} />
              </Field>
            </div>
            <Field label={t('ticketForm.fObs')}>
              <Textarea placeholder={t('ticketForm.fObsPh')} value={f.observations} onChange={(e: any) => set('observations', e.target.value)} style={{ minHeight: 64 }} />
            </Field>
          </div>
        </FormSection>

        <FormSection letter="C" title={t('ticketForm.secC')} sub={t('ticketForm.secCsub')}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--st-proc-bg)', color: 'var(--st-proc-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <Icon name="camera" size={18} />
            </span>
            <div style={{ flex: 1 }}>
              <Textarea placeholder={t('ticketForm.fEvidencePh')} value={f.evidenceReq} onChange={(e: any) => set('evidenceReq', e.target.value)} />
            </div>
          </div>
        </FormSection>

        <FormSection letter="D" title={t('ticketForm.secD')} sub={t('ticketForm.secDsub')}>
          <ChecklistEditor items={f.checklist} setItems={(v: any) => set('checklist', v)} />
        </FormSection>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, position: 'sticky', bottom: 0, background: 'var(--bg)', padding: '12px 0', borderTop: '1px solid var(--border)' }}>
          <Button variant="ghost" onClick={() => ctx.back()}>{t('common.cancel')}</Button>
          <Button variant="primary" icon="check" onClick={save}>{editing ? t('common.saveChanges') : t('tickets.create')}</Button>
        </div>
      </div>
    </div>
  );
}
