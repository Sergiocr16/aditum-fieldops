/* © 2026 Aditum — Aditum FieldOps — facturación electrónica (GTI).
   Config del emisor por tenant (KMS), emisión de facturas y notas de crédito,
   reenvío de correo, consulta de estado y polling automático ante Hacienda. */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import { nowCR } from './shared';
import { assertAdmin, assertRoles, tcol, Ctx } from './tenant';
import { encryptSecret, decryptSecret } from './kms';
import {
  GtiConfig,
  FiscalLineInput,
  FiscalReceptor,
  buildDocumentPayload,
  documentTotals,
  cargarDocumento,
  estadoHacienda,
  reenviarCorreo,
  ping,
  haciendaStatus,
  STATUS_FINAL,
} from './gti-client';

const db = () => admin.firestore();

/* ---------------- helpers ---------------- */

/** 'YYYY-MM-DD HH:mm' (nowCR) → 'YYYY-MM-DDTHH:mm:ss' (formato GTI). */
function toGtiDateTime(cr: string): string {
  const s = (cr || nowCR()).trim();
  const withSeconds = s.length === 16 ? `${s}:00` : s; // agrega segundos si faltan
  return withSeconds.replace(' ', 'T');
}

interface LoadedConfig {
  cfg: GtiConfig;
  enabled: boolean;
  raw: any;
}

async function loadGtiConfig(tenantId: string): Promise<LoadedConfig | null> {
  const snap = await tcol(tenantId, 'settings').doc('gti').get();
  if (!snap.exists) return null;
  const d = snap.data() as any;
  if (!d.accountNumber || !d.username || !d.passCiphertext) return null;
  const password = await decryptSecret(d.passCiphertext);
  return {
    cfg: {
      accountNumber: String(d.accountNumber),
      username: String(d.username),
      password,
      activityCode: String(d.activityCode || ''),
      terminal: Number(d.terminal) || 1,
      environment: d.environment === 'production' ? 'production' : 'sandbox',
    },
    enabled: !!d.enabled,
    raw: d,
  };
}

function receptorFromClient(c: any): FiscalReceptor {
  return {
    name: c.name,
    identType: Number(c.identType),
    identNumber: String(c.identNumber),
    comercialName: c.comercialName || undefined,
    email: c.email,
    ccEmails: c.ccEmails || undefined,
    activityCode: c.activityCode || undefined,
    province: c.province ?? null,
    canton: c.canton ?? null,
    district: c.district ?? null,
    neighborhood: c.neighborhood ?? null,
    direction: c.direction || undefined,
    internalCode: c.internalCode || undefined,
  };
}

/** Procesa la respuesta de CargarDocumento y devuelve el patch a persistir. */
function processCargaResponse(result: { status: number; json: any; text: string }): {
  patch: any;
  ok: boolean;
  detail: string;
} {
  const json = result.json || {};
  if (result.status === 202 || json.Estado === 202) {
    const msg = (json.Respuestas && json.Respuestas[0]) || {};
    if (Number(msg.Codigo) === 0) {
      return {
        ok: true,
        detail: msg.Respuesta || 'Documento recibido',
        patch: {
          isElectronicBillSend: true,
          referenceNumber: msg.Consecutivo || null,
          numericKey: msg.ClaveNumerica || null,
          electronicBillStatus: 'SENT_TO_GTI',
          electronicBillResponse: `${msg.Codigo} - ${msg.Detalle || msg.Respuesta || ''}`,
        },
      };
    }
    const detail = msg.Detalle || msg.Error || 'ERROR_SENDING_TO_GTI';
    return {
      ok: false,
      detail,
      patch: {
        isElectronicBillSend: false,
        electronicBillStatus: String(detail),
        electronicBillResponse: `${msg.Codigo} - ${msg.Detalle || msg.Error || ''}`,
      },
    };
  }
  if (result.status === 401 || json.Estado === 401) {
    const detail = (json.Respuestas && json.Respuestas[0]?.Detalle) || 'Credenciales GTI inválidas';
    return { ok: false, detail, patch: { isElectronicBillSend: false, electronicBillStatus: 'INVALID_CREDENTIALS', electronicBillResponse: detail } };
  }
  const detail = json.Error || result.text || `HTTP ${result.status}`;
  return { ok: false, detail, patch: { isElectronicBillSend: false, electronicBillStatus: 'ERROR_SENDING_TO_GTI', electronicBillResponse: String(detail).slice(0, 500) } };
}

