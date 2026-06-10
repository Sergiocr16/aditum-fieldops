/* © 2026 Aditum — Aditum FieldOps — Technicians management */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Icon, Avatar, Button, Modal, Field, Input, Select, Toggle, toast, CredentialsCard, confirmDialog } from '../../components/ui';
import { PageHeader } from './AdminShell';
import { useTenant } from '../../lib/tenant';
import { tenantHasFeature } from '../../lib/modules';
import AvailabilityEditor from '../../components/AvailabilityEditor';
import type { AppCtx } from '../../lib/ctx';
import type { AppUser } from '../../lib/types';

const CREATABLE_ROLES = ['tech', 'coordinador', 'facturacion'] as const;

export function genPassword() {
  const a = 'ABCDEFGHJKMNPQRSTUVWXYZ',
    b = 'abcdefghijkmnpqrstuvwxyz',
    n = '23456789';
  const r = new Uint32Array(8);
  crypto.getRandomValues(r);
  const pick = (s: string, i: number) => s[r[i] % s.length];
  return pick(a, 0) + pick(b, 1) + pick(b, 2) + pick(b, 3) + pick(n, 4) + pick(n, 5) + pick('@#$%', 6) + pick(n, 7);
}

function TechFormModal({ open, tech, onClose, onSave }: any) {
  const { t } = useTranslation();
  const editing = !!tech;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<string>('tech');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState<any>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setName(tech?.name || '');
      setEmail(tech?.email || '');
      setPhone(tech?.phone || '');
      setRole(tech?.role || 'tech');
      setPass(editing ? '' : genPassword());
      setErr({});
      setSaving(false);
    }
  }, [open, tech]);

  const save = async () => {
    const e: any = {};
    if (!name.trim()) e.name = t('technicians.errName');
    if (!email.trim()) e.email = t('technicians.errEmail');
    else if (!/.+@.+\..+/.test(email)) e.email = t('technicians.errEmailInvalid');
    if (!editing && !pass.trim()) e.pass = t('technicians.errPass');
    setErr(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      await onSave({ id: tech?.id, name: name.trim(), email: email.trim(), phone: phone.trim(), password: pass, role });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={460}
      title={editing ? t('technicians.edit') : t('technicians.create')}
      sub={editing ? t('technicians.editSub') : t('technicians.createSub')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" icon={editing ? 'check' : 'plus'} onClick={save} disabled={saving}>
            {editing ? t('common.saveChanges') : t('technicians.create')}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        <Field label={t('technicians.fullName')} required error={err.name}>
          <Input icon="users" placeholder={t('technicians.namePlaceholder')} value={name} onChange={(e: any) => setName(e.target.value)} error={!!err.name} />
        </Field>
        <Field label={t('auth.email')} required error={err.email}>
          <Input icon="mail" type="email" placeholder="jose.perez@aditum.cr" value={email} onChange={(e: any) => setEmail(e.target.value)} error={!!err.email} />
        </Field>
        <Field label={t('technicians.phone')} hint={t('common.optional')}>
          <Input icon="phone" placeholder="8888-8888" value={phone} onChange={(e: any) => setPhone(e.target.value)} />
        </Field>
        {!editing && (
          <Field label={t('technicians.fRole')} hint={t('technicians.fRoleHint')}>
            <Select value={role} onChange={(e: any) => setRole(e.target.value)}>
              {CREATABLE_ROLES.map((r) => <option key={r} value={r}>{t('roles.' + r)}</option>)}
            </Select>
          </Field>
        )}
        {/* La contraseña se genera automáticamente y se muestra en la tarjeta de credenciales al crear. */}
      </div>
    </Modal>
  );
}

export default function TechniciansScreen({ ctx, openCreate }: { ctx: AppCtx; openCreate?: boolean }) {
  const { t } = useTranslation();
  const [modal, setModal] = useState<any>(null);
  const [creds, setCreds] = useState<any>(null);
  const [availTech, setAvailTech] = useState<any>(null);
  useEffect(() => {
    if (openCreate) setModal({ tech: null });
  }, [openCreate]);

  const { tid, tenant } = useTenant();
  const showAvail = tenantHasFeature('maintenance', tenant?.features);
  const techs = ctx.db.technicians;
  // Personal de escritorio del tenant (coordinador/facturación) — query local.
  const [staff, setStaff] = useState<AppUser[]>([]);
  useEffect(() => {
    if (!tid) return;
    const q = query(collection(db, 'users'), where('tenantId', '==', tid), where('role', 'in', ['coordinador', 'facturacion']));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as AppUser[];
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setStaff(list);
    }, () => {});
  }, [tid]);

  const onSave = async (data: any) => {
    if (data.id) {
      try {
        await ctx.updateTechnician(data.id, { name: data.name, phone: data.phone, email: data.email } as any);
        toast(t('technicians.updated'), 'success');
        setModal(null);
      } catch (e: any) {
        toast(e?.message || 'Error', 'error');
      }
    } else {
      try {
        await ctx.addTechnician({ name: data.name, email: data.email, phone: data.phone, password: data.password, role: data.role });
        setModal(null);
        setCreds({ name: data.name, email: data.email, password: data.password, title: t('technicians.created'), sub: t('technicians.createdSub') });
      } catch (e: any) {
        toast(e?.message || 'Error', 'error');
      }
    }
  };

  const onResetPassword = async (tech: any) => {
    const ok = await confirmDialog({ title: t('technicians.resetPassword'), message: t('technicians.resetPasswordConfirm', { name: tech.name }), confirmLabel: t('technicians.resetPassword'), confirmIcon: 'refresh' });
    if (!ok) return;
    try {
      const { password } = await ctx.resetTechnicianPassword(tech.id);
      setCreds({ name: tech.name, email: tech.email, password, title: t('technicians.resetPasswordTitle'), sub: t('technicians.resetPasswordSub') });
      toast(t('technicians.passwordReset'), 'success');
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    }
  };

  return (
    <div className="fade-in">
      <PageHeader
        title={t('technicians.title')}
        sub={t('technicians.sub', { active: techs.filter((x) => x.active).length, total: techs.length })}
        action={<Button variant="primary" icon="plus" onClick={() => setModal({ tech: null })}>{t('technicians.create')}</Button>}
      />

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('technicians.colName')}</th>
                <th>{t('technicians.colEmail')}</th>
                <th>{t('technicians.colPhone')}</th>
                <th>{t('technicians.colStatus')}</th>
                <th>{t('technicians.colCreated')}</th>
                <th style={{ textAlign: 'right' }}>{t('technicians.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {techs.map((tech) => (
                <tr key={tech.id}>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                      <Avatar initials={tech.initials} size={32} />
                      <span style={{ fontWeight: 600 }}>{tech.name}</span>
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-2)' }} className="mono-sm">{tech.email}</td>
                  <td style={{ color: 'var(--text-2)' }}>{tech.phone || '—'}</td>
                  <td>
                    <span className={'badge sm ' + (tech.active ? 'bg-apro' : 'bg-cerr')}>
                      <span className="dot" />
                      {tech.active ? t('technicians.active') : t('technicians.inactive')}
                    </span>
                  </td>
                  <td className="mono" style={{ color: 'var(--text-2)', fontSize: 12.5 }}>{(tech.createdAt || '').split(' ')[0] || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                      <button className="icon-btn" title={t('common.edit')} onClick={() => setModal({ tech })}>
                        <Icon name="edit" size={16} />
                      </button>
                      {showAvail && (
                        <button className="icon-btn" title={t('availability.manageTitle')} onClick={() => setAvailTech(tech)}>
                          <Icon name="clock" size={16} />
                        </button>
                      )}
                      <button className="icon-btn" title={t('technicians.resetPassword')} onClick={() => onResetPassword(tech)}>
                        <Icon name="lock" size={16} />
                      </button>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingLeft: 6, borderLeft: '1px solid var(--border)' }}>
                        <Toggle
                          on={tech.active}
                          onClick={async () => {
                            await ctx.updateTechnician(tech.id, { active: !tech.active });
                            toast(tech.active ? t('technicians.deactivated') : t('technicians.activated'));
                          }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {staff.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div className="section-label" style={{ marginBottom: 10 }}>{t('technicians.deskStaff')}</div>
          <div className="card" style={{ overflow: 'hidden' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('technicians.colName')}</th>
                  <th>{t('technicians.colRole')}</th>
                  <th>{t('technicians.colEmail')}</th>
                  <th>{t('technicians.colStatus')}</th>
                  <th style={{ textAlign: 'right' }}>{t('technicians.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                        <Avatar initials={u.initials} size={32} gold />
                        <span style={{ fontWeight: 600 }}>{u.name}</span>
                      </span>
                    </td>
                    <td><span className="badge sm">{t('roles.' + u.role)}</span></td>
                    <td style={{ color: 'var(--text-2)' }} className="mono-sm">{u.email}</td>
                    <td>
                      <span className={'badge sm ' + (u.active ? 'bg-apro' : 'bg-cerr')}>
                        <span className="dot" />
                        {u.active ? t('technicians.active') : t('technicians.inactive')}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button className="icon-btn" title={t('technicians.resetPassword')} onClick={() => onResetPassword(u)}>
                          <Icon name="lock" size={16} />
                        </button>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingLeft: 6, borderLeft: '1px solid var(--border)' }}>
                          <Toggle on={u.active} onClick={async () => { await ctx.updateTechnician(u.id, { active: !u.active }); toast(u.active ? t('technicians.deactivated') : t('technicians.activated')); }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <TechFormModal open={!!modal} tech={modal?.tech} onClose={() => setModal(null)} onSave={onSave} />

      <Modal open={!!creds} onClose={() => setCreds(null)} width={420} title={t('technicians.created')} sub={t('technicians.createdSub')} tone="success" footer={<Button variant="primary" block onClick={() => setCreds(null)}>{t('common.understood')}</Button>}>
        {creds && <CredentialsCard name={creds.name} email={creds.email} password={creds.password} />}
      </Modal>

      <Modal open={!!availTech} onClose={() => setAvailTech(null)} width={520} title={t('availability.manageTitle')} sub={availTech ? t('availability.manageSub', { name: availTech.name }) : ''} footer={<Button variant="ghost" block onClick={() => setAvailTech(null)}>{t('common.close')}</Button>}>
        {availTech && <AvailabilityEditor techId={availTech.id} canEdit={true} />}
      </Modal>
    </div>
  );
}
