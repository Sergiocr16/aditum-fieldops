/* © 2026 Aditum — Aditum Service — Email notifications (Gmail SMTP via Nodemailer) */
import { defineSecret } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import nodemailer from 'nodemailer';

export const SMTP_USER = defineSecret('SMTP_USER');
export const SMTP_PASS = defineSecret('SMTP_PASS');

export const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || 'partners@aditumcr.com';
const APP_URL = process.env.APP_URL || 'https://fieldops-aditum.web.app';

const PRI: Record<string, string> = { baja: 'Baja', media: 'Media', alta: 'Alta', urgente: 'Urgente' };

/** Resolves the transporter + from for a tenant: per-tenant SMTP config from
    tenants/{tid}/settings/smtp (password encrypted with KMS), falling back to
    the global SMTP_USER/SMTP_PASS secrets when the tenant has none. */
const mailerCache = new Map<string, { tx: nodemailer.Transporter; from: string; exp: number }>();
const MAILER_TTL_MS = 10 * 60 * 1000;

export function invalidateMailer(tenantId: string) {
  mailerCache.delete(tenantId);
}

export async function getMailer(tenantId: string): Promise<{ tx: nodemailer.Transporter; from: string }> {
  const hit = mailerCache.get(tenantId);
  if (hit && hit.exp > Date.now()) return hit;
  let entry: { tx: nodemailer.Transporter; from: string } | null = null;
  try {
    const admin = require('firebase-admin');
    const snap = await admin.firestore().collection('tenants').doc(tenantId).collection('settings').doc('smtp').get();
    const cfg = snap.exists ? (snap.data() as any) : null;
    if (cfg?.user && cfg?.passCiphertext) {
      const { decryptSecret } = require('./kms');
      const pass = await decryptSecret(cfg.passCiphertext);
      entry = {
        tx: nodemailer.createTransport({ service: 'gmail', auth: { user: cfg.user, pass } }),
        from: `${cfg.fromName || 'Aditum Service'} <${cfg.fromAddr || cfg.user}>`,
      };
    }
  } catch (e) {
    logger.error('getMailer: fallo config por tenant; usando fallback global', e as Error);
  }
  if (!entry) {
    const fromAddr = process.env.SMTP_FROM || SMTP_USER.value();
    entry = {
      tx: nodemailer.createTransport({ service: 'gmail', auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() } }),
      from: `Aditum Service <${fromAddr}>`,
    };
  }
  mailerCache.set(tenantId, { ...entry, exp: Date.now() + MAILER_TTL_MS });
  return entry;
}

export async function sendMail(tenantId: string, to: string | undefined | null, subject: string, html: string, cc?: string) {
  if (!to) {
    logger.warn('sendMail: sin destinatario, se omite', { subject });
    return;
  }
  const { tx, from } = await getMailer(tenantId);
  const msg: any = { from, to, subject, html };
  if (cc) msg.cc = cc;
  await tx.sendMail(msg);
  logger.info('email enviado', { tenantId, to, cc, subject });
}

/** Variante que no propaga el error (notificaciones automáticas best-effort). */
export async function sendMailSafe(tenantId: string, to: string, subject: string, html: string, cc?: string) {
  try {
    await sendMail(tenantId, to, subject, html, cc);
  } catch (e) {
    logger.error('email falló', e as Error);
  }
}

/* ---------------- plantillas ---------------- */
/** Escapa datos de usuario antes de interpolarlos en el HTML del correo
    (evita inyección de HTML/links — phishing — en el cliente de correo). */
