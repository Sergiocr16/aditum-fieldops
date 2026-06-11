/* © 2026 Aditum — Valida las tools MCP de mantenimiento contra el emulador de Firestore.
   NO toca producción: usa un tenant desechable y lo limpia al final.
   Uso:
     FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_PROJECT_ID=demo-aditum-fieldops \
       node mcp/scripts/validate-maintenance.mjs
   Requiere haber compilado antes: npm --prefix shared run build && npm --prefix mcp run build */
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
import admin from 'firebase-admin';
import { registerTools } from '../dist/tools.js';

const projectId = process.env.FIREBASE_PROJECT_ID || 'demo-aditum-fieldops';
admin.initializeApp({ projectId });
const db = admin.firestore();
const TENANT = '_mcp_validate';

// Mock del McpServer: captura los handlers por nombre.
const handlers = {};
const server = { tool(name, _desc, _schema, handler) { handlers[name] = handler; } };
registerTools(server, db, TENANT, 'Validator', admin.auth());

const call = async (name, args = {}) => {
  const h = handlers[name];
  if (!h) throw new Error('tool no registrada: ' + name);
  const res = await h(args);
  const text = res?.content?.[0]?.text ?? '';
  try { return JSON.parse(text); } catch { return text; }
};

let pass = 0, fail = 0;
const check = (cond, msg) => { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗ FALLO:', msg); } };

async function wipe() {
  for (const c of ['equipmentTypes', 'equipment', 'contracts', 'serviceOrders', 'checklistTemplates', 'tickets', 'invoiceItems', 'invoices', 'counters']) {
    const snap = await db.collection('tenants').doc(TENANT).collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await db.collection('tenants').doc(TENANT).delete().catch(() => {});
  await db.collection('users').doc('_tech_mcp_validate').delete().catch(() => {});
}

console.log('Tools de creación registradas:', Object.keys(handlers).filter((n) => n.startsWith('create_')).sort().join(', '));

await wipe();
await db.collection('tenants').doc(TENANT).set({ numbering: { ticketPrefix: 'AD', contractPrefix: 'CT', osPrefix: 'OS' }, defaultPeriodicityMonths: 3 });
await db.collection('users').doc('_tech_mcp_validate').set({ tenantId: TENANT, role: 'tech', name: 'Tecnico Prueba', email: 'tech@val.cr', active: true });
await db.collection('users').doc('_admin_mcp_validate').set({ tenantId: TENANT, role: 'admin', name: 'Admin Prueba', email: 'admin@val.cr', active: true });

console.log('\n== 1. create_equipment_type ==');
const ty = await call('create_equipment_type', { name: 'Refrigerador' });
check(ty.ok && ty.id, 'tipo de equipo creado');
const ty2 = await call('create_equipment_type', { name: ' refrigerador ' });
check(ty2.existed && ty2.id === ty.id, 'idempotente por nombre (no duplica)');

console.log('\n== 2. create_contract ==');
const ct = await call('create_contract', { licitacionNum: 'LIC-001', clientName: 'Condominio Vista', clientEmail: 'cliente@vista.cr', startDate: '2026-06-01', periodicityMonths: 3, technician: 'Tecnico' });
check(ct.created && /^CT-\d+$/.test(ct.num), `contrato creado (${ct.num})`);

console.log('\n== 3. create_equipment ==');
const eq = await call('create_equipment', { contract: ct.num, typeName: 'Refrigerador', brand: 'LG', model: 'X1', serial: 'SN-001', location: 'Cocina', periodicityMonths: 3 });
check(eq.ok && eq.id, 'equipo dado de alta');
check(eq.typeId === ty.id, 'reusó el tipo existente (no creó duplicado)');

console.log('\n== 4. create_service_order (revisión) ==');
const so = await call('create_service_order', { equipment: 'SN-001', scheduledDate: '2026-09-01', type: 'preventivo' });
check(so.created && /^OS-\d+$/.test(so.num), `orden de servicio creada (${so.num})`);
check(!!so.techId, 'técnico heredado del equipo/contrato');

console.log('\n== 5. lecturas / consistencia ==');
const types = await call('list_equipment_types');
check(Array.isArray(types) && types.length === 1, 'list_equipment_types');
const eqs = await call('list_equipment', { contract: ct.num });
check(eqs.length === 1, 'list_equipment por contrato');
const sos = await call('list_service_orders');
check(sos.length === 1, 'list_service_orders');
const got = await call('get_service_order', { idOrNum: so.num });
check(got.found && got.status === 'PROGRAMADA', 'get_service_order → estado PROGRAMADA');
check(got.equipmentSnapshot?.typeName === 'Refrigerador' && got.equipmentSnapshot?.serial === 'SN-001', 'snapshot de equipo correcto');
check(got.client?.name === 'Condominio Vista', 'snapshot de cliente tomado del contrato');

console.log('\n== 6. ciclo de vida de OS (confirmar → iniciar → completar) ==');
const conf = await call('confirm_service_order', { idOrNum: so.num });
check(conf.ok && conf.status === 'CONFIRMADA', 'confirm_service_order → CONFIRMADA');
const start = await call('start_service_order', { idOrNum: so.num });
check(start.ok && start.status === 'EN_PROGRESO', 'start_service_order → EN_PROGRESO');
const comp = await call('complete_service_order', { idOrNum: so.num, signature: { name: 'Juan Cliente', idNumber: '1-1111-1111', path: 'sig/x.png', url: 'https://x/sig.png' } });
check(comp.ok && comp.status === 'SERVICIO_TERMINADO', 'complete_service_order → SERVICIO_TERMINADO');
const gotDone = await call('get_service_order', { idOrNum: so.num });
check(gotDone.signature?.name === 'Juan Cliente' && gotDone.finishedAt, 'firma y finishedAt persistidos');

console.log('\n== 7. reagendar y cancelar OS ==');
const so2 = await call('create_service_order', { equipment: 'SN-001', scheduledDate: '2026-10-01' });
const resch = await call('reschedule_service_order', { idOrNum: so2.num, date: '2026-10-15', time: '09:00' });
check(resch.ok && resch.scheduledDate === '2026-10-15', 'reschedule_service_order → REAGENDADA');
const canc = await call('cancel_service_order', { idOrNum: so2.num, reason: 'prueba' });
check(canc.ok && canc.status === 'CANCELADA', 'cancel_service_order → CANCELADA');

console.log('\n== 8. ciclo de vida de ticket (crear → revisión → aprobar / rechazar) ==');
const tk = await call('create_ticket', { title: 'Cambio de lector', client: 'Condominio Vista', technician: 'Tecnico' });
check(/^AD-\d+$/.test(tk.num), `ticket creado (${tk.num})`);
await call('set_ticket_status', { idOrNum: tk.num, status: 'listo_revision' });
const appr = await call('approve_ticket', { idOrNum: tk.num, comment: 'Todo OK' });
check(appr.ok && appr.status === 'aprobado', 'approve_ticket → aprobado');
const tk2 = await call('create_ticket', { title: 'Revisión motor', client: 'Condominio Vista' });
const rej = await call('reject_ticket', { idOrNum: tk2.num, comment: 'Falta foto' });
check(rej.ok && rej.status === 'rechazado', 'reject_ticket → rechazado');
const cmt = await call('add_ticket_comment', { idOrNum: tk.num, text: 'nota interna' });
check(cmt.ok, 'add_ticket_comment');

console.log('\n== 9. run_scheduler (generar preventivas) ==');
const sched = await call('run_scheduler', { horizonDays: 120 });
check(sched.ok && sched.equipmentChecked >= 1, 'run_scheduler corre y revisa equipos');
check(sched.created >= 1, `run_scheduler generó preventivas (${sched.created})`);
const sched2 = await call('run_scheduler', { horizonDays: 120 });
check(sched2.created === 0, 'run_scheduler idempotente (segunda corrida no duplica)');

console.log('\n== 10. CRUD: update / delete ==');
await call('update_contract', { idOrNum: ct.num, clientName: 'Vista Real', clientPhone: '8888-0000' });
const ctU = await call('get_contract', { idOrNum: ct.num });
check(ctU.clientName === 'Vista Real' && ctU.clientPhone === '8888-0000', 'update_contract aplicó cambios');
await call('update_equipment', { equipment: 'SN-001', location: 'Cocina principal' });
const eqU = await call('list_equipment', { contract: ct.num });
check(eqU[0].location === 'Cocina principal', 'update_equipment aplicó cambios');
const tyTmp = await call('create_equipment_type', { name: 'Compresor' });
const tyR = await call('update_equipment_type', { idOrName: 'Compresor', name: 'Compresores' });
check(tyR.ok && tyR.name === 'Compresores', 'update_equipment_type renombra');
const delT = await call('delete_equipment_type', { idOrName: 'Compresores' });
check(delT.ok, 'delete_equipment_type (sin uso) elimina');
const delTUsed = await call('delete_equipment_type', { idOrName: 'Refrigerador' });
check(!delTUsed.ok, 'delete_equipment_type en uso → rechazado');
const delCt = await call('delete_contract', { idOrNum: ct.num });
check(!delCt.ok, 'delete_contract con equipos → rechazado');
const eqDel = await call('create_equipment', { contract: ct.num, typeName: 'Refrigerador', serial: 'SN-DEL' });
const delEq = await call('delete_equipment', { equipment: 'SN-DEL' });
check(delEq.ok, 'delete_equipment elimina');

console.log('\n== 11. plantillas de checklist (versionadas) ==');
const pub1 = await call('publish_checklist_template', { type: 'Refrigerador', items: [
  { label: 'Temperatura', type: 'numero', required: true, unit: '°C', min: 0, max: 8, section: 'Mediciones' },
  { label: 'Limpieza de serpentín', type: 'si_no', required: true, section: 'Inspección' },
  { label: 'Foto frontal', type: 'foto', required: true },
] });
check(pub1.ok && pub1.version === 1 && pub1.items === 3 && pub1.sections === 2, 'publish v1 (3 ítems, 2 secciones)');
const pub2 = await call('publish_checklist_template', { type: 'Refrigerador', items: [{ label: 'Estado general', type: 'texto', required: true }] });
check(pub2.ok && pub2.version === 2, 'publish v2 (nueva versión)');
const tpls = await call('list_checklist_templates', { type: 'Refrigerador' });
check(tpls.activeVersion === 2 && tpls.versions.length === 2, 'list_checklist_templates → activa v2, 2 versiones');
check(tpls.versions.find((v) => v.version === 1)?.status === 'superseded', 'v1 quedó superseded');
const tysNow = await call('list_equipment_types');
check(tysNow.find((x) => x.name === 'Refrigerador')?.templateVersion === 2, 'tipo apunta a activeTemplateVersion 2');

console.log('\n== 12. la plantilla activa se aplica al iniciar una OS ==');
const so3 = await call('create_service_order', { equipment: 'SN-001', scheduledDate: '2027-01-10' });
const start3 = await call('start_service_order', { idOrNum: so3.num });
check(start3.ok && start3.templateVersion === 2 && start3.checklistItems === 1, 'start_service_order cargó el checklist de la plantilla activa');

console.log('\n== 13. personal / técnicos (Auth) ==');
const createdUids = [];
const tcr = await call('create_technician', { name: 'Carlos Tec', email: 'carlos@val.cr', roles: ['tech'], phone: '6000' });
check(tcr.ok && tcr.uid && tcr.password && tcr.roles.join() === 'tech', 'create_technician (técnico) + contraseña');
if (tcr.uid) createdUids.push(tcr.uid);
const claimsTec = (await admin.auth().getUser(tcr.uid)).customClaims || {};
check(claimsTec.role === 'tech' && claimsTec.tenantId === TENANT, 'claims del técnico (role/tenantId)');

const acr = await call('create_technician', { name: 'Ana Escritorio', email: 'ana@val.cr', roles: ['coordinador', 'facturacion'] });
check(acr.ok && acr.roles.join() === 'coordinador,facturacion', 'create_technician (escritorio multi-rol)');
if (acr.uid) createdUids.push(acr.uid);
const claimsAna = (await admin.auth().getUser(acr.uid)).customClaims || {};
check(claimsAna.role === 'coordinador' && JSON.stringify(claimsAna.roles) === JSON.stringify(['coordinador', 'facturacion']), 'claims multi-rol');

const staff = await call('list_staff');
check(staff.find((s) => s.email === 'ana@val.cr')?.roles.join() === 'coordinador,facturacion', 'list_staff muestra roles');

const upd = await call('update_technician', { id: 'ana@val.cr', name: 'Ana Coordinadora', roles: ['coordinador'] });
check(upd.ok, 'update_technician aplica');
const claimsAna2 = (await admin.auth().getUser(acr.uid)).customClaims || {};
check(claimsAna2.role === 'coordinador' && JSON.stringify(claimsAna2.roles) === JSON.stringify(['coordinador']), 'update_technician actualizó claims (quitó facturación)');

const deact = await call('update_technician', { id: 'carlos@val.cr', active: false });
check(deact.ok && (await admin.auth().getUser(tcr.uid)).disabled === true, 'update_technician active:false deshabilita en Auth');

const rst = await call('reset_technician_password', { id: 'carlos@val.cr' });
check(rst.ok && rst.password && rst.password !== tcr.password, 'reset_technician_password genera nueva');

const avail = await call('set_technician_availability', { technician: 'carlos@val.cr', weeklyHours: { mon: [{ start: '08:00', end: '17:00' }], tue: [{ start: '09:00', end: '08:00' }] } });
check(avail.ok, 'set_technician_availability ok');
const carlosDoc = (await db.collection('users').doc(tcr.uid).get()).data();
check(carlosDoc.availability?.weeklyHours?.mon?.length === 1 && carlosDoc.availability?.weeklyHours?.tue?.length === 0, 'disponibilidad: rango válido guardado, inválido descartado');

const mods = await call('set_admin_modules', { admin: 'admin@val.cr', modules: ['tickets', 'serviceOrders', 'noExiste'] });
check(mods.ok && mods.modules.join() === 'tickets,serviceOrders', 'set_admin_modules filtra módulos válidos');
const modsNonAdmin = await call('set_admin_modules', { admin: 'carlos@val.cr', modules: ['tickets'] });
check(!modsNonAdmin.ok, 'set_admin_modules rechaza si el destino no es admin');

console.log('\n== 14. facturación ==');
// El invoiceItem normalmente lo crea el trigger al completar la OS; acá lo sembramos para probar.
const itemRef = db.collection('tenants').doc(TENANT).collection('invoiceItems').doc();
await itemRef.set({ status: 'pendiente', soNum: so.num, serviceOrderId: so.id, contractId: ct.id, clientName: 'Vista Real', licitacionNum: 'LIC-001', equipmentSummary: 'Refrigerador SN-001', serviceDate: '2026-09-01', type: 'preventivo', createdAt: '2026-09-01 10:00' });
const cons = await call('consolidate_invoice_items', { itemIds: [itemRef.id], note: 'Servicios septiembre' });
check(cons.ok && /^FC-\d+$/.test(cons.num), `consolidate_invoice_items → ${cons.num}`);
const itemAfter = (await itemRef.get()).data();
check(itemAfter.status === 'facturado' && itemAfter.invoiceNum === cons.num, 'ítem marcado como facturado');
const soAfterInv = await call('get_service_order', { idOrNum: so.num });
check(soAfterInv.status === 'FACTURADA', 'OS movida a FACTURADA');
const invs = await call('list_invoices');
check(invs.find((f) => f.num === cons.num)?.itemCount === 1, 'list_invoices muestra la factura');
const consAgain = await call('consolidate_invoice_items', { itemIds: [itemRef.id] });
check(!consAgain.ok, 'no reconsolida un ítem ya facturado');
const csv = await call('export_invoice_csv', {});
check(csv.ok && csv.count >= 1 && csv.csv.includes(so.num), 'export_invoice_csv genera CSV con el ítem');

console.log('\n== 15. orden de trabajo con visitas (varios días) ==');
const ptk = await call('create_ticket', { title: 'Pintura fachada', client: 'Condominio Vista', technician: 'Tecnico', checklist: ['Lijar', 'Primera mano'] });
const v1 = await call('add_ticket_visit', { idOrNum: ptk.num, note: 'Día 1: lijado', date: '2026-09-01', hours: 6 });
check(v1.ok && v1.visits === 1 && !!v1.visitId, `add_ticket_visit día 1 (${ptk.num})`);
const v2 = await call('add_ticket_visit', { idOrNum: ptk.num, note: 'Día 2: primera mano' });
check(v2.ok && v2.visits === 2 && v2.num === ptk.num, 'add_ticket_visit día 2 en la MISMA orden');
const gotTk = await call('get_ticket', { idOrNum: ptk.num });
check((gotTk.visits || []).length === 2, 'la orden tiene 2 visitas (una sola orden)');
check(gotTk.visits[0].note.includes('Día 1') && gotTk.visits[1].note.includes('Día 2'), 'cada visita guarda lo que se hizo ese día');
check(gotTk.visits[0].hours === 6, 'guarda horas por visita');
check(gotTk.status === 'en_proceso', 'la orden queda en_proceso (sigue abierta entre días)');
check((gotTk.checklist || []).length === 2, 'checklist único de la orden (no se duplica por día)');
check(gotTk.continuationOf === undefined && gotTk.jobGroupId === undefined, 'no hay órdenes enlazadas: es una sola');

for (const uid of createdUids) {
  await admin.auth().deleteUser(uid).catch(() => {});
  await db.collection('users').doc(uid).delete().catch(() => {});
}
await db.collection('users').doc('_admin_mcp_validate').delete().catch(() => {});

await wipe();
// tickets quedan en una subcolección extra; limpiar
for (const c of ['tickets']) {
  const s = await db.collection('tenants').doc(TENANT).collection(c).get();
  await Promise.all(s.docs.map((d) => d.ref.delete()));
}
console.log(`\nRESULTADO: ${pass} ok, ${fail} fallos`);
process.exit(fail ? 1 : 0);
