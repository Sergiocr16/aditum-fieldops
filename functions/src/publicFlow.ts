/* © 2026 Aditum — Aditum FieldOps — client-facing flow for service orders:
   notices with confirm/reschedule token links, reminders, public callables
   (confirm, slots, hold, reschedule, report). No client login: everything goes
   through single-use tokens in the global `publicTokens` collection. */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import {
  nowCR,
  canTransition,
  SO_BUSY_STATUSES,
  subtractBusy,
  chunkSlots,
  weekdayKey,
  toMin,
  toHHMM,
  TimeRange,
} from './shared';
import { tcol, resolvePublicToken, createPublicToken, invalidatePublicToken } from './tenant';
import { SMTP_USER, SMTP_PASS, sendMail, layout } from './notifications';
import { getSettings } from './scheduler';

const db = () => admin.firestore();
const PUBLIC_BASE = process.env.PUBLIC_BASE_URL || 'https://fieldops-aditum.web.app';

/* ---------------- bitácora ---------------- */
async function logNotification(tid: string, entry: Record<string, any>) {
  await tcol(tid, 'notifications')
    .add({ channel: 'email', provider: 'gmail', at: nowCR(), ...entry })
    .catch(() => {});
}

/* ---------------- plantillas (mapean la OS al layout existente) ---------------- */
function soAsTicket(so: any) {
  const eq = so.equipmentSnapshot || {};
  return {
    num: so.num,
    title: [eq.typeName, eq.brand, eq.model].filter(Boolean).join(' ') || 'Mantenimiento',
    client: so.client?.name,
    site: eq.location,
    priority: undefined,
    scheduled: so.scheduledDate + (so.scheduledTime ? ' ' + so.scheduledTime : ''),
  };
}

export function noticeTpl(so: any, confirmUrl: string, rescheduleUrl: string) {
  const extra = `
    <div style="margin-top:16px;display:flex;gap:10px">
      <a href="${encodeURI(confirmUrl)}" style="display:inline-block;background:#1d7a3f;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:10px">Confirmar la fecha</a>
      <a href="${encodeURI(rescheduleUrl)}" style="display:inline-block;background:#f1f3f5;color:#1f2937;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:10px;margin-left:8px">Cambiar la fecha</a>
    </div>`;
  return {
    subject: `Visita de mantenimiento programada — ${so.num} — ${so.scheduledDate}`,
    html: layout({
      heading: 'Tenés una visita de mantenimiento programada',
      intro: `Nuestro técnico visitará sus instalaciones el <b>${so.scheduledDate}</b> a las <b>${so.scheduledTime || '08:00'}</b> para el mantenimiento preventivo del equipo. Por favor confirmá la fecha o elegí otra.`,
      ticket: soAsTicket(so),
      extraHtml: extra,
      buttonUrl: confirmUrl,
      buttonLabel: 'Confirmar la fecha',
    }),
  };
}

export function reminderTpl(so: any) {
  return {
    subject: `Recordatorio: visita de mantenimiento hoy — ${so.num}`,
    html: layout({
      heading: 'Recordatorio de visita',
      intro: `Hoy <b>${so.scheduledDate}</b> a las <b>${so.scheduledTime || '08:00'}</b> está programada la visita de mantenimiento.`,
      ticket: soAsTicket(so),
    }),
  };
}

export function soTechTpl(so: any, heading: string, intro: string) {
  return {
    subject: `${heading} — ${so.num} — ${so.scheduledDate}`,
    html: layout({ heading, intro, ticket: soAsTicket(so) }),
  };
}

export function reportTpl(so: any, url: string) {
  return {
    subject: `Reporte de servicio — ${so.num}`,
    html: layout({
      heading: 'Reporte de servicio de mantenimiento',
      intro: 'El servicio fue completado y firmado. Podés ver el reporte en línea (solo lectura) con el botón de abajo.',
      ticket: soAsTicket(so),
      buttonUrl: url,
      buttonLabel: 'Ver el reporte',
    }),
  };
}