export function esc(value: any): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function layout(opts: { heading: string; intro: string; ticket: any; extraHtml?: string; buttonUrl?: string; buttonLabel?: string }) {
  const t = opts.ticket;
  const btnUrl = encodeURI(opts.buttonUrl || APP_URL);
  const btnLabel = opts.buttonLabel || 'Ver en Aditum Service';
  const row = (label: string, value: any) =>
    value
      ? `<tr><td style="padding:4px 0;color:#5b6573;font-size:13px;width:130px">${esc(label)}</td><td style="padding:4px 0;color:#1f2937;font-size:13px;font-weight:600">${esc(value)}</td></tr>`
      : '';
  return `
  <div style="background:#f7f8fa;padding:24px 0;font-family:Inter,Arial,sans-serif">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden">
      <div style="background:#001e2f;padding:16px 22px;color:#fff;font-size:18px;font-weight:700">
        Aditum <span style="color:#deb66e">Service</span>
      </div>
      <div style="padding:22px">
        <h1 style="margin:0 0 6px;font-size:18px;color:#1f2937">${opts.heading}</h1>
        <p style="margin:0 0 16px;font-size:14px;color:#5b6573;line-height:1.5">${opts.intro}</p>
        <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;background:#fbfcfd">
          <div style="font-size:13px;color:#8a93a1;font-weight:600;margin-bottom:6px">${esc(t.num)}</div>
          <div style="font-size:15px;font-weight:700;color:#1f2937;margin-bottom:10px">${esc(t.title)}</div>
          <table style="border-collapse:collapse;width:100%">
            ${row('Cliente', t.client)}
            ${row('Sitio', t.site)}
            ${row('Prioridad', PRI[t.priority] || t.priority)}
            ${row('Fecha programada', t.scheduled)}
          </table>
        </div>
        ${opts.extraHtml || ''}
        <div style="margin-top:20px">
          <a href="${btnUrl}" style="display:inline-block;background:#002a42;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:10px">${btnLabel}</a>
        </div>
        <p style="margin:22px 0 0;font-size:11.5px;color:#8a93a1;border-top:1px solid #e5e7eb;padding-top:14px">
          Desarrollado por Aditum · Este es un mensaje automático de Aditum Service.
        </p>
      </div>
    </div>
  </div>`;
}

export function assignedTpl(ticket: any) {
  return {
    subject: `Nueva orden de trabajo asignada: ${ticket.num} — ${ticket.title}`,
    html: layout({ heading: 'Se te asignó una orden de trabajo', intro: 'Tenés un nuevo trabajo asignado. Abrí la app para ver el detalle, completar el checklist y subir la evidencia.', ticket }),
  };
}

export function readyTpl(ticket: any) {
  return {
    subject: `Orden de trabajo lista para revisión: ${ticket.num}`,
    html: layout({ heading: 'Una orden de trabajo está lista para revisión', intro: 'El técnico marcó el trabajo como listo. Revisá la evidencia y aprobá o devolvé la orden.', ticket }),
  };
}

export function rejectedTpl(ticket: any, comment: string) {
  const extra = comment
    ? `<div style="margin-top:14px;background:#fdeaea;border:1px solid #f3cccc;border-radius:12px;padding:12px 14px">
         <div style="font-size:12px;font-weight:700;color:#bb2d2d;margin-bottom:4px">Qué corregir</div>
         <div style="font-size:13.5px;color:#8a3030;line-height:1.5">${esc(comment)}</div>
       </div>`
    : '';
  return {
    subject: `Orden de trabajo devuelta para corrección: ${ticket.num}`,
    html: layout({ heading: 'Tu orden de trabajo requiere corrección', intro: 'El administrador devolvió la orden. Revisá el comentario, corregí lo indicado y volvé a enviarla.', ticket, extraHtml: extra }),
  };
}

export function approvedTpl(ticket: any) {
  return {
    subject: `Orden de trabajo aprobada: ${ticket.num}`,
    html: layout({ heading: '¡Tu trabajo fue aprobado!', intro: 'El administrador revisó y aprobó el trabajo. ¡Buen trabajo!', ticket }),
  };
}

export function sharedReportTpl(ticket: any, url: string, message?: string) {
  const extra = message
    ? `<div style="margin-top:14px;background:#f6ecd7;border:1px solid #ecdcb8;border-radius:12px;padding:12px 14px;font-size:13.5px;color:#6b521a;line-height:1.5">${esc(message)}</div>`
    : '';
  return {
    subject: `Reporte de trabajo — ${ticket.num} — ${ticket.title}`,
    html: layout({
      heading: 'Reporte de trabajo técnico',
      intro: 'Te compartimos el reporte del trabajo realizado. Podés verlo en línea (solo lectura) con el botón de abajo.',
      ticket,
      extraHtml: extra,
      buttonUrl: url,
      buttonLabel: 'Ver el reporte',
    }),
  };
}

export function lastRejectionComment(after: any): string {
  const list = (after.comments || []).filter((c: any) => c.type === 'rechazo');
  return list.length ? list[list.length - 1].text : '';
}
