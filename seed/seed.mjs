/* © 2026 Aditum — Aditum FieldOps — seed admin + demo data.
   Usage:
     # Against emulators:
     FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
       FIREBASE_PROJECT_ID=aditum-fieldops node seed.mjs
     # Against production:
     FIREBASE_SERVICE_ACCOUNT=../secrets/service-account.json FIREBASE_PROJECT_ID=<id> node seed.mjs
*/
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { randomBytes } from 'crypto';

const projectId = process.env.FIREBASE_PROJECT_ID || 'aditum-fieldops';
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
const tcol = (name) => db.collection('tenants').doc(TENANT_ID).collection(name);

// Seguridad: contra un proyecto que NO sea demo/emulador, exigir --force para
// evitar correr el seed (con credenciales conocidas) contra producción por error.
const IS_EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;
const IS_DEMO = projectId.startsWith('demo-');
if (!IS_EMULATOR && !IS_DEMO && !process.argv.includes('--force')) {
  console.error(`✗ Negado: '${projectId}' no es un proyecto demo/emulador. Usá --force si realmente querés sembrar aquí.`);
  process.exit(1);
}

// Contraseñas: si no se pasan por env, se generan aleatorias (no defaults fijos).
const genPass = () => 'Ad-' + randomBytes(9).toString('base64url') + '!';

const initials = (n) => n.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
const now = () => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t)?.value || '';
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`;
};

async function ensureUser(email, password, name, role) {
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch {
    user = await auth.createUser({ email, password, displayName: name });
  }
  const claims = role === 'superadmin' ? { role } : { role, tenantId: TENANT_ID };
  await auth.setCustomUserClaims(user.uid, claims);
  await db.collection('users').doc(user.uid).set(
    { name, email, role, tenantId: role === 'superadmin' ? null : TENANT_ID, active: true, initials: initials(name), ticketsCount: 0, phone: '', createdAt: now(), updatedAt: now() },
    { merge: true }
  );
  return user.uid;
}

async function main() {
  // tenant raíz
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
  console.log(`✓ Tenant: ${TENANT_ID}`);

  // Para demo/emulador se usa una contraseña fija legible; contra cualquier otro
  // proyecto se exige pasarla por env o se genera una aleatoria (nunca un default conocido).
  const demoPass = (fixed) => (IS_EMULATOR || IS_DEMO ? fixed : genPass());

  const superEmail = process.env.SUPERADMIN_EMAIL || 'super@aditumcr.com';
  const superPass = process.env.SUPERADMIN_PASSWORD || demoPass('Super2026!');
  await ensureUser(superEmail, superPass, 'Super Admin', 'superadmin');
  console.log(`✓ Superadmin: ${superEmail} / ${superPass}`);

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@aditumcr.com';
  const adminPass = process.env.ADMIN_PASSWORD || demoPass('Aditum2026!');
  const adminUid = await ensureUser(adminEmail, adminPass, 'Admin Aditum', 'admin');
  console.log(`✓ Admin: ${adminEmail} / ${adminPass}`);

  const techs = [
    ['carlos.jimenez@aditum.cr', 'Carlos Jiménez'],
    ['maria.rodriguez@aditum.cr', 'María Rodríguez'],
    ['esteban.mora@aditum.cr', 'Esteban Mora'],
  ];
  const techIds = {};
  for (const [email, name] of techs) {
    const pass = process.env.TECH_PASSWORD || demoPass('Tecnico2026!');
    techIds[name] = await ensureUser(email, pass, name, 'tech');
    console.log(`✓ Técnico: ${email} / ${pass}`);
  }

  // counter
  await tcol('counters').doc('tickets').set({ value: 1041 }, { merge: true });

  const baseChecklist = (done) =>
    [
      'Verificar voltaje y conexión eléctrica del equipo',
      'Montar e instalar el lector QR en la entrada',
      'Configurar conexión a la red del condominio',
      'Probar apertura con 3 códigos QR distintos',
      'Capacitar al guarda sobre el uso básico',
    ].map((text, i) => ({ id: 'c' + i, text, done: i < done, by: i < done ? 'Carlos Jiménez' : null, at: i < done ? now() : null }));

  const tickets = [
    {
      num: 'AD-1041', title: 'Instalación de lector QR — entrada principal', client: 'Condominio Vista Real', site: 'Caseta de acceso vehicular',
      address: 'Santa Ana, San José. 200m oeste del Cruce, portón azul.', priority: 'alta', status: 'asignado', techId: techIds['Carlos Jiménez'],
      scheduled: '2026-06-07', deadline: '2026-06-09',
      description: 'Instalar un lector de códigos QR en la entrada vehicular principal.', instructions: 'Montar el lector a 1.10m. Conectar a red eléctrica y WiFi.',
      expected: 'El portón abre en menos de 2s al escanear un QR válido.', doneConditions: 'Equipo instalado, configurado y probado.', observations: 'Coordinar con el guarda.',
      evidenceReq: 'Grabar video del equipo instalado y prueba completa del flujo. Foto del lector montado.', checklist: baseChecklist(0),
    },
    {
      num: 'AD-1040', title: 'Mantenimiento de portón vehicular', client: 'Residencial Monte Verde', site: 'Portón de salida',
      address: 'Heredia, San Pablo. Frente al parque central.', priority: 'urgente', status: 'pendiente', techId: null,
      scheduled: '2026-06-08', deadline: '2026-06-08',
      description: 'El portón se traba intermitentemente. Revisar motor, riel y sensores.', instructions: 'Inspeccionar motor y riel. Probar 10 ciclos.',
      expected: 'Portón abre y cierra suave en 10 ciclos.', doneConditions: '10 ciclos exitosos.', observations: 'Cliente reporta urgencia.',
      evidenceReq: 'Video de los 10 ciclos. Foto del riel y motor.', checklist: baseChecklist(0),
    },
  ];

  for (const t of tickets) {
    const id = t.num.toLowerCase();
    await tcol('tickets').doc(id).set({
      ...t,
      created: now(),
      techNote: '', techObs: '', readyAt: null,
      evidence: [], comments: [],
      history: [{ status: 'pendiente', at: now(), by: 'Admin · Daniela Soto' }, ...(t.techId ? [{ status: 'asignado', at: now(), by: 'Admin · Daniela Soto' }] : [])],
      share: { active: false, token: null, url: null, created: null, lastVisit: null },
    });
  }
  console.log(`✓ ${tickets.length} tickets de demo`);

  // wiki
  const catRef = await tcol('wikiCategories').add({ name: 'Lectores QR', description: 'Instalación y pruebas', active: true, orderIndex: 1, createdAt: now(), updatedAt: now() });
  await tcol('wikiPages').add({
    title: 'Instalación de lector QR',
    categoryId: catRef.id,
    contentMarkdown: '# Instalación de lector QR\n\n## Objetivo\nEsta guía explica cómo instalar y probar un lector QR en un punto de acceso.\n\n## Pasos\n1. Verificar alimentación eléctrica.\n2. Conectar el lector al controlador.\n3. Validar conexión a internet.\n4. Realizar prueba con código QR.\n5. Confirmar apertura de puerta.\n\n## Evidencia requerida\nEl técnico debe grabar un video mostrando:\n- Lector encendido.\n- Lectura del QR.\n- Respuesta del sistema.\n- Apertura del acceso.',
    status: 'PUBLISHED', attachments: [], createdBy: 'Daniela Soto', updatedBy: 'Daniela Soto', createdAt: now(), updatedAt: now(), publishedAt: now(),
  });
  console.log('✓ Wiki: 1 categoría + 1 página');

  console.log('\nSeed completo.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
