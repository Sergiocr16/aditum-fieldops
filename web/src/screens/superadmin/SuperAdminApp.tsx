/* © 2026 Aditum — Aditum FieldOps — Superadmin console: tenants, admins, MCP keys */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../lib/firebase';
import { useAuth } from '../../lib/auth';
import { Logo, Icon, Avatar, Button, Modal, Field, Input, Toggle, EmptyState, LangSwitcher, CredentialsCard, toast, confirmDialog } from '../../components/ui';
import type { AppUser, McpKeyMeta, Tenant } from '../../lib/types';

const call = (name: string) => httpsCallable(functions, name);

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="badge" style={{ background: ok ? 'var(--st-apro-bg)' : 'var(--st-pend-bg)', color: ok ? 'var(--st-apro-fg)' : 'var(--st-pend-fg)' }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: ok ? 'var(--st-apro-dot)' : 'var(--st-pend-dot)' }} />
      {label}
    </span>
  );
}

/* ------------------------------ create tenant modal ------------------------------ */
function CreateTenantModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [notifyEmail, setNotifyEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const slugOk = /^[a-z0-9][a-z0-9-]{1,18}[a-z0-9]$/.test(id);

  const create = async () => {
    if (!slugOk || !name.trim()) {
      toast(t('superadmin.invalidTenant'), 'error');
      return;
    }
    setBusy(true);
    try {
      await call('createTenant')({ id, name: name.trim(), ticketPrefix: prefix.trim() || undefined, notifyEmail: notifyEmail.trim() });
      toast(t('superadmin.tenantCreated'), 'success');
      setId(''); setName(''); setPrefix(''); setNotifyEmail('');
      onClose();
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('superadmin.newTenant')} sub={t('superadmin.newTenantSub')}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
        <Button onClick={create} disabled={busy}>{busy ? '…' : t('common.create')}</Button>
      </>}>
      <div className="form-grid">
        <Field label={t('superadmin.fSlug')} required hint={t('superadmin.fSlugHint')} error={id && !slugOk ? t('superadmin.fSlugErr') : undefined}>
          <Input placeholder="ralex" value={id} onChange={(e: any) => setId(e.target.value.toLowerCase().trim())} />
        </Field>
        <Field label={t('superadmin.fName')} required>
          <Input placeholder="Servicios Técnicos Ralex" value={name} onChange={(e: any) => setName(e.target.value)} />
        </Field>
        <Field label={t('superadmin.fPrefix')} hint={t('superadmin.fPrefixHint')}>
          <Input placeholder="RX" value={prefix} onChange={(e: any) => setPrefix(e.target.value.toUpperCase())} maxLength={4} />
        </Field>
        <Field label={t('superadmin.fNotifyEmail')} hint={t('superadmin.fNotifyEmailHint')}>
          <Input type="email" placeholder="ops@cliente.com" value={notifyEmail} onChange={(e: any) => setNotifyEmail(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/* ------------------------------ tenant detail ------------------------------ */
function TenantDetail({ tenant, onBack }: { tenant: Tenant; onBack: () => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'general' | 'admins' | 'mcp'>('general');
  const [admins, setAdmins] = useState<AppUser[]>([]);
  const [keys, setKeys] = useState<McpKeyMeta[]>([]);

  useEffect(() => {
    const qA = query(collection(db, 'users'), where('tenantId', '==', tenant.id), where('role', '==', 'admin'));
    const unsubA = onSnapshot(qA, (snap) => setAdmins(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as AppUser[]), () => {});
    const unsubK = onSnapshot(collection(db, 'tenants', tenant.id, 'mcpKeys'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as McpKeyMeta[];
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setKeys(list);
    }, () => {});
    return () => { unsubA(); unsubK(); };
  }, [tenant.id]);

  /* --- general --- */
  const [name, setName] = useState(tenant.name);
  const [notifyEmail, setNotifyEmail] = useState(tenant.notifyEmail || '');
  const [appName, setAppName] = useState(tenant.branding?.appName || '');
  const [savingGeneral, setSavingGeneral] = useState(false);
  useEffect(() => {
    setName(tenant.name);
    setNotifyEmail(tenant.notifyEmail || '');
    setAppName(tenant.branding?.appName || '');
  }, [tenant.id]);

  const saveGeneral = async () => {
    setSavingGeneral(true);
    try {
      await call('updateTenant')({ tenantId: tenant.id, name: name.trim(), notifyEmail: notifyEmail.trim(), branding: { appName: appName.trim() } });
      toast(t('common.saved'), 'success');
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    } finally {
      setSavingGeneral(false);
    }
  };

  const toggleActive = async () => {
    const ok = await confirmDialog({
      title: tenant.active ? t('superadmin.deactivateTitle') : t('superadmin.activateTitle'),
      message: tenant.active ? t('superadmin.deactivateMsg') : t('superadmin.activateMsg'),
      tone: tenant.active ? 'danger' : 'info',
      confirmLabel: tenant.active ? t('superadmin.deactivate') : t('superadmin.activate'),
    });
    if (!ok) return;
    try {
      await call('updateTenant')({ tenantId: tenant.id, active: !tenant.active });
      toast(t('common.saved'), 'success');
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    }
  };

  /* --- admins --- */
  const [adminModal, setAdminModal] = useState(false);
  const [aName, setAName] = useState('');
  const [aEmail, setAEmail] = useState('');
  const [aBusy, setABusy] = useState(false);
  const [creds, setCreds] = useState<{ name: string; email: string; password: string } | null>(null);

  const createAdmin = async () => {
    if (!aName.trim() || !aEmail.trim()) return;
    setABusy(true);
    try {
      const res: any = await call('createTenantAdmin')({ tenantId: tenant.id, name: aName.trim(), email: aEmail.trim() });
      setCreds({ name: aName.trim(), email: aEmail.trim(), password: res.data.password });
      setAName(''); setAEmail('');
      setAdminModal(false);
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    } finally {
      setABusy(false);
    }
  };

  /* --- mcp keys --- */
  const [newKey, setNewKey] = useState<{ key: string; keyId: string } | null>(null);
  const [keyBusy, setKeyBusy] = useState(false);

  const genKey = async () => {
    setKeyBusy(true);
    try {
      const res: any = await call('generateMcpKey')({ tenantId: tenant.id, label: 'web-' + new Date().toISOString().slice(0, 10) });
      setNewKey({ key: res.data.key, keyId: res.data.keyId });
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    } finally {
      setKeyBusy(false);
    }
  };

  const revokeKey = async (k: McpKeyMeta) => {
    const ok = await confirmDialog({ title: t('superadmin.revokeTitle'), message: t('superadmin.revokeMsg'), tone: 'danger', confirmLabel: t('superadmin.revoke') });
    if (!ok) return;
    try {
      await call('revokeMcpKey')({ tenantId: tenant.id, keyId: k.id });
      toast(t('superadmin.revoked'), 'success');
    } catch (e: any) {
      toast(e?.message || 'Error', 'error');
    }
  };

  const mcpSnippet = (key: string) =>
    `claude mcp add fieldops --transport http ${location.origin.includes('localhost') ? 'https://<mcp-server-url>' : 'https://<mcp-server-url>'}/mcp --header "Authorization: Bearer ${key}"`;

  const copy = (text: string, msg: string) => {
    navigator.clipboard?.writeText(text);
    toast(msg, 'success');
  };

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'general', label: t('superadmin.tabGeneral') },
    { key: 'admins', label: t('superadmin.tabAdmins') },
    { key: 'mcp', label: t('superadmin.tabMcp') },
  ];

  return (
    <div className="fade-in" style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <button className="icon-btn" onClick={onBack} style={{ width: 38, height: 38 }}>
          <Icon name="arrowLeft" size={18} />
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{tenant.name}</h1>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-2)' }} className="mono">{tenant.id} · {tenant.numbering?.ticketPrefix || 'AD'}-####</p>
        </div>
        <StatusDot ok={tenant.active} label={tenant.active ? t('superadmin.active') : t('superadmin.inactive')} />
        <StatusDot ok={tenant.smtpStatus === 'verified'} label={'SMTP: ' + t('superadmin.smtp_' + (tenant.smtpStatus || 'unset'))} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {tabs.map((x) => (
          <button key={x.key} className={'chip' + (tab === x.key ? ' chip-active' : '')} onClick={() => setTab(x.key)} style={tab === x.key ? { background: 'var(--navy-800)', color: '#fff', cursor: 'pointer' } : { cursor: 'pointer' }}>
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <div className="card card-pad">
          <div className="form-grid">
            <Field label={t('superadmin.fName')}>
              <Input value={name} onChange={(e: any) => setName(e.target.value)} />
            </Field>
            <Field label={t('superadmin.fAppName')} hint={t('superadmin.fAppNameHint')}>
              <Input value={appName} onChange={(e: any) => setAppName(e.target.value)} />
            </Field>
            <Field label={t('superadmin.fNotifyEmail')}>
              <Input type="email" value={notifyEmail} onChange={(e: any) => setNotifyEmail(e.target.value)} />
            </Field>
            <Field label={t('superadmin.fActive')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 42 }}>
                <Toggle on={tenant.active} onClick={toggleActive} />
                <span style={{ fontSize: 13.5, color: 'var(--text-2)' }}>{tenant.active ? t('superadmin.active') : t('superadmin.inactive')}</span>
              </div>
            </Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
            <Button onClick={saveGeneral} disabled={savingGeneral}>{savingGeneral ? '…' : t('common.save')}</Button>
          </div>
        </div>
      )}

      {tab === 'admins' && (
        <div className="card card-pad">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="section-label">{t('superadmin.adminsOf', { name: tenant.name })}</div>
            <Button size="sm" icon="plus" onClick={() => setAdminModal(true)}>{t('superadmin.newAdmin')}</Button>
          </div>
          {creds && (
            <div style={{ marginBottom: 14 }}>
              <CredentialsCard name={creds.name} email={creds.email} password={creds.password} />
              <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '8px 0 0' }}>{t('superadmin.credsOnce')}</p>
            </div>
          )}
          {admins.length === 0 ? (
            <EmptyState icon="users" title={t('superadmin.noAdmins')} sub={t('superadmin.noAdminsSub')} />
          ) : (
            admins.map((a) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <Avatar initials={a.initials} size={34} gold />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{a.name}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-3)' }} className="mono">{a.email}</div>
                </div>
                <StatusDot ok={a.active} label={a.active ? t('superadmin.active') : t('superadmin.inactive')} />
              </div>
            ))
          )}
          <Modal open={adminModal} onClose={() => setAdminModal(false)} title={t('superadmin.newAdmin')} sub={tenant.name}
            footer={<>
              <Button variant="ghost" onClick={() => setAdminModal(false)}>{t('common.cancel')}</Button>
              <Button onClick={createAdmin} disabled={aBusy}>{aBusy ? '…' : t('common.create')}</Button>
            </>}>
            <div className="form-grid">
              <Field label={t('superadmin.fAdminName')} required>
                <Input value={aName} onChange={(e: any) => setAName(e.target.value)} />
              </Field>
              <Field label={t('superadmin.fAdminEmail')} required>
                <Input type="email" value={aEmail} onChange={(e: any) => setAEmail(e.target.value)} />
              </Field>
            </div>
          </Modal>
        </div>
      )}

      {tab === 'mcp' && (
        <div className="card card-pad">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="section-label">{t('superadmin.mcpKeys')}</div>
            <Button size="sm" icon="plus" onClick={genKey} disabled={keyBusy}>{keyBusy ? '…' : t('superadmin.newKey')}</Button>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 14px' }}>{t('superadmin.mcpIntro')}</p>
          {newKey && (
            <div style={{ background: 'var(--navy-900)', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', marginBottom: 6 }}>{t('superadmin.keyOnce')}</div>
              <div className="mono" style={{ fontSize: 12.5, color: '#fff', wordBreak: 'break-all', marginBottom: 10 }}>{newKey.key}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button size="sm" variant="gold" icon="copy" onClick={() => copy(newKey.key, t('share.copied'))}>{t('superadmin.copyKey')}</Button>
                <Button size="sm" variant="ghost" icon="copy" onClick={() => copy(mcpSnippet(newKey.key), t('share.copied'))} style={{ color: '#fff' }}>{t('superadmin.copySnippet')}</Button>
              </div>
            </div>
          )}
          {keys.length === 0 ? (
            <EmptyState icon="link" title={t('superadmin.noKeys')} sub={t('superadmin.noKeysSub')} />
          ) : (
            keys.map((k) => (
              <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <Icon name="link" size={17} style={{ color: 'var(--text-3)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{k.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }} className="mono">····{k.last4} · {k.createdAt || ''}</div>
                </div>
                {k.revoked ? (
                  <StatusDot ok={false} label={t('superadmin.revokedLabel')} />
                ) : (
                  <Button size="sm" variant="danger" onClick={() => revokeKey(k)}>{t('superadmin.revoke')}</Button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ root ------------------------------ */
export default function SuperAdminApp() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    return onSnapshot(
      collection(db, 'tenants'),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Tenant[];
        list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setTenants(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, []);

  const selected = useMemo(() => tenants.find((x) => x.id === selectedId) || null, [tenants, selectedId]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{ background: 'var(--navy-900)', padding: '0 22px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Logo variant="dark" height={26} withLockup lockupColor="#fff" dark />
          <span className="badge" style={{ background: 'var(--gold)', color: 'var(--navy-900)', fontWeight: 700 }}>{t('superadmin.badge')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <LangSwitcher dark />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar initials={user?.initials || 'SA'} size={32} gold />
            <span style={{ color: '#fff', fontSize: 13.5, fontWeight: 600 }} className="hide-sm">{user?.name}</span>
          </div>
          <button onClick={logout} title={t('common.logout')} style={{ border: 'none', background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.85)', width: 34, height: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Icon name="logout" size={16} />
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 20px' }}>
        {selected ? (
          <TenantDetail tenant={selected} onBack={() => setSelectedId(null)} />
        ) : (
          <div className="fade-in">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 23, fontWeight: 700 }}>{t('superadmin.title')}</h1>
                <p style={{ margin: '3px 0 0', fontSize: 13.5, color: 'var(--text-2)' }}>{t('superadmin.subtitle')}</p>
              </div>
              <Button icon="plus" variant="gold" onClick={() => setCreateOpen(true)}>{t('superadmin.newTenant')}</Button>
            </div>

            {loading ? null : tenants.length === 0 ? (
              <EmptyState icon="building" title={t('superadmin.noTenants')} sub={t('superadmin.noTenantsSub')} action={<Button icon="plus" onClick={() => setCreateOpen(true)}>{t('superadmin.newTenant')}</Button>} />
            ) : (
              <div className="card" style={{ overflow: 'hidden' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('superadmin.thTenant')}</th>
                      <th>{t('superadmin.thPrefix')}</th>
                      <th>{t('superadmin.thSmtp')}</th>
                      <th>{t('superadmin.thStatus')}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map((x) => (
                      <tr key={x.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedId(x.id)}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{x.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-3)' }} className="mono">{x.id}</div>
                        </td>
                        <td className="mono">{x.numbering?.ticketPrefix || 'AD'}</td>
                        <td><StatusDot ok={x.smtpStatus === 'verified'} label={t('superadmin.smtp_' + (x.smtpStatus || 'unset'))} /></td>
                        <td><StatusDot ok={x.active} label={x.active ? t('superadmin.active') : t('superadmin.inactive')} /></td>
                        <td style={{ textAlign: 'right' }}><Icon name="chevronRight" size={16} style={{ color: 'var(--text-3)' }} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <CreateTenantModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
