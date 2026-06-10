/* © 2026 Aditum — Aditum FieldOps — billing: consolidate invoice items + CSV export */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { nowCR } from './shared';
import { assertRoles, tcol, tenantRef } from './tenant';

const db = () => admin.firestore();

/** Consolidates pending invoice items into an invoice (FC-####), marks the
    items as invoiced and moves their service orders to FACTURADA. */
export const consolidateInvoiceItems = onCall(async (req) => {
  const ctx = assertRoles(req, ['admin', 'facturacion']);
  const { itemIds, note } = req.data || {};
  if (!Array.isArray(itemIds) || !itemIds.length || itemIds.length > 200) {
    throw new HttpsError('invalid-argument', 'itemIds (1–200) es requerido.');
  }

  const itemRefs = itemIds.map((id: string) => tcol(ctx.tenantId, 'invoiceItems').doc(String(id)));
  const invoiceRef = tcol(ctx.tenantId, 'invoices').doc();
  const counterRef = tcol(ctx.tenantId, 'counters').doc('invoices');

  const num = await db().runTransaction(async (tx) => {
    const snaps = await Promise.all(itemRefs.map((r) => tx.get(r)));
    const items = snaps.map((s, i) => {
      if (!s.exists) throw new HttpsError('not-found', `Item ${itemIds[i]} no existe.`);
      const d = s.data() as any;
      if (d.status !== 'pendiente') throw new HttpsError('failed-precondition', `Item ${d.soNum} ya está facturado.`);
      return { ref: s.ref, data: d };
    });
    const soSnaps = await Promise.all(
      items.map((it) => (it.data.serviceOrderId ? tx.get(tcol(ctx.tenantId, 'serviceOrders').doc(it.data.serviceOrderId)) : Promise.resolve(null)))
    );
    const cs = await tx.get(counterRef);
    const next = (cs.exists ? (cs.data() as any).value : 1000) + 1;
    const invoiceNum = 'FC-' + next;
    const at = nowCR();

    tx.set(counterRef, { value: next }, { merge: true });
    tx.set(invoiceRef, {
      num: invoiceNum,
      itemIds: itemIds.map(String),
      itemCount: items.length,
      contractIds: [...new Set(items.map((it) => it.data.contractId))],
      clientNames: [...new Set(items.map((it) => it.data.clientName))],
      note: String(note || '').slice(0, 200),
      status: 'facturada',
      createdAt: at,
      createdBy: ctx.uid,
    });
    items.forEach((it, i) => {
      tx.update(it.ref, { status: 'facturado', invoiceId: invoiceRef.id, invoiceNum, invoicedAt: at, invoiceNote: String(note || '') });
      const soSnap = soSnaps[i];
      if (soSnap && soSnap.exists) {
        const so = soSnap.data() as any;
        tx.update(soSnap.ref, {
          status: 'FACTURADA',
          history: [...(so.history || []), { status: 'FACTURADA', at, by: 'Admin', note: invoiceNum + (note ? ' · ' + note : '') }],
        });
      }
    });
    return invoiceNum;
  });

  return { ok: true, invoiceId: invoiceRef.id, num };
});

/** Returns a CSV string of invoice items (for Odoo/accounting import). */
export const exportInvoiceCsv = onCall(async (req) => {
  const ctx = assertRoles(req, ['admin', 'facturacion']);
  const { status, contractId, from, to } = req.data || {};
  let q: FirebaseFirestore.Query = tcol(ctx.tenantId, 'invoiceItems');
  if (status === 'pendiente' || status === 'facturado') q = q.where('status', '==', status);
  if (contractId) {
    // Validar pertenencia al tenant (defensa en profundidad).
    if (!(await tcol(ctx.tenantId, 'contracts').doc(String(contractId)).get()).exists) {
      throw new HttpsError('not-found', 'Contrato no encontrado en este tenant.');
    }
    q = q.where('contractId', '==', String(contractId));
  }
  const snap = await q.limit(2000).get();
  let rows = snap.docs.map((d) => d.data() as any);
  if (from) rows = rows.filter((r) => r.serviceDate >= from);
  if (to) rows = rows.filter((r) => r.serviceDate <= to);
  rows.sort((a, b) => (a.serviceDate || '').localeCompare(b.serviceDate || ''));

  const esc = (v: any) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const header = ['orden', 'tipo', 'licitacion', 'cliente', 'equipo', 'fecha_servicio', 'estado', 'factura', 'facturado_en'];
  const csv = [header.join(',')]
    .concat(rows.map((r) => [r.soNum, r.type, r.licitacionNum, r.clientName, r.equipmentSummary, r.serviceDate, r.status, r.invoiceNum || '', r.invoicedAt || ''].map(esc).join(',')))
    .join('\n');
  return { csv, count: rows.length };
});
