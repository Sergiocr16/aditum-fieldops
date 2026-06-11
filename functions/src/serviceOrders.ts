/* © 2026 Aditum — Aditum FieldOps — service-order lifecycle:
   start/complete callables + onServiceOrderWritten trigger (notifications,
   report link, billing, cadence recalc). Every effect block is idempotent
   (flags billingApplied / cadenceApplied / reportShare.token) because the
   trigger re-fires on its own writes. */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import { nowCR, addMonthsCR, computeNoticeDate, canTransition, PERIODICITIES, PeriodicityMonths } from './shared';
import { tcol, createPublicToken } from './tenant';
import { SMTP_USER, SMTP_PASS, sendMailSafe, getBranding } from './notifications';
import { soTechTpl, reportTpl } from './publicFlow';
import { getSettings } from './scheduler';

const db = () => admin.firestore();
const PUBLIC_BASE = process.env.PUBLIC_BASE_URL || 'https://fieldops-aditum.web.app';

function soCtx(req: any): { uid: string; tenantId: string; role: string; name: string } {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { role, tenantId } = req.auth.token as any;
  if ((role !== 'admin' && role !== 'tech') || !tenantId) throw new HttpsError('permission-denied', 'Tenant member only.');
  return { uid: req.auth.uid, tenantId, role, name: (req.auth.token.name as string) || '' };
}

/** Tech (owner) or admin starts the visit: binds the checklist template
    snapshot of the equipment type and moves the order to EN_PROGRESO. */
