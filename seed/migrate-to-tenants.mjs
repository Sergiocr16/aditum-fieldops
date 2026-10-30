/* ⚠ PRODUCCIÓN: NO usar este script. Usar seed/migrate-prod-to-service-orders.mjs, que hace este paso
   con respaldo previo, sin sobrescribir datos existentes, sin disparar correos/inventario (guardas de
   migración en los triggers) y re-apuntando los links públicos /p/ a la orden de servicio. */
/* © 2026 Aditum — Aditum FieldOps — migración single-tenant → multi-tenant.
   Mueve los datos top-level al tenant inicial (subcolecciones tenants/{tid}/...),
   agrega tenantId a users y claims, y crea publicTokens para los share.token
   existentes (los links /p/:token vigentes siguen funcionando).

   Usage:
     # Dry-run (no escribe nada):
     FIREBASE_SERVICE_ACCOUNT=../secrets/service-account.json FIREBASE_PROJECT_ID=fieldops-aditum \
       node migrate-to-tenants.mjs --dry-run
     # Migración real:
     FIREBASE_SERVICE_ACCOUNT=... FIREBASE_PROJECT_ID=fieldops-aditum node migrate-to-tenants.mjs
     # Purga de colecciones viejas (días después, tras validar):
     FIREBASE_SERVICE_ACCOUNT=... FIREBASE_PROJECT_ID=fieldops-aditum node migrate-to-tenants.mjs --purge

   Idempotente: copia con los mismos IDs (re-ejecutar sobreescribe idéntico). */
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
const auth = admin.auth();

const TENANT_ID = process.env.TENANT_ID || 'aditum';
const DRY = process.argv.includes('--dry-run');
const PURGE = process.argv.includes('--purge');
const COLLECTIONS = ['tickets', 'counters', 'wikiCategories', 'wikiPages', 'inventory', 'inventoryMovements'];

const now = () => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t)?.value || '';
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`;
};

const tcol = (name) => db.collection('tenants').doc(TENANT_ID).collection(name);

async function copyCollection(name) {
  const src = await db.collection(name).get();
  if (src.empty) {
    console.log(`  ${name}: vacía, nada que copiar`);
    return;
  }
  let batch = db.batch();
  let ops = 0;
  for (const d of src.docs) {
    batch.set(tcol(name).doc(d.id), d.data());
    if (++ops >= 400) {
      if (!DRY) await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0 && !DRY) await batch.commit();
  const dst = DRY ? { size: '(dry)' } : await tcol(name).get();
  console.log(`  ${name}: ${src.size} docs → tenants/${TENANT_ID}/${name} (${dst.size})`);
  if (!DRY && dst.size < src.size) throw new Error(`Conteo no coincide en ${name}: ${src.size} vs ${dst.size}`);
}

async function purgeCollection(name) {
  const src = await db.collection(name).get();
  let batch = db.batch();
  let ops = 0;
  for (const d of src.docs) {
    batch.delete(d.ref);
    if (++ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  console.log(`  ${name}: ${src.size} docs eliminados (top-level)`);
}

async function main() {
  console.log(`${DRY ? '[DRY-RUN] ' : ''}Migración a tenants/${TENANT_ID} — proyecto ${projectId}\n`);

  if (PURGE) {
    console.log('PURGA de colecciones top-level viejas:');
    for (const c of COLLECTIONS) await purgeCollection(c);
    console.log('\nPurga completa.');
    return;
  }

  // 1) tenant raíz
  console.log('1) Tenant raíz');
  if (!DRY) {
    await db.collection('tenants').doc(TENANT_ID).set({
      name: 'Aditum',
      active: true,
      branding: { appName: 'Aditum Service', logoUrl: '', primaryColor: '#002A42', accentColor: '#DEB66E' },
      numbering: { ticketPrefix: 'AD', contractPrefix: 'CT', osPrefix: 'OS' },
      notifyEmail: process.env.ADMIN_NOTIFY_EMAIL || 'partners@aditumcr.com',
      smtpStatus: 'unset',
      createdAt: now(),
      updatedAt: now(),
    }, { merge: true });
  }
  console.log(`  ✓ tenants/${TENANT_ID}`);

  // 2) copiar colecciones
  console.log('2) Copia de colecciones');
  for (const c of COLLECTIONS) await copyCollection(c);

  // 3) users += tenantId
  console.log('3) users.tenantId');
  const users = await db.collection('users').get();
  let updated = 0;
  for (const d of users.docs) {
    const u = d.data();
    if (u.role === 'superadmin') continue;
    if (u.tenantId === TENANT_ID) continue;
    if (!DRY) await d.ref.set({ tenantId: TENANT_ID, updatedAt: now() }, { merge: true });
    updated++;
  }
  console.log(`  ✓ ${updated}/${users.size} users actualizados`);

  // 4) claims con tenantId
  console.log('4) Auth claims');
  let pageToken = undefined;
  let claimed = 0;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) {
      const claims = u.customClaims || {};
      if (claims.role === 'superadmin') continue;
      if (claims.tenantId === TENANT_ID) continue;
      const role = claims.role || 'tech';
      if (!DRY) await auth.setCustomUserClaims(u.uid, { role, tenantId: TENANT_ID });
      claimed++;
    }
    pageToken = page.pageToken;
  } while (pageToken);
  console.log(`  ✓ ${claimed} usuarios re-claimed (deberán re-loguear)`);

  // 5) publicTokens para share.token existentes
  console.log('5) publicTokens (links públicos vigentes)');
  const ticketsSnap = DRY ? await db.collection('tickets').get() : await tcol('tickets').get();
  let tokens = 0;
  for (const d of ticketsSnap.docs) {
    const t = d.data();
    const sh = t.share || {};
    if (!sh.token) continue;
    if (!DRY) {
      await db.collection('publicTokens').doc(sh.token).set({
        tenantId: TENANT_ID,
        purpose: 'ticket_share',
        targetId: d.id,
        active: sh.active !== false,
        singleUse: false,
        usedAt: null,
        invalidatedAt: sh.active === false ? now() : null,
        expiresAt: sh.expiresAt || null,
        createdAt: sh.created || now(),
        migrated: true,
      }, { merge: true });
    }
    tokens++;
  }
  console.log(`  ✓ ${tokens} tokens migrados`);

  console.log(`\n${DRY ? '[DRY-RUN] sin escrituras. ' : ''}Migración completa.`);
  console.log('Siguientes pasos: deploy de rules+functions+hosting, smoke test, re-login de usuarios.');
  console.log('La purga de colecciones viejas se corre días después con --purge.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