/* ---------------- config del emisor ---------------- */

/** Guarda la config GTI del tenant. La clave se cifra con KMS (igual que SMTP);
    omití `password` para conservar la actual. */
export const saveGtiConfig = onCall(async (req) => {
  const ctx = assertAdmin(req);
  const { accountNumber, username, activityCode, terminal, defaultCurrency, environment, enabled, password } = req.data || {};
  if (!String(accountNumber || '').trim()) throw new HttpsError('invalid-argument', 'El número de cuenta es requerido.');
  if (!String(username || '').trim()) throw new HttpsError('invalid-argument', 'El usuario es requerido.');
  if (password && /[#?&%/]/.test(String(password))) {
    throw new HttpsError('invalid-argument', 'La clave no puede contener los caracteres # ? & % /.');
  }
  const ref = tcol(ctx.tenantId, 'settings').doc('gti');
  const patch: any = {
    accountNumber: String(accountNumber).trim(),
    username: String(username).trim(),
    activityCode: String(activityCode || '').trim(),
    terminal: Number(terminal) || 1,
    defaultCurrency: defaultCurrency === 'USD' ? 'USD' : 'CRC',
    environment: environment === 'production' ? 'production' : 'sandbox',
    enabled: !!enabled,
    updatedAt: nowCR(),
    updatedBy: ctx.uid,
  };
  if (password && String(password).trim()) {
    try {
      patch.passCiphertext = await encryptSecret(String(password).trim());
    } catch (e: any) {
      throw new HttpsError('internal', 'No se pudo cifrar la clave (KMS): ' + (e?.message || 'error'));
    }
  } else {
    const existing = await ref.get();
    if (!existing.exists || !(existing.data() as any).passCiphertext) {
      throw new HttpsError('invalid-argument', 'La clave es requerida la primera vez.');
    }
  }
  await ref.set(patch, { merge: true });
  return { ok: true };
});

/** Valida las credenciales contra el ping de GTI y guarda el resultado. */
export const testGtiConfig = onCall(async (req) => {
  const ctx = assertAdmin(req);
  const loaded = await loadGtiConfig(ctx.tenantId);
  const ref = tcol(ctx.tenantId, 'settings').doc('gti');
  if (!loaded) throw new HttpsError('failed-precondition', 'Configurá y guardá las credenciales GTI primero.');
  try {
    const res = await ping(loaded.cfg);
    if (res.status >= 200 && res.status < 300) {
      await ref.set({ status: 'verified', lastTestAt: nowCR(), lastError: null }, { merge: true });
      return { ok: true };
    }
    const err = `HTTP ${res.status}`;
    await ref.set({ status: 'error', lastTestAt: nowCR(), lastError: err }, { merge: true });
    throw new HttpsError('failed-precondition', 'Los datos de GTI no son válidos (' + err + ').');
  } catch (e: any) {
    if (e instanceof HttpsError) throw e;
    await ref.set({ status: 'error', lastTestAt: nowCR(), lastError: String(e?.message || e) }, { merge: true });
    throw new HttpsError('internal', 'No se pudo validar la conexión con GTI: ' + (e?.message || 'error'));
  }
});

/* ---------------- emisión de factura ---------------- */

/** Arma las líneas GTI de una factura: manual (inv.lines, monto base) o consolidada (invoiceItems, IVA-incluido). */
async function buildLinesFromInvoice(tenantId: string, inv: any): Promise<FiscalLineInput[]> {
  // Factura manual: líneas guardadas en el doc (monto base + IVA encima).
  if (Array.isArray(inv.lines) && inv.lines.length) {
    return inv.lines
      .filter((l: any) => Number(l.amount) > 0)
      .map((l: any) => ({
        cabys: l.cabys || undefined,
        prodServCode: l.prodServCode || undefined,
        description: l.description || 'Servicio',
        amount: Number(l.amount),
        emitIva: l.emitIva !== false,
        ivaIncluded: l.ivaIncluded === true, // manual = base (false)
      }));
  }
  // Factura consolidada: una línea por invoiceItem (monto IVA-incluido).
  const itemIds: string[] = Array.isArray(inv.itemIds) ? inv.itemIds.map(String) : [];
  if (!itemIds.length) throw new HttpsError('failed-precondition', 'La factura no tiene ítems ni líneas.');
  const itemSnaps = await db().getAll(...itemIds.map((id) => tcol(tenantId, 'invoiceItems').doc(id)));
  const items = itemSnaps.filter((s) => s.exists).map((s) => ({ id: s.id, ...(s.data() as any) }));
  const ctIds = [...new Set(items.map((it) => it.chargeTypeId).filter(Boolean))] as string[];
  const ctMap = new Map<string, any>();
  if (ctIds.length) {
    const ctSnaps = await db().getAll(...ctIds.map((id) => tcol(tenantId, 'chargeTypes').doc(id)));
    ctSnaps.forEach((s) => s.exists && ctMap.set(s.id, s.data()));
  }
  const lines: FiscalLineInput[] = [];
  for (const it of items) {
    const ct = it.chargeTypeId ? ctMap.get(it.chargeTypeId) : null;
    if (!ct) throw new HttpsError('failed-precondition', `El ítem ${it.soNum || it.id} no tiene tipo de cargo.`);
    if (ct.issuesDocument === false) continue; // no emite documento
    const amount = Number(it.amount);
    if (!amount || amount <= 0) throw new HttpsError('failed-precondition', `El ítem ${it.soNum || it.id} no tiene monto.`);
    lines.push({
      cabys: ct.cabysCode || undefined,
      prodServCode: ct.code || undefined,
      description: it.description || it.equipmentSummary || it.soNum || 'Servicio',
      amount,
      emitIva: ct.emitIva !== false, // ivaIncluded por defecto true (monto IVA-incluido)
    });
  }
  return lines;
}

/** Emite una factura ya creada (TipoDoc=1): receptor + líneas → payload → GTI → persiste el resultado. */
async function sendInvoiceDoc(tenantId: string, invRef: FirebaseFirestore.DocumentReference, inv: any, cfg: GtiConfig): Promise<{ ok: boolean; detail: string; patch: any }> {
  if (!inv.receptorId) throw new HttpsError('failed-precondition', 'La factura no tiene receptor asignado.');
  const clientSnap = await tcol(tenantId, 'clients').doc(String(inv.receptorId)).get();
  if (!clientSnap.exists) throw new HttpsError('not-found', 'Receptor no encontrado.');
  const receptor = receptorFromClient(clientSnap.data());
  const lines = await buildLinesFromInvoice(tenantId, inv);
  if (!lines.length) throw new HttpsError('failed-precondition', 'No hay líneas facturables (revisá los tipos de cargo).');
  const currency = inv.currency === 'USD' ? 'USD' : 'CRC';
  const payload = buildDocumentPayload({ config: cfg, tipoDoc: 1, currency, fechaFactura: toGtiDateTime(nowCR()), receptor, lines, notes: inv.note || undefined });
  let result;
  try {
    result = await cargarDocumento(cfg, payload);
  } catch (e: any) {
    await invRef.set({ electronicBillStatus: 'ERROR_SENDING_TO_GTI', electronicBillResponse: String(e?.message || e).slice(0, 500), payloadSent: payload }, { merge: true });
    throw new HttpsError('internal', 'Fallo de red enviando a GTI: ' + (e?.message || 'error'));
  }
  const totals = documentTotals(lines);
  const { patch, ok, detail } = processCargaResponse(result);
  await invRef.set({ ...patch, currency, subtotal: totals.subtotal, tax: totals.tax, total: totals.total, emittedAt: nowCR(), payloadSent: payload }, { merge: true });
  return { ok, detail, patch };
}

export const emitElectronicInvoice = onCall(async (req) => {
  const ctx = assertRoles(req, ['admin', 'facturacion']);
  const invoiceId = String(req.data?.invoiceId || '');
  if (!invoiceId) throw new HttpsError('invalid-argument', 'invoiceId es requerido.');

  const loaded = await loadGtiConfig(ctx.tenantId);
  if (!loaded || !loaded.enabled) throw new HttpsError('failed-precondition', 'La facturación electrónica GTI no está habilitada.');

  const invRef = tcol(ctx.tenantId, 'invoices').doc(invoiceId);
  const invSnap = await invRef.get();
  if (!invSnap.exists) throw new HttpsError('not-found', 'Factura no encontrada.');
  const inv = invSnap.data() as any;
  if (inv.isElectronicBillSend) return { ok: true, already: true, referenceNumber: inv.referenceNumber || null };

  const { ok, detail, patch } = await sendInvoiceDoc(ctx.tenantId, invRef, inv, loaded.cfg);
  if (!ok) throw new HttpsError('failed-precondition', 'GTI rechazó el documento: ' + detail);
  return { ok: true, referenceNumber: patch.referenceNumber, numericKey: patch.numericKey };
});

/** Factura manual por líneas (compositor): crea el FC con líneas (monto base) y la emite de una vez. */
export const createManualInvoice = onCall(async (req) => {
  const ctx = assertRoles(req, ['admin', 'facturacion']);
  const { receptorId, currency, note, lines, sourceItemIds } = req.data || {};
  const srcIds: string[] = Array.isArray(sourceItemIds) ? sourceItemIds.map(String) : [];
  if (!receptorId) throw new HttpsError('invalid-argument', 'El receptor es requerido.');
  if (!Array.isArray(lines) || !lines.length) throw new HttpsError('invalid-argument', 'Agregá al menos una línea.');
  if (lines.length > 50) throw new HttpsError('invalid-argument', 'Demasiadas líneas (máx 50).');

  const loaded = await loadGtiConfig(ctx.tenantId);
  if (!loaded || !loaded.enabled) throw new HttpsError('failed-precondition', 'La facturación electrónica GTI no está habilitada.');

  const clientSnap = await tcol(ctx.tenantId, 'clients').doc(String(receptorId)).get();
  if (!clientSnap.exists) throw new HttpsError('not-found', 'Receptor no encontrado.');
  const client = clientSnap.data() as any;

  // Resolver tipos de cargo de cada línea
  const ctIds = [...new Set(lines.map((l: any) => l.chargeTypeId).filter(Boolean))] as string[];
  const ctMap = new Map<string, any>();
  if (ctIds.length) {
    const ctSnaps = await db().getAll(...ctIds.map((id) => tcol(ctx.tenantId, 'chargeTypes').doc(id)));
    ctSnaps.forEach((s) => s.exists && ctMap.set(s.id, s.data()));
  }
  const storedLines = lines.map((l: any) => {
    const amount = Number(l.amount);
    if (!l.description || !String(l.description).trim()) throw new HttpsError('invalid-argument', 'Cada línea necesita descripción.');
    if (!amount || amount <= 0) throw new HttpsError('invalid-argument', 'Cada línea necesita un monto mayor a cero.');
    const ct = l.chargeTypeId ? ctMap.get(l.chargeTypeId) : null;
    return {
      description: String(l.description).trim().slice(0, 200),
      chargeTypeId: l.chargeTypeId || null,
      cabys: ct?.cabysCode || null,
      prodServCode: ct?.code || null,
      emitIva: ct ? ct.emitIva !== false : true,
      amount,
      ivaIncluded: false, // monto base: el IVA se suma encima
    };
  });

  const cur = currency === 'USD' ? 'USD' : 'CRC';
  const lineInputs: FiscalLineInput[] = storedLines.map((l) => ({ cabys: l.cabys || undefined, prodServCode: l.prodServCode || undefined, description: l.description, amount: l.amount, emitIva: l.emitIva, ivaIncluded: false }));
  const totals = documentTotals(lineInputs);

  const invRef = tcol(ctx.tenantId, 'invoices').doc();
  const counterRef = tcol(ctx.tenantId, 'counters').doc('invoices');
  const at = nowCR();
  const num = await db().runTransaction(async (tx) => {
    // Lecturas primero (counter + ítems de origen + sus OT/OS).
    const cs = await tx.get(counterRef);
    const itemSnaps = await Promise.all(srcIds.map((id) => tx.get(tcol(ctx.tenantId, 'invoiceItems').doc(id))));
    const soSnaps = await Promise.all(itemSnaps.map((s) => { const d = s.data() as any; return d?.serviceOrderId ? tx.get(tcol(ctx.tenantId, 'serviceOrders').doc(d.serviceOrderId)) : Promise.resolve(null); }));
    const tkSnaps = await Promise.all(itemSnaps.map((s) => { const d = s.data() as any; return d?.ticketId ? tx.get(tcol(ctx.tenantId, 'tickets').doc(d.ticketId)) : Promise.resolve(null); }));

    const next = (cs.exists ? (cs.data() as any).value : 1000) + 1;
    const invoiceNum = 'FC-' + next;
    tx.set(counterRef, { value: next }, { merge: true });
    tx.set(invRef, {
      num: invoiceNum,
      manual: true,
      itemIds: srcIds,
      itemCount: storedLines.length,
      clientNames: [client.name || ''],
      receptorId,
      currency: cur,
      lines: storedLines,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      note: String(note || '').slice(0, 200),
      status: 'facturada',
      isElectronicBillSend: false,
      electronicBillStatus: 'PENDING',
      createdAt: at,
      createdBy: ctx.uid,
    });
    // Marcar los ítems de origen como facturados (salen de la bandeja de pendientes).
    itemSnaps.forEach((s, i) => {
      if (!s.exists) return;
      tx.update(s.ref, { status: 'facturado', invoiceId: invRef.id, invoiceNum, invoicedAt: at });
      const so = soSnaps[i];
      if (so && so.exists) {
        const sod = so.data() as any;
        tx.update(so.ref, { status: 'FACTURADA', history: [...(sod.history || []), { status: 'FACTURADA', at, by: 'Admin', note: invoiceNum }] });
      }
      const tk = tkSnaps[i];
      if (tk && tk.exists) tx.update(tk.ref, { invoiced: true, invoicedAt: at, invoiceNum });
    });
    return invoiceNum;
  });

  // Emitir de una vez. Si GTI rechaza, la factura queda creada (visible) y reintentable.
  const fresh = await invRef.get();
  const { ok, detail, patch } = await sendInvoiceDoc(ctx.tenantId, invRef, fresh.data(), loaded.cfg);
  if (!ok) return { ok: false, invoiceId: invRef.id, num, error: detail };
  return { ok: true, invoiceId: invRef.id, num, referenceNumber: patch.referenceNumber, numericKey: patch.numericKey };
});

/* ---------------- nota de crédito (anulación) ---------------- */

export const emitCreditNote = onCall(async (req) => {
  const ctx = assertRoles(req, ['admin', 'facturacion']);
  const invoiceId = String(req.data?.invoiceId || '');
  const amount = Number(req.data?.amount);
  const reason = String(req.data?.reason || '').trim();
  if (!invoiceId) throw new HttpsError('invalid-argument', 'invoiceId es requerido.');
  if (!amount || amount <= 0) throw new HttpsError('invalid-argument', 'El monto debe ser mayor a cero.');
  if (!reason) throw new HttpsError('invalid-argument', 'El motivo es requerido.');

  const loaded = await loadGtiConfig(ctx.tenantId);
  if (!loaded || !loaded.enabled) throw new HttpsError('failed-precondition', 'La facturación electrónica GTI no está habilitada.');

  const invSnap = await tcol(ctx.tenantId, 'invoices').doc(invoiceId).get();
  if (!invSnap.exists) throw new HttpsError('not-found', 'Factura no encontrada.');
  const inv = invSnap.data() as any;
  if (!inv.referenceNumber) throw new HttpsError('failed-precondition', 'Solo se puede anular una factura ya emitida en GTI.');
  if (!inv.receptorId) throw new HttpsError('failed-precondition', 'La factura no tiene receptor asignado.');

  const clientSnap = await tcol(ctx.tenantId, 'clients').doc(String(inv.receptorId)).get();
  if (!clientSnap.exists) throw new HttpsError('not-found', 'Receptor no encontrado.');
  const receptor = receptorFromClient(clientSnap.data());

  // Tipo de cargo de referencia: el del primer ítem de la factura.
  const firstItemId = Array.isArray(inv.itemIds) && inv.itemIds.length ? String(inv.itemIds[0]) : null;
  let emitIva = true;
  let cabys: string | undefined;
  let code: string | undefined;
  if (firstItemId) {
    const itSnap = await tcol(ctx.tenantId, 'invoiceItems').doc(firstItemId).get();
    const ctId = itSnap.exists ? (itSnap.data() as any).chargeTypeId : null;
    if (ctId) {
      const ctSnap = await tcol(ctx.tenantId, 'chargeTypes').doc(String(ctId)).get();
      if (ctSnap.exists) {
        const ct = ctSnap.data() as any;
        emitIva = ct.emitIva !== false;
        cabys = ct.cabysCode || undefined;
        code = ct.code || undefined;
      }
    }
  }

  const currency = inv.currency === 'USD' ? 'USD' : 'CRC';
  const lines: FiscalLineInput[] = [{ cabys, prodServCode: code, description: `Nota de credito ${inv.num} - ${reason}`, amount, emitIva }];
  const payload = buildDocumentPayload({
    config: loaded.cfg,
    tipoDoc: 3,
    currency,
    fechaFactura: toGtiDateTime(nowCR()), // NC usa fecha/hora actual (Hacienda rechaza fecha vieja)
    receptor,
    lines,
    reference: {
      numeroRef: String(inv.referenceNumber),
      fechaRef: toGtiDateTime(inv.emittedAt || inv.createdAt || nowCR()),
      razonNota: reason,
    },
  });

  const ncRef = tcol(ctx.tenantId, 'creditNotes').doc();
  const totals = documentTotals(lines);
  const at = nowCR();
  // Registramos la NC antes de enviar (auditoría); luego persistimos el resultado.
  await ncRef.set({
    canceledInvoiceId: invoiceId,
    canceledInvoiceNum: inv.num,
    receptorId: inv.receptorId,
    amount,
    reason,
    currency,
    subtotal: totals.subtotal,
    tax: totals.tax,
    total: totals.total,
    isElectronicBillSend: false,
    electronicBillStatus: 'PENDING',
    referenceNumber: null,
    numericKey: null,
    payloadSent: payload,
    createdAt: at,
    createdBy: ctx.uid,
  });

  let result;
  try {
    result = await cargarDocumento(loaded.cfg, payload);
  } catch (e: any) {
    await ncRef.set({ electronicBillStatus: 'ERROR_SENDING_TO_GTI', electronicBillResponse: String(e?.message || e).slice(0, 500) }, { merge: true });
    throw new HttpsError('internal', 'Fallo de red enviando la NC a GTI: ' + (e?.message || 'error'));
  }
  const { patch, ok, detail } = processCargaResponse(result);
  await ncRef.set({ ...patch }, { merge: true });
  if (ok) {
    // Marcar la factura como anulada (total o parcial) para la UI.
    await tcol(ctx.tenantId, 'invoices').doc(invoiceId).set({ creditedAt: at, creditNoteId: ncRef.id, creditedAmount: amount }, { merge: true });
  } else {
    throw new HttpsError('failed-precondition', 'GTI rechazó la nota de crédito: ' + detail);
  }
  return { ok: true, creditNoteId: ncRef.id, referenceNumber: patch.referenceNumber };
});

/* ---------------- reenviar correo / consultar estado ---------------- */

function docRef(ctx: Ctx, kind: string, id: string) {
  const col = kind === 'creditNote' ? 'creditNotes' : 'invoices';
  return tcol(ctx.tenantId, col).doc(id);
}

export const resendFiscalEmail = onCall(async (req) => {
  const ctx = assertRoles(req, ['admin', 'facturacion']);
  const { kind, id, email } = req.data || {};
  if (!id) throw new HttpsError('invalid-argument', 'id es requerido.');
  const loaded = await loadGtiConfig(ctx.tenantId);
  if (!loaded) throw new HttpsError('failed-precondition', 'GTI no está configurado.');
  const snap = await docRef(ctx, kind, String(id)).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Documento no encontrado.');
  const d = snap.data() as any;
  if (!d.referenceNumber) throw new HttpsError('failed-precondition', 'El documento aún no fue emitido.');
  let correo = String(email || '').trim();
  if (!correo && d.receptorId) {
    const c = await tcol(ctx.tenantId, 'clients').doc(String(d.receptorId)).get();
    correo = c.exists ? (c.data() as any).email : '';
  }
  if (!correo) throw new HttpsError('invalid-argument', 'No hay correo de destino.');
  const res = await reenviarCorreo(loaded.cfg, String(d.referenceNumber), correo);
  if (res.status < 200 || res.status >= 300) throw new HttpsError('internal', 'GTI no pudo reenviar el correo (HTTP ' + res.status + ').');
  return { ok: true };
});

export const queryFiscalStatus = onCall(async (req) => {
  const ctx = assertRoles(req, ['admin', 'facturacion']);
  const { kind, id } = req.data || {};
  if (!id) throw new HttpsError('invalid-argument', 'id es requerido.');
  const loaded = await loadGtiConfig(ctx.tenantId);
  if (!loaded) throw new HttpsError('failed-precondition', 'GTI no está configurado.');
  const ref = docRef(ctx, kind, String(id));
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Documento no encontrado.');
  const d = snap.data() as any;
  if (!d.referenceNumber) throw new HttpsError('failed-precondition', 'El documento aún no fue emitido.');
  const res = await estadoHacienda(loaded.cfg, String(d.referenceNumber));
  const msg = res.json || {};
  const status = haciendaStatus(Number(msg.Codigo));
  await ref.set(
    { electronicBillStatus: status, electronicBillResponse: `Código: ${msg.Codigo}\n\nRespuesta: ${msg.Respuesta || ''}\n\nDetalle: ${msg.Detalle || ''}`.slice(0, 800) },
    { merge: true }
  );
  return { ok: true, status };
});

/* ---------------- polling automático ---------------- */

/** Cada 3 horas consulta el estado ante Hacienda de los documentos no finalizados. */
export const pollFiscalStatus = onSchedule({ schedule: 'every 3 hours', timeZone: 'America/Costa_Rica', region: process.env.FUNCTIONS_REGION || 'us-central1' }, async () => {
  const tenants = await db().collection('tenants').get();
  for (const t of tenants.docs) {
    const tid = t.id;
    let loaded: LoadedConfig | null;
    try {
      loaded = await loadGtiConfig(tid);
    } catch (e) {
      logger.warn('pollFiscalStatus: no se pudo cargar config GTI de ' + tid, e as Error);
      continue;
    }
    if (!loaded || !loaded.enabled) continue;
    for (const col of ['invoices', 'creditNotes']) {
      try {
        const snap = await tcol(tid, col).where('isElectronicBillSend', '==', true).limit(200).get();
        for (const docSnap of snap.docs) {
          const d = docSnap.data() as any;
          if (!d.referenceNumber || STATUS_FINAL.includes(d.electronicBillStatus)) continue;
          try {
            const res = await estadoHacienda(loaded.cfg, String(d.referenceNumber));
            const msg = res.json || {};
            const status = haciendaStatus(Number(msg.Codigo));
            await docSnap.ref.set(
              { electronicBillStatus: status, electronicBillResponse: `Código: ${msg.Codigo}\n\nRespuesta: ${msg.Respuesta || ''}\n\nDetalle: ${msg.Detalle || ''}`.slice(0, 800) },
              { merge: true }
            );
          } catch (e) {
            logger.warn(`pollFiscalStatus: fallo consultando ${col}/${docSnap.id} de ${tid}`, e as Error);
          }
        }
      } catch (e) {
        logger.warn(`pollFiscalStatus: fallo listando ${col} de ${tid}`, e as Error);
      }
    }
  }
});
