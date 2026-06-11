/* © 2026 Aditum — Aditum FieldOps — Cloud Functions */
/* deploy build: 2.0.0 (multi-tenant) */
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import { SMTP_USER, SMTP_PASS, ADMIN_EMAIL, sendMail, sendMailSafe, getBranding, publicBranding, assignedTpl, readyTpl, rejectedTpl, approvedTpl, sharedReportTpl, passwordResetTpl, lastRejectionComment } from './notifications';
import { randomUUID } from 'crypto';
import { initialsOf, nowCR } from './shared';
import { tcol, tenantRef, assertAdmin, assertSameTenantUser, resolvePublicToken, createPublicToken, invalidatePublicToken } from './tenant';

admin.initializeApp();
const db = admin.firestore();

setGlobalOptions({ region: process.env.FUNCTIONS_REGION || 'us-central1', maxInstances: 10 });

/* Tenant-management callables (superadmin) + per-tenant SMTP config + maintenance module. */
export * from './tenants';
export * from './smtp';
export { importEquipment, setTechnicianAvailability } from './maintenance';
export { dailyMaintenanceJob, runMaintenanceScheduler } from './scheduler';
export { startServiceOrder, completeServiceOrder, onServiceOrderWritten } from './serviceOrders';
export { getPublicServiceOrder, confirmServiceOrder, getTechnicianSlots, holdSlot, rescheduleServiceOrder, getPublicServiceReport } from './publicFlow';
export { consolidateInvoiceItems, exportInvoiceCsv } from './billing';

/* ------------------------- helpers ------------------------- */
function genPassword() {
  const a = 'ABCDEFGHJKMNPQRSTUVWXYZ', b = 'abcdefghijkmnpqrstuvwxyz', n = '23456789', s = '@#$%';
  const buf = require('crypto').randomBytes(8);
  const pick = (set: string, i: number) => set[buf[i] % set.length];
  return pick(a, 0) + pick(b, 1) + pick(b, 2) + pick(b, 3) + pick(n, 4) + pick(n, 5) + pick(s, 6) + pick(n, 7);
}

/* ------------------------- technicians ------------------------- */
// Un admin crea miembros de su tenant: técnico, coordinador o facturación.
// (Crear otros admins es exclusivo del superadmin → createTenantAdmin.)
const ADMIN_CREATABLE = ['tech', 'coordinador', 'facturacion'];

/** Normaliza la selección de roles. 'tech' es exclusivo (técnico móvil); el personal
    de escritorio puede combinar coordinador y/o facturación. */
function normalizeMemberRoles(roles: any, single?: any): string[] {
  let r = Array.isArray(roles) ? roles.filter((x: any) => ADMIN_CREATABLE.includes(x)) : [];
  if (!r.length && ADMIN_CREATABLE.includes(single)) r = [single];
  if (!r.length) r = ['tech'];
  if (r.includes('tech')) return ['tech'];
  return [...new Set(r)] as string[];
}

export const createTechnician = onCall(async (req) => {
  const ctx = assertAdmin(req);
  const { name, email, phone, password, role, roles } = req.data || {};
  if (!name?.trim() || !email?.trim()) throw new HttpsError('invalid-argument', 'name and email are required.');
  const memberRoles = normalizeMemberRoles(roles, role);
  const primary = memberRoles[0];
  const pass = (password && String(password)) || genPassword();
  let userRecord;
  try {
    userRecord = await admin.auth().createUser({ email: email.trim(), password: pass, displayName: name.trim() });
  } catch (e: any) {
    if (e.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'A user with that email already exists.');
    throw new HttpsError('internal', e.message || 'Could not create user.');
  }
  await admin.auth().setCustomUserClaims(userRecord.uid, { role: primary, roles: memberRoles, tenantId: ctx.tenantId });
  const ts = nowCR();
  await db.collection('users').doc(userRecord.uid).set({
    name: name.trim(),
    email: email.trim(),
    role: primary,
    roles: memberRoles,
    tenantId: ctx.tenantId,
    phone: phone || '',
    active: true,
    initials: initialsOf(name),
    ticketsCount: 0,
    createdAt: ts,
    updatedAt: ts,
  });
  return { uid: userRecord.uid, password: pass };
});

