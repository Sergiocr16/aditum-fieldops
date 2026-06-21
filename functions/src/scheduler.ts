/* © 2026 Aditum — Aditum FieldOps — daily maintenance scheduler.
   Phase 1: generates preventive service orders by periodicity (idempotent via
   deterministic ids). Phases 2-3 (client notices / reminders) live in
   publicFlow.ts and run from the same daily job. */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import { nowCR, addPeriodCR, soContractPlanId, createServiceOrderWithNumber, PeriodicityMonths, PERIODICITIES } from './shared';
import { tcol, tenantRef } from './tenant';
import { SMTP_USER, SMTP_PASS } from './notifications';
import { sendNotices, sendReminders } from './publicFlow';

const db = () => admin.firestore();

export interface MaintenanceSettings {
  horizonDays: number;
  defaultNoticeDaysBefore: number;
  reminderEnabled: boolean;
  slotDurationMin: number;
  holdMinutes: number;
  tokenTtlDays: number;
  defaultWeeklyHours: Record<string, { start: string; end: string }[]>;
}

export const DEFAULT_SETTINGS: MaintenanceSettings = {
  horizonDays: 60,
  defaultNoticeDaysBefore: 3,
  reminderEnabled: true,
  slotDurationMin: 60,
  holdMinutes: 15,
  tokenTtlDays: 14,
  defaultWeeklyHours: {
    mon: [{ start: '08:00', end: '17:00' }],
    tue: [{ start: '08:00', end: '17:00' }],
    wed: [{ start: '08:00', end: '17:00' }],
    thu: [{ start: '08:00', end: '17:00' }],
    fri: [{ start: '08:00', end: '17:00' }],
    sat: [],
    sun: [],
  },
};

export async function getSettings(tid: string): Promise<MaintenanceSettings> {
  const snap = await tcol(tid, 'settings').doc('maintenance').get();
  return { ...DEFAULT_SETTINGS, ...(snap.exists ? (snap.data() as any) : {}) };
}

/** Generates preventive service orders for one tenant within the horizon.
    Idempotent: deterministic ids (eq_{equipmentId}_{YYYYMMDD}) make duplicate
    occurrences impossible even if the job runs twice. */
