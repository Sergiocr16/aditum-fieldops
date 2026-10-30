/* © 2026 Aditum — Aditum FieldOps — migración de PRODUCCIÓN (modelo viejo → órdenes de servicio).

   Reemplaza correr a mano migrate-to-tenants.mjs + migrate-tickets-to-orders.mjs. Convierte TODO lo
   que hay en el modelo viejo (single-tenant, colección `tickets` top-level) al modelo nuevo:

     1. Respaldo JSON completo (Firestore top-level + subcolecciones + usuarios de Auth) en
        secrets/backups/ ANTES de escribir nada.
     2. Tenant raíz `tenants/{TENANT}` (si no existe).
     3. Copia de cada colección top-level (tickets, counters, wiki, inventario, movimientos y
        cualquier otra que exista) a `tenants/{TENANT}/...`, mismos ids.
     4. Cada ticket → `tenants/{TENANT}/serviceOrders/{mismo id}` como orden POR DEMANDA, conservando
        número (AD-####), evidencia, visitas, checklist, comentarios, aprobación, materiales,
        historial y CUALQUIER otro campo del ticket (se copian todos; los que cambian de forma
        quedan además en `legacy`).
     5. Links públicos: cada `share.token` → `publicTokens/{token}` (purpose so_report → la orden).
        /p/:token y /r/:token muestran el reporte de la orden de servicio en vivo.
     6. Numeración: las órdenes nuevas siguen la secuencia AD-#### (configurable con --os-prefix).
     7. users.tenantId + custom claims {role, tenantId} (solo usuarios con doc en `users`).
     8. Verificación campo por campo. Sale con código 1 si algo no cuadra.

   REPARACIÓN DE VIDEOS: la compresión vieja (onEvidenceFinalized de main) a veces terminaba antes de que
   el cliente registrara la evidencia → la evidencia quedaba 'processing' apuntando al ORIGINAL, que la
   función ya había borrado (URL rota, HTTP 403). Si existe `tickets/{id}/compressed/{evidenceId}.mp4`,
   la orden migrada apunta a ese archivo (status 'ready') y guarda el valor viejo en `repairedFrom`.
   Las evidencias cuyo archivo no existe en ningún lado se reportan como advertencia.

   GARANTÍAS
   - No borra NADA: los `tickets` top-level y la copia `tenants/{T}/tickets` quedan intactos
     (los videos/fotos siguen en sus mismas rutas de Storage y con sus mismas URLs).
   - Solo crea lo que falta: si un doc destino ya existe NO se sobrescribe (re-correr es seguro y no
     pisa trabajo hecho después de la migración).
   - No dispara efectos: cada escritura lleva `migration.runId`; los triggers onServiceOrderWritten
     / onTicketWritten ignoran esas escrituras (sin correos, sin rebaja de inventario, sin
     facturación, sin links nuevos). Órdenes ya terminadas quedan con materialsApplied=true para
     que una edición futura nunca rebaje inventario histórico.

   USO (desde seed/):
     # 1) Dry-run contra producción (solo lee; muestra qué haría):
     FIREBASE_SERVICE_ACCOUNT=../secrets/service-account.json FIREBASE_PROJECT_ID=fieldops-aditum \
       node migrate-prod-to-service-orders.mjs --dry-run
     # 2) Migración real (hace el respaldo primero):
     FIREBASE_SERVICE_ACCOUNT=../secrets/service-account.json FIREBASE_PROJECT_ID=fieldops-aditum \
       node migrate-prod-to-service-orders.mjs
     # 3) Solo verificar (lee y compara; no escribe):
     ... node migrate-prod-to-service-orders.mjs --verify-only
     # Emulador:
     FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
       FIREBASE_PROJECT_ID=demo-aditum-fieldops node migrate-prod-to-service-orders.mjs

   Flags: --dry-run · --verify-only · --skip-backup · --tenant=aditum · --os-prefix=AD
          --backup-dir=../secrets/backups · --public-base=https://fieldops-aditum.web.app
*/
import admin from 'firebase-admin';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { isDeepStrictEqual } from 'util';
import path from 'path';

