/* © 2026 Aditum — Aditum FieldOps — datos demo del MODELO UNIFICADO (emuladores).
   Corre DESPUÉS de seed.mjs. Crea, con sentido para probar todo:
   - Tipos de equipo + plantillas de checklist v1.
   - Contratos: periódico trimestral (multi-equipo), periódico QUINCENAL, y POR DEMANDA.
   - Equipos por contrato; inventario; clientes fiscales + tipos de cargo.
   - Órdenes: periódica multi-equipo PROGRAMADA / EN_PROGRESO / terminada (con reporte
     público), correctiva multi-equipo, y una POR DEMANDA en revisión (checklist ad-hoc,
     evidencia, materiales, visitas).

   Uso:
     FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
     FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 FIREBASE_PROJECT_ID=demo-aditum-fieldops \
     BASE_HOST=localhost node demo.mjs
*/
import admin from 'firebase-admin';
import { randomBytes } from 'crypto';

const projectId = process.env.FIREBASE_PROJECT_ID || 'demo-aditum-fieldops';
const BASE_HOST = process.env.BASE_HOST || 'localhost';
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
const addDays = (d, n) => { const [y, m, dd] = d.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, dd + n)); return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`; };
const rid = () => Math.random().toString(36).slice(2, 9);
const tok = () => randomBytes(24).toString('base64url');

async function uploadSvg(path, svg) {
  const dl = rid() + rid();
  await bucket.file(path).save(Buffer.from(svg), { metadata: { contentType: 'image/svg+xml', metadata: { firebaseStorageDownloadTokens: dl } } });
  return { path, url: `http://${BASE_HOST}:9199/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${dl}` };
}
const SIGN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="160"><rect width="400" height="160" fill="#fff"/><path d="M30 110 C60 40 90 130 120 80 S180 40 200 95 S260 130 290 70 S350 60 370 100" fill="none" stroke="#1f2937" stroke-width="3"/></svg>`;
const photoSvg = (label, color) => `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="${color}"/><text x="320" y="250" font-family="Arial" font-size="26" fill="#fff" text-anchor="middle">${label}</text></svg>`;

/* ---------------- plantillas de checklist ---------------- */
const TPL = {
  Refrigerador: {
    sections: [{ id: 's1', title: 'Inspección', order: 0 }, { id: 's2', title: 'Mediciones', order: 1 }],
    items: [
      { s: 's1', label: 'Limpieza de condensador', type: 'si_no', required: true },
      { s: 's1', label: 'Empaques de puerta', type: 'seleccion', required: true, config: { options: ['Bueno', 'Regular', 'Malo'] } },
      { s: 's2', label: 'Temperatura interna', type: 'numero', required: true, config: { min: 0, max: 12, alertMin: 2, alertMax: 8, unit: '°C' } },
      { s: 's2', label: 'Foto del equipo', type: 'foto', required: true },
    ],
  },
  'Aire Acondicionado': {
    sections: [{ id: 's1', title: 'Mantenimiento', order: 0 }],
    items: [
      { s: 's1', label: 'Lavado de filtros', type: 'si_no', required: true },
      { s: 's1', label: 'Carga de gas (PSI)', type: 'numero', required: true, config: { min: 0, max: 150, alertMin: 60, alertMax: 120, unit: 'PSI' } },
      { s: 's1', label: 'Foto unidad', type: 'foto', required: true },
    ],
  },
  Congelador: {
    sections: [{ id: 's1', title: 'Inspección', order: 0 }],
    items: [
      { s: 's1', label: 'Descarche correcto', type: 'si_no', required: true },
      { s: 's1', label: 'Temperatura', type: 'numero', required: true, config: { min: -30, max: 0, alertMin: -25, alertMax: -15, unit: '°C' } },
    ],
  },
};

function snapshotChecklist(tplName, answers = null, by = 'Carlos Jiménez') {
  const tpl = TPL[tplName]; if (!tpl) return [];
  const stitle = new Map(tpl.sections.map((s) => [s.id, s.title]));
  return tpl.items.map((it, i) => {
    const e = { id: 'it' + i, sectionId: it.s, sectionTitle: stitle.get(it.s), label: it.label, type: it.type, required: !!it.required, config: it.config || {}, unit: it.config?.unit || null, answer: null, alert: false, photoPath: null, photoUrl: null, at: null, by: null };
    if (answers && answers[i] !== undefined) { e.answer = answers[i].answer ?? null; e.alert = !!answers[i].alert; e.photoUrl = answers[i].photoUrl || null; e.photoPath = answers[i].photoPath || null; e.at = now(); e.by = by; }
    return e;
  });
}

async function nextNum(counter, prefix, start = 1000) {
  const ref = t('counters').doc(counter);
  return db.runTransaction(async (tx) => { const s = await tx.get(ref); const next = (s.exists ? s.data().value : start) + 1; tx.set(ref, { value: next }, { merge: true }); return prefix + '-' + next; });
}

/** Doc completo de orden de servicio (modelo unificado). */
function soDoc(o) {
  const ts = now();
  const date = o.scheduledDate;
  return {
    num: o.num, type: o.type || 'preventivo', mode: o.mode || 'periodico', status: o.status,
    contractId: o.contractId || null, equipmentId: null, equipmentSnapshot: null,
    equipments: o.equipments || [],
    client: o.client, techId: o.techId || null,
    planDate: date, scheduledDate: date, scheduledTime: o.time || '09:00', durationMin: 60,
    skipNotice: o.skipNotice ?? (o.mode === 'demanda'),
    notify: { noticeDaysBefore: 3, noticeDate: addDays(date, -3), noticeSentAt: o.noticeSentAt || null, reminderSentAt: null, confirmedAt: o.confirmedAt || null, confirmedVia: o.confirmedAt ? 'email' : null, rescheduleCount: 0, tokens: { confirm: null, reschedule: null } },
    hold: null, checklistTemplateId: null, checklistTemplateVersion: null,
    checklist: o.checklist || [], photos: o.photos || [], evidence: o.evidence || [], visits: o.visits || [],
    observations: o.observations || '', notes: o.notes || '',
    signature: o.signature || null, startedAt: o.startedAt || null, finishedAt: o.finishedAt || null,
    reportShare: o.reportShare || { active: false, token: null, url: null, created: null, lastVisit: null },
    title: o.title || '', site: o.site || '', address: o.address || '', priority: o.priority || 'media',
    description: o.description || '', instructions: '', expected: '', doneConditions: '', evidenceReq: '', techObs: '', readyAt: o.readyAt || null,
    requiresReview: o.requiresReview ?? (o.mode === 'demanda'), approval: o.approval || null, comments: o.comments || [],
    materials: o.materials || [], materialsNote: o.materialsNote || '', materialsApplied: !!o.materialsApplied,
    requiresInvoice: !!o.requiresInvoice, chargeTypeId: o.chargeTypeId || null, clientId: o.clientId || null, billAmount: o.billAmount ?? null, billCurrency: 'CRC',
    billingApplied: !!o.billingApplied, invoiceItemId: null, cadenceApplied: !!o.cadenceApplied,
    history: o.history || [{ status: o.status, at: ts, by: 'scheduler' }],
    created: ts, createdBy: 'demo',
  };
}

async function publicReportToken(soId) {
  const tk = tok();
  await db.collection('publicTokens').doc(tk).set({ tenantId: TID, purpose: 'so_report', targetId: soId, active: true, singleUse: false, usedAt: null, invalidatedAt: null, expiresAt: addDays(today(), 60) + ' 23:59', createdAt: now(), createdBy: 'demo' });
  return { active: true, token: tk, url: `http://${BASE_HOST}:5173/r/${tk}`, created: now(), lastVisit: null };
}

