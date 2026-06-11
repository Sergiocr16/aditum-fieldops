/* © 2026 Aditum — Aditum FieldOps — tenant management (superadmin) */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { createHash, randomBytes } from 'crypto';
import { nowCR, initialsOf, validTenantId, DEFAULT_BRANDING, DEFAULT_NUMBERING, TenantDoc } from './shared';
import { assertAdmin, assertSuperadmin, tenantRef, tcol } from './tenant';
import { invalidateBranding } from './notifications';

const db = () => admin.firestore();

function genPassword() {
  const a = 'ABCDEFGHJKMNPQRSTUVWXYZ', b = 'abcdefghijkmnpqrstuvwxyz', n = '23456789', s = '@#$%';
  const buf = randomBytes(8);
  const pick = (set: string, i: number) => set[buf[i] % set.length];
  return pick(a, 0) + pick(b, 1) + pick(b, 2) + pick(b, 3) + pick(n, 4) + pick(n, 5) + pick(s, 6) + pick(n, 7);
}

/* ------------------------- tenants ------------------------- */
export const createTenant = onCall(async (req) => {
  const su = assertSuperadmin(req);
  const { id, name, ticketPrefix, notifyEmail } = req.data || {};
  if (!validTenantId(id)) throw new HttpsError('invalid-argument', 'ID de tenant inválido (minúsculas, dígitos y guiones, 3–20).');
  if (!name?.trim()) throw new HttpsError('invalid-argument', 'name es requerido.');
  const ref = tenantRef(id);
  if ((await ref.get()).exists) throw new HttpsError('already-exists', 'Ya existe un tenant con ese ID.');
  const ts = nowCR();
  const docData: TenantDoc = {
    name: name.trim(),
    active: true,
    branding: { ...DEFAULT_BRANDING, appName: name.trim() },
    numbering: { ...DEFAULT_NUMBERING, ...(ticketPrefix?.trim() ? { ticketPrefix: String(ticketPrefix).trim().toUpperCase().slice(0, 4) } : {}) },
    notifyEmail: (notifyEmail || '').trim(),
    smtpStatus: 'unset',
    createdAt: ts,
    updatedAt: ts,
    createdBy: su.uid,
  };
  await ref.set(docData);
  await tcol(id, 'counters').doc('tickets').set({ value: 1000 }, { merge: true });
  return { ok: true, id };
});

const VALID_FEATURES = ['tickets', 'maintenance', 'inventory', 'wiki', 'fiscal'];

