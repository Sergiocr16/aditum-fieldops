/* © 2026 Aditum — Aditum FieldOps — migración a órdenes MULTI-EQUIPO + cadencia por contrato.
   - Backfill: serviceOrders periódicas/correctivas con equipo único → `equipments[]` de 1 elemento.
   - Cadencia: siembra estado a nivel contrato (nextScheduledDate / lastServiceDate) desde sus equipos.
   - Limpieza: borra órdenes PROGRAMADA legacy por-equipo (id `eq_*`) para que el scheduler
     regenere a nivel contrato (`co_*`) sin duplicar visitas.
   Idempotente.

   Uso:
     # Dry-run:
     FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_PROJECT_ID=demo-aditum-fieldops \
       node migrate-orders-multiequipment.mjs --dry-run
     # Real (emulador):
     FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_PROJECT_ID=demo-aditum-fieldops \
       node migrate-orders-multiequipment.mjs
     # Producción:
     FIREBASE_SERVICE_ACCOUNT=../secrets/service-account.json FIREBASE_PROJECT_ID=fieldops-aditum \
       node migrate-orders-multiequipment.mjs
*/
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const projectId = process.env.FIREBASE_PROJECT_ID || 'fieldops-aditum';
const saPath = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (saPath && !process.env.FIRESTORE_EMULATOR_HOST) {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(saPath, 'utf8'))), projectId });
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

async function migrateTenant(tid) {
  const ordersCol = db.collection('tenants').doc(tid).collection('serviceOrders');
  const snap = await ordersCol.get();
  let backfilled = 0, deleted = 0;
  for (const doc of snap.docs) {
    const so = doc.data();
    // Limpieza: órdenes preventivas PROGRAMADA legacy por-equipo (id eq_*) → borrar (se regeneran por contrato)
    if (so.status === 'PROGRAMADA' && doc.id.startsWith('eq_')) {
      if (DRY) console.log(`  [dry] delete ${so.num} (${doc.id})`);
      else { await doc.ref.delete(); deleted++; }
      continue;
    }
    // Backfill: single → equipments[] de 1 (si no tiene equipments y tiene equipo)
    if ((!Array.isArray(so.equipments) || !so.equipments.length) && so.equipmentSnapshot) {
      const equipments = [{
        equipmentId: so.equipmentId || '',
        equipmentSnapshot: so.equipmentSnapshot,
        checklistTemplateId: so.checklistTemplateId ?? null,
        checklistTemplateVersion: so.checklistTemplateVersion ?? null,
        checklist: so.checklist || [],
      }];
      if (DRY) console.log(`  [dry] backfill ${so.num} → 1 equipo`);
      else { await doc.ref.set({ equipments }, { merge: true }); backfilled++; }
    }
  }

  // Cadencia a nivel contrato: sembrar nextScheduledDate (mín) y lastServiceDate (máx) desde equipos.
  const eqSnap = await db.collection('tenants').doc(tid).collection('equipment').get();
  const byContract = new Map();
  eqSnap.docs.forEach((d) => {
    const e = d.data();
    if (!byContract.has(e.contractId)) byContract.set(e.contractId, []);
    byContract.get(e.contractId).push(e);
  });
  let contractsSeeded = 0;
  for (const [contractId, eqs] of byContract) {
    const cRef = db.collection('tenants').doc(tid).collection('contracts').doc(contractId);
    const cSnap = await cRef.get();
    if (!cSnap.exists) continue;
    const c = cSnap.data();
    if (c.nextScheduledDate || c.lastServiceDate) continue; // ya tiene estado de cadencia
    const nexts = eqs.map((e) => e.nextScheduledDate).filter(Boolean).sort();
    const lasts = eqs.map((e) => e.lastServiceDate).filter(Boolean).sort();
    const patch = {};
    if (nexts.length) patch.nextScheduledDate = nexts[0];
    if (lasts.length) patch.lastServiceDate = lasts[lasts.length - 1];
    if (Object.keys(patch).length) {
      patch.updatedAt = now();
      if (DRY) console.log(`  [dry] contract ${c.num || contractId} cadence ←`, patch);
      else { await cRef.set(patch, { merge: true }); contractsSeeded++; }
    }
  }
  return { backfilled, deleted, contractsSeeded };
}

async function main() {
  console.log(`Migración multi-equipo ${DRY ? '(DRY-RUN)' : ''} proyecto=${projectId}`);
  const tenants = await db.collection('tenants').get();
  const ids = tenants.empty ? [process.env.TENANT_ID || 'aditum'] : tenants.docs.map((d) => d.id);
  let tot = { backfilled: 0, deleted: 0, contractsSeeded: 0 };
  for (const tid of ids) {
    console.log(`\nTenant ${tid}:`);
    const r = await migrateTenant(tid);
    tot.backfilled += r.backfilled; tot.deleted += r.deleted; tot.contractsSeeded += r.contractsSeeded;
    console.log(`  backfill=${r.backfilled} borradas=${r.deleted} contratos=${r.contractsSeeded}`);
  }
  console.log(`\nListo. backfill=${tot.backfilled}, PROGRAMADA legacy borradas=${tot.deleted}, contratos sembrados=${tot.contractsSeeded}.${DRY ? ' (dry-run)' : ''}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