async function main() {
  const d = today();
  const techUid = async (email) => { try { return (await auth.getUserByEmail(email)).uid; } catch { return null; } };
  const CARLOS = await techUid('carlos.jimenez@aditum.cr');
  const MARIA = await techUid('maria.rodriguez@aditum.cr');
  const ESTEBAN = await techUid('esteban.mora@aditum.cr');

  /* ---- tipos de equipo + plantillas ---- */
  const typeId = {};
  for (const name of Object.keys(TPL)) {
    const ref = t('equipmentTypes').doc();
    await ref.set({ name, active: true, activeTemplateVersion: 1, createdAt: now(), updatedAt: now() });
    const tpl = TPL[name];
    await t('checklistTemplates').doc(`${ref.id}_v1`).set({ typeId: ref.id, version: 1, status: 'active', sections: tpl.sections, items: tpl.items.map((it, i) => ({ id: 'it' + i, sectionId: it.s, order: i, label: it.label, type: it.type, required: !!it.required, config: it.config || {} })), createdAt: now(), createdBy: 'demo' });
    typeId[name] = ref.id;
  }
  console.log('✓ 3 tipos de equipo + plantillas v1');

  /* ---- inventario ---- */
  const inv = [
    { name: 'Gas refrigerante R-134a (lata)', quantity: 24, minQty: 6, purchaseLink: '', description: 'Lata 340g' },
    { name: 'Filtro de aire 20x20', quantity: 40, minQty: 10, purchaseLink: '', description: '' },
    { name: 'Empaque magnético de puerta', quantity: 8, minQty: 4, purchaseLink: '', description: '' },
    { name: 'Limpiador de serpentín (galón)', quantity: 12, minQty: 3, purchaseLink: '', description: '' },
  ];
  const invIds = [];
  for (const it of inv) { const r = t('inventory').doc(); await r.set({ ...it, nameKey: it.name.toLowerCase(), createdAt: now(), updatedAt: now() }); invIds.push({ id: r.id, ...it }); }
  console.log('✓ inventario (4 productos)');

  /* ---- clientes fiscales + tipos de cargo ---- */
  const cliFarmacia = t('clients').doc(); await cliFarmacia.set({ name: 'Farmacias del Valle S.A.', identType: 2, identNumber: '3101123456', email: 'pagos@farmaciasdelvalle.cr', ccEmails: '', active: true, createdAt: now(), updatedAt: now() });
  const cargoMant = t('chargeTypes').doc(); await cargoMant.set({ name: 'Mantenimiento preventivo', code: 'MANT', cabysCode: '8714900000000', emitIva: true, issuesDocument: true, active: true, createdAt: now(), updatedAt: now() });
  const cargoRep = t('chargeTypes').doc(); await cargoRep.set({ name: 'Reparación / correctivo', code: 'REP', cabysCode: '8714900000000', emitIva: true, issuesDocument: true, active: true, createdAt: now(), updatedAt: now() });
  console.log('✓ 1 cliente fiscal + 2 tipos de cargo');

  /* ---- contratos ---- */
  const mkContract = async (data) => { const num = await nextNum('contracts', 'CT'); const ref = t('contracts').doc(); await ref.set({ num, licitacionNum: data.licitacionNum, clientName: data.clientName, clientEmail: data.clientEmail, clientPhone: data.clientPhone || '', modality: data.modality || 'periodico', startDate: data.startDate, endDate: data.endDate || '', defaultPeriodicityMonths: data.per ?? 3, defaultTechId: data.tech || null, noticeDaysBefore: 3, notes: '', active: true, nextScheduledDate: data.next || null, lastServiceDate: data.last || null, createdAt: now(), updatedAt: now(), history: [{ at: now(), by: 'demo', note: 'Contrato creado' }] }); return { id: ref.id, num, ...data }; };

  const cFarmacia = await mkContract({ licitacionNum: '2026LD-000045-CV', clientName: 'Farmacias del Valle S.A.', clientEmail: 'mantenimiento@farmaciasdelvalle.cr', clientPhone: '2222-3344', modality: 'periodico', per: 3, startDate: addDays(d, -90), tech: CARLOS, next: addDays(d, 12) });
  const cSuper = await mkContract({ licitacionNum: 'CT-SUPER-2026', clientName: 'Súper Mercado Central', clientEmail: 'operaciones@supercentral.cr', clientPhone: '2233-1122', modality: 'periodico', per: 0.5, startDate: addDays(d, -30), tech: MARIA, next: addDays(d, 6) });
  const cTorre = await mkContract({ licitacionNum: 'OC-2026-118', clientName: 'Torre Empresarial Escazú', clientEmail: 'admin@torreescazu.cr', clientPhone: '2588-9000', modality: 'demanda', per: 3, startDate: addDays(d, -200), tech: ESTEBAN });
  console.log('✓ 3 contratos (periódico trimestral, periódico QUINCENAL, por demanda)');

  /* ---- equipos ---- */
  const mkEq = async (c, type, brand, model, serial, loc) => { const ref = t('equipment').doc(); await ref.set({ contractId: c.id, typeId: typeId[type], brand, model, serial, location: loc, assignedTechId: null, periodicityMonths: null, noticeDaysBefore: null, nextScheduledDate: null, lastServiceDate: null, notes: '', active: true, importBatchId: null, createdAt: now(), updatedAt: now() }); return { id: ref.id, typeId: typeId[type], typeName: type, brand, model, serial, location: loc }; };

  const fa = await mkEq(cFarmacia, 'Refrigerador', 'Vestfrost', 'AKG-377', 'VF-1001', 'Farmacia Centro');
  const fb = await mkEq(cFarmacia, 'Refrigerador', 'Imbera', 'VR-12', 'IMB-2210', 'Farmacia Centro');
  const fc = await mkEq(cFarmacia, 'Congelador', 'LG', 'GF-300', 'LG-7781', 'Bodega fría');
  const sa = await mkEq(cSuper, 'Aire Acondicionado', 'Carrier', '24K', 'CAR-501', 'Caja 1');
  const sb = await mkEq(cSuper, 'Aire Acondicionado', 'LG', '18K', 'LG-9002', 'Caja 2');
  console.log('✓ 5 equipos (3 en Farmacia, 2 en Súper)');

  const snap = (e) => ({ typeId: e.typeId, typeName: e.typeName, brand: e.brand, model: e.model, serial: e.serial, location: e.location });
  const eqEntry = (e, checklist = []) => ({ equipmentId: e.id, equipmentSnapshot: snap(e), checklistTemplateId: `${e.typeId}_v1`, checklistTemplateVersion: 1, checklist });
  const cliOf = (c) => ({ name: c.clientName, email: c.clientEmail, phone: c.clientPhone || '' });

  /* ---- imágenes demo ---- */
  const sign = await uploadSvg(`tenants/${TID}/serviceOrders/demo/firma.svg`, SIGN_SVG);
  const fotoRefri = await uploadSvg(`tenants/${TID}/serviceOrders/demo/refri.svg`, photoSvg('Refrigerador — Farmacia', '#0e3a53'));
  const fotoAire = await uploadSvg(`tenants/${TID}/serviceOrders/demo/aire.svg`, photoSvg('Aire acondicionado', '#1d5c3f'));
  const fotoPorton = await uploadSvg(`tenants/${TID}/serviceOrders/demo/porton.svg`, photoSvg('Portón vehicular', '#4a2a6b'));

  /* ---- ÓRDENES ---- */
  // 1) Periódica multi-equipo PROGRAMADA (los 3 equipos de Farmacia, checklist se carga al iniciar)
  const n1 = await nextNum('serviceOrders', 'OS');
  await t('serviceOrders').doc('co_' + cFarmacia.id + '_' + addDays(d, 12).replace(/-/g, '')).set(soDoc({
    num: n1, status: 'PROGRAMADA', contractId: cFarmacia.id, techId: CARLOS, client: cliOf(cFarmacia),
    scheduledDate: addDays(d, 12), time: '09:00',
    equipments: [eqEntry(fa), eqEntry(fb), eqEntry(fc)],
  }));

  // 2) Periódica multi-equipo EN_PROGRESO (checklist cargado, parcialmente lleno)
  const n2 = await nextNum('serviceOrders', 'OS');
  await t('serviceOrders').doc('co_' + cSuper.id + '_' + d.replace(/-/g, '')).set(soDoc({
    num: n2, status: 'EN_PROGRESO', contractId: cSuper.id, techId: MARIA, client: cliOf(cSuper),
    scheduledDate: d, time: '08:00', startedAt: now(),
    equipments: [
      eqEntry(sa, snapshotChecklist('Aire Acondicionado', [{ answer: true }, { answer: 95 }, {}], 'María Rodríguez')),
      eqEntry(sb, snapshotChecklist('Aire Acondicionado')),
    ],
    history: [{ status: 'PROGRAMADA', at: addDays(d, -3) + ' 06:00', by: 'scheduler' }, { status: 'EN_PROGRESO', at: now(), by: 'María Rodríguez' }],
  }));

  // 3) Periódica multi-equipo TERMINADA + reporte público + firma (Farmacia, mes pasado)
  const doneDate = addDays(d, -8);
  const ref3 = t('serviceOrders').doc('co_' + cFarmacia.id + '_' + doneDate.replace(/-/g, ''));
  const n3 = await nextNum('serviceOrders', 'OS');
  const report = await publicReportToken(ref3.id);
  await ref3.set(soDoc({
    num: n3, status: 'PENDIENTE_FACTURAR', contractId: cFarmacia.id, techId: CARLOS, client: cliOf(cFarmacia),
    scheduledDate: doneDate, time: '09:00', startedAt: doneDate + ' 09:05', finishedAt: doneDate + ' 10:30',
    cadenceApplied: true,
    equipments: [
      eqEntry(fa, snapshotChecklist('Refrigerador', [{ answer: true }, { answer: 'Bueno' }, { answer: 4.2 }, { photoUrl: fotoRefri.url, photoPath: fotoRefri.path }])),
      eqEntry(fb, snapshotChecklist('Refrigerador', [{ answer: true }, { answer: 'Regular' }, { answer: 9.1, alert: true }, { photoUrl: fotoRefri.url, photoPath: fotoRefri.path }])),
      eqEntry(fc, snapshotChecklist('Congelador', [{ answer: true }, { answer: -18 }])),
    ],
    observations: 'Mantenimiento completo de los 3 equipos. El refrigerador IMB-2210 quedó con temperatura alta, se recomienda recarga de gas.',
    signature: { name: 'Lic. Roberto Solano', idNumber: '109870456', path: sign.path, url: sign.url, at: doneDate + ' 10:28' },
    reportShare: report, requiresInvoice: true, chargeTypeId: cargoMant.id, clientId: cliFarmacia.id, billAmount: 95000, billingApplied: false,
    history: [{ status: 'PROGRAMADA', at: doneDate + ' 06:00', by: 'scheduler' }, { status: 'SERVICIO_TERMINADO', at: doneDate + ' 10:30', by: 'Carlos Jiménez', note: 'Firmado por Lic. Roberto Solano' }, { status: 'PENDIENTE_FACTURAR', at: doneDate + ' 10:31', by: 'sistema' }],
  }));
  console.log('  reporte público (terminada): ' + report.url);

  // 4) Correctiva multi-equipo PROGRAMADA (2 aires del Súper)
  const n4 = await nextNum('serviceOrders', 'OS');
  await t('serviceOrders').doc().set(soDoc({
    num: n4, type: 'correctivo', status: 'PROGRAMADA', contractId: cSuper.id, techId: MARIA, client: cliOf(cSuper),
    scheduledDate: addDays(d, 2), time: '14:00', skipNotice: true,
    equipments: [eqEntry(sa), eqEntry(sb)], notes: 'Reportan poco frío en ambas cajas.',
  }));

  // 5) POR DEMANDA en EN_REVISION (ex orden de trabajo): checklist ad-hoc, evidencia, materiales, visita
  const n5 = await nextNum('serviceOrders', 'OS');
  await t('serviceOrders').doc().set(soDoc({
    num: n5, type: 'correctivo', mode: 'demanda', status: 'EN_REVISION', contractId: cTorre.id, techId: ESTEBAN,
    client: { name: 'Torre Empresarial Escazú', email: 'admin@torreescazu.cr', phone: '2588-9000' },
    scheduledDate: addDays(d, -1), time: '10:00', startedAt: addDays(d, -1) + ' 10:05', finishedAt: addDays(d, -1) + ' 12:40', readyAt: addDays(d, -1) + ' 12:45',
    title: 'Reparación de portón vehicular', site: 'Sótano 1', address: 'Escazú, San José', priority: 'alta',
    description: 'El portón vehicular no abre con el control remoto. Revisar motor y tarjeta.',
    requiresReview: true,
    visits: [{
      id: 'vd1', date: addDays(d, -1), techId: ESTEBAN, techName: 'Esteban Mora',
      note: 'Diagnóstico, reemplazo de tarjeta de control y pruebas de apertura.',
      segments: [
        { start: addDays(d, -1) + ' 10:05', end: addDays(d, -1) + ' 12:10' },
        { start: addDays(d, -1) + ' 13:00', end: addDays(d, -1) + ' 14:35' },
      ],
      hours: 3.67, at: addDays(d, -1) + ' 14:35', by: 'Esteban Mora',
    }],
    checklist: [
      { id: 'c0', text: 'Revisar motor y engranajes', done: true, by: 'Esteban Mora', at: addDays(d, -1) + ' 11:00', visitId: 'vd1' },
      { id: 'c1', text: 'Reemplazar tarjeta de control', done: true, by: 'Esteban Mora', at: addDays(d, -1) + ' 11:50', visitId: 'vd1' },
      { id: 'c2', text: 'Probar apertura/cierre 5 veces', done: true, by: 'Esteban Mora', at: addDays(d, -1) + ' 14:20', visitId: 'vd1' },
    ],
    evidence: [
      { id: 'e' + rid(), path: fotoPorton.path, file: fotoPorton.url, type: 'image', name: 'porton.svg', desc: 'Portón reparado', by: 'Esteban Mora', date: addDays(d, -1) + ' 14:30', status: 'ready', visitId: 'vd1' },
    ],
    materials: [
      { productId: null, name: 'Tarjeta de control de portón', qty: 1, comment: 'Repuesto cliente' },
      { productId: invIds[1].id, name: invIds[1].name, qty: 0, comment: '' },
    ],
    materialsNote: 'Se usó tarjeta provista por el cliente.',
    requiresInvoice: true, chargeTypeId: cargoRep.id, clientId: cliFarmacia.id, billAmount: 60000,
    history: [{ status: 'PROGRAMADA', at: addDays(d, -1) + ' 09:00', by: 'Admin' }, { status: 'EN_PROGRESO', at: addDays(d, -1) + ' 10:05', by: 'Esteban Mora' }, { status: 'SERVICIO_TERMINADO', at: addDays(d, -1) + ' 12:40', by: 'Esteban Mora' }, { status: 'EN_REVISION', at: addDays(d, -1) + ' 12:45', by: 'sistema', note: 'En espera de revisión interna' }],
  }));

  console.log('✓ 5 órdenes (periódica multi-equipo PROGRAMADA/EN_PROGRESO/terminada, correctiva, demanda en revisión)');
  console.log('\nDemo completo. Entrá como admin@aditumcr.com / Aditum2026!');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