/* ---------------- config ---------------- */
const arg = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};
const DRY = process.argv.includes('--dry-run');
const VERIFY_ONLY = process.argv.includes('--verify-only');
const SKIP_BACKUP = process.argv.includes('--skip-backup');
const TENANT_ID = arg('tenant', process.env.TENANT_ID || 'aditum');
const OS_PREFIX = arg('os-prefix', 'AD');
const TICKET_PREFIX = 'AD';
const BACKUP_DIR = arg('backup-dir', '../secrets/backups');
const PUBLIC_BASE = arg('public-base', process.env.PUBLIC_BASE_URL || 'https://fieldops-aditum.web.app');
/** Colecciones top-level que en el modelo nuevo siguen siendo GLOBALES (no se copian al tenant). */
const GLOBAL_COLLECTIONS = new Set(['users', 'tenants', 'publicTokens', 'mcpApiKeys']);

const projectId = process.env.FIREBASE_PROJECT_ID || 'fieldops-aditum';
const saPath = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (saPath && !process.env.FIRESTORE_EMULATOR_HOST) {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(saPath, 'utf8'))), projectId });
} else {
  admin.initializeApp({ projectId });
}
const db = admin.firestore();
const auth = admin.auth();
const BUCKET = arg('bucket', process.env.FIREBASE_STORAGE_BUCKET || (process.env.FIRESTORE_EMULATOR_HOST ? `${projectId}.appspot.com` : 'fieldops-aditum.firebasestorage.app'));
const bucket = admin.storage().bucket(BUCKET);
const STORAGE_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST ? `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}` : 'https://firebasestorage.googleapis.com';
const downloadUrl = (p, token) => `${STORAGE_HOST}/v0/b/${BUCKET}/o/${encodeURIComponent(p)}?alt=media&token=${token}`;

const nowCR = () => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t)?.value || '';
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`;
};
const RUN_ID = `mig-${Date.now()}`;
const STAMP = { runId: RUN_ID, at: nowCR(), by: 'migrate-prod-to-service-orders' };
const tenant = db.collection('tenants').doc(TENANT_ID);
const tcol = (name) => tenant.collection(name);

const stats = { copied: {}, skipped: {}, orders: 0, ordersSkipped: 0, tokens: 0, tokensSkipped: 0, users: 0, claims: 0 };
const errors = [];
const warnings = [];
const W = (s) => { warnings.push(s); console.log('  ⚠ ' + s); };
const E = (s) => { errors.push(s); console.log('  ✗ ' + s); };

/* ---------------- 1) respaldo ---------------- */
async function dumpCollection(ref) {
  const out = {};
  const snap = await ref.get();
  for (const d of snap.docs) {
    const subs = await d.ref.listCollections();
    const entry = { data: d.data() };
    if (subs.length) {
      entry.subcollections = {};
      for (const s of subs) entry.subcollections[s.id] = await dumpCollection(s);
    }
    out[d.id] = entry;
  }
  return out;
}

async function backup() {
  console.log('1) Respaldo');
  const cols = await db.listCollections();
  const firestore = {};
  for (const c of cols) firestore[c.id] = await dumpCollection(c);
  const users = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) users.push({ uid: u.uid, email: u.email, displayName: u.displayName, disabled: u.disabled, customClaims: u.customClaims || null, metadata: u.metadata });
    pageToken = page.pageToken;
  } while (pageToken);
  mkdirSync(BACKUP_DIR, { recursive: true });
  const file = path.join(BACKUP_DIR, `firestore-${projectId}-${RUN_ID}.json`);
  // Timestamps de Firestore se serializan como {_seconds,_nanoseconds}.
  writeFileSync(file, JSON.stringify({ projectId, runId: RUN_ID, at: STAMP.at, firestore, authUsers: users }, null, 1));
  const counts = Object.fromEntries(Object.entries(firestore).map(([k, v]) => [k, Object.keys(v).length]));
  console.log(`  ✓ ${file}`);
  console.log('  colecciones:', JSON.stringify(counts), `· usuarios Auth: ${users.length}`);
  return file;
}

/* ---------------- 2) tenant ---------------- */
async function ensureTenant() {
  console.log(`2) Tenant tenants/${TENANT_ID}`);
  const snap = await tenant.get();
  if (snap.exists) {
    const n = snap.data().numbering || {};
    console.log(`  = ya existe (numeración actual: ticket=${n.ticketPrefix || '-'} os=${n.osPrefix || '-'}); no se modifica`);
    return;
  }
  const doc = {
    name: 'Aditum',
    active: true,
    branding: { appName: 'Aditum Service', logoUrl: '', primaryColor: '#002A42', accentColor: '#DEB66E' },
    numbering: { ticketPrefix: TICKET_PREFIX, contractPrefix: 'CT', osPrefix: OS_PREFIX },
    notifyEmail: process.env.ADMIN_NOTIFY_EMAIL || 'partners@aditumcr.com',
    smtpStatus: 'unset',
    createdAt: nowCR(),
    updatedAt: nowCR(),
    migration: STAMP,
  };
  if (!DRY) await tenant.create(doc);
  console.log(`  + creado (órdenes nuevas: ${OS_PREFIX}-####)`);
}

