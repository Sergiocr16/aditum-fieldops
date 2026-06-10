/* © 2026 Aditum — Aditum FieldOps — tenancy helpers for Cloud Functions */
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { randomBytes } from 'crypto';
import { nowCR, PublicTokenDoc, PublicTokenPurpose } from './shared';

const db = () => admin.firestore();

export const tenantRef = (tid: string) => db().collection('tenants').doc(tid);
export const tcol = (tid: string, name: string) => tenantRef(tid).collection(name);

export type TenantRole = 'admin' | 'coordinador' | 'facturacion' | 'tech';

export interface Ctx {
  uid: string;
  tenantId: string;
  role: TenantRole;
}

/** Caller must be a tenant admin. Superadmin is NOT a tenant admin: tenant data
    operations always run in the context of a concrete tenant. */
export function assertAdmin(req: CallableRequest): Ctx {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const role = req.auth.token.role as string;
  const tenantId = req.auth.token.tenantId as string;
  if (role !== 'admin' || !tenantId) throw new HttpsError('permission-denied', 'Admin only.');
  return { uid: req.auth.uid, tenantId, role: 'admin' };
}

/** Caller must hold one of `roles` within a tenant. */
export function assertRoles(req: CallableRequest, roles: TenantRole[]): Ctx {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const role = req.auth.token.role as TenantRole;
  const tenantId = req.auth.token.tenantId as string;
  if (!tenantId || !roles.includes(role)) throw new HttpsError('permission-denied', 'No autorizado.');
  return { uid: req.auth.uid, tenantId, role };
}

/** Caller must be any signed-in tenant member. */
export function assertMember(req: CallableRequest): Ctx {
  return assertRoles(req, ['admin', 'coordinador', 'facturacion', 'tech']);
}

export function assertSuperadmin(req: CallableRequest): { uid: string } {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  if (req.auth.token.role !== 'superadmin') throw new HttpsError('permission-denied', 'Superadmin only.');
  return { uid: req.auth.uid };
}

/** Asserts that a (global) user doc belongs to the caller's tenant. Returns the user data. */
export async function assertSameTenantUser(ctx: Ctx, userId: string): Promise<FirebaseFirestore.DocumentData> {
  const snap = await db().collection('users').doc(userId).get();
  if (!snap.exists) throw new HttpsError('not-found', 'User not found.');
  const data = snap.data()!;
  if (data.tenantId !== ctx.tenantId) throw new HttpsError('permission-denied', 'User belongs to another tenant.');
  return data;
}

/* ---------------- public tokens (global collection, doc id = token) ---------------- */

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export interface ResolvedToken extends PublicTokenDoc {
  token: string;
  ref: FirebaseFirestore.DocumentReference;
}

/** O(1) lookup + validation of a public token. Throws HttpsError with a `reason`
    detail ('notfound' | 'disabled' | 'expired' | 'used') matching the existing
    public error pages. Validate the token BEFORE any other read. */
export async function resolvePublicToken(token: unknown, purpose: PublicTokenPurpose): Promise<ResolvedToken> {
  if (!token || typeof token !== 'string' || token.length > 128) {
    throw new HttpsError('not-found', 'Missing token', { reason: 'notfound' });
  }
  const ref = db().collection('publicTokens').doc(token);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Not found', { reason: 'notfound' });
  const d = snap.data() as PublicTokenDoc;
  if (d.purpose !== purpose) throw new HttpsError('not-found', 'Not found', { reason: 'notfound' });
  if (!d.active || d.invalidatedAt) throw new HttpsError('permission-denied', 'Link disabled', { reason: 'disabled' });
  if (d.singleUse && d.usedAt) throw new HttpsError('permission-denied', 'Link already used', { reason: 'used' });
  if (d.expiresAt && nowCR() > d.expiresAt) throw new HttpsError('permission-denied', 'Link expired', { reason: 'expired' });
  return { ...d, token, ref };
}

/** Creates the global token doc. Caller decides purpose/expiry/single-use. */
export async function createPublicToken(opts: {
  tenantId: string;
  purpose: PublicTokenPurpose;
  targetId: string;
  singleUse?: boolean;
  expiresAt?: string | null;
  createdBy?: string;
}): Promise<string> {
  const token = newToken();
  const docData: PublicTokenDoc = {
    tenantId: opts.tenantId,
    purpose: opts.purpose,
    targetId: opts.targetId,
    active: true,
    singleUse: !!opts.singleUse,
    usedAt: null,
    invalidatedAt: null,
    expiresAt: opts.expiresAt || null,
    createdAt: nowCR(),
    ...(opts.createdBy ? { createdBy: opts.createdBy } : {}),
  };
  await db().collection('publicTokens').doc(token).set(docData);
  return token;
}

export async function invalidatePublicToken(token: string | null | undefined): Promise<void> {
  if (!token) return;
  await db()
    .collection('publicTokens')
    .doc(token)
    .set({ active: false, invalidatedAt: nowCR() }, { merge: true })
    .catch(() => {});
}