/* ---------------- fase 2 del job: avisos ---------------- */
export async function sendNotices(tid: string, today: string): Promise<{ sent: number; failed: number }> {
  const settings = await getSettings(tid);
  const snap = await tcol(tid, 'serviceOrders')
    .where('status', '==', 'PROGRAMADA')
    .where('notify.noticeDate', '<=', today)
    .get();
  let sent = 0;
  let failed = 0;
  for (const doc of snap.docs) {
    const so = { id: doc.id, ...(doc.data() as any) };
    if (so.skipNotice) continue;
    if (so.scheduledDate < today) continue; // visita vencida: no avisar automático
    const email = so.client?.email;
    if (!email) continue;
    try {
      const expiresAt = so.scheduledDate + ' 23:59';
      const confirm = await createPublicToken({ tenantId: tid, purpose: 'so_confirm', targetId: doc.id, singleUse: true, expiresAt });
      const reschedule = await createPublicToken({ tenantId: tid, purpose: 'so_reschedule', targetId: doc.id, singleUse: true, expiresAt });
      const m = noticeTpl(so, `${PUBLIC_BASE}/confirm/${confirm}`, `${PUBLIC_BASE}/reschedule/${reschedule}`);
      await sendMail(tid, email, m.subject, m.html); // si falla, queda PROGRAMADA y reintenta mañana
      await doc.ref.set(
        {
          status: 'NOTIFICADA',
          notify: { ...so.notify, noticeSentAt: nowCR(), tokens: { confirm, reschedule } },
          history: [...(so.history || []), { status: 'NOTIFICADA', at: nowCR(), by: 'scheduler', note: 'Aviso enviado a ' + email }],
        },
        { merge: true }
      );
      await logNotification(tid, { type: 'so_notice', to: email, serviceOrderId: doc.id, soNum: so.num, status: 'sent' });
      sent++;
    } catch (e: any) {
      failed++;
      await logNotification(tid, { type: 'so_notice', to: email, serviceOrderId: doc.id, soNum: so.num, status: 'failed', error: String(e?.message || e) });
    }
  }
  if (settings.reminderEnabled) { /* settings consumido en sendReminders */ }
  return { sent, failed };
}

/* ---------------- fase 3 del job: recordatorios ---------------- */
export async function sendReminders(tid: string, today: string): Promise<{ sent: number }> {
  const settings = await getSettings(tid);
  if (!settings.reminderEnabled) return { sent: 0 };
  const snap = await tcol(tid, 'serviceOrders')
    .where('status', 'in', ['NOTIFICADA', 'CONFIRMADA', 'REAGENDADA'])
    .where('scheduledDate', '==', today)
    .get();
  let sent = 0;
  for (const doc of snap.docs) {
    const so = { id: doc.id, ...(doc.data() as any) };
    if (so.notify?.reminderSentAt) continue;
    const m = reminderTpl(so);
    try {
      if (so.client?.email) await sendMail(tid, so.client.email, m.subject, m.html);
      if (so.techId) {
        const u = await db().collection('users').doc(so.techId).get();
        const techMail = u.exists && (u.data() as any).tenantId === tid ? (u.data() as any).email : null;
        if (techMail) await sendMail(tid, techMail, m.subject, m.html);
      }
      await doc.ref.set({ notify: { ...so.notify, reminderSentAt: nowCR() } }, { merge: true });
      await logNotification(tid, { type: 'so_reminder', to: so.client?.email || '', serviceOrderId: doc.id, soNum: so.num, status: 'sent' });
      sent++;
    } catch (e: any) {
      await logNotification(tid, { type: 'so_reminder', to: so.client?.email || '', serviceOrderId: doc.id, soNum: so.num, status: 'failed', error: String(e?.message || e) });
    }
  }
  return { sent };
}

