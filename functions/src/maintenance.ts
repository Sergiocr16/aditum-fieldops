/* © 2026 Aditum — Aditum FieldOps — maintenance module callables (contracts/equipment/availability) */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { randomBytes } from 'crypto';
import { nowCR, addMonthsCR, validateEquipment, buildEquipmentDoc, PERIODICITIES, PeriodicityMonths, WEEKDAY_KEYS } from './shared';
import { assertRoles, tcol } from './tenant';

const db = () => admin.firestore();

/** Weekly working hours of a technician. Tech edits their own; admin edits any
    tech of their tenant. Only path that writes users.availability (users rules
    block all client writes). */
export const setTechnicianAvailability = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const { role, tenantId } = req.auth.token as any;
  const canManageOthers = role === 'admin' || role === 'coordinador';
  if (!canManageOthers && role !== 'tech') throw new HttpsError('permission-denied', 'No autorizado.');
  if (!tenantId) throw new HttpsError('permission-denied', 'No autorizado.');
  const targetId: string = canManageOthers && req.data?.techId ? String(req.data.techId) : req.auth.uid;
  const userSnap = await db().collection('users').doc(targetId).get();
  if (!userSnap.exists || (userSnap.data() as any).tenantId !== tenantId) {
    throw new HttpsError('permission-denied', 'Usuario de otro tenant.');
  }
  if (role === 'tech' && targetId !== req.auth.uid) throw new HttpsError('permission-denied', 'Solo tu propia disponibilidad.');

  const weeklyHours = req.data?.weeklyHours || {};
  const clean: Record<string, { start: string; end: string }[]> = {};
  for (const day of WEEKDAY_KEYS) {
    const ranges = Array.isArray(weeklyHours[day]) ? weeklyHours[day] : [];
    clean[day] = ranges
      .filter((r: any) => /^\d{2}:\d{2}$/.test(r?.start || '') && /^\d{2}:\d{2}$/.test(r?.end || '') && r.start < r.end)
      .slice(0, 4)
      .map((r: any) => ({ start: r.start, end: r.end }));
  }
  await db().collection('users').doc(targetId).set({ availability: { weeklyHours: clean }, updatedAt: nowCR() }, { merge: true });
  return { ok: true };
});

export interface EquipmentCsvRow {
  typeName?: string;
  typeId?: string;
  brand?: string;
  model?: string;
  serial?: string;
  location?: string;
  technician?: string; // name or email
  periodicityMonths?: number | string;
  nextScheduledDate?: string;
  notes?: string;
}

/** Bulk import of equipment for a contract (CSV parsed client-side).
    Resolves type by name (creating missing types), technician by name/email,
    dedupes by serial within the contract, and computes the initial
    nextScheduledDate from the contract periodicity. */
export const importEquipment = onCall(async (req) => {
  const ctx = assertRoles(req, ['admin', 'coordinador']);
  const { contractId, rows } = (req.data || {}) as { contractId: string; rows: EquipmentCsvRow[] };
  if (!contractId || !Array.isArray(rows) || !rows.length) {
    throw new HttpsError('invalid-argument', 'contractId y rows son requeridos.');
  }
  if (rows.length > 2000) throw new HttpsError('invalid-argument', 'Máximo 2000 filas por importación.');

  const contractSnap = await tcol(ctx.tenantId, 'contracts').doc(contractId).get();
  if (!contractSnap.exists) throw new HttpsError('not-found', 'Contrato no encontrado.');
  const contract = contractSnap.data() as any;

  // catálogo de tipos (por nombre, case-insensitive)
  const typesSnap = await tcol(ctx.tenantId, 'equipmentTypes').get();
  const typeByName = new Map<string, string>();
  typesSnap.docs.forEach((d) => typeByName.set(((d.data() as any).name || '').trim().toLowerCase(), d.id));

  // técnicos del tenant (por nombre o email)
  const techsSnap = await db().collection('users').where('tenantId', '==', ctx.tenantId).where('role', '==', 'tech').get();
  const findTech = (q?: string): string | null => {
    if (!q?.trim()) return null;
    const k = q.trim().toLowerCase();
    const m = techsSnap.docs.find((d) => ((d.data() as any).name || '').toLowerCase().includes(k) || ((d.data() as any).email || '').toLowerCase() === k);
    return m ? m.id : null;
  };

  // seriales ya existentes en el contrato (dedupe)
  const existingSnap = await tcol(ctx.tenantId, 'equipment').where('contractId', '==', contractId).get();
  const existingSerials = new Set(existingSnap.docs.map((d) => ((d.data() as any).serial || '').trim().toLowerCase()).filter(Boolean));

  const batchId = 'imp_' + randomBytes(5).toString('hex');
  const startBase = contract.startDate || nowCR().slice(0, 10);
  const errors: { row: number; error: string }[] = [];
  let created = 0;
  let skipped = 0;
  let typesCreated = 0;

  let batch = db().batch();
  let ops = 0;
  const commit = async () => {
    if (ops > 0) {
      await batch.commit();
      batch = db().batch();
      ops = 0;
    }
  };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
    const typeName = (r.typeName || '').trim();
    let typeId = (r.typeId || '').trim();
    if (!typeId && typeName) {
      const key = typeName.toLowerCase();
      typeId = typeByName.get(key) || '';
      if (!typeId) {
        const ref = tcol(ctx.tenantId, 'equipmentTypes').doc();
        batch.set(ref, { name: typeName, active: true, activeTemplateVersion: 0, createdAt: nowCR(), updatedAt: nowCR(), createdBy: ctx.uid });
        ops++;
        typeByName.set(key, ref.id);
        typeId = ref.id;
        typesCreated++;
      }
    }
    if (!typeId) {
      errors.push({ row: i + 1, error: 'tipo de equipo vacío' });
      continue;
    }
    const serial = (r.serial || '').trim();
    if (serial && existingSerials.has(serial.toLowerCase())) {
      skipped++;
      continue;
    }
    let per: PeriodicityMonths | null = null;
    if (r.periodicityMonths != null && String(r.periodicityMonths).trim() !== '') {
      const p = Number(r.periodicityMonths);
      if (!PERIODICITIES.includes(p as PeriodicityMonths)) {
        errors.push({ row: i + 1, error: 'periodicidad inválida: ' + r.periodicityMonths });
        continue;
      }
      per = p as PeriodicityMonths;
    }
    const effPer = per ?? (contract.defaultPeriodicityMonths || 3);
    const cap = (v: any, n = 120) => String(v || '').slice(0, n); // límite por campo (anti-DoS)
    const input = {
      contractId,
      typeId,
      brand: cap(r.brand),
      model: cap(r.model),
      serial: cap(serial, 80),
      location: cap(r.location),
      assignedTechId: findTech(r.technician) || contract.defaultTechId || null,
      periodicityMonths: per,
      nextScheduledDate: (r.nextScheduledDate || '').trim() || addMonthsCR(startBase, effPer),
      notes: cap(r.notes, 500),
    };
    const errs = validateEquipment(input);
    if (errs.length) {
      errors.push({ row: i + 1, error: errs.join(', ') });
      continue;
    }
    const ref = tcol(ctx.tenantId, 'equipment').doc();
    batch.set(ref, { ...buildEquipmentDoc(input, ctx.uid), importBatchId: batchId });
    ops++;
    if (serial) existingSerials.add(serial.toLowerCase());
    created++;
    if (ops >= 400) await commit();
  }
  await commit();

  return { created, skipped, typesCreated, errors, batchId };
});
