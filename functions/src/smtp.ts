/* © 2026 Aditum — Aditum FieldOps — per-tenant SMTP config (web-editable, KMS-encrypted) */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { nowCR } from './shared';
import { assertAdmin, tcol, tenantRef } from './tenant';
import { encryptSecret } from './kms';
import { SMTP_USER, SMTP_PASS, sendMail, invalidateMailer } from './notifications';

/** Saves the tenant SMTP config. The app password is encrypted with Cloud KMS
    before touching Firestore; omit `password` to keep the current one. */
export const saveSmtpConfig = onCall(async (req) => {
  const ctx = assertAdmin(req);
  const { user, fromName, fromAddr, password } = req.data || {};
  if (!user?.trim()) throw new HttpsError('invalid-argument', 'El usuario SMTP es requerido.');
  const ref = tcol(ctx.tenantId, 'settings').doc('smtp');
  const patch: any = {
    user: String(user).trim(),
    fromName: String(fromName || '').trim().slice(0, 80),
    fromAddr: String(fromAddr || '').trim() || String(user).trim(),
    updatedAt: nowCR(),
    updatedBy: ctx.uid,
  };
  if (password && String(password).trim()) {
    try {
      patch.passCiphertext = await encryptSecret(String(password).trim());
    } catch (e: any) {
      throw new HttpsError('internal', 'No se pudo cifrar la contraseña (KMS): ' + (e?.message || 'error'));
    }
  } else {
    const existing = await ref.get();
    if (!existing.exists || !(existing.data() as any).passCiphertext) {
      throw new HttpsError('invalid-argument', 'La contraseña de aplicación es requerida la primera vez.');
    }
  }
  await ref.set(patch, { merge: true });
  await tenantRef(ctx.tenantId).set({ smtpStatus: 'unset', updatedAt: nowCR() }, { merge: true });
  invalidateMailer(ctx.tenantId);
  return { ok: true };
});

/** Sends a test email with the tenant config and records the result. */
export const testSmtpConfig = onCall({ secrets: [SMTP_USER, SMTP_PASS] }, async (req) => {
  const ctx = assertAdmin(req);
  const to = String(req.data?.to || req.auth?.token?.email || '').trim();
  if (!to) throw new HttpsError('invalid-argument', 'Destinatario de prueba requerido.');
  const ref = tcol(ctx.tenantId, 'settings').doc('smtp');
  try {
    await sendMail(
      ctx.tenantId,
      to,
      'Prueba de correo — Aditum FieldOps',
      '<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#1f2937">La configuración SMTP de tu tenant funciona correctamente. ✔</div>'
    );
    await ref.set({ lastTestAt: nowCR(), lastError: null }, { merge: true });
    await tenantRef(ctx.tenantId).set({ smtpStatus: 'verified', updatedAt: nowCR() }, { merge: true });
    return { ok: true };
  } catch (e: any) {
    await ref.set({ lastTestAt: nowCR(), lastError: String(e?.message || e) }, { merge: true });
    await tenantRef(ctx.tenantId).set({ smtpStatus: 'error', updatedAt: nowCR() }, { merge: true });
    throw new HttpsError('internal', 'Fallo el envío de prueba: ' + (e?.message || 'error'));
  }
});