/* ---------------- slots de disponibilidad ---------------- */
async function computeSlots(tid: string, techId: string, fromDate: string, days: number): Promise<{ date: string; times: string[] }[]> {
  const settings = await getSettings(tid);
  const userSnap = await db().collection('users').doc(techId).get();
  const weekly: Record<string, TimeRange[]> =
    (userSnap.exists && (userSnap.data() as any).availability?.weeklyHours) || settings.defaultWeeklyHours;

  const endDate = addDaysStr(fromDate, days);
  const [blocksSnap, busySnap] = await Promise.all([
    tcol(tid, 'availabilityBlocks').where('techId', '==', techId).where('date', '>=', fromDate).where('date', '<', endDate).get(),
    tcol(tid, 'serviceOrders').where('techId', '==', techId).where('scheduledDate', '>=', fromDate).where('scheduledDate', '<', endDate).get(),
  ]);

  const blocksByDate = new Map<string, TimeRange[]>();
  blocksSnap.docs.forEach((d) => {
    const b = d.data() as any;
    const r: TimeRange = b.allDay ? { start: '00:00', end: '23:59' } : { start: b.startTime || '00:00', end: b.endTime || '23:59' };
    blocksByDate.set(b.date, [...(blocksByDate.get(b.date) || []), r]);
  });

  const busyByDate = new Map<string, TimeRange[]>();
  const now = nowCR();
  busySnap.docs.forEach((d) => {
    const so = d.data() as any;
    if (!SO_BUSY_STATUSES.includes(so.status)) return;
    const start = so.scheduledTime || '08:00';
    const end = toHHMM(Math.min(toMin(start) + (so.durationMin || 60), 23 * 60 + 59));
    busyByDate.set(so.scheduledDate, [...(busyByDate.get(so.scheduledDate) || []), { start, end }]);
    // holds vigentes de otras OS en proceso de reagenda
    if (so.hold?.date && so.hold.holdUntil && so.hold.holdUntil > now) {
      const hs = so.hold.time || '08:00';
      const he = toHHMM(Math.min(toMin(hs) + (so.durationMin || 60), 23 * 60 + 59));
      busyByDate.set(so.hold.date, [...(busyByDate.get(so.hold.date) || []), { start: hs, end: he }]);
    }
  });

  const out: { date: string; times: string[] }[] = [];
  const todayStr = now.slice(0, 10);
  const nowTime = now.slice(11);
  for (let i = 0; i < days; i++) {
    const date = addDaysStr(fromDate, i);
    if (date < todayStr) continue;
    let free: TimeRange[] = weekly[weekdayKey(date)] || [];
    if (!free.length) continue;
    free = subtractBusy(free, blocksByDate.get(date) || []);
    free = subtractBusy(free, busyByDate.get(date) || []);
    let times = chunkSlots(free, settings.slotDurationMin);
    if (date === todayStr) times = times.filter((t) => t > nowTime);
    if (times.length) out.push({ date, times });
  }
  return out;
}

function addDaysStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** Enmascara una cédula/identificación dejando solo los últimos 4 caracteres. */
function maskId(id: string | null | undefined): string {
  const s = String(id || '').trim();
  if (s.length <= 4) return s ? '••••' : '';
  return '••••' + s.slice(-4);
}

/* ---------------- callables públicas (token, sin login) ---------------- */

export const getPublicServiceOrder = onCall(async (req) => {
  const purpose = req.data?.purpose === 'so_reschedule' ? 'so_reschedule' : 'so_confirm';
  const tk = await resolvePublicToken(req.data?.token, purpose);
  const snap = await tcol(tk.tenantId, 'serviceOrders').doc(tk.targetId).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Not found', { reason: 'notfound' });
  const so = snap.data() as any;
  let techName = '';
  if (so.techId) {
    const u = await db().collection('users').doc(so.techId).get();
    techName = u.exists && (u.data() as any).tenantId === tk.tenantId ? (u.data() as any).name : '';
  }
  return {
    order: {
      num: so.num,
      status: so.status,
      scheduledDate: so.scheduledDate,
      scheduledTime: so.scheduledTime,
      durationMin: so.durationMin,
      equipment: so.equipmentSnapshot,
      clientName: so.client?.name || '',
      techName,
      // el destinatario del correo ya posee ambos links; exponer el token hermano
      // permite saltar de "confirmar" a "reagendar" sin volver al correo
      ...(purpose === 'so_confirm' ? { rescheduleToken: so.notify?.tokens?.reschedule || null } : {}),
    },
  };
});