/* ---------------- 3) copia de colecciones (solo crea faltantes, recursivo) ---------------- */
async function copyCollection(src, dst, label, stampTickets) {
  const snap = await src.get();
  const existing = new Set((await dst.select().get()).docs.map((d) => d.id));
  let batch = db.batch();
  let ops = 0;
  let copied = 0;
  let skipped = 0;
  for (const d of snap.docs) {
    if (existing.has(d.id)) {
      skipped++;
    } else {
      const data = stampTickets ? { ...d.data(), migration: STAMP } : d.data();
      batch.create(dst.doc(d.id), data);
      copied++;
      if (++ops >= 400) {
        if (!DRY) await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
    for (const sub of await d.ref.listCollections()) {
      await copyCollection(sub, dst.doc(d.id).collection(sub.id), `${label}/${d.id}/${sub.id}`, false);
    }
  }
  if (ops > 0 && !DRY) await batch.commit();
  stats.copied[label] = (stats.copied[label] || 0) + copied;
  stats.skipped[label] = (stats.skipped[label] || 0) + skipped;
  console.log(`  ${label}: ${snap.size} docs → copiados ${copied}${skipped ? `, ya existían ${skipped} (no se tocan)` : ''}`);
}

async function copyAll() {
  console.log(`3) Copia de colecciones top-level → tenants/${TENANT_ID}/...`);
  const cols = (await db.listCollections()).filter((c) => !GLOBAL_COLLECTIONS.has(c.id));
  for (const c of cols) await copyCollection(c, tcol(c.id), c.id, c.id === 'tickets');
  return cols.map((c) => c.id);
}

/* ---------------- 4) tickets → serviceOrders (demanda) ---------------- */
const FINAL = new Set(['PENDIENTE_FACTURAR', 'FACTURADA', 'CERRADA']);

function mapStatus(t) {
  switch (t.status) {
    case 'pendiente':
    case 'asignado': return 'PROGRAMADA';
    case 'en_proceso':
    case 'rechazado': return 'EN_PROGRESO'; // devuelta al técnico para corregir
    case 'listo_revision': return 'EN_REVISION';
    case 'aprobado': return t.requiresInvoice && !t.billingApplied ? 'PENDIENTE_FACTURAR' : 'CERRADA';
    case 'cerrado': return t.invoiced || t.billingApplied ? 'FACTURADA' : 'CERRADA';
    default: return 'PROGRAMADA';
  }
}

/* Índice de Storage (solo nombres + metadata) para validar/reparar referencias de evidencia. */
let storageIndex = null;
async function loadStorageIndex() {
  if (storageIndex) return storageIndex;
  storageIndex = new Map();
  try {
    const [files] = await bucket.getFiles({ prefix: 'tickets/' });
    for (const f of files) storageIndex.set(f.name, f.metadata || {});
    console.log(`  Storage ${BUCKET}: ${storageIndex.size} archivos bajo tickets/`);
  } catch (e) {
    W(`no se pudo listar Storage (${e.message}); se omite la validación/reparación de evidencia`);
    storageIndex = null;
  }
  return storageIndex;
}

/** Devuelve la evidencia reparada (o igual) + diagnóstico. */
function repairEvidence(ticketId, num, list) {
  if (!storageIndex) return list;
  return (list || []).map((e) => {
    if (!e?.path || storageIndex.has(e.path)) return e;
    const comp = `tickets/${ticketId}/compressed/${e.id}.mp4`;
    const meta = storageIndex.get(comp);
    const token = meta?.metadata?.firebaseStorageDownloadTokens?.split(',')[0];
    if (meta && token) {
      stats.repaired = (stats.repaired || 0) + 1;
      console.log(`  ↻ ${num}: video ${e.id} reparado → ${comp}`);
      return { ...e, file: downloadUrl(comp, token), path: comp, status: 'ready', size: Number(meta.size) || e.size, repairedFrom: { file: e.file ?? null, path: e.path, status: e.status ?? null } };
    }
    W(`${num}: evidencia ${e.id} (${e.type}) no tiene archivo en Storage (${e.path}) y no hay versión comprimida`);
    return e;
  });
}

/** Campos que la orden redefine (el resto del ticket se copia tal cual). */
const OVERRIDDEN = new Set([
  'type', 'mode', 'status', 'client', 'contractId', 'equipmentId', 'equipmentSnapshot', 'planDate', 'scheduledDate',
  'scheduledTime', 'durationMin', 'skipNotice', 'notify', 'hold', 'checklistTemplateId', 'checklistTemplateVersion',
  'reportShare', 'requiresReview', 'cadenceApplied', 'materialsApplied', 'history', 'startedAt', 'finishedAt',
  'notes', 'techObs', 'migratedFromTicket', 'migration', 'legacy', 'id',
]);

function ticketToOrder(id, t) {
  const status = mapStatus(t);
  const share = t.share || {};
  const created = typeof t.created === 'string' ? t.created : '';
  const date = (t.scheduled || created.slice(0, 10) || nowCR().slice(0, 10)).slice(0, 10);
  const startedAt = (t.history || []).find((h) => h.status === 'en_proceso')?.at || null;
  const isFinal = FINAL.has(status);
  const { id: _drop, ...rest } = t;
  return {
    // 1) TODO el ticket tal cual (evidencia, visitas, checklist, comentarios, aprobación, materiales,
    //    briefing, techNote/techObs, deadline, share, fechas, createdBy, etc.)
    ...rest,
    // 2) forma de orden de servicio por demanda
    type: 'correctivo',
    mode: 'demanda',
    status,
    client: { name: typeof t.client === 'string' ? t.client : t.client?.name || '', email: t.client?.email || '', phone: t.client?.phone || '' },
    contractId: null,
    equipmentId: null,
    equipmentSnapshot: null,
    planDate: date,
    scheduledDate: date,
    scheduledTime: '08:00',
    durationMin: 60,
    skipNotice: true,
    notify: { noticeDaysBefore: 3, noticeDate: date, noticeSentAt: null, reminderSentAt: null, confirmedAt: null, confirmedVia: null, rescheduleCount: 0, tokens: { confirm: null, reschedule: null } },
    hold: null,
    checklistTemplateId: null,
    checklistTemplateVersion: null,
    checklist: t.checklist || [],
    photos: t.photos || [],
    evidence: repairEvidence(id, t.num, t.evidence || []),
    visits: t.visits || [],
    comments: t.comments || [],
    materials: t.materials || [],
    signature: t.signature || null,
    startedAt,
    finishedAt: t.readyAt || null,
    notes: t.notes || (t.deadline ? `Fecha límite: ${t.deadline}` : ''),
    techObs: t.techObs || t.techNote || '',
    reportShare: share.token
      ? { active: share.active !== false, token: share.token, url: `${PUBLIC_BASE}/r/${share.token}`, created: share.created || null, lastVisit: share.lastVisit || null }
      : { active: false, token: null, url: null, created: null, lastVisit: null },
    requiresReview: true,
    requiresInvoice: !!t.requiresInvoice,
    billingApplied: !!t.billingApplied,
    // Órdenes ya terminadas: el inventario se manejó (o no) en el sistema viejo; nunca re-rebajar.
    materialsApplied: isFinal ? true : !!t.materialsApplied,
    cadenceApplied: true,
    history: [...(t.history || []), { status, at: STAMP.at, by: 'migración', note: `Migrada desde orden de trabajo ${t.num || id} (estado: ${t.status || '—'})` }],
    created: t.created || STAMP.at,
    createdBy: t.createdBy || 'migración',
    migratedFromTicket: id,
    migration: STAMP,
    // Valores originales de los campos que cambian de forma (para auditoría / reversa).
    legacy: {
      status: t.status ?? null,
      client: t.client ?? null,
      share: t.share ?? null,
      materialsApplied: t.materialsApplied ?? null,
      scheduled: t.scheduled ?? null,
      notes: t.notes ?? null,
      techObs: t.techObs ?? null,
    },
  };
}

async function migrateTickets() {
  console.log(`4) tickets → tenants/${TENANT_ID}/serviceOrders (por demanda)`);
  await loadStorageIndex();
  const src = await db.collection('tickets').get();
  const byStatus = {};
  for (const d of src.docs) {
    const t = d.data();
    const order = ticketToOrder(d.id, t);
    const dest = tcol('serviceOrders').doc(d.id);
    const cur = await dest.get();
    if (cur.exists) {
      if (cur.data().migratedFromTicket === d.id) { stats.ordersSkipped++; continue; }
      E(`serviceOrders/${d.id} ya existe y NO viene de este ticket (${t.num}); revisar a mano`);
      continue;
    }
    const sz = Buffer.byteLength(JSON.stringify(order));
    if (sz > 900_000) { E(`${t.num}: la orden pesaría ${sz} bytes (límite Firestore 1MB)`); continue; }
    if (!DRY) await dest.create(order);
    stats.orders++;
    byStatus[`${t.status}→${order.status}`] = (byStatus[`${t.status}→${order.status}`] || 0) + 1;
  }
  console.log(`  ✓ ${stats.orders} órdenes creadas${stats.ordersSkipped ? `, ${stats.ordersSkipped} ya migradas antes` : ''} de ${src.size} tickets${stats.repaired ? ` · ${stats.repaired} videos rotos reparados` : ''}`);
  console.log('  estados:', JSON.stringify(byStatus));
}

/* ---------------- 5) links públicos ---------------- */
async function migrateTokens() {
  console.log('5) Links públicos (/p/:token → reporte de la orden)');
  const src = await db.collection('tickets').get();
  for (const d of src.docs) {
    const sh = d.data().share || {};
    if (!sh.token) continue;
    const ref = db.collection('publicTokens').doc(sh.token);
    const cur = await ref.get();
    if (cur.exists) {
      const c = cur.data();
      if (c.targetId !== d.id || c.tenantId !== TENANT_ID) { E(`publicTokens/${sh.token.slice(0, 8)}… apunta a otro destino (${c.tenantId}/${c.targetId})`); continue; }
      if (c.purpose === 'so_report') { stats.tokensSkipped++; continue; }
      // token de la migración vieja (ticket_share) → re-apuntar a la orden
      if (!DRY) await ref.set({ purpose: 'so_report', migration: STAMP }, { merge: true });
      stats.tokens++;
      continue;
    }
    if (!DRY) {
      await ref.create({
        tenantId: TENANT_ID,
        purpose: 'so_report',
        targetId: d.id,
        active: sh.active !== false,
        singleUse: false,
        usedAt: null,
        invalidatedAt: sh.active === false ? nowCR() : null,
        expiresAt: sh.expiresAt || null,
        createdAt: sh.created || nowCR(),
        lastVisit: sh.lastVisit || null,
        migratedFrom: 'ticket_share',
        migration: STAMP,
      });
    }
    stats.tokens++;
  }
  console.log(`  ✓ ${stats.tokens} tokens${stats.tokensSkipped ? `, ${stats.tokensSkipped} ya estaban` : ''}`);
}

/* ---------------- 6) numeración ---------------- */
function numValue(num) {
  const m = /-(\d+)$/.exec(num || '');
  return m ? Number(m[1]) : 0;
}
async function seedCounter() {
  console.log('6) Numeración de órdenes');
  const t = await tenant.get();
  const osPrefix = (t.exists && t.data().numbering?.osPrefix) || OS_PREFIX;
  const ticketPrefix = (t.exists && t.data().numbering?.ticketPrefix) || TICKET_PREFIX;
  const tc = await db.collection('counters').doc('tickets').get();
  const tickets = await db.collection('tickets').select('num').get();
  const maxNum = Math.max(0, tc.exists ? Number(tc.data().value || 0) : 0, ...tickets.docs.map((d) => numValue(d.data().num)));
  const ref = tcol('counters').doc('serviceOrders');
  const cur = await ref.get();
  const curVal = cur.exists ? Number(cur.data().value || 0) : 0;
  if (osPrefix !== ticketPrefix) {
    console.log(`  = prefijos distintos (${ticketPrefix} vs ${osPrefix}): sin colisión; órdenes nuevas desde ${osPrefix}-${Math.max(curVal, 1000) + 1}`);
    return;
  }
  if (curVal >= maxNum) { console.log(`  = contador ya en ${curVal} (próxima ${osPrefix}-${curVal + 1})`); return; }
  if (!DRY) await ref.set({ value: maxNum, migration: STAMP }, { merge: true });
  console.log(`  ✓ counters/serviceOrders = ${maxNum} → la próxima orden será ${osPrefix}-${maxNum + 1}`);
}

/* ---------------- 7) usuarios ---------------- */
async function migrateUsers() {
  console.log('7) Usuarios (tenantId + claims)');
  const users = await db.collection('users').get();
  for (const d of users.docs) {
    const u = d.data();
    if (u.role === 'superadmin') continue;
    if (u.tenantId && u.tenantId !== TENANT_ID) { W(`users/${d.id} (${u.email}) pertenece a otro tenant (${u.tenantId}); no se toca`); continue; }
    if (!u.tenantId) {
      if (!DRY) await d.ref.set({ tenantId: TENANT_ID, updatedAt: nowCR() }, { merge: true });
      stats.users++;
    }
    let rec;
    try { rec = await auth.getUser(d.id); } catch { W(`users/${d.id} (${u.email}) no existe en Auth`); continue; }
    const claims = rec.customClaims || {};
    if (claims.role === 'superadmin') continue;
    const role = claims.role || u.role;
    if (!role) { W(`${u.email}: sin rol en claims ni en users; no se asignan claims`); continue; }
    if (claims.tenantId === TENANT_ID && claims.role === role) continue;
    if (!DRY) await auth.setCustomUserClaims(d.id, { ...claims, role, tenantId: TENANT_ID });
    stats.claims++;
  }
  // Auth sin doc users: no se les da acceso (evita convertir cuentas sueltas en técnicos).
  let pageToken;
  const docIds = new Set(users.docs.map((d) => d.id));
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const r of page.users) if (!docIds.has(r.uid) && (r.customClaims || {}).role !== 'superadmin') W(`Auth ${r.email || r.uid} no tiene doc en users; no se migra`);
    pageToken = page.pageToken;
  } while (pageToken);
  console.log(`  ✓ users.tenantId: ${stats.users} · claims actualizados: ${stats.claims} (deben volver a iniciar sesión)`);
}