export const updateTechnician = onCall(async (req) => {
  const ctx = assertAdmin(req);
  const { id, name, phone, active, email, roles } = req.data || {};
  if (!id) throw new HttpsError('invalid-argument', 'id is required.');
  const target = await assertSameTenantUser(ctx, id);
  const patch: any = { updatedAt: nowCR() };

  // Edición de roles: solo para personal de escritorio (coordinador/facturación),
  // que puede combinar ambos. No aplica a técnicos ni admins.
  if (Array.isArray(roles)) {
    const curRoles: string[] = Array.isArray(target.roles) ? target.roles : [target.role];
    const isDesk = curRoles.some((r) => r === 'coordinador' || r === 'facturacion');
    const next = [...new Set(roles.filter((r: any) => r === 'coordinador' || r === 'facturacion'))] as string[];
    if (isDesk && next.length) {
      patch.role = next[0];
      patch.roles = next;
      await admin.auth().setCustomUserClaims(id, { role: next[0], roles: next, tenantId: ctx.tenantId });
    }
  }
  if (typeof name === 'string') {
    patch.name = name.trim();
    patch.initials = initialsOf(name);
    await admin.auth().updateUser(id, { displayName: name.trim() });
  }
  if (typeof email === 'string' && email.trim()) {
    try {
      await admin.auth().updateUser(id, { email: email.trim() });
      patch.email = email.trim();
    } catch (e: any) {
      if (e.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'Ese correo ya está en uso por otro usuario.');
      if (e.code === 'auth/invalid-email') throw new HttpsError('invalid-argument', 'Correo no válido.');
      throw new HttpsError('internal', e.message || 'No se pudo actualizar el correo.');
    }
  }
  if (typeof phone === 'string') patch.phone = phone;
  if (typeof active === 'boolean') {
    patch.active = active;
    await admin.auth().updateUser(id, { disabled: !active });
  }
  await db.collection('users').doc(id).set(patch, { merge: true });
  return { ok: true };
});

export const resetTechnicianPassword = onCall(async (req) => {
  const ctx = assertAdmin(req);
  const { id, password } = req.data || {};
  if (!id) throw new HttpsError('invalid-argument', 'id is required.');
  await assertSameTenantUser(ctx, id);
  const pass = (password && String(password)) || genPassword();
  await admin.auth().updateUser(id, { password: pass });
  return { password: pass };
});

/* ------------------------- admin module permissions ------------------------- */
const VALID_MODULES = ['tickets', 'technicians', 'contracts', 'equipment', 'serviceOrders', 'calendar', 'billing', 'inventory', 'wiki', 'notifySettings'];

/** Define qué módulos ve un admin del mismo tenant. Lista vacía = ve todos.
    Solo aplica a usuarios con rol 'admin'. */
export const setAdminModules = onCall(async (req) => {
  const ctx = assertAdmin(req);
  const { adminId, modules } = req.data || {};
  if (!adminId) throw new HttpsError('invalid-argument', 'adminId es requerido.');
  const target = await assertSameTenantUser(ctx, adminId);
  if (target.role !== 'admin') throw new HttpsError('failed-precondition', 'El usuario destino no es administrador.');
  const clean = Array.isArray(modules) ? [...new Set(modules.filter((m: any) => VALID_MODULES.includes(m)))] : [];
  await db.collection('users').doc(adminId).set({ modules: clean, updatedAt: nowCR() }, { merge: true });
  return { ok: true, modules: clean };
});