export const confirmServiceOrder = onCall({ secrets: [SMTP_USER, SMTP_PASS] }, async (req) => {
  const tk = await resolvePublicToken(req.data?.token, 'so_confirm');
  const soRef = tcol(tk.tenantId, 'serviceOrders').doc(tk.targetId);
  const result = await db().runTransaction(async (tx) => {
    const tokenSnap = await tx.get(tk.ref);
    const td = tokenSnap.data() as any;
    if (!td || !td.active || td.usedAt) throw new HttpsError('permission-denied', 'Link already used', { reason: 'used' });
    const soSnap = await tx.get(soRef);
    if (!soSnap.exists) throw new HttpsError('not-found', 'Not found', { reason: 'notfound' });
    const so = soSnap.data() as any;
    if (so.status === 'CONFIRMADA') return { so, already: true };
    if (!canTransition(so.status, 'CONFIRMADA')) {
      throw new HttpsError('failed-precondition', 'La visita ya no se puede confirmar', { reason: 'state' });
    }
    const at = nowCR();
    tx.set(tk.ref, { usedAt: at, active: false }, { merge: true });
    tx.set(soRef, {
      status: 'CONFIRMADA',
      notify: { ...so.notify, confirmedAt: at, confirmedVia: 'cliente' },
      history: [...(so.history || []), { status: 'CONFIRMADA', at, by: 'Cliente', note: 'Cliente confirmó la fecha' }],
    }, { merge: true });
    return { so, already: false };
  });
  // invalidar el token hermano de reagenda (fuera de la tx, best-effort)
  await invalidatePublicToken(result.so?.notify?.tokens?.reschedule);
  return { ok: true, scheduledDate: result.so.scheduledDate, scheduledTime: result.so.scheduledTime };
});

export const getTechnicianSlots = onCall(async (req) => {
  const tk = await resolvePublicToken(req.data?.token, 'so_reschedule');
  const soSnap = await tcol(tk.tenantId, 'serviceOrders').doc(tk.targetId).get();
  if (!soSnap.exists) throw new HttpsError('not-found', 'Not found', { reason: 'notfound' });
  const so = soSnap.data() as any;
  if (!so.techId) throw new HttpsError('failed-precondition', 'Sin técnico asignado', { reason: 'state' });
  // Clampeo de la ventana: solo se puede consultar [hoy, hoy+30] para que el
  // portador del token no pueda enumerar la agenda del técnico en rangos arbitrarios.
  const todayStr = nowCR().slice(0, 10);
  const maxFrom = addDaysStr(todayStr, 30);
  let fromDate = typeof req.data?.fromDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.data.fromDate) ? req.data.fromDate : todayStr;
  if (fromDate < todayStr) fromDate = todayStr;
  if (fromDate > maxFrom) throw new HttpsError('invalid-argument', 'fromDate fuera de rango.');
  const days = Math.min(Math.max(Number(req.data?.days) || 14, 1), 21);
  const slots = await computeSlots(tk.tenantId, so.techId, fromDate, days);
  return { slots };
});

export const holdSlot = onCall(async (req) => {
  const tk = await resolvePublicToken(req.data?.token, 'so_reschedule');
  const { date, time } = req.data || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '')) {
    throw new HttpsError('invalid-argument', 'date y time son requeridos.');
  }
  const settings = await getSettings(tk.tenantId);
  const soRef = tcol(tk.tenantId, 'serviceOrders').doc(tk.targetId);
  const holdUntil = nowCR().slice(0, 10) + ' ' + toHHMM(toMin(nowCR().slice(11)) + settings.holdMinutes);
  await soRef.set({ hold: { date, time, holdUntil } }, { merge: true });
  return { ok: true, holdUntil };
});