/* ---------------- 8) verificación ---------------- */
async function verify(copiedCols) {
  console.log('8) Verificación');
  let checked = 0;
  // 8a) copias top-level → tenant
  for (const c of copiedCols) {
    const src = await db.collection(c).get();
    for (const d of src.docs) {
      const dst = await tcol(c).doc(d.id).get();
      checked++;
      if (!dst.exists) { E(`falta tenants/${TENANT_ID}/${c}/${d.id}`); continue; }
      const { migration: _m, ...dd } = dst.data();
      if (!isDeepStrictEqual(dd, d.data())) W(`tenants/${TENANT_ID}/${c}/${d.id} difiere del original (¿editado después de migrar?)`);
    }
  }
  // 8b) tickets → órdenes: todos los campos presentes
  const tickets = await db.collection('tickets').get();
  for (const d of tickets.docs) {
    const t = d.data();
    const o = (await tcol('serviceOrders').doc(d.id).get()).data();
    checked++;
    if (!o) { E(`falta la orden de ${t.num} (${d.id})`); continue; }
    if (o.migratedFromTicket !== d.id) { E(`serviceOrders/${d.id} no proviene del ticket ${t.num}`); continue; }
    if (o.num !== t.num) E(`${t.num}: número distinto en la orden (${o.num})`);
    for (const [k, v0] of Object.entries(t)) {
      if (OVERRIDDEN.has(k)) continue;
      let v = v0;
      if (k === 'evidence' && Array.isArray(o.evidence)) {
        // evidencia reparada: se compara restaurando los valores originales guardados en repairedFrom
        o.evidence = o.evidence.map((e) => {
          if (!e?.repairedFrom) return e;
          const { repairedFrom: r, ...rest } = e;
          const back = { ...rest, file: r.file, path: r.path, status: r.status };
          const orig = (v0 || []).find((x) => x.id === e.id);
          if (orig && 'size' in orig) back.size = orig.size; else delete back.size;
          if (r.file === null && !(orig && 'file' in orig)) delete back.file;
          if (r.status === null && !(orig && 'status' in orig)) delete back.status;
          return back;
        });
      }
      if (!isDeepStrictEqual(o[k], v)) {
        // listas: la orden puede tener MÁS elementos (trabajo nuevo), nunca menos.
        if (Array.isArray(v) && Array.isArray(o[k]) && o[k].length >= v.length && v.every((x, i) => isDeepStrictEqual(o[k][i], x))) continue;
        W(`${t.num}: campo "${k}" distinto en la orden (¿editado después de migrar?)`);
      }
    }
    const hist = o.history || [];
    if (!(t.history || []).every((h, i) => isDeepStrictEqual(hist[i], h))) E(`${t.num}: el historial original no se conservó`);
    if (o.legacy?.status !== (t.status ?? null)) E(`${t.num}: legacy.status no coincide`);
    if (typeof t.client === 'string' && o.client?.name !== t.client) E(`${t.num}: cliente distinto (${o.client?.name} vs ${t.client})`);
    const sh = t.share || {};
    if (sh.token) {
      const tk = (await db.collection('publicTokens').doc(sh.token).get()).data();
      if (!tk) E(`${t.num}: falta el token público del link /p/`);
      else {
        if (tk.targetId !== d.id || tk.tenantId !== TENANT_ID) E(`${t.num}: token público apunta a otro destino`);
        if (!['so_report', 'ticket_share'].includes(tk.purpose)) E(`${t.num}: token con purpose ${tk.purpose}`);
        if (tk.active !== (sh.active !== false)) W(`${t.num}: token activo=${tk.active} pero el link original activo=${sh.active !== false}`);
      }
    }
  }
  // 8c) usuarios
  const users = await db.collection('users').get();
  for (const d of users.docs) {
    const u = d.data();
    if (u.role === 'superadmin') continue;
    checked++;
    if (u.tenantId !== TENANT_ID) { E(`users/${d.id} (${u.email}) sin tenantId=${TENANT_ID}`); continue; }
    try {
      const c = (await auth.getUser(d.id)).customClaims || {};
      if (c.tenantId !== TENANT_ID || !c.role) E(`${u.email}: claims incompletos ${JSON.stringify(c)}`);
    } catch { /* ya advertido */ }
  }
  console.log(`  ${checked} verificaciones · ${errors.length} errores · ${warnings.length} advertencias`);
}

/* ---------------- main ---------------- */
async function main() {
  console.log(`${DRY ? '[DRY-RUN] ' : ''}${VERIFY_ONLY ? '[VERIFY-ONLY] ' : ''}Migración → órdenes de servicio · proyecto=${projectId} · tenant=${TENANT_ID} · run=${RUN_ID}\n`);
  if (VERIFY_ONLY) {
    const cols = (await db.listCollections()).map((c) => c.id).filter((c) => !GLOBAL_COLLECTIONS.has(c));
    await verify(cols);
  } else {
    if (!SKIP_BACKUP) await backup();
    else console.log('1) Respaldo OMITIDO (--skip-backup)');
    await ensureTenant();
    const cols = await copyAll();
    await migrateTickets();
    await migrateTokens();
    await seedCounter();
    await migrateUsers();
    if (DRY) console.log('\n8) Verificación omitida en dry-run (no hay escrituras que verificar).');
    else await verify(cols);
  }
  console.log(`\n${errors.length ? '✗ TERMINÓ CON ERRORES' : '✓ OK'}${DRY ? ' (dry-run: no se escribió nada)' : ''}`);
  if (errors.length) errors.forEach((e) => console.log('  - ' + e));
  process.exit(errors.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
