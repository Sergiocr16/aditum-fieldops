/* © 2026 Aditum — Aditum FieldOps — service-order lifecycle:
   start/complete callables + onServiceOrderWritten trigger (notifications,
   report link, billing, cadence recalc). Every effect block is idempotent
   (flags billingApplied / cadenceApplied / reportShare.token) because the
   trigger re-fires on its own writes. */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import { nowCR, addPeriodCR, computeNoticeDate, canTransition, soEquipments, PERIODICITIES, PeriodicityMonths } from './shared';
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

/** Carga el checklist (snapshot de la plantilla vigente) para un tipo de equipo. */
async function loadChecklistForType(tenantId: string, typeId: string | undefined): Promise<{ checklist: any[]; templateId: string | null; templateVersion: number | null }> {
  if (!typeId) return { checklist: [], templateId: null, templateVersion: null };
  const typeSnap = await tcol(tenantId, 'equipmentTypes').doc(typeId).get();
  const version = typeSnap.exists ? (typeSnap.data() as any).activeTemplateVersion || 0 : 0;
  if (version <= 0) return { checklist: [], templateId: null, templateVersion: null };
  const tplSnap = await tcol(tenantId, 'checklistTemplates').doc(`${typeId}_v${version}`).get();
  if (!tplSnap.exists) return { checklist: [], templateId: null, templateVersion: null };
  const tpl = tplSnap.data() as any;
  const sections = new Map<string, string>((tpl.sections || []).map((s: any) => [s.id, s.title]));
  const checklist = (tpl.items || [])
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
  return { checklist, templateId: tplSnap.id, templateVersion: version };
}

/** Tech (owner) or admin starts the visit: binds the checklist template of EACH
    equipment of the order (multi-equipo) and moves the order to EN_PROGRESO. */
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

  const patch: any = { status: 'EN_PROGRESO', startedAt: so.startedAt || nowCR() };
  let totalItems = 0;

  // Multi-equipo: usa equipments[] (o normaliza desde legacy single). Demanda: sin equipos → no toca checklist.
  const eqList = soEquipments(so);
  if (eqList.length) {
    const equipments = [];
    for (const e of eqList) {
      let entry = { ...e };
      if (!entry.checklist?.length) {
        const loaded = await loadChecklistForType(ctx.tenantId, e.equipmentSnapshot?.typeId);
        entry = { ...entry, checklist: loaded.checklist, checklistTemplateId: loaded.templateId, checklistTemplateVersion: loaded.templateVersion };
      }
      totalItems += entry.checklist?.length || 0;
      equipments.push(entry);
    }
    patch.equipments = equipments;
  }

  patch.history = [...(so.history || []), { status: 'EN_PROGRESO', at: patch.startedAt, by: ctx.name || ctx.uid }];
  await ref.set(patch, { merge: true });
  return { ok: true, items: totalItems };
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

  // Validar ítems requeridos en el checklist de TODOS los equipos (multi-equipo) o el legacy.
  const allItems = soEquipments(so).flatMap((e: any) => e.checklist || []);
  const items = allItems.length ? allItems : (so.checklist || []);
  const missing = items.filter((c: any) => c.required && (c.answer === null || c.answer === undefined || c.answer === '') && c.type !== 'foto');
  const missingPhotos = items.filter((c: any) => c.required && c.type === 'foto' && !c.photoUrl);
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

/** Técnico (o admin) marca una orden POR DEMANDA como terminada (sin firma/plantilla
    obligatoria). Pasa a SERVICIO_TERMINADO; el trigger la lleva a EN_REVISION si
    la orden exige revisión interna. */