export const rescheduleServiceOrder = onCall({ secrets: [SMTP_USER, SMTP_PASS] }, async (req) => {
  const tk = await resolvePublicToken(req.data?.token, 'so_reschedule');
  const { date, time } = req.data || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '')) {
    throw new HttpsError('invalid-argument', 'date y time son requeridos.');
  }
  const soRef = tcol(tk.tenantId, 'serviceOrders').doc(tk.targetId);

  // re-validar slot dentro de la ventana real (la transacción final es la garantía)
  const preSnap = await soRef.get();
  if (!preSnap.exists) throw new HttpsError('not-found', 'Not found', { reason: 'notfound' });
  const pre = preSnap.data() as any;
  const slots = await computeSlots(tk.tenantId, pre.techId, date, 1);
  const day = slots.find((s) => s.date === date);
  const isOwnHold = pre.hold?.date === date && pre.hold?.time === time;
  if (!isOwnHold && (!day || !day.times.includes(time))) {
    throw new HttpsError('failed-precondition', 'El horario ya no está disponible', { reason: 'slot' });
  }

  const result = await db().runTransaction(async (tx) => {
    const tokenSnap = await tx.get(tk.ref);
    const td = tokenSnap.data() as any;
    if (!td || !td.active || td.usedAt) throw new HttpsError('permission-denied', 'Link already used', { reason: 'used' });
    const soSnap = await tx.get(soRef);
    const so = soSnap.data() as any;
    if (!canTransition(so.status, 'REAGENDADA')) {
      throw new HttpsError('failed-precondition', 'La visita ya no se puede reagendar', { reason: 'state' });
    }
    const at = nowCR();
    tx.set(tk.ref, { usedAt: at, active: false }, { merge: true });
    tx.set(soRef, {
      status: 'REAGENDADA',
      scheduledDate: date,
      scheduledTime: time,
      hold: null,
      notify: {
        ...so.notify,
        confirmedAt: at,
        confirmedVia: 'cliente',
        rescheduleCount: (so.notify?.rescheduleCount || 0) + 1,
      },
      history: [...(so.history || []), { status: 'REAGENDADA', at, by: 'Cliente', note: `Reagendada por el cliente a ${date} ${time}` }],
    }, { merge: true });
    return { so };
  });
  await invalidatePublicToken(result.so?.notify?.tokens?.confirm);
  return { ok: true, date, time };
});

export const getPublicServiceReport = onCall(async (req) => {
  const tk = await resolvePublicToken(req.data?.token, 'so_report');
  const snap = await tcol(tk.tenantId, 'serviceOrders').doc(tk.targetId).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Not found', { reason: 'notfound' });
  const so = snap.data() as any;
  let techName = '';
  if (so.techId) {
    const u = await db().collection('users').doc(so.techId).get();
    techName = u.exists && (u.data() as any).tenantId === tk.tenantId ? (u.data() as any).name : '';
  }
  tk.ref.set({ lastVisit: nowCR() }, { merge: true }).catch(() => {});
  // DTO saneado: sin datos internos ni de otros tenants
  return {
    report: {
      num: so.num,
      type: so.type,
      status: so.status,
      scheduledDate: so.scheduledDate,
      startedAt: so.startedAt,
      finishedAt: so.finishedAt,
      equipment: so.equipmentSnapshot,
      clientName: so.client?.name || '',
      techName,
      checklist: (so.checklist || []).map((c: any) => ({
        sectionTitle: c.sectionTitle || null,
        label: c.label,
        type: c.type,
        answer: c.answer ?? null,
        unit: c.unit || null,
        alert: !!c.alert,
        photoUrl: c.photoUrl || null,
      })),
      photos: (so.photos || []).map((p: any) => ({ url: p.url, desc: p.desc || '', at: p.at || null })),
      observations: so.observations || '',
      // Cédula enmascarada en el reporte público (PII): solo se muestran los últimos 4.
      signature: so.signature ? { name: so.signature.name, idNumber: maskId(so.signature.idNumber), url: so.signature.url, at: so.signature.at } : null,
    },
  };
});