export async function generateForTenant(tid: string, today: string): Promise<{ created: number; checked: number }> {
  const settings = await getSettings(tid);
  const tenantSnap = await tenantRef(tid).get();
  const osPrefix = (tenantSnap.exists && (tenantSnap.data() as any).numbering?.osPrefix) || 'OS';

  const contractsSnap = await tcol(tid, 'contracts').where('active', '==', true).get();
  const contracts = new Map<string, any>();
  contractsSnap.docs.forEach((d) => contracts.set(d.id, d.data()));

  const typesSnap = await tcol(tid, 'equipmentTypes').get();
  const typeNames = new Map<string, string>();
  typesSnap.docs.forEach((d) => typeNames.set(d.id, (d.data() as any).name || ''));

  // Agrupar equipos activos por contrato: una sola orden por contrato/visita con todos sus equipos.
  const equipmentSnap = await tcol(tid, 'equipment').where('active', '==', true).get();
  const byContract = new Map<string, any[]>();
  for (const eqDoc of equipmentSnap.docs) {
    const eq = { id: eqDoc.id, ...(eqDoc.data() as any) };
    if (!byContract.has(eq.contractId)) byContract.set(eq.contractId, []);
    byContract.get(eq.contractId)!.push(eq);
  }

  let created = 0;
  let checked = 0;

  for (const [contractId, contractDoc] of contracts) {
    const contract = contractDoc;
    if (contract.modality === 'demanda') continue; // por demanda no genera automáticas
    const eqs = byContract.get(contractId) || [];
    if (!eqs.length) continue; // sin equipos no hay visita
    checked++;

    const per: PeriodicityMonths = (PERIODICITIES.includes(contract.defaultPeriodicityMonths) ? contract.defaultPeriodicityMonths : 3) as PeriodicityMonths;
    const noticeDays = contract.noticeDaysBefore ?? settings.defaultNoticeDaysBefore;
    let cursor: string = contract.nextScheduledDate || addPeriodCR(contract.lastServiceDate || contract.startDate || today, per);

    const equipments = eqs.map((eq) => ({
      equipmentId: eq.id,
      equipmentSnapshot: {
        typeId: eq.typeId,
        typeName: typeNames.get(eq.typeId) || '',
        brand: eq.brand || '',
        model: eq.model || '',
        serial: eq.serial || '',
        location: eq.location || '',
      },
      condition: eq.condition || 'operativo',
    }));

    let guard = 0;
    while (cursor <= addDays(today, settings.horizonDays) && guard < 50) {
      guard++;
      if (contract.endDate && cursor > contract.endDate) break; // fuera de vigencia
      const res = await createServiceOrderWithNumber(
        db(),
        tid,
        {
          type: 'preventivo',
          contractId,
          equipments,
          client: { name: contract.clientName || '', email: contract.clientEmail || '', phone: contract.clientPhone || '' },
          techId: contract.defaultTechId || null,
          planDate: cursor,
          scheduledDate: cursor,
          noticeDaysBefore: noticeDays,
        },
        'scheduler',
        osPrefix,
        soContractPlanId(contractId, cursor)
      );
      if (res.created) created++;
      cursor = addPeriodCR(cursor, per);
      await tcol(tid, 'contracts').doc(contractId).set({ nextScheduledDate: cursor, updatedAt: nowCR() }, { merge: true });
    }
  }
  return { created, checked };
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

async function runAllPhases(tid: string, today: string) {
  const stats: any = { tenant: tid };
  try {
    stats.generate = await generateForTenant(tid, today);
  } catch (e) {
    logger.error(`scheduler/generate falló para tenant ${tid}`, e as Error);
    stats.generateError = String((e as Error).message);
  }
  try {
    stats.notices = await sendNotices(tid, today);
  } catch (e) {
    logger.error(`scheduler/notices falló para tenant ${tid}`, e as Error);
    stats.noticesError = String((e as Error).message);
  }
  try {
    stats.reminders = await sendReminders(tid, today);
  } catch (e) {
    logger.error(`scheduler/reminders falló para tenant ${tid}`, e as Error);
    stats.remindersError = String((e as Error).message);
  }
  return stats;
}

/** Daily job, 6:00 AM Costa Rica. One job, three phases per tenant; a failing
    tenant or phase never aborts the rest. */
export const dailyMaintenanceJob = onSchedule(
  { schedule: '0 6 * * *', timeZone: 'America/Costa_Rica', timeoutSeconds: 540, memory: '512MiB', secrets: [SMTP_USER, SMTP_PASS] },
  async () => {
    const today = nowCR().slice(0, 10);
    const tenants = await db().collection('tenants').where('active', '==', true).get();
    for (const t of tenants.docs) {
      const stats = await runAllPhases(t.id, today);
      logger.info('dailyMaintenanceJob', stats);
    }
  }
);

/** Manual trigger: admin runs it for their tenant, superadmin for all.
    Same code path as the daily job (useful for testing and onboarding). */
export const runMaintenanceScheduler = onCall({ secrets: [SMTP_USER, SMTP_PASS], timeoutSeconds: 540 }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const role = req.auth.token.role as string;
  const today = nowCR().slice(0, 10);
  if (role === 'superadmin') {
    const tenants = await db().collection('tenants').where('active', '==', true).get();
    const all = [];
    for (const t of tenants.docs) all.push(await runAllPhases(t.id, today));
    return { ok: true, stats: all };
  }
  if ((role === 'admin' || role === 'coordinador') && req.auth.token.tenantId) {
    const stats = await runAllPhases(req.auth.token.tenantId as string, today);
    return { ok: true, stats: [stats] };
  }
  throw new HttpsError('permission-denied', 'No autorizado.');
});
