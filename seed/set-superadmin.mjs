/* © 2026 Aditum — Aditum FieldOps — bootstrap superadmin (one-off).
   Usage:
     # Production:
     FIREBASE_SERVICE_ACCOUNT=../secrets/service-account.json FIREBASE_PROJECT_ID=fieldops-aditum \
       SUPERADMIN_EMAIL=partners@aditumcr.com node set-superadmin.mjs
     # Emulators:
     FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
       FIREBASE_PROJECT_ID=demo-aditum-fieldops SUPERADMIN_EMAIL=super@aditumcr.com node set-superadmin.mjs

   The target user must already exist in Auth (or pass SUPERADMIN_PASSWORD to create it). */
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

const email = process.env.SUPERADMIN_EMAIL;
if (!email) {
  console.error('SUPERADMIN_EMAIL es requerido');
  process.exit(1);
}

const now = () => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t)?.value || '';
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`;
};

async function main() {
  const auth = admin.auth();
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch {
    const pass = process.env.SUPERADMIN_PASSWORD;
    if (!pass) {
      console.error(`El usuario ${email} no existe. Pasá SUPERADMIN_PASSWORD para crearlo.`);
      process.exit(1);
    }
    user = await auth.createUser({ email, password: pass, displayName: 'Super Admin' });
    console.log(`✓ Usuario creado: ${email}`);
  }
  await auth.setCustomUserClaims(user.uid, { role: 'superadmin' });
  await admin.firestore().collection('users').doc(user.uid).set(
    { name: user.displayName || 'Super Admin', email, role: 'superadmin', tenantId: null, active: true, initials: 'SA', updatedAt: now() },
    { merge: true }
  );
  console.log(`✓ Superadmin: ${email} (uid ${user.uid})`);
  console.log('  El usuario debe cerrar sesión y volver a entrar para refrescar sus claims.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