/* ------------------------- public ticket (no auth) ------------------------- */
export const getPublicTicket = onCall(async (req) => {
  const tk = await resolvePublicToken(req.data?.token, 'ticket_share');
  const ref = tcol(tk.tenantId, 'tickets').doc(tk.targetId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Not found', { reason: 'notfound' });
  const t = snap.data() as any;
  const sh = t.share || {};
  if (!sh.active) throw new HttpsError('permission-denied', 'Link disabled', { reason: 'disabled' });

  // record visit (best-effort)
  ref.set({ share: { ...sh, lastVisit: nowCR() } }, { merge: true }).catch(() => {});

  let techName = '';
  if (t.techId) {
    const u = await db.collection('users').doc(t.techId).get();
    const ud = u.exists ? (u.data() as any) : null;
    techName = ud && ud.tenantId === tk.tenantId ? ud.name : '';
  }

  // sanitized DTO — only what the public should see
  const ticket = {
    num: t.num,
    status: t.status,
    title: t.title,
    client: t.client,
    site: t.site,
    address: t.address,
    created: t.created,
    readyAt: t.readyAt || null,
    techName,
    description: t.description,
    instructions: t.instructions,
    expected: t.expected,
    observations: t.observations,
    techNote: t.techNote,
    techObs: t.techObs,
    checklist: (t.checklist || []).map((c: any) => ({ text: c.text, done: c.done, at: c.at || null })),
    evidence: (t.evidence || []).map((e: any) => ({ file: e.file, type: e.type, desc: e.desc, date: e.date, name: e.name || null })),
    approval: t.approval || null,
  };
  return { ticket, branding: await publicBranding(tk.tenantId) };
});

/* ------------------------- public link management (admin) ------------------------- */
const PUBLIC_BASE = process.env.PUBLIC_BASE_URL || 'https://fieldops-aditum.web.app';

/* ------------------------- password reset (self-service, no auth) ------------------------- */
/** Genera un enlace de reseteo y lo envía con la marca + SMTP del tenant a una
    página propia (/reset). Anti-enumeración: siempre responde ok, exista o no el correo. */
export const requestPasswordReset = onCall({ secrets: [SMTP_USER, SMTP_PASS] }, async (req) => {
  const email = String(req.data?.email || '').trim().toLowerCase();
  if (!email || !/.+@.+\..+/.test(email)) return { ok: true }; // no revelar nada
  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    const tenantId = (userRecord.customClaims as any)?.tenantId || null;
    // Link de reseteo (Admin SDK) → extraemos el oobCode y armamos nuestra propia página.
    const fbLink = await admin.auth().generatePasswordResetLink(email, { url: `${PUBLIC_BASE}/login` });
    const oobCode = new URL(fbLink).searchParams.get('oobCode');
    if (!oobCode) return { ok: true };
    const resetUrl = `${PUBLIC_BASE}/reset?oobCode=${encodeURIComponent(oobCode)}`;
    logger.info('password reset link', { email, resetUrl }); // visible en emulador (SMTP real no envía)
    if (tenantId) {
      const brand = await getBranding(tenantId);
      const m = passwordResetTpl(resetUrl, brand);
      await sendMailSafe(tenantId, email, m.subject, m.html);
    } else {
      // superadmin u otros sin tenant: correo con marca por defecto vía SMTP global
      const m = passwordResetTpl(resetUrl);
      await sendMailSafe('', email, m.subject, m.html);
    }
  } catch (e) {
    logger.warn('requestPasswordReset: usuario no encontrado o fallo (silencioso)', { email });
  }
  return { ok: true };
});