/** Superadmin edits any tenant; a tenant admin can edit branding/notifyEmail/features of their own. */
export const updateTenant = onCall(async (req) => {
  const { tenantId, name, active, branding, numbering, notifyEmail, features, techEditAvailability, language, whiteLabel } = req.data || {};
  if (!tenantId) throw new HttpsError('invalid-argument', 'tenantId es requerido.');
  const isSuper = req.auth?.token?.role === 'superadmin';
  if (!isSuper) {
    const ctx = assertAdmin(req);
    if (ctx.tenantId !== tenantId) throw new HttpsError('permission-denied', 'Solo podés editar tu propio tenant.');
    if (typeof active === 'boolean' || name || numbering) throw new HttpsError('permission-denied', 'Solo superadmin cambia nombre, estado o numeración.');
  }
  const ref = tenantRef(tenantId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Tenant no encontrado.');
  const patch: any = { updatedAt: nowCR() };
  if (isSuper && typeof name === 'string' && name.trim()) patch.name = name.trim();
  if (isSuper && typeof active === 'boolean') patch.active = active;
  if (isSuper && numbering && typeof numbering === 'object') {
    const cur = (snap.data() as any).numbering || DEFAULT_NUMBERING;
    patch.numbering = {
      ticketPrefix: String(numbering.ticketPrefix || cur.ticketPrefix).toUpperCase().slice(0, 4),
      contractPrefix: String(numbering.contractPrefix || cur.contractPrefix).toUpperCase().slice(0, 4),
      osPrefix: String(numbering.osPrefix || cur.osPrefix).toUpperCase().slice(0, 4),
    };
  }
  if (branding && typeof branding === 'object') {
    const data = snap.data() as any;
    // La personalización de marca (logo/paleta) requiere que el tenant sea white-label.
    if (!isSuper && data.whiteLabel !== true) {
      throw new HttpsError('permission-denied', 'La personalización de marca no está habilitada para esta empresa.');
    }
    const cur = data.branding || DEFAULT_BRANDING;
    const hexOr = (v: any, fallback: string) => (/^#[0-9a-fA-F]{6}$/.test(String(v || '')) ? String(v) : fallback);
    patch.branding = {
      appName: String(branding.appName ?? cur.appName).slice(0, 60),
      logoUrl: String(branding.logoUrl ?? cur.logoUrl).slice(0, 500),
      primaryColor: hexOr(branding.primaryColor ?? cur.primaryColor, cur.primaryColor),
      accentColor: hexOr(branding.accentColor ?? cur.accentColor, cur.accentColor),
    };
  }
  if (typeof notifyEmail === 'string') patch.notifyEmail = notifyEmail.trim();
  // Módulos que usa la empresa (gobierna panel admin + app del técnico). Lo edita el admin.
  if (Array.isArray(features)) {
    patch.features = [...new Set(features.filter((f: any) => VALID_FEATURES.includes(f)))];
  }
  if (typeof techEditAvailability === 'boolean') patch.techEditAvailability = techEditAvailability;
  // Idioma de la empresa: lo fija el admin y aplica a todos los usuarios del tenant.
  if (language === 'es' || language === 'en') patch.language = language;
  // White-label: solo el superadmin habilita/deshabilita la personalización de marca.
  if (isSuper && typeof whiteLabel === 'boolean') patch.whiteLabel = whiteLabel;
  await ref.set(patch, { merge: true });
  if (patch.branding) invalidateBranding(tenantId); // refresca el branding de los correos
  return { ok: true };
});

/* ------------------------- tenant admins ------------------------- */
export const createTenantAdmin = onCall(async (req) => {
  assertSuperadmin(req);
  const { tenantId, name, email, password } = req.data || {};
  if (!tenantId || !name?.trim() || !email?.trim()) throw new HttpsError('invalid-argument', 'tenantId, name y email son requeridos.');
  const tSnap = await tenantRef(tenantId).get();
  if (!tSnap.exists) throw new HttpsError('not-found', 'Tenant no encontrado.');
  const pass = (password && String(password)) || genPassword();
  let userRecord;
  try {
    userRecord = await admin.auth().createUser({ email: email.trim(), password: pass, displayName: name.trim() });
  } catch (e: any) {
    if (e.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'Ya existe un usuario con ese correo.');
    throw new HttpsError('internal', e.message || 'No se pudo crear el usuario.');
  }
  await admin.auth().setCustomUserClaims(userRecord.uid, { role: 'admin', tenantId });
  const ts = nowCR();
  await db().collection('users').doc(userRecord.uid).set({
    name: name.trim(),
    email: email.trim(),
    role: 'admin',
    tenantId,
    phone: '',
    active: true,
    initials: initialsOf(name),
    createdAt: ts,
    updatedAt: ts,
  });
  return { uid: userRecord.uid, password: pass };
});

/** Superadmin edita el nombre de un admin de cualquier tenant. */
export const updateTenantAdmin = onCall(async (req) => {
  assertSuperadmin(req);
  const { uid, name } = req.data || {};
  if (!uid || !name?.trim()) throw new HttpsError('invalid-argument', 'uid y name son requeridos.');
  const snap = await db().collection('users').doc(String(uid)).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Usuario no encontrado.');
  if ((snap.data() as any).role !== 'admin') throw new HttpsError('failed-precondition', 'Solo se puede editar a administradores.');
  const clean = String(name).trim().slice(0, 80);
  await admin.auth().updateUser(String(uid), { displayName: clean });
  await db().collection('users').doc(String(uid)).set({ name: clean, initials: initialsOf(clean), updatedAt: nowCR() }, { merge: true });
  return { ok: true };
});

/* ------------------------- MCP API keys ------------------------- */
/** Key format: fok_{tenantId}_{32 bytes base64url}. Stored as SHA-256 (doc id of
    mcpApiKeys); the plaintext is returned exactly once. */
export const generateMcpKey = onCall(async (req) => {
  const su = assertSuperadmin(req);
  const { tenantId, label } = req.data || {};
  if (!tenantId) throw new HttpsError('invalid-argument', 'tenantId es requerido.');
  if (!(await tenantRef(tenantId).get()).exists) throw new HttpsError('not-found', 'Tenant no encontrado.');
  const secret = randomBytes(32).toString('base64url');
  const key = `fok_${tenantId}_${secret}`;
  const hash = createHash('sha256').update(key).digest('hex');
  const keyId = randomBytes(6).toString('hex');
  const ts = nowCR();
  const meta = { tenantId, keyId, label: String(label || 'default').slice(0, 60), last4: secret.slice(-4), revoked: false, revokedAt: null, lastUsedAt: null, createdAt: ts, createdBy: su.uid };
  await db().collection('mcpApiKeys').doc(hash).set(meta);
  await tcol(tenantId, 'mcpKeys').doc(keyId).set({ label: meta.label, last4: meta.last4, revoked: false, createdAt: ts, createdBy: su.uid });
  return { key, keyId, last4: meta.last4 };
});

export const revokeMcpKey = onCall(async (req) => {
  assertSuperadmin(req);
  const { tenantId, keyId } = req.data || {};
  if (!tenantId || !keyId) throw new HttpsError('invalid-argument', 'tenantId y keyId son requeridos.');
  const q = await db().collection('mcpApiKeys').where('tenantId', '==', tenantId).where('keyId', '==', keyId).limit(1).get();
  if (q.empty) throw new HttpsError('not-found', 'Key no encontrada.');
  const ts = nowCR();
  await q.docs[0].ref.set({ revoked: true, revokedAt: ts }, { merge: true });
  await tcol(tenantId, 'mcpKeys').doc(keyId).set({ revoked: true, revokedAt: ts }, { merge: true });
  return { ok: true };
});
