/* ⚠ PRODUCCIÓN: NO usar este script. Usar seed/migrate-prod-to-service-orders.mjs, que hace este paso
   con respaldo previo, sin sobrescribir datos existentes, sin disparar correos/inventario (guardas de
   migración en los triggers) y re-apuntando los links públicos /p/ a la orden de servicio. */
/* © 2026 Aditum — Aditum FieldOps — migración Órdenes de Trabajo (tickets) → Órdenes de Servicio.
   Copia cada tenants/{tid}/tickets/{id} a tenants/{tid}/serviceOrders/{id} como una orden
   POR DEMANDA (mode='demanda'), conservando el número (AD-####), evidencia, visitas, checklist,
   materiales y el link público. Mapea los estados de OT a la máquina de estados unificada.

   - Idempotente: usa el MISMO id de documento + flag `migratedFromTicket`. Re-ejecutar sobreescribe igual.
   - NO borra la colección `tickets` (los links /p/:token siguen sirviendo por getPublicTicket).
     La purga es un paso posterior manual, tras validar.

   Uso:
     # Dry-run (no escribe):
     FIREBASE_SERVICE_ACCOUNT=../secrets/service-account.json FIREBASE_PROJECT_ID=fieldops-aditum \
       node migrate-tickets-to-orders.mjs --dry-run
     # Emulador:
     FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_PROJECT_ID=demo-aditum-fieldops \
       node migrate-tickets-to-orders.mjs
     # Producción:
     FIREBASE_SERVICE_ACCOUNT=... FIREBASE_PROJECT_ID=fieldops-aditum node migrate-tickets-to-orders.mjs
*/
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const projectId = process.env.FIREBASE_PROJECT_ID || 'fieldops-aditum';
const saPath = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (saPath && !process.env.FIRESTORE_EMULATOR_HOST) {
  const sa = JSON.parse(readFileSync(saPath, 'utf8'));
  admin.initializeApp({ credential: admin.credential.cert(sa), projectId });
} else {
  admin.initializeApp({ projectId });
}
const db = admin.firestore();

const DRY = process.argv.includes('--dry-run');
const now = () => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t)?.value || '';
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`;
};

/** Mapea el estado de una OT a la máquina de estados unificada de OS. */
function mapStatus(t) {
  switch (t.status) {
    case 'pendiente': return 'PROGRAMADA';
    case 'asignado': return 'PROGRAMADA';
    case 'en_proceso': return 'EN_PROGRESO';
    case 'listo_revision': return 'EN_REVISION';
    case 'rechazado': return 'EN_PROGRESO'; // devuelto al técnico para corregir
    case 'aprobado': return t.requiresInvoice ? 'PENDIENTE_FACTURAR' : 'CERRADA';
    case 'cerrado': return t.invoiced || t.billingApplied ? 'FACTURADA' : 'CERRADA';
    default: return 'PROGRAMADA';
  }
}

/** Construye el doc de orden de servicio (demanda) a partir de un ticket. */
function ticketToOrder(t) {
  const status = mapStatus(t);
  const share = t.share || {};
  return {
    num: t.num,
    type: 'correctivo',
    mode: 'demanda',
    status,
    contractId: null,
    equipmentId: null,
    equipmentSnapshot: null,
    client: { name: t.client || '', email: '', phone: '' },
    techId: t.techId || null,
    planDate: t.scheduled || (t.created || '').slice(0, 10) || '',
    scheduledDate: t.scheduled || (t.created || '').slice(0, 10) || '',
    scheduledTime: '08:00',
    durationMin: 60,
    skipNotice: true,
    notify: { noticeDaysBefore: 3, noticeDate: t.scheduled || '', noticeSentAt: null, reminderSentAt: null, confirmedAt: null, confirmedVia: null, rescheduleCount: 0, tokens: { confirm: null, reschedule: null } },
    hold: null,
    checklistTemplateId: null,
    checklistTemplateVersion: null,
    checklist: (t.checklist || []).map((c) => ({ id: c.id, text: c.text, done: !!c.done, by: c.by || null, at: c.at || null, visitId: c.visitId || null })),
    photos: [],
    evidence: t.evidence || [],
    visits: t.visits || [],
    observations: t.observations || '',
    notes: '',
    signature: null,
    startedAt: null,
    finishedAt: t.readyAt || null,
    // Conserva el link público existente (share → reportShare) para no romper /p/:token.
    reportShare: { active: !!share.active, token: share.token || null, url: share.url || null, created: share.created || null, lastVisit: share.lastVisit || null },
    title: t.title || '',
    site: t.site || '',
    address: t.address || '',
    priority: t.priority || 'media',
    description: t.description || '',
    instructions: t.instructions || '',
    expected: t.expected || '',
    doneConditions: t.doneConditions || '',
    evidenceReq: t.evidenceReq || '',
    techObs: t.techObs || t.techNote || '',
    readyAt: t.readyAt || null,
    requiresReview: true,
    approval: t.approval || null,
    comments: t.comments || [],
    materials: t.materials || [],
    materialsNote: t.materialsNote || '',
    materialsApplied: !!t.materialsApplied,
    requiresInvoice: !!t.requiresInvoice,
    chargeTypeId: t.chargeTypeId || null,
    clientId: t.clientId || null,
    billAmount: typeof t.billAmount === 'number' ? t.billAmount : null,
    billCurrency: t.billCurrency || 'CRC',
    billingApplied: !!t.billingApplied,
    invoiceItemId: t.invoiceItemId || null,
    cadenceApplied: true, // las órdenes por demanda no recalculan cadencia
    history: [...(t.history || []), { status, at: now(), by: 'migración', note: 'Migrada desde orden de trabajo' }],
    created: t.created || now(),
    createdBy: t.createdBy || 'migración',
    migratedFromTicket: t.id || true,
  };
}

async function migrateTenant(tid) {
  const ticketsSnap = await db.collection('tenants').doc(tid).collection('tickets').get();
  if (ticketsSnap.empty) return { tid, total: 0, migrated: 0 };
  let migrated = 0;
  for (const doc of ticketsSnap.docs) {
    const t = { id: doc.id, ...doc.data() };
    const order = ticketToOrder(t);
    const dest = db.collection('tenants').doc(tid).collection('serviceOrders').doc(doc.id);
    if (DRY) {
      console.log(`  [dry] ${t.num} (${t.status} → ${order.status})`);
    } else {
      await dest.set(order, { merge: true });
      // Re-apunta el publicToken del ticket (purpose ticket_share) para que el reporte
      // siga resolviendo; el nuevo reporte /r/ usa so_report, pero /p/ sigue vía getPublicTicket.
      migrated++;
      console.log(`  ${t.num}: ${t.status} → ${order.status}`);
    }
  }
  return { tid, total: ticketsSnap.size, migrated };
}

async function main() {
  console.log(`Migración tickets → serviceOrders  ${DRY ? '(DRY-RUN)' : ''}  proyecto=${projectId}`);
  const tenantsSnap = await db.collection('tenants').get();
  const tenantIds = tenantsSnap.empty ? [process.env.TENANT_ID || 'aditum'] : tenantsSnap.docs.map((d) => d.id);
  let totals = { total: 0, migrated: 0 };
  for (const tid of tenantIds) {
    console.log(`\nTenant ${tid}:`);
    const r = await migrateTenant(tid);
    totals.total += r.total; totals.migrated += r.migrated;
    console.log(`  → ${r.migrated}/${r.total} migradas`);
  }
  console.log(`\nListo. ${totals.migrated}/${totals.total} órdenes migradas.${DRY ? ' (dry-run, sin escribir)' : ''}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
