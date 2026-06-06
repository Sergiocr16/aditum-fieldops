/* © 2026 Aditum — Aditum FieldOps — Cloud Functions */
/* deploy build: 1.0.1 */
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';
import { initialsOf, nowCR, SHAREABLE_STATUSES } from './shared';

admin.initializeApp();
const db = admin.firestore();

setGlobalOptions({ region: process.env.FUNCTIONS_REGION || 'us-central1', maxInstances: 10 });

/* ------------------------- helpers ------------------------- */
function assertAdmin(req: CallableRequest) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  if (req.auth.token.role !== 'admin') throw new HttpsError('permission-denied', 'Admin only.');
}

function genPassword() {
  const a = 'ABCDEFGHJKMNPQRSTUVWXYZ', b = 'abcdefghijkmnpqrstuvwxyz', n = '23456789', s = '@#$%';
  const buf = require('crypto').randomBytes(8);
  const pick = (set: string, i: number) => set[buf[i] % set.length];
  return pick(a, 0) + pick(b, 1) + pick(b, 2) + pick(b, 3) + pick(n, 4) + pick(n, 5) + pick(s, 6) + pick(n, 7);
}

/* ------------------------- technicians ------------------------- */
export const createTechnician = onCall(async (req) => {
  assertAdmin(req);
  const { name, email, phone, password } = req.data || {};
  if (!name?.trim() || !email?.trim()) throw new HttpsError('invalid-argument', 'name and email are required.');
  const pass = (password && String(password)) || genPassword();
  let userRecord;
  try {
    userRecord = await admin.auth().createUser({ email: email.trim(), password: pass, displayName: name.trim() });
  } catch (e: any) {
    if (e.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'A user with that email already exists.');
    throw new HttpsError('internal', e.message || 'Could not create user.');
  }
  await admin.auth().setCustomUserClaims(userRecord.uid, { role: 'tech' });
  const ts = nowCR();
  await db.collection('users').doc(userRecord.uid).set({
    name: name.trim(),
    email: email.trim(),
    role: 'tech',
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
  assertAdmin(req);
  const { id, name, phone, active } = req.data || {};
  if (!id) throw new HttpsError('invalid-argument', 'id is required.');
  const patch: any = { updatedAt: nowCR() };
  if (typeof name === 'string') {
    patch.name = name.trim();
    patch.initials = initialsOf(name);
    await admin.auth().updateUser(id, { displayName: name.trim() });
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
  assertAdmin(req);
  const { id, password } = req.data || {};
  if (!id) throw new HttpsError('invalid-argument', 'id is required.');
  const pass = (password && String(password)) || genPassword();
  await admin.auth().updateUser(id, { password: pass });
  return { password: pass };
});

/* ------------------------- public ticket (no auth) ------------------------- */
export const getPublicTicket = onCall(async (req) => {
  const token = req.data?.token;
  if (!token) throw new HttpsError('not-found', 'Missing token', { reason: 'notfound' });
  const snap = await db.collection('tickets').where('share.token', '==', token).limit(1).get();
  if (snap.empty) throw new HttpsError('not-found', 'Not found', { reason: 'notfound' });
  const doc = snap.docs[0];
  const t = doc.data() as any;
  const sh = t.share || {};
  if (!sh.active) throw new HttpsError('permission-denied', 'Link disabled', { reason: 'disabled' });
  if (sh.expiresAt && nowCR() > sh.expiresAt) throw new HttpsError('permission-denied', 'Link expired', { reason: 'expired' });

  // record visit (best-effort)
  doc.ref.set({ share: { ...sh, lastVisit: nowCR() } }, { merge: true }).catch(() => {});

  let techName = '';
  if (t.techId) {
    const u = await db.collection('users').doc(t.techId).get();
    techName = u.exists ? (u.data() as any).name : '';
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
  return { ticket };
});

/* ------------------------- evidence finalize (compress video) ------------------------- */
export const onEvidenceFinalized = onObjectFinalized({ memory: '1GiB', timeoutSeconds: 300, region: process.env.STORAGE_REGION || 'us-east1' }, async (event) => {
  const object = event.data;
  const filePath = object.name || '';
  if (!filePath.startsWith('tickets/')) return;
  if (filePath.includes('/compressed/')) return; // already processed
  const meta = object.metadata || {};
  const ticketId = meta.ticketId;
  const evidenceId = meta.evidenceId;
  if (!ticketId || !evidenceId) return;
  const isVideo = (object.contentType || '').startsWith('video/');

  const ticketRef = db.collection('tickets').doc(ticketId);

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

    const compressedPath = `tickets/${ticketId}/compressed/${evidenceId}.mp4`;
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
    logger.info(`Compressed video for ticket ${ticketId} / evidence ${evidenceId}`);
  } catch (e: any) {
    logger.error('Video compression failed; leaving original.', e);
    await markEvidenceReady(ticketRef, evidenceId);
  }
});

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