async function ensureLink(tenantId: string, ticketId: string, by: string, action: 'generate' | 'regenerate' | 'toggle') {
  const ref = tcol(tenantId, 'tickets').doc(ticketId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Ticket no encontrado.');
  const t = snap.data() as any;
  let sh = t.share || {};

  if (action === 'toggle' && sh.token) {
    const active = !sh.active;
    sh = { ...sh, active };
    await ref.set({ share: sh }, { merge: true });
    await db.collection('publicTokens').doc(sh.token).set({ active, ...(active ? { invalidatedAt: null } : { invalidatedAt: nowCR() }) }, { merge: true });
    return { token: sh.token as string, url: sh.url as string, active };
  }

  const mustCreate = action === 'regenerate' || !sh.token || !sh.active;
  if (mustCreate) {
    if (sh.token) await invalidatePublicToken(sh.token);
    const token = await createPublicToken({ tenantId, purpose: 'ticket_share', targetId: ticketId, singleUse: false, createdBy: by });
    sh = { active: true, token, url: `${PUBLIC_BASE}/p/${token}`, created: nowCR(), lastVisit: null, createdBy: by };
    await ref.set({ share: sh }, { merge: true });
  }
  return { token: sh.token as string, url: sh.url as string, active: true };
}

/** Generates / regenerates / toggles the public link of a ticket.
    Token resolution lives in the global `publicTokens` collection, so the
    client can no longer mint tokens directly. */
export const ensurePublicLink = onCall(async (req) => {
  const ctx = assertAdmin(req);
  const { ticketId, action } = req.data || {};
  if (!ticketId) throw new HttpsError('invalid-argument', 'ticketId es requerido.');
  const act = action === 'regenerate' || action === 'toggle' ? action : 'generate';
  return await ensureLink(ctx.tenantId, ticketId, ctx.uid, act);
});

/* ------------------------- share public link by email (admin) ------------------------- */
export const sharePublicLink = onCall({ secrets: [SMTP_USER, SMTP_PASS] }, async (req) => {
  const ctx = assertAdmin(req);
  const { ticketId, to, cc, message } = req.data || {};
  if (!ticketId || !to || !String(to).trim()) {
    throw new HttpsError('invalid-argument', 'ticketId y destinatarios son requeridos.');
  }
  const { url } = await ensureLink(ctx.tenantId, ticketId, ctx.uid, 'generate');
  const snap = await tcol(ctx.tenantId, 'tickets').doc(ticketId).get();
  const t = snap.data() as any;
  const brand = await getBranding(ctx.tenantId);
  const m = sharedReportTpl({ num: t.num, title: t.title, client: t.client, site: t.site, priority: t.priority, scheduled: t.scheduled }, url, message, brand);
  try {
    await sendMail(ctx.tenantId, String(to).trim(), m.subject, m.html, cc ? String(cc).trim() : undefined);
  } catch (e: any) {
    throw new HttpsError('internal', 'No se pudo enviar el correo: ' + (e?.message || 'error'));
  }
  return { ok: true, url };
});

/* ------------------------- evidence finalize (compress video) ------------------------- */
const LEGACY_TENANT = process.env.LEGACY_TENANT_ID || 'aditum';

export const onEvidenceFinalized = onObjectFinalized({ memory: '1GiB', timeoutSeconds: 300, region: process.env.STORAGE_REGION || 'us-east1' }, async (event) => {
  const object = event.data;
  const filePath = object.name || '';
  // tenants/{tid}/tickets/{ticketId}/... — with a legacy fallback for in-flight
  // uploads under the pre-tenant `tickets/` prefix during the migration window.
  const parts = filePath.split('/');
  let tid: string;
  if (parts[0] === 'tenants' && parts[2] === 'tickets') tid = parts[1];
  else if (parts[0] === 'tickets') tid = LEGACY_TENANT;
  else return;
  if (filePath.includes('/compressed/')) return; // already processed
  const meta = object.metadata || {};
  const ticketId = meta.ticketId;
  const evidenceId = meta.evidenceId;
  if (!ticketId || !evidenceId) return;
  const isVideo = (object.contentType || '').startsWith('video/');

  const ticketRef = tcol(tid, 'tickets').doc(ticketId);

  if (!isVideo) {
    // images/pdf are ready as-is; ensure status flag is set
    await markEvidenceReady(ticketRef, evidenceId);
    return;
  }

  try {
    const ffmpeg = require('fluent-ffmpeg');
    const ffmpegPath = require('ffmpeg-static');
    ffmpeg.setFfmpegPath(ffmpegPath);
    const os = require('os');
    const path = require('path');
    const fs = require('fs');

    const bucket = admin.storage().bucket(object.bucket);
    const tmpIn = path.join(os.tmpdir(), 'in-' + evidenceId);
    const tmpOut = path.join(os.tmpdir(), evidenceId + '.mp4');
    await bucket.file(filePath).download({ destination: tmpIn });

    await new Promise<void>((resolve, reject) => {
      ffmpeg(tmpIn)
        .outputOptions(['-vcodec libx264', '-crf 28', '-preset veryfast', '-vf', 'scale=-2:720', '-movflags +faststart', '-acodec aac', '-b:a 128k'])
        .on('end', () => resolve())
        .on('error', (err: any) => reject(err))
        .save(tmpOut);
    });

    const compressedPath = `tenants/${tid}/tickets/${ticketId}/compressed/${evidenceId}.mp4`;
    const downloadToken = randomUUID();
    await bucket.upload(tmpOut, {
      destination: compressedPath,
      metadata: { contentType: 'video/mp4', metadata: { firebaseStorageDownloadTokens: downloadToken, ticketId, evidenceId, compressed: 'true' } },
    });
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(compressedPath)}?alt=media&token=${downloadToken}`;

    await updateEvidence(ticketRef, evidenceId, { status: 'ready', file: url, path: compressedPath });
    // remove the original to save space (best-effort)
    bucket.file(filePath).delete().catch(() => {});
    try { fs.unlinkSync(tmpIn); fs.unlinkSync(tmpOut); } catch {}
    logger.info(`Compressed video for tenant ${tid} ticket ${ticketId} / evidence ${evidenceId}`);
  } catch (e: any) {
    logger.error('Video compression failed; leaving original.', e);
    await markEvidenceReady(ticketRef, evidenceId);
  }
});

/* ------------------------- email notifications (assignment + status) ------------------------- */
async function techEmail(tenantId: string, techId?: string | null): Promise<string | null> {
  if (!techId) return null;
  const u = await db.collection('users').doc(techId).get();
  if (!u.exists) return null;
  const ud = u.data() as any;
  if (ud.tenantId !== tenantId) return null;
  return ud.email || null;
}

async function tenantNotifyEmail(tenantId: string): Promise<string> {
  const t = await tenantRef(tenantId).get();
  return (t.exists && (t.data() as any).notifyEmail) || ADMIN_EMAIL;
}

export const onTicketWritten = onDocumentWritten(
  { document: 'tenants/{tid}/tickets/{id}', region: 'us-central1', secrets: [SMTP_USER, SMTP_PASS] },
  async (event) => {
    const after = event.data?.after?.data() as any;
    if (!after) return; // borrado
    const before = event.data?.before?.data() as any;
    const tid = event.params.tid;
    const ticket = { id: event.params.id, ...after };

    // Branding del tenant (logo + paleta) para todos los correos de esta orden.
    const brand = await getBranding(tid);

    // Asignación / reasignación
    if (after.techId && after.techId !== before?.techId) {
      const email = await techEmail(tid, after.techId);
      const m = assignedTpl(ticket, brand);
      if (email) await sendMailSafe(tid, email, m.subject, m.html);
    }

    // Cambio de estado
    if (after.status !== before?.status) {
      if (after.status === 'listo_revision') {
        const m = readyTpl(ticket, brand);
        await sendMailSafe(tid, await tenantNotifyEmail(tid), m.subject, m.html);
      } else if (after.status === 'rechazado') {
        const email = await techEmail(tid, after.techId);
        const m = rejectedTpl(ticket, lastRejectionComment(after), brand);
        if (email) await sendMailSafe(tid, email, m.subject, m.html);
      } else if (after.status === 'aprobado') {
        const email = await techEmail(tid, after.techId);
        const m = approvedTpl(ticket, brand);
        if (email) await sendMailSafe(tid, email, m.subject, m.html);
      }
    }

    // Rebaja de inventario + historial de movimientos al aprobar (atómico e idempotente)
    if (after.status === 'aprobado' && !after.materialsApplied && Array.isArray(after.materials) && after.materials.some((m: any) => m.productId && m.qty > 0)) {
      const ticketRef = event.data!.after!.ref;
      let techName = '';
      if (after.techId) {
        const us = await db.collection('users').doc(after.techId).get();
        techName = us.exists ? (us.data() as any).name : '';
      }
      try {
        await db.runTransaction(async (tx) => {
          const tsnap = await tx.get(ticketRef);
          const td = tsnap.data() as any;
          if (!td || td.materialsApplied || td.status !== 'aprobado') return;
          const mats = (td.materials || []).filter((m: any) => m.productId && m.qty > 0);
          const refs = mats.map((m: any) => tcol(tid, 'inventory').doc(m.productId));
          const snaps: any[] = [];
          for (const r of refs) snaps.push(await tx.get(r as FirebaseFirestore.DocumentReference)); // reads antes de writes
          mats.forEach((m: any, idx: number) => {
            const s = snaps[idx];
            if (s.exists) {
              const cur = Number((s.data() as any).quantity) || 0;
              tx.update(s.ref, { quantity: Math.max(0, cur - Number(m.qty)) });
            }
            const mv = tcol(tid, 'inventoryMovements').doc();
            tx.set(mv, {
              productId: m.productId,
              productName: m.name,
              qty: Number(m.qty),
              ticketId: ticketRef.id,
              ticketNum: td.num,
              client: td.client || '',
              site: td.site || '',
              techName,
              at: nowCR(),
            });
          });
          tx.set(ticketRef, { materialsApplied: true }, { merge: true });
        });
        logger.info('inventario rebajado para ticket ' + after.num);
      } catch (e) {
        logger.error('error rebajando inventario', e as Error);
      }
    }

    // Facturación: si el ticket requiere factura y ya quedó aprobado/cerrado, se crea un
    // invoiceItem que entra a la bandeja de Facturación (misma cola que las OS). Idempotente.
    if (after.requiresInvoice === true && (after.status === 'aprobado' || after.status === 'cerrado') && !after.billingApplied) {
      const ticketRef = event.data!.after!.ref;
      try {
        await db.runTransaction(async (tx) => {
          const tsnap = await tx.get(ticketRef);
          const td = tsnap.data() as any;
          if (!td || td.billingApplied || td.requiresInvoice !== true) return;
          if (td.status !== 'aprobado' && td.status !== 'cerrado') return;
          const itemRef = tcol(tid, 'invoiceItems').doc();
          const at = nowCR();
          tx.set(itemRef, {
            kind: 'ticket',
            ticketId: ticketRef.id,
            soNum: td.num, // display: número del ticket
            type: 'ticket',
            contractId: null,
            licitacionNum: '',
            clientName: td.client || '',
            equipmentSummary: [td.title, td.site].filter(Boolean).join(' · '),
            serviceDate: (td.readyAt || at).slice(0, 10),
            status: 'pendiente',
            invoiceId: null,
            amount: null,
            createdAt: at,
          });
          tx.set(ticketRef, { billingApplied: true, invoiceItemId: itemRef.id }, { merge: true });
        });
        logger.info('invoiceItem creado para ticket ' + after.num);
      } catch (e) {
        logger.error('facturación ticket: fallo creando invoiceItem', e as Error);
      }
    }
  }
);

async function markEvidenceReady(ticketRef: FirebaseFirestore.DocumentReference, evidenceId: string) {
  await updateEvidence(ticketRef, evidenceId, { status: 'ready' });
}
async function updateEvidence(ticketRef: FirebaseFirestore.DocumentReference, evidenceId: string, patch: any) {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ticketRef);
    if (!snap.exists) return;
    const ev = (snap.data() as any).evidence || [];
    const next = ev.map((e: any) => (e.id === evidenceId ? { ...e, ...patch } : e));
    tx.set(ticketRef, { evidence: next }, { merge: true });
  });
}
