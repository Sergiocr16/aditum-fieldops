/* © 2026 Aditum — Aditum FieldOps — datos demo del módulo de mantenimiento (emuladores).
   Corre DESPUÉS de seed.mjs:
     FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
     FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 FIREBASE_PROJECT_ID=demo-aditum-fieldops \
     BASE_HOST=10.0.0.137 node demo-mantenimiento.mjs

   Crea: tipos de equipo + plantillas de checklist v1, 3 contratos, 14 equipos,
   disponibilidad de técnicos, OS en todos los estados (incl. una NOTIFICADA con
   links públicos de confirmar/reagendar), inventario y el tenant "ralex". */
import admin from 'firebase-admin';
import { randomBytes } from 'crypto';

const projectId = process.env.FIREBASE_PROJECT_ID || 'demo-aditum-fieldops';
const BASE_HOST = process.env.BASE_HOST || 'localhost';
const APP = `http://${BASE_HOST}:5173`;
admin.initializeApp({ projectId, storageBucket: `${projectId}.appspot.com` });
const db = admin.firestore();
const auth = admin.auth();
const bucket = admin.storage().bucket();

const TID = 'aditum';
const t = (name) => db.collection('tenants').doc(TID).collection(name);

const now = () => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const g = (x) => p.find((q) => q.type === x)?.value || '';
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`;
};
const today = () => now().slice(0, 10);
const addDays = (d, n) => {
  const [y, m, dd] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, dd + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
};
const rid = () => Math.random().toString(36).slice(2, 9);
const token = () => randomBytes(32).toString('base64url');

/* ---------- storage: firma y fotos demo (SVG) ---------- */
async function uploadSvg(path, svg) {
  const tok = rid() + rid();
  await bucket.file(path).save(Buffer.from(svg), {
    metadata: { contentType: 'image/svg+xml', metadata: { firebaseStorageDownloadTokens: tok } },
  });
  return { path, url: `http://${BASE_HOST}:9199/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${tok}` };
}
const SIGNATURE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="160" viewBox="0 0 400 160"><rect width="400" height="160" fill="#fff"/><path d="M30 110 C60 40 90 130 120 80 S180 40 200 95 S260 130 290 70 S350 60 370 100" fill="none" stroke="#1f2937" stroke-width="3" stroke-linecap="round"/><path d="M40 125 H360" stroke="#9aa3ad" stroke-width="1" stroke-dasharray="4 4"/></svg>`;
const photoSvg = (label, color) => `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="${color}"/><rect x="20" y="20" width="600" height="440" fill="none" stroke="#ffffff55" stroke-width="3"/><text x="320" y="240" font-family="Arial" font-size="30" fill="#fff" text-anchor="middle">${label}</text><text x="320" y="280" font-family="Arial" font-size="16" fill="#ffffffaa" text-anchor="middle">foto demo</text></svg>`;

/* ---------- plantillas ---------- */
const TPL = {
  Refrigerador: {
    sections: [
      { id: 's1', title: 'Inspección general', order: 0 },
      { id: 's2', title: 'Mediciones', order: 1 },
      { id: 's3', title: 'Cierre', order: 2 },
    ],
    items: [
      { s: 's1', label: 'Limpieza de condensador y serpentín', type: 'si_no', required: true },
      { s: 's1', label: 'Empaques de puerta en buen estado', type: 'si_no', required: true },
      { s: 's1', label: 'Estado general del gabinete', type: 'seleccion', required: true, config: { options: ['Bueno', 'Regular', 'Malo'] } },
      { s: 's2', label: 'Temperatura interna', type: 'numero', required: true, config: { min: 0, max: 12, alertMin: 2, alertMax: 8, unit: '°C' } },
      { s: 's2', label: 'Voltaje de alimentación', type: 'numero', required: true, config: { min: 100, max: 130, alertMin: 110, alertMax: 125, unit: 'V' } },
      { s: 's2', label: 'Amperaje del compresor', type: 'numero', required: false, config: { min: 0, max: 15, unit: 'A' } },
      { s: 's3', label: 'Foto del equipo y termómetro', type: 'foto', required: true },
      { s: 's3', label: 'Observaciones del estado', type: 'texto', required: false },
    ],
  },
  Congelador: {
    sections: [{ id: 's1', title: 'Inspección', order: 0 }, { id: 's2', title: 'Mediciones', order: 1 }],
    items: [
      { s: 's1', label: 'Descongelamiento y limpieza interna', type: 'si_no', required: true },
      { s: 's1', label: 'Sello hermético de tapa/puerta', type: 'si_no', required: true },
      { s: 's2', label: 'Temperatura interna', type: 'numero', required: true, config: { min: -35, max: 0, alertMin: -30, alertMax: -15, unit: '°C' } },
      { s: 's2', label: 'Foto del registro de temperatura', type: 'foto', required: true },
    ],
  },
  Autoclave: {
    sections: [{ id: 's1', title: 'Seguridad', order: 0 }, { id: 's2', title: 'Funcionamiento', order: 1 }],
    items: [
      { s: 's1', label: 'Válvula de seguridad operativa', type: 'si_no', required: true },
      { s: 's1', label: 'Empaque de puerta sin fisuras', type: 'si_no', required: true },
      { s: 's2', label: 'Presión de trabajo', type: 'numero', required: true, config: { min: 0, max: 40, alertMin: 15, alertMax: 32, unit: 'psi' } },
      { s: 's2', label: 'Temperatura de esterilización', type: 'numero', required: true, config: { min: 100, max: 140, alertMin: 121, alertMax: 134, unit: '°C' } },
      { s: 's2', label: 'Ciclo de prueba completado', type: 'seleccion', required: true, config: { options: ['Exitoso', 'Con observaciones', 'Falló'] } },
    ],
  },
  'Cámara de refrigeración': {
    sections: [{ id: 's1', title: 'Inspección', order: 0 }],
    items: [
      { s: 's1', label: 'Limpieza de evaporadores', type: 'si_no', required: true },
      { s: 's1', label: 'Cortinas / puertas en buen estado', type: 'si_no', required: true },
      { s: 's1', label: 'Temperatura de cámara', type: 'numero', required: true, config: { min: -5, max: 15, alertMin: 2, alertMax: 8, unit: '°C' } },
      { s: 's1', label: 'Foto panorámica de la cámara', type: 'foto', required: false },
    ],
  },
};
const TYPE_NAMES = ['Refrigerador', 'Congelador', 'Cámara de refrigeración', 'Enfriador vertical', 'Cabina de bioseguridad', 'Autoclave', 'Incubadora', 'Baño maría', 'Pasteurizadora', 'Banco de leche'];

function snapshotChecklist(tplName, answers = null) {
  const tpl = TPL[tplName];
  if (!tpl) return [];
  const stitle = new Map(tpl.sections.map((s) => [s.id, s.title]));
  return tpl.items.map((it, i) => {
    const id = 'it' + i;
    const base = {
      id, sectionId: it.s, sectionTitle: stitle.get(it.s), label: it.label, type: it.type,
      required: !!it.required, config: it.config || {}, unit: it.config?.unit || null,
      answer: null, alert: false, photoPath: null, photoUrl: null, at: null, by: null,
    };
    if (answers && answers[i] !== undefined) {
      base.answer = answers[i].answer ?? null;
      base.alert = !!answers[i].alert;
      base.photoUrl = answers[i].photoUrl || null;
      base.photoPath = answers[i].photoPath || null;
      base.at = now();
      base.by = answers[i].by || 'Carlos Jiménez';
    }
    return base;
  });
}

async function nextNum(counter, prefix, start = 1000) {
  const ref = t('counters').doc(counter);
  return db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const next = (s.exists ? s.data().value : start) + 1;
    tx.set(ref, { value: next }, { merge: true });
    return prefix + '-' + next;
  });
}

function soBase({ num, type = 'preventivo', status, contractId, equipmentId, eqSnap, client, techId, date, time = '09:00', noticeDays = 3 }) {
  const ts = now();
  return {
    num, type, status, contractId, equipmentId,
    equipmentSnapshot: eqSnap, client, techId,
    planDate: date, scheduledDate: date, scheduledTime: time, durationMin: 60,
    skipNotice: type === 'correctivo',
    notify: {
      noticeDaysBefore: noticeDays, noticeDate: addDays(date, -noticeDays),
      noticeSentAt: null, reminderSentAt: null, confirmedAt: null, confirmedVia: null,
      rescheduleCount: 0, tokens: { confirm: null, reschedule: null },
    },
    hold: null, checklistTemplateId: null, checklistTemplateVersion: null,
    checklist: [], photos: [], observations: '', notes: '',
    signature: null, startedAt: null, finishedAt: null,
    reportShare: { active: false, token: null, url: null, created: null, lastVisit: null },
    billingApplied: false, invoiceItemId: null, cadenceApplied: false,
    history: [{ status: 'PROGRAMADA', at: ts, by: 'scheduler' }],
    created: ts, createdBy: 'demo-seed',
  };
}

async function main() {
  const d = today();
  console.log(`Demo de mantenimiento — tenant ${TID} — hoy ${d}\n`);

  // técnicos
  const users = await db.collection('users').where('tenantId', '==', TID).where('role', '==', 'tech').get();
  const tech = {};
  users.docs.forEach((u) => (tech[u.data().name.split(' ')[0]] = u.id));
  const CARLOS = tech['Carlos'], MARIA = tech['María'], ESTEBAN = tech['Esteban'];

  // disponibilidad de técnicos
  const wk = (sat) => ({
    mon: [{ start: '08:00', end: '17:00' }], tue: [{ start: '08:00', end: '17:00' }],
    wed: [{ start: '08:00', end: '17:00' }], thu: [{ start: '08:00', end: '17:00' }],
    fri: [{ start: '08:00', end: '16:00' }], sat: sat ? [{ start: '08:00', end: '12:00' }] : [], sun: [],
  });
  await db.collection('users').doc(CARLOS).set({ availability: { weeklyHours: wk(true) } }, { merge: true });
  await db.collection('users').doc(MARIA).set({ availability: { weeklyHours: wk(false) } }, { merge: true });
  await db.collection('users').doc(ESTEBAN).set({ availability: { weeklyHours: wk(false) } }, { merge: true });
  console.log('✓ Disponibilidad de 3 técnicos');

  // usuarios de escritorio: coordinador y facturación (roles reales)
  const ensureMember = async (email, password, name, role, initials) => {
    let u;
    try { u = await auth.getUserByEmail(email); } catch { u = await auth.createUser({ email, password, displayName: name }); }
    await auth.setCustomUserClaims(u.uid, { role, tenantId: TID });
    await db.collection('users').doc(u.uid).set({ name, email, role, tenantId: TID, phone: '', active: true, initials, createdAt: now(), updatedAt: now() }, { merge: true });
    return u.uid;
  };
  await ensureMember('coordinador@aditumcr.com', 'Coord2026!', 'Laura Coordinadora', 'coordinador', 'LC');
  await ensureMember('facturacion@aditumcr.com', 'Factura2026!', 'Fede Facturación', 'facturacion', 'FF');
  console.log('✓ Coordinador: coordinador@aditumcr.com / Coord2026!');
  console.log('✓ Facturación: facturacion@aditumcr.com / Factura2026!');

  // tipos de equipo + plantillas v1
  const typeIds = {};
  for (const name of TYPE_NAMES) {
    const hasTpl = !!TPL[name];
    const ref = t('equipmentTypes').doc();
    typeIds[name] = ref.id;
    await ref.set({ name, active: true, activeTemplateVersion: hasTpl ? 1 : 0, createdAt: now(), updatedAt: now() });
    if (hasTpl) {
      const tpl = TPL[name];
      await t('checklistTemplates').doc(`${ref.id}_v1`).set({
        typeId: ref.id, version: 1, status: 'active',
        sections: tpl.sections,
        items: tpl.items.map((it, i) => ({ id: 'it' + i, sectionId: it.s, order: i, label: it.label, type: it.type, required: !!it.required, config: it.config || {} })),
        createdAt: now(), createdBy: 'Admin Aditum',
      });
    }
  }
  console.log(`✓ ${TYPE_NAMES.length} tipos de equipo (4 con checklist v1)`);

  // contratos
  const mkContract = async (data) => {
    const num = await nextNum('contracts', 'CT');
    const ref = t('contracts').doc();
    await ref.set({ ...data, num, active: true, noticeDaysBefore: null, notes: data.notes || '', createdAt: now(), updatedAt: now(), history: [{ at: now(), by: 'Admin · Admin Aditum', note: 'Contrato creado' }] });
    return { id: ref.id, num, ...data };
  };
  const c1 = await mkContract({
    licitacionNum: '2025LD-000021-0001102202', clientName: 'CCSS — Hospital San Juan de Dios',
    clientEmail: 'mantenimiento.hsjd@ccss.sa.cr', clientPhone: '+506 2547-8000',
    startDate: addDays(d, -120), endDate: addDays(d, 600), defaultPeriodicityMonths: 3, defaultTechId: CARLOS,
    notes: 'Contrato MPC equipo de refrigeración. Acceso por bodega norte, reportarse con seguridad.',
  });
  const c2 = await mkContract({
    licitacionNum: '2025LN-000087-0001101142', clientName: 'CCSS — Hospital México',
    clientEmail: 'ingenieria.hm@ccss.sa.cr', clientPhone: '+506 2242-6700',
    startDate: addDays(d, -200), endDate: addDays(d, 500), defaultPeriodicityMonths: 6, defaultTechId: MARIA,
  });
  const c3 = await mkContract({
    licitacionNum: '2026CD-000012-LAB', clientName: 'Laboratorios Páez — Sede Central',
    clientEmail: 'operaciones@labpaez.cr', clientPhone: '+506 2280-1515',
    startDate: addDays(d, -60), endDate: addDays(d, 305), defaultPeriodicityMonths: 1, defaultTechId: ESTEBAN,
  });
  console.log(`✓ 3 contratos: ${c1.num}, ${c2.num}, ${c3.num}`);

  // equipos
  const EQUIPMENT = [
    // contrato 1 — HSJD (refrigeración, trimestral, Carlos)
    { c: c1, type: 'Refrigerador', brand: 'Vestfrost', model: 'VKS-318', serial: 'VF-2201', loc: 'Farmacia central', next: addDays(d, 12) },
    { c: c1, type: 'Refrigerador', brand: 'Haier', model: 'HYC-360', serial: 'HA-0915', loc: 'Banco de sangre', next: addDays(d, 5) },
    { c: c1, type: 'Congelador', brand: 'Thermo Fisher', model: 'TSX-400', serial: 'TF-7731', loc: 'Laboratorio clínico', next: addDays(d, 20) },
    { c: c1, type: 'Cámara de refrigeración', brand: 'Frigopack', model: 'CR-12', serial: 'FP-12-08', loc: 'Nutrición — cocina', next: addDays(d, 33) },
    { c: c1, type: 'Banco de leche', brand: 'Medela', model: 'BL-200', serial: 'MD-4410', loc: 'Neonatología', next: addDays(d, 47) },
    // contrato 2 — México (médico, semestral, María)
    { c: c2, type: 'Autoclave', brand: 'Tuttnauer', model: '3870EA', serial: 'TT-3870-2', loc: 'Central de equipos', next: addDays(d, 8) },
    { c: c2, type: 'Autoclave', brand: 'Tuttnauer', model: '2540M', serial: 'TT-2540-7', loc: 'Sala de partos', next: addDays(d, 25) },
    { c: c2, type: 'Cabina de bioseguridad', brand: 'Esco', model: 'AC2-4S', serial: 'ES-9982', loc: 'Microbiología', next: addDays(d, 40) },
    { c: c2, type: 'Incubadora', brand: 'Memmert', model: 'IN-110', serial: 'MM-1102', loc: 'Laboratorio clínico', next: addDays(d, 55) },
    // contrato 3 — Lab Páez (mensual, Esteban)
    { c: c3, type: 'Refrigerador', brand: 'Samsung', model: 'RT-38', serial: 'LP-001', loc: 'Recepción de muestras', next: addDays(d, 3) },
    { c: c3, type: 'Congelador', brand: 'LG', model: 'GC-B404', serial: 'LP-002', loc: 'Banco de reactivos', next: addDays(d, 15) },
    { c: c3, type: 'Baño maría', brand: 'Memmert', model: 'WNB-14', serial: 'LP-003', loc: 'Química clínica', next: addDays(d, 18) },
    { c: c3, type: 'Incubadora', brand: 'Binder', model: 'BD-56', serial: 'LP-004', loc: 'Microbiología', next: addDays(d, 22) },
    { c: c3, type: 'Pasteurizadora', brand: 'Armfield', model: 'FT-43', serial: 'LP-005', loc: 'Planta piloto', next: addDays(d, 28) },
  ];
  const eqDocs = [];
  for (const e of EQUIPMENT) {
    const ref = t('equipment').doc();
    await ref.set({
      contractId: e.c.id, typeId: typeIds[e.type], brand: e.brand, model: e.model, serial: e.serial,
      location: e.loc, assignedTechId: null, periodicityMonths: null, noticeDaysBefore: null,
      nextScheduledDate: e.next, lastServiceDate: null, notes: '', active: true, importBatchId: null,
      createdAt: now(), updatedAt: now(),
    });
    eqDocs.push({ id: ref.id, ...e, typeId: typeIds[e.type] });
  }
  console.log(`✓ ${EQUIPMENT.length} equipos en 3 contratos`);

  const snap = (e) => ({ typeId: e.typeId, typeName: e.type, brand: e.brand, model: e.model, serial: e.serial, location: e.loc });
  const cli = (c) => ({ name: c.clientName, email: c.clientEmail, phone: c.clientPhone });
  const techOf = (c) => c.defaultTechId;
  const mkSO = async (e, patch) => {
    const num = await nextNum('serviceOrders', 'OS');
    const base = soBase({ num, contractId: e.c.id, equipmentId: e.id, eqSnap: snap(e), client: cli(e.c), techId: techOf(e.c), date: patch.date || addDays(d, 7), ...patch });
    const doc = { ...base, ...patch.override };
    const ref = t('serviceOrders').doc('eq_' + e.id + '_' + (patch.date || addDays(d, 7)).replace(/-/g, ''));
    await ref.set(doc);
    return { id: ref.id, num };
  };

  /* ---- OS PROGRAMADAS (futuras, pueblan el calendario) ---- */
  const so1 = await mkSO(eqDocs[0], { status: 'PROGRAMADA', date: addDays(d, 12), time: '09:00' });
  const so2 = await mkSO(eqDocs[2], { status: 'PROGRAMADA', date: addDays(d, 20), time: '13:00' });
  const so3 = await mkSO(eqDocs[6], { status: 'PROGRAMADA', date: addDays(d, 25), time: '10:00' });
  const so4 = await mkSO(eqDocs[10], { status: 'PROGRAMADA', date: addDays(d, 15), time: '08:00' });

  /* ---- OS NOTIFICADA con links públicos reales ---- */
  const eN = eqDocs[5]; // Autoclave Tuttnauer 3870EA
  const dateN = addDays(d, 8);
  const confirmTk = token();
  const reschedTk = token();
  const soN = await mkSO(eN, {
    status: 'NOTIFICADA', date: dateN, time: '10:00',
    override: {
      notify: {
        noticeDaysBefore: 3, noticeDate: addDays(dateN, -3), noticeSentAt: now(), reminderSentAt: null,
        confirmedAt: null, confirmedVia: null, rescheduleCount: 0,
        tokens: { confirm: confirmTk, reschedule: reschedTk },
      },
      history: [
        { status: 'PROGRAMADA', at: now(), by: 'scheduler' },
        { status: 'NOTIFICADA', at: now(), by: 'scheduler', note: 'Aviso enviado a ' + eN.c.clientEmail },
      ],
    },
  });
  for (const [purpose, tk] of [['so_confirm', confirmTk], ['so_reschedule', reschedTk]]) {
    await db.collection('publicTokens').doc(tk).set({
      tenantId: TID, purpose, targetId: soN.id, active: true, singleUse: true,
      usedAt: null, invalidatedAt: null, expiresAt: dateN + ' 23:59', createdAt: now(),
    });
  }

  /* ---- OS CONFIRMADA ---- */
  const so5 = await mkSO(eqDocs[9], {
    status: 'CONFIRMADA', date: addDays(d, 3), time: '11:00',
    override: {
      notify: { noticeDaysBefore: 3, noticeDate: addDays(d, 0), noticeSentAt: now(), reminderSentAt: null, confirmedAt: now(), confirmedVia: 'cliente', rescheduleCount: 0, tokens: { confirm: null, reschedule: null } },
      history: [
        { status: 'PROGRAMADA', at: now(), by: 'scheduler' },
        { status: 'NOTIFICADA', at: now(), by: 'scheduler' },
        { status: 'CONFIRMADA', at: now(), by: 'Cliente', note: 'Cliente confirmó la fecha' },
      ],
    },
  });

  /* ---- OS EN_PROGRESO (Carlos, checklist a medio llenar) ---- */
  const eP = eqDocs[1]; // Refrigerador Haier — banco de sangre
  const soP = await mkSO(eP, {
    status: 'EN_PROGRESO', date: d, time: '08:00',
    override: {
      startedAt: now(),
      checklistTemplateId: `${eP.typeId}_v1`, checklistTemplateVersion: 1,
      checklist: snapshotChecklist('Refrigerador', {
        0: { answer: true }, 1: { answer: true },
        3: { answer: 4.5 }, 4: { answer: 118 },
      }),
      history: [
        { status: 'PROGRAMADA', at: now(), by: 'scheduler' },
        { status: 'CONFIRMADA', at: now(), by: 'Cliente' },
        { status: 'EN_PROGRESO', at: now(), by: 'Carlos Jiménez' },
      ],
    },
  });

  /* ---- 2 OS terminadas (el trigger las pasa a PENDIENTE_FACTURAR) ---- */
  const sig = await uploadSvg(`tenants/${TID}/serviceOrders/demo/firma-demo.svg`, SIGNATURE_SVG);
  const f1 = await uploadSvg(`tenants/${TID}/serviceOrders/demo/foto-refri.svg`, photoSvg('Refrigerador Vestfrost — Farmacia', '#0e3a53'));
  const f2 = await uploadSvg(`tenants/${TID}/serviceOrders/demo/foto-term.svg`, photoSvg('Termómetro: 4.2 °C', '#1d5c3f'));
  const f3 = await uploadSvg(`tenants/${TID}/serviceOrders/demo/foto-cong.svg`, photoSvg('Congelador LG — Reactivos', '#4a2a6b'));

  const doneDate1 = addDays(d, -2);
  const eDone1 = eqDocs[0]; // mismo equipo que so1: terminado pasado + programada futura (cadencia visible)
  const numD1 = await nextNum('serviceOrders', 'OS');
  const refD1 = t('serviceOrders').doc('eq_' + eDone1.id + '_' + doneDate1.replace(/-/g, ''));
  await refD1.set({
    ...soBase({ num: numD1, contractId: eDone1.c.id, equipmentId: eDone1.id, eqSnap: snap(eDone1), client: cli(eDone1.c), techId: CARLOS, date: doneDate1, time: '09:00' }),
    status: 'SERVICIO_TERMINADO',
    startedAt: doneDate1 + ' 09:05', finishedAt: doneDate1 + ' 10:12',
    checklistTemplateId: `${eDone1.typeId}_v1`, checklistTemplateVersion: 1,
    checklist: snapshotChecklist('Refrigerador', {
      0: { answer: true }, 1: { answer: true }, 2: { answer: 'Bueno' },
      3: { answer: 4.2 }, 4: { answer: 119 }, 5: { answer: 6.1 },
      6: { answer: null, photoUrl: f2.url, photoPath: f2.path },
      7: { answer: 'Equipo en óptimas condiciones. Se ajustó termostato.' },
    }),
    photos: [
      { id: rid(), path: f1.path, url: f1.url, desc: 'Equipo instalado', at: doneDate1 + ' 10:05', by: 'Carlos Jiménez' },
      { id: rid(), path: f2.path, url: f2.url, desc: 'Lectura de temperatura', at: doneDate1 + ' 10:07', by: 'Carlos Jiménez' },
    ],
    observations: 'Mantenimiento preventivo completo. Condensador limpio, gas refrigerante OK. Se recomienda cambiar empaque de puerta en la próxima visita.',
    signature: { name: 'Lic. Roberto Solano', idNumber: '1-0888-0456', path: sig.path, url: sig.url, at: doneDate1 + ' 10:12' },
    history: [
      { status: 'PROGRAMADA', at: doneDate1 + ' 06:00', by: 'scheduler' },
      { status: 'CONFIRMADA', at: doneDate1 + ' 07:30', by: 'Cliente' },
      { status: 'EN_PROGRESO', at: doneDate1 + ' 09:05', by: 'Carlos Jiménez' },
      { status: 'SERVICIO_TERMINADO', at: doneDate1 + ' 10:12', by: 'Carlos Jiménez', note: 'Firmado por Lic. Roberto Solano' },
    ],
  });

  const doneDate2 = addDays(d, -6);
  const eDone2 = eqDocs[10]; // Congelador LG (lab Páez)
  const numD2 = await nextNum('serviceOrders', 'OS');
  const refD2 = t('serviceOrders').doc('eq_' + eDone2.id + '_' + doneDate2.replace(/-/g, ''));
  await refD2.set({
    ...soBase({ num: numD2, contractId: eDone2.c.id, equipmentId: eDone2.id, eqSnap: snap(eDone2), client: cli(eDone2.c), techId: ESTEBAN, date: doneDate2, time: '14:00' }),
    status: 'SERVICIO_TERMINADO',
    startedAt: doneDate2 + ' 14:02', finishedAt: doneDate2 + ' 15:00',
    checklistTemplateId: `${eDone2.typeId}_v1`, checklistTemplateVersion: 1,
    checklist: snapshotChecklist('Congelador', {
      0: { answer: true, by: 'Esteban Mora' }, 1: { answer: true, by: 'Esteban Mora' },
      2: { answer: -12.5, alert: true, by: 'Esteban Mora' },
      3: { answer: null, photoUrl: f3.url, photoPath: f3.path, by: 'Esteban Mora' },
    }),
    photos: [{ id: rid(), path: f3.path, url: f3.url, desc: 'Congelador con carga', at: doneDate2 + ' 14:40', by: 'Esteban Mora' }],
    observations: 'ALERTA: temperatura por encima del rango recomendado (-12.5°C, esperado < -15°C). Se programó revisión del compresor como correctivo.',
    signature: { name: 'Dra. Ana Páez', idNumber: '2-0455-0789', path: sig.path, url: sig.url, at: doneDate2 + ' 15:00' },
    history: [
      { status: 'PROGRAMADA', at: doneDate2 + ' 06:00', by: 'scheduler' },
      { status: 'EN_PROGRESO', at: doneDate2 + ' 14:02', by: 'Esteban Mora' },
      { status: 'SERVICIO_TERMINADO', at: doneDate2 + ' 15:00', by: 'Esteban Mora', note: 'Firmado por Dra. Ana Páez' },
    ],
  });

  /* ---- correctivo derivado de la alerta ---- */
  const numC = await nextNum('serviceOrders', 'OS');
  await t('serviceOrders').doc().set({
    ...soBase({ num: numC, type: 'correctivo', contractId: eDone2.c.id, equipmentId: eDone2.id, eqSnap: snap(eDone2), client: cli(eDone2.c), techId: ESTEBAN, date: addDays(d, 1), time: '08:00' }),
    status: 'PROGRAMADA',
    notes: 'Revisar compresor: el preventivo del ' + doneDate2 + ' registró -12.5°C (fuera de rango). Posible falla de gas o compresor.',
  });

  /* ---- cancelada ---- */
  const numX = await nextNum('serviceOrders', 'OS');
  await t('serviceOrders').doc().set({
    ...soBase({ num: numX, contractId: c2.id, equipmentId: eqDocs[7].id, eqSnap: snap(eqDocs[7]), client: cli(c2), techId: MARIA, date: addDays(d, -1), time: '13:00' }),
    status: 'CANCELADA',
    history: [
      { status: 'PROGRAMADA', at: addDays(d, -5) + ' 06:00', by: 'scheduler' },
      { status: 'CANCELADA', at: addDays(d, -2) + ' 10:11', by: 'Admin · Admin Aditum', note: 'Cliente solicitó posponer por remodelación del área' },
    ],
  });

  console.log('✓ 10 órdenes de servicio (programadas, notificada, confirmada, en progreso, 2 terminadas→facturar, correctivo, cancelada)');

  /* ---- inventario ---- */
  const INV = [
    { name: 'Gas refrigerante R-134a (lata 340g)', quantity: 12, minQty: 5, purchaseLink: 'https://example.com/r134a' },
    { name: 'Empaque puerta refrigerador universal', quantity: 3, minQty: 6, purchaseLink: 'https://example.com/empaque' },
    { name: 'Termómetro digital calibrado', quantity: 8, minQty: 3 },
    { name: 'Empaque autoclave Tuttnauer 3870', quantity: 2, minQty: 2 },
    { name: 'Filtro HEPA cabina bioseguridad', quantity: 1, minQty: 2, purchaseLink: 'https://example.com/hepa' },
  ];
  for (const it of INV) {
    await t('inventory').doc().set({ ...it, nameKey: it.name.toLowerCase(), description: '', purchaseLink: it.purchaseLink || '', createdAt: now(), updatedAt: now() });
  }
  console.log(`✓ ${INV.length} productos de inventario (2 bajo mínimo)`);

  /* ---- tenant ralex (demo multi-tenant) ---- */
  const ralexRef = db.collection('tenants').doc('ralex');
  if (!(await ralexRef.get()).exists) {
    await ralexRef.set({
      name: 'Servicios Técnicos Ralex', active: true,
      branding: { appName: 'Ralex Service', logoUrl: '', primaryColor: '#1F3A2E', accentColor: '#D9A441' },
      numbering: { ticketPrefix: 'RX', contractPrefix: 'CT', osPrefix: 'OS' },
      notifyEmail: 'operaciones@ralex.cr', smtpStatus: 'unset', createdAt: now(), updatedAt: now(),
    });
    await db.collection('tenants').doc('ralex').collection('counters').doc('tickets').set({ value: 1000 });
    let ru;
    try { ru = await auth.getUserByEmail('admin@ralex.cr'); } catch { ru = await auth.createUser({ email: 'admin@ralex.cr', password: 'Ralex2026!', displayName: 'Admin Ralex' }); }
    await auth.setCustomUserClaims(ru.uid, { role: 'admin', tenantId: 'ralex' });
    await db.collection('users').doc(ru.uid).set({ name: 'Admin Ralex', email: 'admin@ralex.cr', role: 'admin', tenantId: 'ralex', phone: '', active: true, initials: 'AR', createdAt: now(), updatedAt: now() }, { merge: true });
    console.log('✓ Tenant ralex + admin@ralex.cr / Ralex2026! (para ver el aislamiento)');
  }

  console.log('\n──────────────────────────────────────────────');
  console.log('LINKS PÚBLICOS DEMO (sin login):');
  console.log(`  Confirmar visita ${soN.num}:  ${APP}/confirm/${confirmTk}`);
  console.log(`  Reagendar visita ${soN.num}:  ${APP}/reschedule/${reschedTk}`);
  console.log('  (los reportes /r/... se generan solos: ver botón "Ver reporte" en las OS pendientes de facturar)');
  console.log('──────────────────────────────────────────────');
  console.log('\nDemo completo.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