export const startServiceOrder = onCall(async (req) => {
  const ctx = soCtx(req);
  const { serviceOrderId } = req.data || {};
  if (!serviceOrderId) throw new HttpsError('invalid-argument', 'serviceOrderId es requerido.');
  const ref = tcol(ctx.tenantId, 'serviceOrders').doc(serviceOrderId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Orden no encontrada.');
  const so = snap.data() as any;
  if (ctx.role === 'tech' && so.techId !== ctx.uid) throw new HttpsError('permission-denied', 'No es tu orden.');
  if (!canTransition(so.status, 'EN_PROGRESO')) throw new HttpsError('failed-precondition', 'La orden no se puede iniciar en su estado actual.');

  // snapshot del checklist según el tipo de equipo (versión vigente al iniciar)
  let checklist: any[] = so.checklist || [];
  let templateId: string | null = so.checklistTemplateId || null;
  let templateVersion: number | null = so.checklistTemplateVersion || null;
  if (!checklist.length) {
    const typeId = so.equipmentSnapshot?.typeId;
    if (typeId) {
      const typeSnap = await tcol(ctx.tenantId, 'equipmentTypes').doc(typeId).get();
      const version = typeSnap.exists ? (typeSnap.data() as any).activeTemplateVersion || 0 : 0;
      if (version > 0) {
        const tplSnap = await tcol(ctx.tenantId, 'checklistTemplates').doc(`${typeId}_v${version}`).get();
        if (tplSnap.exists) {
          const tpl = tplSnap.data() as any;
          const sections = new Map<string, string>((tpl.sections || []).map((s: any) => [s.id, s.title]));
          checklist = (tpl.items || [])
            .slice()
            .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
            .map((it: any) => ({
              id: it.id,
              sectionId: it.sectionId || null,
              sectionTitle: it.sectionId ? sections.get(it.sectionId) || null : null,
              label: it.label,
              type: it.type,
              required: !!it.required,
              config: it.config || {},
              unit: it.config?.unit || null,
              answer: null,
              alert: false,
              photoPath: null,
              photoUrl: null,
              at: null,
              by: null,
            }));
          templateId = tplSnap.id;
          templateVersion = version;
        }
      }
    }
  }

  const at = nowCR();
  await ref.set(
    {
      status: 'EN_PROGRESO',
      startedAt: so.startedAt || at,
      checklist,
      checklistTemplateId: templateId,
      checklistTemplateVersion: templateVersion,
      history: [...(so.history || []), { status: 'EN_PROGRESO', at, by: ctx.name || ctx.uid }],
    },
    { merge: true }
  );
  return { ok: true, items: checklist.length, templateVersion };
});

/** Closes the visit: validates required answers + signature, moves to
    SERVICIO_TERMINADO. The trigger handles report/billing/cadence. */
export const completeServiceOrder = onCall(async (req) => {
  const ctx = soCtx(req);
  const { serviceOrderId, signature, observations } = req.data || {};
  if (!serviceOrderId) throw new HttpsError('invalid-argument', 'serviceOrderId es requerido.');
  if (!signature?.name?.trim() || !signature?.idNumber?.trim() || !signature?.path || !signature?.url) {
    throw new HttpsError('invalid-argument', 'Firma incompleta: nombre, cédula e imagen son requeridos.');
  }
  const ref = tcol(ctx.tenantId, 'serviceOrders').doc(serviceOrderId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Orden no encontrada.');
  const so = snap.data() as any;
  if (ctx.role === 'tech' && so.techId !== ctx.uid) throw new HttpsError('permission-denied', 'No es tu orden.');
  if (so.status !== 'EN_PROGRESO') throw new HttpsError('failed-precondition', 'La orden no está en progreso.');

  const missing = (so.checklist || []).filter((c: any) => c.required && (c.answer === null || c.answer === undefined || c.answer === '') && c.type !== 'foto');
  const missingPhotos = (so.checklist || []).filter((c: any) => c.required && c.type === 'foto' && !c.photoUrl);
  if (missing.length || missingPhotos.length) {
    throw new HttpsError('failed-precondition', `Checklist incompleto: faltan ${missing.length + missingPhotos.length} ítems requeridos.`);
  }

  const at = nowCR();
  await ref.set(
    {
      status: 'SERVICIO_TERMINADO',
      finishedAt: at,
      observations: typeof observations === 'string' ? observations : so.observations || '',
      signature: {
        name: String(signature.name).trim(),
        idNumber: String(signature.idNumber).trim(),
        path: String(signature.path),
        url: String(signature.url),
        at,
      },
      history: [...(so.history || []), { status: 'SERVICIO_TERMINADO', at, by: ctx.name || ctx.uid, note: 'Firmado por ' + String(signature.name).trim() }],
    },
    { merge: true }
  );
  return { ok: true };
});

/* ---------------- trigger ---------------- */
async function techEmailOf(tid: string, techId?: string | null): Promise<string | null> {
  if (!techId) return null;
  const u = await db().collection('users').doc(techId).get();
  if (!u.exists) return null;
  const ud = u.data() as any;
  return ud.tenantId === tid ? ud.email || null : null;
}

export const onServiceOrderWritten = onDocumentWritten(
  { document: 'tenants/{tid}/serviceOrders/{id}', region: 'us-central1', secrets: [SMTP_USER, SMTP_PASS] },
  async (event) => {
    const after = event.data?.after?.data() as any;
    if (!after) return;
    const before = event.data?.before?.data() as any;
    const tid = event.params.tid;
    const soId = event.params.id;
    const ref = event.data!.after!.ref;
    const so = { id: soId, ...after };
    const brand = await getBranding(tid);

    // Asignación de técnico (creación o cambio)
    if (after.techId && after.techId !== before?.techId) {
      const email = await techEmailOf(tid, after.techId);
      if (email) {
        const m = soTechTpl(so, 'Nueva orden de mantenimiento asignada', `Tenés una visita ${after.type === 'correctivo' ? 'correctiva' : 'preventiva'} programada para el ${after.scheduledDate}.`, brand);
        await sendMailSafe(tid, email, m.subject, m.html);
      }
    }

    const statusChanged = after.status !== before?.status;

    if (statusChanged && after.status === 'CONFIRMADA') {
      const email = await techEmailOf(tid, after.techId);
      if (email) {
        const m = soTechTpl(so, 'El cliente confirmó la visita', `La visita del ${after.scheduledDate} a las ${after.scheduledTime || '08:00'} fue confirmada por el cliente.`, brand);
        await sendMailSafe(tid, email, m.subject, m.html);
      }
    }

    if (statusChanged && after.status === 'REAGENDADA') {
      const email = await techEmailOf(tid, after.techId);
      if (email) {
        const m = soTechTpl(so, 'El cliente reagendó la visita', `Nueva fecha: ${after.scheduledDate} a las ${after.scheduledTime || '08:00'}.`, brand);
        await sendMailSafe(tid, email, m.subject, m.html);
      }
      if (after.client?.email) {
        const m = soTechTpl(so, 'Tu visita fue reagendada', `Confirmamos la nueva fecha: ${after.scheduledDate} a las ${after.scheduledTime || '08:00'}.`, brand);
        await sendMailSafe(tid, after.client.email, m.subject, m.html);
      }
      // recalcular fecha de aviso para el recordatorio
      if (after.notify?.noticeDaysBefore != null) {
        const noticeDate = computeNoticeDate(after.scheduledDate, after.notify.noticeDaysBefore);
        if (after.notify.noticeDate !== noticeDate) {
          await ref.set({ notify: { ...after.notify, noticeDate } }, { merge: true });
        }
      }
    }

    if (statusChanged && after.status === 'CANCELADA') {
      if (after.client?.email && before?.status && before.status !== 'PROGRAMADA') {
        const m = soTechTpl(so, 'Visita de mantenimiento cancelada', `La visita programada para el ${after.scheduledDate} fue cancelada.`, brand);
        await sendMailSafe(tid, after.client.email, m.subject, m.html);
      }
    }

    /* ---- SERVICIO_TERMINADO: reporte + facturación + cadencia (idempotente) ---- */
    if (after.status === 'SERVICIO_TERMINADO' || after.status === 'PENDIENTE_FACTURAR') {
      // 1) link público del reporte + correo al cliente (una sola vez)
      if (!after.reportShare?.token) {
        try {
          const settings = await getSettings(tid);
          const finishedDay = (after.finishedAt || nowCR()).slice(0, 10);
          const expiresAt = addDaysHelper(finishedDay, settings.tokenTtlDays) + ' 23:59';
          const token = await createPublicToken({ tenantId: tid, purpose: 'so_report', targetId: soId, singleUse: false, expiresAt });
          const url = `${PUBLIC_BASE}/r/${token}`;
          await ref.set({ reportShare: { active: true, token, url, created: nowCR(), lastVisit: null } }, { merge: true });
          if (after.client?.email) {
            const m = reportTpl(so, url, brand);
            await sendMailSafe(tid, after.client.email, m.subject, m.html);
          }
        } catch (e) {
          logger.error('reporte: fallo generando link', e as Error);
        }
      }

      // 2) item de facturación + transición automática a PENDIENTE_FACTURAR
      if (!after.billingApplied) {
        try {
          await db().runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const d = snap.data() as any;
            if (!d || d.billingApplied) return;
            const contractSnap = await tx.get(tcol(tid, 'contracts').doc(d.contractId));
            const contract = contractSnap.exists ? (contractSnap.data() as any) : {};
            const itemRef = tcol(tid, 'invoiceItems').doc();
            const at = nowCR();
            tx.set(itemRef, {
              serviceOrderId: soId,
              soNum: d.num,
              type: d.type,
              contractId: d.contractId,
              licitacionNum: contract.licitacionNum || '',
              clientName: d.client?.name || '',
              equipmentSummary: [d.equipmentSnapshot?.typeName, d.equipmentSnapshot?.brand, d.equipmentSnapshot?.serial].filter(Boolean).join(' · '),
              serviceDate: (d.finishedAt || at).slice(0, 10),
              status: 'pendiente',
              invoiceId: null,
              // Facturación electrónica: receptor/tipo/monto se completan luego en la bandeja.
              amount: typeof d.billAmount === 'number' ? d.billAmount : null,
              chargeTypeId: d.chargeTypeId || null,
              clientId: d.clientId || null,
              currency: d.billCurrency === 'USD' ? 'USD' : 'CRC',
              description: [d.equipmentSnapshot?.typeName, d.equipmentSnapshot?.brand].filter(Boolean).join(' · ') || d.num,
              createdAt: at,
            });
            tx.set(ref, {
              billingApplied: true,
              invoiceItemId: itemRef.id,
              status: 'PENDIENTE_FACTURAR',
              history: [...(d.history || []), { status: 'PENDIENTE_FACTURAR', at, by: 'sistema', note: 'Listo para facturar' }],
            }, { merge: true });
          });
        } catch (e) {
          logger.error('facturación: fallo creando invoiceItem', e as Error);
        }
      }

      // 3) recálculo de cadencia desde la fecha real del servicio
      if (!after.cadenceApplied && after.type === 'preventivo' && after.equipmentId) {
        try {
          const eqRef = tcol(tid, 'equipment').doc(after.equipmentId);
          const eqSnap = await eqRef.get();
          if (eqSnap.exists) {
            const eq = eqSnap.data() as any;
            const contractSnap = await tcol(tid, 'contracts').doc(after.contractId).get();
            const contract = contractSnap.exists ? (contractSnap.data() as any) : {};
            const per: PeriodicityMonths = (eq.periodicityMonths && PERIODICITIES.includes(eq.periodicityMonths) ? eq.periodicityMonths : contract.defaultPeriodicityMonths || 3) as PeriodicityMonths;
            const realDate = (after.finishedAt || nowCR()).slice(0, 10);
            const next = addMonthsCR(realDate, per);

            // ¿existe ya una OS futura PROGRAMADA de este equipo? → ajustarla si difiere
            const futureSnap = await tcol(tid, 'serviceOrders')
              .where('equipmentId', '==', after.equipmentId)
              .where('type', '==', 'preventivo')
              .where('status', '==', 'PROGRAMADA')
              .get();
            const future = futureSnap.docs
              .filter((d) => (d.data() as any).planDate > after.planDate)
              .sort((a, b) => ((a.data() as any).planDate as string).localeCompare((b.data() as any).planDate));
            if (future.length) {
              const f = future[0];
              const fd = f.data() as any;
              if (fd.scheduledDate !== next) {
                await f.ref.set({
                  scheduledDate: next,
                  notify: { ...fd.notify, noticeDate: computeNoticeDate(next, fd.notify?.noticeDaysBefore ?? 3) },
                  history: [...(fd.history || []), { status: 'PROGRAMADA', at: nowCR(), by: 'sistema', note: `Cadencia recalculada desde el servicio real (${realDate})` }],
                }, { merge: true });
              }
            } else {
              await eqRef.set({ nextScheduledDate: next, updatedAt: nowCR() }, { merge: true });
            }
            await eqRef.set({ lastServiceDate: realDate, updatedAt: nowCR() }, { merge: true });
          }
          await ref.set({ cadenceApplied: true }, { merge: true });
        } catch (e) {
          logger.error('cadencia: fallo recalculando próxima visita', e as Error);
        }
      }
    }
  }
);

function addDaysHelper(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