export const requestServiceReview = onCall(async (req) => {
  const ctx = soCtx(req);
  const { serviceOrderId } = req.data || {};
  if (!serviceOrderId) throw new HttpsError('invalid-argument', 'serviceOrderId es requerido.');
  const ref = tcol(ctx.tenantId, 'serviceOrders').doc(serviceOrderId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Orden no encontrada.');
  const so = snap.data() as any;
  if (ctx.role === 'tech' && so.techId !== ctx.uid) throw new HttpsError('permission-denied', 'No es tu orden.');
  if (so.status !== 'EN_PROGRESO') throw new HttpsError('failed-precondition', 'La orden no está en progreso.');
  const at = nowCR();
  await ref.set(
    {
      status: 'SERVICIO_TERMINADO',
      finishedAt: so.finishedAt || at,
      readyAt: at,
      history: [...(so.history || []), { status: 'SERVICIO_TERMINADO', at, by: ctx.name || ctx.uid, note: 'Trabajo terminado' }],
    },
    { merge: true }
  );
  return { ok: true };
});

/** Admin aprueba una orden EN_REVISION → PENDIENTE_FACTURAR (si factura) o CERRADA.
    El trigger crea el invoiceItem y rebaja inventario. */
export const approveServiceOrder = onCall(async (req) => {
  const ctx = soCtx(req);
  if (ctx.role !== 'admin') throw new HttpsError('permission-denied', 'Solo admin puede aprobar.');
  const { serviceOrderId, comment } = req.data || {};
  if (!serviceOrderId) throw new HttpsError('invalid-argument', 'serviceOrderId es requerido.');
  const ref = tcol(ctx.tenantId, 'serviceOrders').doc(serviceOrderId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Orden no encontrada.');
  const so = snap.data() as any;
  if (so.status !== 'EN_REVISION' && so.status !== 'SERVICIO_TERMINADO') {
    throw new HttpsError('failed-precondition', 'La orden no está en revisión.');
  }
  const isPeriodico = (so.mode || 'periodico') === 'periodico';
  const shouldBill = isPeriodico || so.requiresInvoice === true;
  const next = shouldBill ? 'PENDIENTE_FACTURAR' : 'CERRADA';
  const at = nowCR();
  const cmt = typeof comment === 'string' && comment.trim() ? comment.trim() : '';
  await ref.set(
    {
      status: next,
      approval: { at, by: ctx.name || ctx.uid, comment: cmt },
      comments: [...(so.comments || []), { type: 'aprobacion', by: 'Admin · ' + (ctx.name || ''), at, text: cmt || 'Orden aprobada' }],
      history: [...(so.history || []), { status: next, at, by: ctx.name || ctx.uid, note: 'Aprobada' }],
    },
    { merge: true }
  );
  // aviso al técnico
  const email = await techEmailOf(ctx.tenantId, so.techId);
  if (email) {
    const brand = await getBranding(ctx.tenantId);
    const m = soTechTpl({ id: serviceOrderId, ...so }, 'Orden aprobada', `Tu orden ${so.num} fue aprobada.`, brand);
    await sendMailSafe(ctx.tenantId, email, m.subject, m.html);
  }
  return { ok: true, status: next };
});

/** Admin rechaza una orden EN_REVISION → EN_PROGRESO para que el técnico corrija. */
export const rejectServiceOrder = onCall(async (req) => {
  const ctx = soCtx(req);
  if (ctx.role !== 'admin') throw new HttpsError('permission-denied', 'Solo admin puede rechazar.');
  const { serviceOrderId, comment } = req.data || {};
  if (!serviceOrderId) throw new HttpsError('invalid-argument', 'serviceOrderId es requerido.');
  if (!comment || !String(comment).trim()) throw new HttpsError('invalid-argument', 'El motivo del rechazo es requerido.');
  const ref = tcol(ctx.tenantId, 'serviceOrders').doc(serviceOrderId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Orden no encontrada.');
  const so = snap.data() as any;
  if (so.status !== 'EN_REVISION' && so.status !== 'SERVICIO_TERMINADO') {
    throw new HttpsError('failed-precondition', 'La orden no está en revisión.');
  }
  const at = nowCR();
  const cmt = String(comment).trim();
  await ref.set(
    {
      status: 'EN_PROGRESO',
      comments: [...(so.comments || []), { type: 'rechazo', by: 'Admin · ' + (ctx.name || ''), at, text: cmt }],
      history: [...(so.history || []), { status: 'EN_PROGRESO', at, by: ctx.name || ctx.uid, note: 'Rechazada: ' + cmt }],
    },
    { merge: true }
  );
  const email = await techEmailOf(ctx.tenantId, so.techId);
  if (email) {
    const brand = await getBranding(ctx.tenantId);
    const m = soTechTpl({ id: serviceOrderId, ...so }, 'Orden devuelta para corrección', `Tu orden ${so.num} fue rechazada: ${cmt}`, brand);
    await sendMailSafe(ctx.tenantId, email, m.subject, m.html);
  }
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

/** Correo del admin/tenant para avisos internos (revisión lista). */
async function tenantNotifyEmailOf(tid: string): Promise<string | null> {
  const t = await db().collection('tenants').doc(tid).get();
  return (t.exists && (t.data() as any).notifyEmail) || null;
}

/** Rebaja de inventario + movimientos al finalizar una orden con materiales (atómico e idempotente).
    Portado del flujo de tickets; aplica a ambas modalidades. */
async function applyMaterials(tid: string, ref: FirebaseFirestore.DocumentReference, after: any): Promise<void> {
  if (after.materialsApplied) return;
  if (!Array.isArray(after.materials) || !after.materials.some((m: any) => m.productId && m.qty > 0)) {
    if (!after.materialsApplied) await ref.set({ materialsApplied: true }, { merge: true });
    return;
  }
  let techName = '';
  if (after.techId) {
    const us = await db().collection('users').doc(after.techId).get();
    techName = us.exists ? (us.data() as any).name : '';
  }
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data() as any;
    if (!d || d.materialsApplied) return;
    const mats = (d.materials || []).filter((m: any) => m.productId && m.qty > 0);
    const snaps: any[] = [];
    for (const m of mats) snaps.push(await tx.get(tcol(tid, 'inventory').doc(m.productId)));
    mats.forEach((m: any, idx: number) => {
      const s = snaps[idx];
      if (s.exists) {
        const cur = Number((s.data() as any).quantity) || 0;
        tx.update(s.ref, { quantity: Math.max(0, cur - Number(m.qty)) });
      }
      tx.set(tcol(tid, 'inventoryMovements').doc(), {
        productId: m.productId,
        productName: m.name,
        qty: Number(m.qty),
        ticketId: ref.id,
        ticketNum: d.num,
        client: d.client?.name || '',
        site: d.site || '',
        techName,
        at: nowCR(),
      });
    });
    tx.set(ref, { materialsApplied: true }, { merge: true });
  });
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

    // Aviso interno: orden marcada como terminada y en espera de revisión/aprobación.
    if (statusChanged && after.status === 'EN_REVISION') {
      const email = await tenantNotifyEmailOf(tid);
      if (email) {
        const m = soTechTpl(so, 'Orden lista para revisión', `La orden ${after.num} fue marcada como terminada y espera tu aprobación.`, brand);
        await sendMailSafe(tid, email, m.subject, m.html);
      }
    }

    /* ---- Compuerta de revisión interna: SERVICIO_TERMINADO + requiresReview → EN_REVISION ---- */
    if (statusChanged && after.status === 'SERVICIO_TERMINADO' && after.requiresReview) {
      const at = nowCR();
      await ref.set({
        status: 'EN_REVISION',
        readyAt: after.readyAt || after.finishedAt || at,
        history: [...(after.history || []), { status: 'EN_REVISION', at, by: 'sistema', note: 'En espera de revisión interna' }],
      }, { merge: true });
      return; // la facturación/reporte ocurre al aprobar
    }

    /* ---- Finalización: reporte + materiales + facturación + cadencia (idempotente) ----
       Aplica al terminar (si NO requiere revisión) o tras aprobación (PENDIENTE_FACTURAR/CERRADA). */
    const isPeriodico = (after.mode || 'periodico') === 'periodico';
    const shouldBill = isPeriodico || after.requiresInvoice === true;
    const finalizing =
      (after.status === 'SERVICIO_TERMINADO' && !after.requiresReview) ||
      after.status === 'PENDIENTE_FACTURAR' ||
      after.status === 'CERRADA';
    if (finalizing) {
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

      // 2) rebaja de inventario por materiales reportados (idempotente)
      try {
        await applyMaterials(tid, ref, after);
      } catch (e) {
        logger.error('inventario: fallo rebajando materiales', e as Error);
      }

      // 3) item de facturación + transición automática a PENDIENTE_FACTURAR (o CERRADA si no factura)
      if (shouldBill && !after.billingApplied) {
        try {
          await db().runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const d = snap.data() as any;
            if (!d || d.billingApplied) return;
            const contractSnap = d.contractId ? await tx.get(tcol(tid, 'contracts').doc(d.contractId)) : null;
            const contract = contractSnap?.exists ? (contractSnap.data() as any) : {};
            const itemRef = tcol(tid, 'invoiceItems').doc();
            const at = nowCR();
            const eqs = soEquipments(d);
            const eqSummary = eqs.length
              ? eqs.map((e: any) => [e.equipmentSnapshot?.typeName, e.equipmentSnapshot?.serial].filter(Boolean).join(' ')).filter(Boolean).join(' · ')
              : [d.equipmentSnapshot?.typeName, d.equipmentSnapshot?.brand, d.equipmentSnapshot?.serial].filter(Boolean).join(' · ');
            tx.set(itemRef, {
              serviceOrderId: soId,
              soNum: d.num,
              type: d.type,
              mode: d.mode || 'periodico',
              contractId: d.contractId || null,
              licitacionNum: contract.licitacionNum || '',
              clientName: d.client?.name || '',
              equipmentSummary: eqSummary || [d.title, d.site].filter(Boolean).join(' · '),
              serviceDate: (d.finishedAt || d.readyAt || at).slice(0, 10),
              status: 'pendiente',
              invoiceId: null,
              // Facturación electrónica: receptor/tipo/monto se completan luego en la bandeja.
              amount: typeof d.billAmount === 'number' ? d.billAmount : null,
              chargeTypeId: d.chargeTypeId || null,
              clientId: d.clientId || null,
              currency: d.billCurrency === 'USD' ? 'USD' : 'CRC',
              description: eqSummary || d.title || d.num,
              createdAt: at,
            });
            const patch: any = { billingApplied: true, invoiceItemId: itemRef.id };
            if (d.status === 'SERVICIO_TERMINADO') {
              patch.status = 'PENDIENTE_FACTURAR';
              patch.history = [...(d.history || []), { status: 'PENDIENTE_FACTURAR', at, by: 'sistema', note: 'Listo para facturar' }];
            }
            tx.set(ref, patch, { merge: true });
          });
        } catch (e) {
          logger.error('facturación: fallo creando invoiceItem', e as Error);
        }
      } else if (!shouldBill && after.status === 'SERVICIO_TERMINADO') {
        // Orden por demanda sin facturación: cerrar directamente.
        const at = nowCR();
        await ref.set({
          status: 'CERRADA',
          history: [...(after.history || []), { status: 'CERRADA', at, by: 'sistema', note: 'Cerrada (sin facturación)' }],
        }, { merge: true });
      }

      // 4) recálculo de cadencia A NIVEL CONTRATO (todos los equipos se revisan juntos)
      if (!after.cadenceApplied && after.type === 'preventivo' && after.contractId) {
        try {
          const contractRef = tcol(tid, 'contracts').doc(after.contractId);
          const contractSnap = await contractRef.get();
          if (contractSnap.exists) {
            const contract = contractSnap.data() as any;
            const per: PeriodicityMonths = (PERIODICITIES.includes(contract.defaultPeriodicityMonths) ? contract.defaultPeriodicityMonths : 3) as PeriodicityMonths;
            const realDate = (after.finishedAt || nowCR()).slice(0, 10);
            const next = addPeriodCR(realDate, per);

            // ¿existe ya una próxima orden PROGRAMADA del contrato? → ajustarla; si no, fijar contract.nextScheduledDate
            const futureSnap = await tcol(tid, 'serviceOrders')
              .where('contractId', '==', after.contractId)
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
              await contractRef.set({ nextScheduledDate: next, updatedAt: nowCR() }, { merge: true });
            }
            await contractRef.set({ lastServiceDate: realDate, updatedAt: nowCR() }, { merge: true });
            // Registrar lastServiceDate en cada equipo de la orden (para histórico)
            for (const e of soEquipments(after)) {
              if (e.equipmentId) await tcol(tid, 'equipment').doc(e.equipmentId).set({ lastServiceDate: realDate, updatedAt: nowCR() }, { merge: true });
            }
          }
          await ref.set({ cadenceApplied: true }, { merge: true });
        } catch (e) {
          logger.error('cadencia: fallo recalculando próxima visita', e as Error);
        }
      }

      // 5) propagar la CONDICIÓN de cada equipo al equipo maestro + historial (idempotente)
      if (!after.conditionApplied) {
        try {
          const at = nowCR();
          const by = (after.signature?.name) || 'sistema';
          for (const e of soEquipments(after)) {
            if (!e.equipmentId || !e.condition) continue;
            const eqRef = tcol(tid, 'equipment').doc(e.equipmentId);
            const eqSnap = await eqRef.get();
            if (!eqSnap.exists) continue;
            const cur = (eqSnap.data() as any).condition || 'operativo';
            if (cur === e.condition) continue; // sin cambio → no duplica historial
            const hist = (eqSnap.data() as any).conditionHistory || [];
            await eqRef.set({
              condition: e.condition,
              conditionHistory: [...hist, { condition: e.condition, at, by, orderId: soId, orderNum: after.num || null }],
              updatedAt: at,
            }, { merge: true });
          }
          await ref.set({ conditionApplied: true }, { merge: true });
        } catch (e) {
          logger.error('condición: fallo propagando estado de equipos', e as Error);
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
