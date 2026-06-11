/* © 2026 Aditum — Aditum FieldOps — MCP tools (tenant-scoped).
   Every tool operates strictly inside tenants/{tenantId}/...; the technicians
   lookup uses the global `users` collection filtered by tenantId. */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import type { firestore, auth } from 'firebase-admin';
import {
  createTicketWithNumber,
  buildVisit,
  createContractWithNumber,
  createServiceOrderWithNumber,
  buildEquipmentDoc,
  validateEquipment,
  buildWikiPageDoc,
  validateWikiPage,
  buildClientDoc,
  validateClient,
  NewClientInput,
  nowCR,
  addMonthsCR,
  addDaysCR,
  soPlanId,
  computeNoticeDate,
  canTransition,
  initialsOf,
  WEEKDAY_KEYS,
  STATUSES,
  WIKI_STATUSES,
  PERIODICITIES,
  PeriodicityMonths,
  ServiceOrderStatus,
} from '@aditum/fieldops-shared';

type Db = firestore.Firestore;
type Auth = auth.Auth;

/** Contraseña inicial legible (misma forma que la callable createTechnician). */
function genPassword(): string {
  const a = 'ABCDEFGHJKMNPQRSTUVWXYZ', b = 'abcdefghijkmnpqrstuvwxyz', n = '23456789', s = '@#$%';
  const buf = randomBytes(8);
  const pick = (set: string, i: number) => set[buf[i] % set.length];
  return pick(a, 0) + pick(b, 1) + pick(b, 2) + pick(b, 3) + pick(n, 4) + pick(n, 5) + pick(s, 6) + pick(n, 7);
}

const ADMIN_CREATABLE = ['tech', 'coordinador', 'facturacion'];
function normalizeMemberRoles(roles: any, single?: any): string[] {
  let r = Array.isArray(roles) ? roles.filter((x: any) => ADMIN_CREATABLE.includes(x)) : [];
  if (!r.length && ADMIN_CREATABLE.includes(single)) r = [single];
  if (!r.length) r = ['tech'];
  if (r.includes('tech')) return ['tech'];
  return [...new Set(r)] as string[];
}

const VALID_MODULES = ['tickets', 'technicians', 'contracts', 'equipment', 'serviceOrders', 'calendar', 'billing', 'inventory', 'wiki', 'notifySettings'];

const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] });

export function registerTools(server: McpServer, db: Db, tenantId: string, actor = 'Admin', authClient?: Auth) {
  const BY = 'MCP · ' + actor;
  const tcol = (name: string) => db.collection('tenants').doc(tenantId).collection(name);

  /** Resuelve un usuario del tenant por uid o por correo (colección global users). */
  async function findUser(idOrEmail: string) {
    const direct = await db.collection('users').doc(idOrEmail).get();
    if (direct.exists && (direct.data() as any).tenantId === tenantId) return direct;
    const key = idOrEmail.trim().toLowerCase();
    const snap = await db.collection('users').where('tenantId', '==', tenantId).get();
    return snap.docs.find((d) => ((d.data() as any).email || '').toLowerCase() === key) || null;
  }

  let cachedPrefix: string | null = null;
  async function ticketPrefix(): Promise<string> {
    if (cachedPrefix) return cachedPrefix;
    const t = await db.collection('tenants').doc(tenantId).get();
    cachedPrefix = (t.exists && (t.data() as any).numbering?.ticketPrefix) || 'AD';
    return cachedPrefix!;
  }

  async function findTechId(nameOrId?: string | null): Promise<{ id: string | null; name?: string }> {
    if (!nameOrId) return { id: null };
    const direct = await db.collection('users').doc(nameOrId).get();
    if (direct.exists && (direct.data() as any).tenantId === tenantId) {
      return { id: direct.id, name: (direct.data() as any).name };
    }
    const snap = await db.collection('users').where('tenantId', '==', tenantId).where('role', '==', 'tech').get();
    const q = nameOrId.toLowerCase();
    const match = snap.docs.find((d) => ((d.data() as any).name || '').toLowerCase().includes(q) || ((d.data() as any).email || '').toLowerCase().includes(q));
    return match ? { id: match.id, name: (match.data() as any).name } : { id: null };
  }

  async function findTicket(idOrNum: string) {
    let doc = await tcol('tickets').doc(idOrNum).get();
    if (!doc.exists) {
      const snap = await tcol('tickets').where('num', '==', idOrNum).limit(1).get();
      if (!snap.empty) doc = snap.docs[0];
    }
    return doc.exists ? doc : null;
  }

  /* ---------------- tickets ---------------- */
  server.tool(
    'create_ticket',
    'Crea un ticket de trabajo técnico en Aditum FieldOps. Devuelve el número asignado.',
    {
      title: z.string().describe('Título del trabajo'),
      client: z.string().describe('Cliente / condominio / empresa'),
      site: z.string().optional().describe('Sitio o ubicación'),
      address: z.string().optional().describe('Dirección o referencia'),
      priority: z.enum(['baja', 'media', 'alta', 'urgente']).optional(),
      technician: z.string().optional().describe('Nombre, correo o id del técnico a asignar'),
      scheduled: z.string().optional().describe('Fecha programada YYYY-MM-DD'),
      deadline: z.string().optional().describe('Fecha límite YYYY-MM-DD'),
      description: z.string().optional(),
      instructions: z.string().optional(),
      expected: z.string().optional().describe('Resultado esperado'),
      doneConditions: z.string().optional(),
      observations: z.string().optional(),
      evidenceReq: z.string().optional().describe('Instrucciones de evidencia (qué grabar/fotografiar)'),
      checklist: z.array(z.string()).optional().describe('Ítems del checklist'),
    },
    async (args) => {
      const tech = await findTechId(args.technician);
      const input = {
        title: args.title,
        client: args.client,
        site: args.site,
        address: args.address,
        priority: args.priority,
        techId: tech.id,
        scheduled: args.scheduled,
        deadline: args.deadline,
        description: args.description,
        instructions: args.instructions,
        expected: args.expected,
        doneConditions: args.doneConditions,
        observations: args.observations,
        evidenceReq: args.evidenceReq,
        checklist: (args.checklist || []).map((text) => ({ text })),
      };
      const res = await createTicketWithNumber(db, tenantId, input, BY, tech.name, await ticketPrefix());
      return ok({ created: true, id: res.id, num: res.num, technician: tech.name || null });
    }
  );

  server.tool('list_technicians', 'Lista los técnicos (para resolver nombre -> id).', {}, async () => {
    const snap = await db.collection('users').where('tenantId', '==', tenantId).where('role', '==', 'tech').get();
    return ok(snap.docs.map((d) => ({ id: d.id, name: (d.data() as any).name, email: (d.data() as any).email, phone: (d.data() as any).phone, active: (d.data() as any).active })));
  });

  /* ---------------- personal / técnicos: alta y gestión ---------------- */
  server.tool('list_staff', 'Lista todos los miembros del tenant (técnicos, coordinadores, facturación, admins) con sus roles.', {}, async () => {
    const snap = await db.collection('users').where('tenantId', '==', tenantId).get();
    return ok(
      snap.docs.map((d) => {
        const u = d.data() as any;
        return { id: d.id, name: u.name, email: u.email, role: u.role, roles: u.roles || [u.role], active: u.active, modules: u.modules || [] };
      })
    );
  });

  server.tool(
    'create_technician',
    'Crea un miembro del tenant con su usuario de acceso: técnico (móvil) o personal de escritorio (coordinador y/o facturación). Devuelve la contraseña inicial.',
    {
      name: z.string(),
      email: z.string(),
      roles: z.array(z.enum(['tech', 'coordinador', 'facturacion'])).optional().describe("['tech'] (exclusivo) o una combinación de coordinador/facturación; por defecto técnico"),
      phone: z.string().optional(),
      password: z.string().optional().describe('Si se omite, se genera una contraseña legible'),
    },
    async (args) => {
      if (!authClient) return ok({ ok: false, error: 'gestión de usuarios no disponible en este entorno (sin Auth)' });
      if (!args.name?.trim() || !args.email?.trim()) return ok({ ok: false, error: 'name y email son obligatorios' });
      const memberRoles = normalizeMemberRoles(args.roles);
      const primary = memberRoles[0];
      const pass = (args.password && String(args.password)) || genPassword();
      let userRecord;
      try {
        userRecord = await authClient.createUser({ email: args.email.trim(), password: pass, displayName: args.name.trim() });
      } catch (e: any) {
        if (e.code === 'auth/email-already-exists') return ok({ ok: false, error: 'ya existe un usuario con ese correo' });
        return ok({ ok: false, error: e.message || 'no se pudo crear el usuario' });
      }
      await authClient.setCustomUserClaims(userRecord.uid, { role: primary, roles: memberRoles, tenantId });
      const ts = nowCR();
      await db.collection('users').doc(userRecord.uid).set({
        name: args.name.trim(),
        email: args.email.trim(),
        role: primary,
        roles: memberRoles,
        tenantId,
        phone: args.phone || '',
        active: true,
        initials: initialsOf(args.name),
        ticketsCount: 0,
        createdAt: ts,
        updatedAt: ts,
      });
      return ok({ ok: true, uid: userRecord.uid, roles: memberRoles, password: pass });
    }
  );

  server.tool(
    'update_technician',
    'Actualiza un miembro del tenant (por uid o correo): nombre, teléfono, correo, activo/inactivo, o roles (combinar coordinador/facturación; solo personal de escritorio).',
    {
      id: z.string().describe('uid o correo'),
      name: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      active: z.boolean().optional(),
      roles: z.array(z.enum(['coordinador', 'facturacion'])).optional(),
    },
    async (args) => {
      if (!authClient) return ok({ ok: false, error: 'gestión de usuarios no disponible (sin Auth)' });
      const u = await findUser(args.id);
      if (!u) return ok({ ok: false, error: 'usuario no encontrado en el tenant' });
      const id = u.id;
      const target = u.data() as any;
      const patch: any = { updatedAt: nowCR() };
      if (Array.isArray(args.roles)) {
        const curRoles: string[] = Array.isArray(target.roles) ? target.roles : [target.role];
        const isDesk = curRoles.some((r) => r === 'coordinador' || r === 'facturacion');
        const next = [...new Set(args.roles.filter((r) => r === 'coordinador' || r === 'facturacion'))] as string[];
        if (isDesk && next.length) {
          patch.role = next[0];
          patch.roles = next;
          await authClient.setCustomUserClaims(id, { role: next[0], roles: next, tenantId });
        }
      }
      if (typeof args.name === 'string') {
        patch.name = args.name.trim();
        patch.initials = initialsOf(args.name);
        await authClient.updateUser(id, { displayName: args.name.trim() });
      }
      if (typeof args.email === 'string' && args.email.trim()) {
        try {
          await authClient.updateUser(id, { email: args.email.trim() });
          patch.email = args.email.trim();
        } catch (e: any) {
          if (e.code === 'auth/email-already-exists') return ok({ ok: false, error: 'ese correo ya está en uso' });
          return ok({ ok: false, error: e.message || 'no se pudo actualizar el correo' });
        }
      }
      if (typeof args.phone === 'string') patch.phone = args.phone;
      if (typeof args.active === 'boolean') {
        patch.active = args.active;
        await authClient.updateUser(id, { disabled: !args.active });
      }
      await db.collection('users').doc(id).set(patch, { merge: true });
      return ok({ ok: true, id });
    }
  );

  server.tool(
    'reset_technician_password',
    'Regenera (o fija) la contraseña de un miembro del tenant. Devuelve la nueva contraseña.',
    { id: z.string().describe('uid o correo'), password: z.string().optional() },
    async (args) => {
      if (!authClient) return ok({ ok: false, error: 'gestión de usuarios no disponible (sin Auth)' });
      const u = await findUser(args.id);
      if (!u) return ok({ ok: false, error: 'usuario no encontrado en el tenant' });
      const pass = (args.password && String(args.password)) || genPassword();
      await authClient.updateUser(u.id, { password: pass });
      return ok({ ok: true, id: u.id, password: pass });
    }
  );

  server.tool(
    'set_technician_availability',
    `Define el horario semanal de un técnico para la agenda. Días válidos: ${WEEKDAY_KEYS.join(', ')}.`,
    {
      technician: z.string().describe('uid o correo'),
      weeklyHours: z.record(z.array(z.object({ start: z.string(), end: z.string() }))).describe('Ej: { "mon": [{"start":"08:00","end":"17:00"}], "tue": [...] }'),
    },
    async (args) => {
      const u = await findUser(args.technician);
      if (!u) return ok({ ok: false, error: 'usuario no encontrado en el tenant' });
      const wh: any = args.weeklyHours || {};
      const clean: Record<string, { start: string; end: string }[]> = {};
      for (const day of WEEKDAY_KEYS) {
        const ranges = Array.isArray(wh[day]) ? wh[day] : [];
        clean[day] = ranges
          .filter((r: any) => /^\d{2}:\d{2}$/.test(r?.start || '') && /^\d{2}:\d{2}$/.test(r?.end || '') && r.start < r.end)
          .slice(0, 4)
          .map((r: any) => ({ start: r.start, end: r.end }));
      }
      await db.collection('users').doc(u.id).set({ availability: { weeklyHours: clean }, updatedAt: nowCR() }, { merge: true });
      return ok({ ok: true, id: u.id });
    }
  );

  server.tool(
    'set_admin_modules',
    `Define qué módulos ve un administrador del tenant (lista vacía = ve todos). Módulos: ${VALID_MODULES.join(', ')}.`,
    { admin: z.string().describe('uid o correo del admin'), modules: z.array(z.string()) },
    async (args) => {
      const u = await findUser(args.admin);
      if (!u) return ok({ ok: false, error: 'usuario no encontrado en el tenant' });
      if ((u.data() as any).role !== 'admin') return ok({ ok: false, error: 'el usuario destino no es administrador' });
      const clean = [...new Set((args.modules || []).filter((m) => VALID_MODULES.includes(m)))];
      await db.collection('users').doc(u.id).set({ modules: clean, updatedAt: nowCR() }, { merge: true });
      return ok({ ok: true, id: u.id, modules: clean });
    }
  );

  server.tool(
    'list_tickets',
    'Lista tickets con filtros opcionales por estado y técnico.',
    { status: z.enum(STATUSES as [string, ...string[]]).optional(), technician: z.string().optional(), limit: z.number().optional() },
    async (args) => {
      let q: firestore.Query = tcol('tickets');
      if (args.status) q = q.where('status', '==', args.status);
      if (args.technician) {
        const tech = await findTechId(args.technician);
        if (tech.id) q = q.where('techId', '==', tech.id);
      }
      const snap = await q.limit(args.limit || 50).get();
      const rows = snap.docs.map((d) => {
        const t = d.data() as any;
        return { id: d.id, num: t.num, title: t.title, client: t.client, site: t.site, status: t.status, priority: t.priority, techId: t.techId };
      });
      return ok(rows);
    }
  );

  server.tool('get_ticket', 'Obtiene un ticket por id o por número.', { idOrNum: z.string() }, async (args) => {
    const doc = await findTicket(args.idOrNum);
    if (!doc) return ok({ found: false });
    return ok({ found: true, id: doc.id, ...(doc.data() as any) });
  });

  server.tool('assign_ticket', 'Asigna o reasigna un ticket a un técnico.', { idOrNum: z.string(), technician: z.string() }, async (args) => {
    const doc = await findTicket(args.idOrNum);
    if (!doc) return ok({ ok: false, error: 'not found' });
    const tech = await findTechId(args.technician);
    if (!tech.id) return ok({ ok: false, error: 'technician not found' });
    const t = doc.data() as any;
    await doc.ref.set(
      {
        techId: tech.id,
        status: t.status === 'pendiente' ? 'asignado' : t.status,
        history: [...(t.history || []), { status: 'asignado', at: nowCR(), by: BY, note: 'Asignado a ' + tech.name }],
      },
      { merge: true }
    );
    return ok({ ok: true, num: t.num, technician: tech.name });
  });

  server.tool('add_checklist_items', 'Agrega ítems al checklist de un ticket existente.', { idOrNum: z.string(), items: z.array(z.string()) }, async (args) => {
    const doc = await findTicket(args.idOrNum);
    if (!doc) return ok({ ok: false, error: 'not found' });
    const t = doc.data() as any;
    const newItems = args.items.filter((x) => x.trim()).map((text, i) => ({ id: 'm' + Date.now() + i, text: text.trim(), done: false, by: null, at: null }));
    await doc.ref.set({ checklist: [...(t.checklist || []), ...newItems] }, { merge: true });
    return ok({ ok: true, added: newItems.length });
  });

  /* ---------------- tickets: ciclo de vida ---------------- */
  server.tool(
    'approve_ticket',
    'Aprueba un ticket (estado aprobado). El trigger dispara el correo y rebaja el inventario.',
    { idOrNum: z.string(), comment: z.string().optional() },
    async (args) => {
      const doc = await findTicket(args.idOrNum);
      if (!doc) return ok({ ok: false, error: 'ticket no encontrado' });
      const t = doc.data() as any;
      const at = nowCR();
      const text = (args.comment || '').trim() || 'Aprobado';
      await doc.ref.set(
        {
          status: 'aprobado',
          approval: { at, by: actor, comment: text },
          comments: [...(t.comments || []), { type: 'aprobacion', by: BY, at, text }],
          history: [...(t.history || []), { status: 'aprobado', at, by: BY }],
        },
        { merge: true }
      );
      return ok({ ok: true, num: t.num, status: 'aprobado' });
    }
  );

  server.tool(
    'reject_ticket',
    'Rechaza un ticket (estado rechazado) con un comentario de corrección. El trigger avisa al técnico.',
    { idOrNum: z.string(), comment: z.string() },
    async (args) => {
      const doc = await findTicket(args.idOrNum);
      if (!doc) return ok({ ok: false, error: 'ticket no encontrado' });
      const t = doc.data() as any;
      const at = nowCR();
      await doc.ref.set(
        {
          status: 'rechazado',
          comments: [...(t.comments || []), { type: 'rechazo', by: BY, at, text: args.comment }],
          history: [...(t.history || []), { status: 'rechazado', at, by: BY, note: 'Requiere corrección' }],
        },
        { merge: true }
      );
      return ok({ ok: true, num: t.num, status: 'rechazado' });
    }
  );

  server.tool('close_ticket', 'Cierra un ticket (estado cerrado).', { idOrNum: z.string() }, async (args) => {
    const doc = await findTicket(args.idOrNum);
    if (!doc) return ok({ ok: false, error: 'ticket no encontrado' });
    const t = doc.data() as any;
    const at = nowCR();
    await doc.ref.set({ status: 'cerrado', history: [...(t.history || []), { status: 'cerrado', at, by: BY, note: 'Obra cerrada' }] }, { merge: true });
    return ok({ ok: true, num: t.num, status: 'cerrado' });
  });

  server.tool(
    'set_ticket_status',
    'Cambia el estado de un ticket (genérico: pendiente, asignado, en_proceso, listo_revision, aprobado, rechazado, cerrado).',
    { idOrNum: z.string(), status: z.enum(STATUSES as [string, ...string[]]), note: z.string().optional() },
    async (args) => {
      const doc = await findTicket(args.idOrNum);
      if (!doc) return ok({ ok: false, error: 'ticket no encontrado' });
      const t = doc.data() as any;
      const at = nowCR();
      const entry: any = { status: args.status, at, by: BY };
      if (args.note) entry.note = args.note;
      await doc.ref.set({ status: args.status, history: [...(t.history || []), entry] }, { merge: true });
      return ok({ ok: true, num: t.num, status: args.status });
    }
  );

  server.tool(
    'add_ticket_comment',
    'Agrega un comentario interno a un ticket.',
    { idOrNum: z.string(), text: z.string(), type: z.string().optional() },
    async (args) => {
      const doc = await findTicket(args.idOrNum);
      if (!doc) return ok({ ok: false, error: 'ticket no encontrado' });
      const t = doc.data() as any;
      await doc.ref.set({ comments: [...(t.comments || []), { type: args.type || 'general', by: BY, at: nowCR(), text: args.text }] }, { merge: true });
      return ok({ ok: true, num: t.num });
    }
  );

  server.tool(
    'add_ticket_visit',
    'Registra una visita (un día de trabajo) en una orden de trabajo de varios días. La orden sigue siendo una sola (una factura, un reporte); cada visita guarda qué se hizo ese día.',
    {
      idOrNum: z.string().describe('Orden de trabajo (id o número AD-####)'),
      note: z.string().describe('Qué se hizo ese día'),
      date: z.string().optional().describe('Fecha de la visita YYYY-MM-DD (def hoy)'),
      technician: z.string().optional().describe('Técnico (nombre/email/id); si se omite, el de la orden'),
      hours: z.number().optional().describe('Horas trabajadas ese día'),
    },
    async (args) => {
      const doc = await findTicket(args.idOrNum);
      if (!doc) return ok({ ok: false, error: 'orden de trabajo no encontrada' });
      const t = doc.data() as any;
      let techId: string | null = t.techId || null;
      let techName = '';
      if (args.technician !== undefined) {
        const tech = await findTechId(args.technician);
        if (!tech.id) return ok({ ok: false, error: 'técnico no encontrado' });
        techId = tech.id;
        techName = tech.name || '';
      } else if (techId) {
        const u = await db.collection('users').doc(techId).get();
        techName = u.exists ? (u.data() as any).name || '' : '';
      }
      const visit = buildVisit({ date: args.date, note: args.note, techId, techName, hours: args.hours }, BY);
      const patch: any = { visits: [...(t.visits || []), visit] };
      if (t.status === 'asignado' || t.status === 'pendiente') {
        patch.status = 'en_proceso';
        patch.history = [...(t.history || []), { status: 'en_proceso', at: nowCR(), by: BY }];
      }
      await doc.ref.set(patch, { merge: true });
      return ok({ ok: true, num: t.num, visitId: visit.id, visits: patch.visits.length });
    }
  );

  /* ---------------- wiki ---------------- */
  server.tool('wiki_list_categories', 'Lista las categorías de la Wiki.', {}, async () => {
    const snap = await tcol('wikiCategories').get();
    return ok(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
  });

  server.tool('wiki_create_category', 'Crea una categoría de Wiki.', { name: z.string(), description: z.string().optional() }, async (args) => {
    const ref = await tcol('wikiCategories').add({ name: args.name, description: args.description || '', active: true, orderIndex: 0, createdAt: nowCR(), updatedAt: nowCR() });
    return ok({ id: ref.id, name: args.name });
  });

  server.tool(
    'wiki_list_pages',
    'Lista páginas de la Wiki (opcionalmente filtra por estado).',
    { status: z.enum(WIKI_STATUSES as [string, ...string[]]).optional() },
    async (args) => {
      let q: firestore.Query = tcol('wikiPages');
      if (args.status) q = q.where('status', '==', args.status);
      const snap = await q.get();
      return ok(snap.docs.map((d) => { const p = d.data() as any; return { id: d.id, title: p.title, status: p.status, categoryId: p.categoryId, updatedAt: p.updatedAt }; }));
    }
  );

  server.tool('wiki_get_page', 'Obtiene una página de Wiki por id.', { id: z.string() }, async (args) => {
    const doc = await tcol('wikiPages').doc(args.id).get();
    return doc.exists ? ok({ found: true, id: doc.id, ...(doc.data() as any) }) : ok({ found: false });
  });

  server.tool(
    'wiki_create_page',
    'Crea una página de Wiki en Markdown. status DRAFT o PUBLISHED.',
    {
      title: z.string(),
      contentMarkdown: z.string().optional(),
      category: z.string().optional().describe('Nombre o id de la categoría'),
      status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
    },
    async (args) => {
      const errors = validateWikiPage({ title: args.title, status: args.status });
      if (errors.length) return ok({ ok: false, errors });
      let categoryId: string | null = null;
      if (args.category) {
        const direct = await tcol('wikiCategories').doc(args.category).get();
        if (direct.exists) categoryId = direct.id;
        else {
          const snap = await tcol('wikiCategories').get();
          const m = snap.docs.find((d) => ((d.data() as any).name || '').toLowerCase() === args.category!.toLowerCase());
          categoryId = m ? m.id : null;
        }
      }
      const docData = buildWikiPageDoc({ title: args.title, contentMarkdown: args.contentMarkdown, categoryId, status: args.status }, BY);
      const ref = await tcol('wikiPages').add(docData);
      return ok({ ok: true, id: ref.id, title: args.title, status: docData.status });
    }
  );

  server.tool(
    'wiki_update_page',
    'Actualiza el contenido/título/categoría de una página de Wiki.',
    { id: z.string(), title: z.string().optional(), contentMarkdown: z.string().optional(), category: z.string().optional() },
    async (args) => {
      const patch: any = { updatedBy: BY, updatedAt: nowCR() };
      if (args.title) patch.title = args.title;
      if (typeof args.contentMarkdown === 'string') patch.contentMarkdown = args.contentMarkdown;
      if (args.category !== undefined) {
        const snap = await tcol('wikiCategories').get();
        const m = snap.docs.find((d) => d.id === args.category || ((d.data() as any).name || '').toLowerCase() === (args.category || '').toLowerCase());
        patch.categoryId = m ? m.id : null;
      }
      await tcol('wikiPages').doc(args.id).set(patch, { merge: true });
      return ok({ ok: true });
    }
  );

  server.tool(
    'wiki_set_status',
    'Cambia el estado de una página de Wiki (DRAFT, PUBLISHED, INACTIVE).',
    { id: z.string(), status: z.enum(['DRAFT', 'PUBLISHED', 'INACTIVE']) },
    async (args) => {
      const patch: any = { status: args.status, updatedBy: BY, updatedAt: nowCR() };
      if (args.status === 'PUBLISHED') patch.publishedAt = nowCR();
      await tcol('wikiPages').doc(args.id).set(patch, { merge: true });
      return ok({ ok: true, status: args.status });
    }
  );

  /* ---------------- contracts & equipment ---------------- */
  server.tool('list_contracts', 'Lista los contratos de mantenimiento.', { activeOnly: z.boolean().optional() }, async (args) => {
    let q: firestore.Query = tcol('contracts');
    if (args.activeOnly) q = q.where('active', '==', true);
    const snap = await q.get();
    return ok(snap.docs.map((d) => {
      const c = d.data() as any;
      return { id: d.id, num: c.num, licitacionNum: c.licitacionNum, client: c.clientName, startDate: c.startDate, endDate: c.endDate, periodicityMonths: c.defaultPeriodicityMonths, active: c.active };
    }));
  });

  server.tool('get_contract', 'Obtiene un contrato por id o número (CT-####).', { idOrNum: z.string() }, async (args) => {
    let doc = await tcol('contracts').doc(args.idOrNum).get();
    if (!doc.exists) {
      const snap = await tcol('contracts').where('num', '==', args.idOrNum).limit(1).get();
      if (!snap.empty) doc = snap.docs[0];
    }
    if (!doc.exists) return ok({ found: false });
    const eqSnap = await tcol('equipment').where('contractId', '==', doc.id).get();
    return ok({ found: true, id: doc.id, ...(doc.data() as any), equipmentCount: eqSnap.size });
  });

  server.tool(
    'create_contract',
    'Crea un contrato de mantenimiento. Devuelve el número asignado.',
    {
      licitacionNum: z.string().describe('Nº de licitación'),
      clientName: z.string(),
      clientEmail: z.string().optional(),
      clientPhone: z.string().optional(),
      startDate: z.string().optional().describe('YYYY-MM-DD'),
      endDate: z.string().optional().describe('YYYY-MM-DD'),
      periodicityMonths: z.number().optional().describe('1, 2, 3, 6 o 12'),
      technician: z.string().optional().describe('Técnico por defecto (nombre/email/id)'),
      notes: z.string().optional(),
    },
    async (args) => {
      const tech = await findTechId(args.technician);
      const t = await db.collection('tenants').doc(tenantId).get();
      const prefix = (t.exists && (t.data() as any).numbering?.contractPrefix) || 'CT';
      const res = await createContractWithNumber(db, tenantId, {
        licitacionNum: args.licitacionNum,
        clientName: args.clientName,
        clientEmail: args.clientEmail,
        clientPhone: args.clientPhone,
        startDate: args.startDate,
        endDate: args.endDate,
        defaultPeriodicityMonths: (args.periodicityMonths && PERIODICITIES.includes(args.periodicityMonths as PeriodicityMonths) ? args.periodicityMonths : undefined) as PeriodicityMonths | undefined,
        defaultTechId: tech.id,
        notes: args.notes,
      }, BY, prefix);
      return ok({ created: true, id: res.id, num: res.num });
    }
  );

  async function findContract(idOrNum: string) {
    let doc = await tcol('contracts').doc(idOrNum).get();
    if (!doc.exists) {
      const snap = await tcol('contracts').where('num', '==', idOrNum).limit(1).get();
      if (!snap.empty) doc = snap.docs[0];
    }
    return doc.exists ? doc : null;
  }

  server.tool(
    'update_contract',
    'Actualiza campos de un contrato de mantenimiento (solo los enviados).',
    {
      idOrNum: z.string(),
      clientName: z.string().optional(),
      clientEmail: z.string().optional(),
      clientPhone: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      periodicityMonths: z.number().optional(),
      technician: z.string().optional().describe('Técnico por defecto (nombre/email/id)'),
      notes: z.string().optional(),
      active: z.boolean().optional(),
    },
    async (args) => {
      const doc = await findContract(args.idOrNum);
      if (!doc) return ok({ ok: false, error: 'contrato no encontrado' });
      const patch: any = { updatedAt: nowCR(), updatedBy: BY };
      if (args.clientName !== undefined) patch.clientName = args.clientName;
      if (args.clientEmail !== undefined) patch.clientEmail = args.clientEmail;
      if (args.clientPhone !== undefined) patch.clientPhone = args.clientPhone;
      if (args.startDate !== undefined) patch.startDate = args.startDate;
      if (args.endDate !== undefined) patch.endDate = args.endDate;
      if (args.periodicityMonths !== undefined && PERIODICITIES.includes(args.periodicityMonths as PeriodicityMonths)) patch.defaultPeriodicityMonths = args.periodicityMonths;
      if (args.notes !== undefined) patch.notes = args.notes;
      if (args.active !== undefined) patch.active = args.active;
      if (args.technician !== undefined) { const tech = await findTechId(args.technician); patch.defaultTechId = tech.id; }
      await doc.ref.set(patch, { merge: true });
      return ok({ ok: true, id: doc.id, num: (doc.data() as any).num });
    }
  );

  server.tool(
    'delete_contract',
    'Elimina un contrato. Falla si tiene equipos asociados (desactivalo o borrá los equipos primero).',
    { idOrNum: z.string() },
    async (args) => {
      const doc = await findContract(args.idOrNum);
      if (!doc) return ok({ ok: false, error: 'contrato no encontrado' });
      const eq = await tcol('equipment').where('contractId', '==', doc.id).limit(1).get();
      if (!eq.empty) return ok({ ok: false, error: 'el contrato tiene equipos asociados; borralos o desactivá el contrato (update_contract active:false)' });
      await doc.ref.delete();
      return ok({ ok: true, deleted: (doc.data() as any).num });
    }
  );

  server.tool('list_equipment_types', 'Lista los tipos de equipo del catálogo.', {}, async () => {
    const snap = await tcol('equipmentTypes').get();
    return ok(snap.docs.map((d) => ({ id: d.id, name: (d.data() as any).name, active: (d.data() as any).active, templateVersion: (d.data() as any).activeTemplateVersion || 0 })));
  });

  server.tool(
    'create_equipment_type',
    'Crea un tipo de equipo en el catálogo (ej: Refrigerador, Compresor). Idempotente: si ya existe por nombre, devuelve el existente.',
    { name: z.string().describe('Nombre del tipo de equipo') },
    async (args) => {
      const name = args.name.trim();
      if (!name) return ok({ ok: false, error: 'el nombre es obligatorio' });
      const key = name.toLowerCase();
      const snap = await tcol('equipmentTypes').get();
      const existing = snap.docs.find((d) => ((d.data() as any).name || '').trim().toLowerCase() === key);
      if (existing) return ok({ ok: true, id: existing.id, name: (existing.data() as any).name, existed: true });
      const ref = await tcol('equipmentTypes').add({ name, active: true, activeTemplateVersion: 0, createdAt: nowCR(), updatedAt: nowCR() });
      return ok({ ok: true, id: ref.id, name, created: true });
    }
  );

  async function findType(idOrName: string) {
    const direct = await tcol('equipmentTypes').doc(idOrName).get();
    if (direct.exists) return direct;
    const key = idOrName.trim().toLowerCase();
    const snap = await tcol('equipmentTypes').get();
    return snap.docs.find((d) => ((d.data() as any).name || '').trim().toLowerCase() === key) || null;
  }

  server.tool(
    'update_equipment_type',
    'Renombra o activa/desactiva un tipo de equipo.',
    { idOrName: z.string(), name: z.string().optional(), active: z.boolean().optional() },
    async (args) => {
      const doc = await findType(args.idOrName);
      if (!doc) return ok({ ok: false, error: 'tipo no encontrado' });
      const patch: any = { updatedAt: nowCR() };
      if (args.name !== undefined) patch.name = args.name.trim();
      if (args.active !== undefined) patch.active = args.active;
      await doc.ref.set(patch, { merge: true });
      return ok({ ok: true, id: doc.id, name: patch.name || (doc.data() as any).name });
    }
  );

  server.tool(
    'delete_equipment_type',
    'Elimina un tipo de equipo. Falla si hay equipos que lo usan (reasignalos o desactivá el tipo).',
    { idOrName: z.string() },
    async (args) => {
      const doc = await findType(args.idOrName);
      if (!doc) return ok({ ok: false, error: 'tipo no encontrado' });
      const eq = await tcol('equipment').where('typeId', '==', doc.id).limit(1).get();
      if (!eq.empty) return ok({ ok: false, error: 'hay equipos que usan este tipo; reasignalos o desactivá el tipo (update_equipment_type active:false)' });
      await doc.ref.delete();
      return ok({ ok: true, deleted: (doc.data() as any).name });
    }
  );

  server.tool(
    'list_equipment',
    'Lista equipos, opcionalmente por contrato (id o número).',
    { contract: z.string().optional(), limit: z.number().optional() },
    async (args) => {
      let q: firestore.Query = tcol('equipment');
      if (args.contract) {
        let cid = args.contract;
        const byNum = await tcol('contracts').where('num', '==', args.contract).limit(1).get();
        if (!byNum.empty) cid = byNum.docs[0].id;
        q = q.where('contractId', '==', cid);
      }
      const snap = await q.limit(args.limit || 100).get();
      return ok(snap.docs.map((d) => {
        const e = d.data() as any;
        return { id: d.id, typeId: e.typeId, brand: e.brand, model: e.model, serial: e.serial, location: e.location, contractId: e.contractId, periodicityMonths: e.periodicityMonths, nextScheduledDate: e.nextScheduledDate, lastServiceDate: e.lastServiceDate, active: e.active };
      }));
    }
  );

  server.tool(
    'create_equipment',
    'Da de alta un equipo en un contrato. El tipo se resuelve por nombre (se crea si no existe).',
    {
      contract: z.string().describe('Id o número del contrato'),
      typeName: z.string().describe('Tipo de equipo, ej: Refrigerador'),
      brand: z.string().optional(),
      model: z.string().optional(),
      serial: z.string().optional(),
      location: z.string().optional(),
      technician: z.string().optional(),
      periodicityMonths: z.number().optional(),
      nextScheduledDate: z.string().optional().describe('YYYY-MM-DD; vacío = inicio contrato + periodicidad'),
    },
    async (args) => {
      let cid = args.contract;
      let cSnap = await tcol('contracts').doc(cid).get();
      if (!cSnap.exists) {
        const byNum = await tcol('contracts').where('num', '==', args.contract).limit(1).get();
        if (byNum.empty) return ok({ ok: false, error: 'contrato no encontrado' });
        cSnap = byNum.docs[0];
        cid = cSnap.id;
      }
      const contract = cSnap.data() as any;
      // tipo por nombre (case-insensitive), crear si falta
      const typesSnap = await tcol('equipmentTypes').get();
      const key = args.typeName.trim().toLowerCase();
      let typeId = typesSnap.docs.find((d) => ((d.data() as any).name || '').trim().toLowerCase() === key)?.id;
      if (!typeId) {
        const ref = await tcol('equipmentTypes').add({ name: args.typeName.trim(), active: true, activeTemplateVersion: 0, createdAt: nowCR(), updatedAt: nowCR() });
        typeId = ref.id;
      }
      const tech = await findTechId(args.technician);
      const per = args.periodicityMonths && PERIODICITIES.includes(args.periodicityMonths as PeriodicityMonths) ? (args.periodicityMonths as PeriodicityMonths) : null;
      const effPer = per ?? contract.defaultPeriodicityMonths ?? 3;
      const input = {
        contractId: cid,
        typeId,
        brand: args.brand,
        model: args.model,
        serial: args.serial,
        location: args.location,
        assignedTechId: tech.id || contract.defaultTechId || null,
        periodicityMonths: per,
        nextScheduledDate: args.nextScheduledDate || addMonthsCR(contract.startDate || nowCR().slice(0, 10), effPer),
      };
      const errs = validateEquipment(input);
      if (errs.length) return ok({ ok: false, errors: errs });
      const ref = await tcol('equipment').add(buildEquipmentDoc(input, BY));
      return ok({ ok: true, id: ref.id, typeId, nextScheduledDate: input.nextScheduledDate });
    }
  );

  server.tool(
    'update_equipment',
    'Actualiza un equipo (solo los campos enviados). Resuelve el equipo por id o serial.',
    {
      equipment: z.string().describe('Id o serial'),
      brand: z.string().optional(),
      model: z.string().optional(),
      serial: z.string().optional(),
      location: z.string().optional(),
      typeName: z.string().optional().describe('Cambia el tipo (debe existir)'),
      technician: z.string().optional(),
      periodicityMonths: z.number().optional(),
      noticeDaysBefore: z.number().optional(),
      nextScheduledDate: z.string().optional(),
      notes: z.string().optional(),
      active: z.boolean().optional(),
    },
    async (args) => {
      const doc = await findEquipment(args.equipment);
      if (!doc) return ok({ ok: false, error: 'equipo no encontrado' });
      const patch: any = { updatedAt: nowCR() };
      if (args.brand !== undefined) patch.brand = args.brand;
      if (args.model !== undefined) patch.model = args.model;
      if (args.serial !== undefined) patch.serial = args.serial;
      if (args.location !== undefined) patch.location = args.location;
      if (args.notes !== undefined) patch.notes = args.notes;
      if (args.active !== undefined) patch.active = args.active;
      if (args.nextScheduledDate !== undefined) patch.nextScheduledDate = args.nextScheduledDate;
      if (args.noticeDaysBefore !== undefined) patch.noticeDaysBefore = args.noticeDaysBefore;
      if (args.periodicityMonths !== undefined) patch.periodicityMonths = PERIODICITIES.includes(args.periodicityMonths as PeriodicityMonths) ? args.periodicityMonths : null;
      if (args.technician !== undefined) { const tech = await findTechId(args.technician); patch.assignedTechId = tech.id; }
      if (args.typeName !== undefined) { const ty = await findType(args.typeName); if (!ty) return ok({ ok: false, error: 'tipo no encontrado (creálo con create_equipment_type)' }); patch.typeId = ty.id; }
      await doc.ref.set(patch, { merge: true });
      return ok({ ok: true, id: doc.id });
    }
  );

  server.tool('delete_equipment', 'Elimina un equipo. Las órdenes de servicio existentes conservan su snapshot.', { equipment: z.string() }, async (args) => {
    const doc = await findEquipment(args.equipment);
    if (!doc) return ok({ ok: false, error: 'equipo no encontrado' });
    await doc.ref.delete();
    return ok({ ok: true });
  });

  /* ---------------- checklist templates (por tipo de equipo, versionadas) ---------------- */
  server.tool('list_checklist_templates', 'Lista las versiones de plantilla de checklist de un tipo de equipo.', { type: z.string().describe('Id o nombre del tipo') }, async (args) => {
    const ty = await findType(args.type);
    if (!ty) return ok({ ok: false, error: 'tipo no encontrado' });
    const snap = await tcol('checklistTemplates').where('typeId', '==', ty.id).get();
    const rows = snap.docs.map((d) => { const v = d.data() as any; return { id: d.id, version: v.version, status: v.status, items: (v.items || []).length, sections: (v.sections || []).length }; }).sort((a, b) => b.version - a.version);
    return ok({ typeId: ty.id, activeVersion: (ty.data() as any).activeTemplateVersion || 0, versions: rows });
  });

  server.tool(
    'publish_checklist_template',
    'Publica una NUEVA versión de checklist para un tipo de equipo (inmutable). Supersede la anterior y mueve el puntero activeTemplateVersion. Las OS futuras la usan al iniciar.',
    {
      type: z.string().describe('Id o nombre del tipo de equipo'),
      items: z
        .array(
          z.object({
            label: z.string(),
            type: z.enum(['si_no', 'numero', 'texto', 'seleccion', 'foto']),
            required: z.boolean().optional(),
            section: z.string().optional().describe('Nombre de sección (los ítems con el mismo nombre se agrupan)'),
            unit: z.string().optional(),
            min: z.number().optional(),
            max: z.number().optional(),
            alertMin: z.number().optional(),
            alertMax: z.number().optional(),
            options: z.array(z.string()).optional(),
          })
        )
        .describe('Ítems del checklist, en orden'),
    },
    async (args) => {
      const ty = await findType(args.type);
      if (!ty) return ok({ ok: false, error: 'tipo no encontrado (creálo con create_equipment_type)' });
      if (!args.items?.length) return ok({ ok: false, error: 'items no puede estar vacío' });
      const typeId = ty.id;
      const existing = await tcol('checklistTemplates').where('typeId', '==', typeId).get();
      const maxV = existing.docs.reduce((m, d) => Math.max(m, (d.data() as any).version || 0), 0);
      const nextVersion = maxV + 1;
      // Secciones a partir de los nombres distintos.
      const sectionMap = new Map<string, string>();
      const sections: any[] = [];
      for (const it of args.items) {
        const name = (it.section || '').trim();
        if (name && !sectionMap.has(name.toLowerCase())) {
          const id = 'sec_' + (sections.length + 1);
          sectionMap.set(name.toLowerCase(), id);
          sections.push({ id, title: name, order: sections.length });
        }
      }
      const items = args.items.map((it, i) => {
        const config: any = { min: it.min ?? null, max: it.max ?? null, alertMin: it.alertMin ?? null, alertMax: it.alertMax ?? null };
        if (it.unit !== undefined) config.unit = it.unit;
        if (it.options !== undefined) config.options = it.options;
        return { id: 'it_' + (i + 1), sectionId: it.section ? sectionMap.get(it.section.trim().toLowerCase()) || null : null, order: i, label: it.label, type: it.type, required: !!it.required, config };
      });
      const batch = db.batch();
      const newRef = tcol('checklistTemplates').doc(`${typeId}_v${nextVersion}`);
      batch.set(newRef, { typeId, version: nextVersion, status: 'active', sections, items, createdAt: nowCR(), createdBy: BY });
      existing.docs.filter((d) => (d.data() as any).status === 'active').forEach((d) => batch.update(d.ref, { status: 'superseded', updatedAt: nowCR() }));
      batch.update(tcol('equipmentTypes').doc(typeId), { activeTemplateVersion: nextVersion, updatedAt: nowCR() });
      await batch.commit();
      return ok({ ok: true, id: newRef.id, typeId, version: nextVersion, items: items.length, sections: sections.length });
    }
  );

  /* ---------------- service orders & billing ---------------- */
  async function findEquipment(idOrSerial: string) {
    const direct = await tcol('equipment').doc(idOrSerial).get();
    if (direct.exists) return direct;
    const bySerial = await tcol('equipment').where('serial', '==', idOrSerial).limit(1).get();
    return bySerial.empty ? null : bySerial.docs[0];
  }

  server.tool(
    'create_service_order',
    'Crea (programa) una orden de servicio / revisión de mantenimiento para un equipo. El cliente y los datos del equipo se toman del contrato/equipo. Devuelve el número (OS-####).',
    {
      equipment: z.string().describe('Id o serial del equipo'),
      scheduledDate: z.string().describe('Fecha de la revisión, YYYY-MM-DD'),
      type: z.enum(['preventivo', 'correctivo']).optional().describe('Por defecto preventivo'),
      scheduledTime: z.string().optional().describe('HH:mm (def 08:00)'),
      durationMin: z.number().optional().describe('Duración en minutos (def 60)'),
      technician: z.string().optional().describe('Técnico (nombre/email/id); si se omite, el del equipo o el del contrato'),
      skipNotice: z.boolean().optional().describe('Saltar el aviso previo al cliente (típico en correctivo)'),
      notes: z.string().optional(),
    },
    async (args) => {
      const eqDoc = await findEquipment(args.equipment);
      if (!eqDoc) return ok({ ok: false, error: 'equipo no encontrado (probá por id o serial)' });
      const eq = eqDoc.data() as any;
      const cSnap = await tcol('contracts').doc(eq.contractId).get();
      if (!cSnap.exists) return ok({ ok: false, error: 'contrato del equipo no encontrado' });
      const contract = cSnap.data() as any;
      const typeDoc = await tcol('equipmentTypes').doc(eq.typeId).get();
      const typeName = typeDoc.exists ? ((typeDoc.data() as any).name || '') : '';
      const tech = await findTechId(args.technician);
      const techId = tech.id || eq.assignedTechId || contract.defaultTechId || null;
      const t = await db.collection('tenants').doc(tenantId).get();
      const osPrefix = (t.exists && (t.data() as any).numbering?.osPrefix) || 'OS';
      const res = await createServiceOrderWithNumber(
        db,
        tenantId,
        {
          type: args.type || 'preventivo',
          contractId: eq.contractId,
          equipmentId: eqDoc.id,
          equipmentSnapshot: { typeId: eq.typeId, typeName, brand: eq.brand || '', model: eq.model || '', serial: eq.serial || '', location: eq.location || '' },
          client: { name: contract.clientName || '', email: contract.clientEmail || '', phone: contract.clientPhone || '' },
          techId,
          planDate: args.scheduledDate,
          scheduledDate: args.scheduledDate,
          scheduledTime: args.scheduledTime,
          durationMin: args.durationMin,
          skipNotice: args.skipNotice,
          notes: args.notes,
        },
        BY,
        osPrefix
      );
      return ok({ created: res.created, id: res.id, num: res.num, techId, technician: tech.name || null });
    }
  );

  async function findSO(idOrNum: string) {
    let doc = await tcol('serviceOrders').doc(idOrNum).get();
    if (!doc.exists) {
      const snap = await tcol('serviceOrders').where('num', '==', idOrNum).limit(1).get();
      if (!snap.empty) doc = snap.docs[0];
    }
    return doc.exists ? doc : null;
  }

  server.tool(
    'confirm_service_order',
    'Confirma la fecha de una orden de servicio (→ CONFIRMADA).',
    { idOrNum: z.string() },
    async (args) => {
      const doc = await findSO(args.idOrNum);
      if (!doc) return ok({ ok: false, error: 'orden no encontrada' });
      const so = doc.data() as any;
      if (so.status === 'CONFIRMADA') return ok({ ok: true, already: true, num: so.num });
      // Confirmación manual del admin (sin link público): admite desde programada/notificada/reagendada.
      if (!['PROGRAMADA', 'NOTIFICADA', 'REAGENDADA'].includes(so.status)) return ok({ ok: false, error: `no se puede confirmar desde ${so.status}` });
      const at = nowCR();
      await doc.ref.set(
        { status: 'CONFIRMADA', notify: { ...(so.notify || {}), confirmedAt: at, confirmedVia: 'admin' }, history: [...(so.history || []), { status: 'CONFIRMADA', at, by: BY, note: 'Confirmada' }] },
        { merge: true }
      );
      return ok({ ok: true, num: so.num, status: 'CONFIRMADA' });
    }
  );

  server.tool(
    'reschedule_service_order',
    'Reagenda una orden de servicio a una nueva fecha/hora (→ REAGENDADA).',
    { idOrNum: z.string(), date: z.string().describe('YYYY-MM-DD'), time: z.string().optional().describe('HH:mm') },
    async (args) => {
      const doc = await findSO(args.idOrNum);
      if (!doc) return ok({ ok: false, error: 'orden no encontrada' });
      const so = doc.data() as any;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) return ok({ ok: false, error: 'date debe ser YYYY-MM-DD' });
      // Reagenda manual del admin: admite desde cualquier estado abierto previo a la ejecución.
      if (!['PROGRAMADA', 'NOTIFICADA', 'CONFIRMADA', 'REAGENDADA'].includes(so.status)) return ok({ ok: false, error: `no se puede reagendar desde ${so.status}` });
      const at = nowCR();
      const noticeDays = so.notify?.noticeDaysBefore ?? 3;
      await doc.ref.set(
        {
          status: 'REAGENDADA',
          scheduledDate: args.date,
          scheduledTime: args.time || so.scheduledTime,
          hold: null,
          notify: { ...(so.notify || {}), noticeDate: computeNoticeDate(args.date, noticeDays), rescheduleCount: (so.notify?.rescheduleCount || 0) + 1 },
          history: [...(so.history || []), { status: 'REAGENDADA', at, by: BY, note: `Reagendada a ${args.date}${args.time ? ' ' + args.time : ''}` }],
        },
        { merge: true }
      );
      return ok({ ok: true, num: so.num, scheduledDate: args.date });
    }
  );

  server.tool(
    'start_service_order',
    'Inicia una orden de servicio (→ EN_PROGRESO) y carga el checklist desde la plantilla vigente del tipo de equipo.',
    { idOrNum: z.string() },
    async (args) => {
      const doc = await findSO(args.idOrNum);
      if (!doc) return ok({ ok: false, error: 'orden no encontrada' });
      const so = doc.data() as any;
      if (!canTransition(so.status as ServiceOrderStatus, 'EN_PROGRESO')) return ok({ ok: false, error: `no se puede iniciar desde ${so.status}` });
      let checklist: any[] = so.checklist || [];
      let templateId: string | null = so.checklistTemplateId || null;
      let templateVersion: number | null = so.checklistTemplateVersion || null;
      if (!checklist.length) {
        const typeId = so.equipmentSnapshot?.typeId;
        if (typeId) {
          const typeSnap = await tcol('equipmentTypes').doc(typeId).get();
          const version = typeSnap.exists ? (typeSnap.data() as any).activeTemplateVersion || 0 : 0;
          if (version > 0) {
            const tplSnap = await tcol('checklistTemplates').doc(`${typeId}_v${version}`).get();
            if (tplSnap.exists) {
              const tpl = tplSnap.data() as any;
              const sections = new Map<string, string>((tpl.sections || []).map((s: any) => [s.id, s.title]));
              checklist = (tpl.items || [])
                .slice()
                .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
                .map((it: any) => ({ id: it.id, sectionId: it.sectionId || null, sectionTitle: it.sectionId ? sections.get(it.sectionId) || null : null, label: it.label, type: it.type, required: !!it.required, config: it.config || {}, unit: it.config?.unit || null, answer: null, alert: false, photoPath: null, photoUrl: null, at: null, by: null }));
              templateId = tplSnap.id;
              templateVersion = version;
            }
          }
        }
      }
      const at = nowCR();
      await doc.ref.set(
        { status: 'EN_PROGRESO', startedAt: so.startedAt || at, checklist, checklistTemplateId: templateId, checklistTemplateVersion: templateVersion, history: [...(so.history || []), { status: 'EN_PROGRESO', at, by: BY }] },
        { merge: true }
      );
      return ok({ ok: true, num: so.num, status: 'EN_PROGRESO', checklistItems: checklist.length, templateVersion });
    }
  );

  server.tool(
    'complete_service_order',
    'Cierra una orden de servicio (→ SERVICIO_TERMINADO). Requiere firma del cliente. El trigger genera el ítem de facturación y recalcula la cadencia.',
    {
      idOrNum: z.string(),
      signature: z.object({ name: z.string(), idNumber: z.string(), path: z.string(), url: z.string() }).describe('Firma del cliente: nombre, cédula, ruta y URL de la imagen'),
      observations: z.string().optional(),
      skipChecklistValidation: z.boolean().optional().describe('Permite cerrar aunque falten ítems requeridos del checklist'),
    },
    async (args) => {
      const doc = await findSO(args.idOrNum);
      if (!doc) return ok({ ok: false, error: 'orden no encontrada' });
      const so = doc.data() as any;
      if (so.status !== 'EN_PROGRESO') return ok({ ok: false, error: 'la orden no está EN_PROGRESO' });
      const s = args.signature;
      if (!s?.name?.trim() || !s?.idNumber?.trim() || !s?.path || !s?.url) return ok({ ok: false, error: 'firma incompleta (nombre, cédula, path y url)' });
      if (!args.skipChecklistValidation) {
        const missing = (so.checklist || []).filter((c: any) => c.required && (c.answer === null || c.answer === undefined || c.answer === '') && c.type !== 'foto');
        const missingPhotos = (so.checklist || []).filter((c: any) => c.required && c.type === 'foto' && !c.photoUrl);
        if (missing.length || missingPhotos.length) return ok({ ok: false, error: `checklist incompleto: faltan ${missing.length + missingPhotos.length} ítems requeridos (usá skipChecklistValidation para forzar)` });
      }
      const at = nowCR();
      await doc.ref.set(
        {
          status: 'SERVICIO_TERMINADO',
          finishedAt: at,
          observations: typeof args.observations === 'string' ? args.observations : so.observations || '',
          signature: { name: s.name.trim(), idNumber: s.idNumber.trim(), path: String(s.path), url: String(s.url), at },
          history: [...(so.history || []), { status: 'SERVICIO_TERMINADO', at, by: BY, note: 'Firmado por ' + s.name.trim() }],
        },
        { merge: true }
      );
      return ok({ ok: true, num: so.num, status: 'SERVICIO_TERMINADO' });
    }
  );

  server.tool(
    'cancel_service_order',
    'Cancela una orden de servicio (→ CANCELADA).',
    { idOrNum: z.string(), reason: z.string().optional() },
    async (args) => {
      const doc = await findSO(args.idOrNum);
      if (!doc) return ok({ ok: false, error: 'orden no encontrada' });
      const so = doc.data() as any;
      if (!canTransition(so.status as ServiceOrderStatus, 'CANCELADA')) return ok({ ok: false, error: `no se puede cancelar desde ${so.status}` });
      const at = nowCR();
      await doc.ref.set({ status: 'CANCELADA', history: [...(so.history || []), { status: 'CANCELADA', at, by: BY, note: args.reason || 'Cancelada' }] }, { merge: true });
      return ok({ ok: true, num: so.num, status: 'CANCELADA' });
    }
  );

  server.tool(
    'run_scheduler',
    'Genera las órdenes de servicio preventivas dentro del horizonte (idempotente: no duplica ocurrencias). Equivale al job diario.',
    { horizonDays: z.number().optional().describe('Días hacia adelante (def 60)') },
    async (args) => {
      const today = nowCR().slice(0, 10);
      const setSnap = await tcol('settings').doc('maintenance').get();
      const settings = setSnap.exists ? (setSnap.data() as any) : {};
      const horizon = args.horizonDays ?? settings.horizonDays ?? 60;
      const limitDate = addDaysCR(today, horizon);
      const t = await db.collection('tenants').doc(tenantId).get();
      const osPrefix = (t.exists && (t.data() as any).numbering?.osPrefix) || 'OS';

      const contractsSnap = await tcol('contracts').where('active', '==', true).get();
      const contracts = new Map<string, any>();
      contractsSnap.docs.forEach((d) => contracts.set(d.id, d.data()));
      const typesSnap = await tcol('equipmentTypes').get();
      const typeNames = new Map<string, string>();
      typesSnap.docs.forEach((d) => typeNames.set(d.id, (d.data() as any).name || ''));
      const equipmentSnap = await tcol('equipment').where('active', '==', true).get();

      let created = 0;
      let checked = 0;
      for (const eqDoc of equipmentSnap.docs) {
        const eq = eqDoc.data() as any;
        const contract = contracts.get(eq.contractId);
        if (!contract) continue;
        checked++;
        const per: PeriodicityMonths = (eq.periodicityMonths && PERIODICITIES.includes(eq.periodicityMonths) ? eq.periodicityMonths : contract.defaultPeriodicityMonths || 3) as PeriodicityMonths;
        const noticeDays = eq.noticeDaysBefore ?? contract.noticeDaysBefore ?? settings.defaultNoticeDaysBefore ?? 3;
        let cursor: string = eq.nextScheduledDate || addMonthsCR(eq.lastServiceDate || contract.startDate || today, per);
        let guard = 0;
        while (cursor <= limitDate && guard < 50) {
          guard++;
          if (contract.endDate && cursor > contract.endDate) break;
          const res = await createServiceOrderWithNumber(
            db,
            tenantId,
            {
              type: 'preventivo',
              contractId: eq.contractId,
              equipmentId: eqDoc.id,
              equipmentSnapshot: { typeId: eq.typeId, typeName: typeNames.get(eq.typeId) || '', brand: eq.brand || '', model: eq.model || '', serial: eq.serial || '', location: eq.location || '' },
              client: { name: contract.clientName || '', email: contract.clientEmail || '', phone: contract.clientPhone || '' },
              techId: eq.assignedTechId || contract.defaultTechId || null,
              planDate: cursor,
              scheduledDate: cursor,
              noticeDaysBefore: noticeDays,
            },
            'scheduler',
            osPrefix,
            soPlanId(eqDoc.id, cursor)
          );
          if (res.created) created++;
          cursor = addMonthsCR(cursor, per);
          await eqDoc.ref.set({ nextScheduledDate: cursor, updatedAt: nowCR() }, { merge: true });
        }
      }
      return ok({ ok: true, created, equipmentChecked: checked, horizonDays: horizon });
    }
  );

  server.tool(
    'list_service_orders',
    'Lista órdenes de servicio de mantenimiento con filtros opcionales.',
    {
      status: z.string().optional().describe('PROGRAMADA|NOTIFICADA|CONFIRMADA|REAGENDADA|EN_PROGRESO|SERVICIO_TERMINADO|PENDIENTE_FACTURAR|FACTURADA|CANCELADA'),
      technician: z.string().optional(),
      from: z.string().optional().describe('scheduledDate >= YYYY-MM-DD'),
      to: z.string().optional().describe('scheduledDate <= YYYY-MM-DD'),
      limit: z.number().optional(),
    },
    async (args) => {
      let q: firestore.Query = tcol('serviceOrders');
      if (args.status) q = q.where('status', '==', args.status);
      if (args.technician) {
        const tech = await findTechId(args.technician);
        if (tech.id) q = q.where('techId', '==', tech.id);
      }
      if (args.from) q = q.where('scheduledDate', '>=', args.from);
      if (args.to) q = q.where('scheduledDate', '<=', args.to);
      const snap = await q.limit(args.limit || 100).get();
      return ok(snap.docs.map((d) => {
        const o = d.data() as any;
        return { id: d.id, num: o.num, type: o.type, status: o.status, scheduledDate: o.scheduledDate, scheduledTime: o.scheduledTime, client: o.client?.name, equipment: o.equipmentSnapshot?.typeName, serial: o.equipmentSnapshot?.serial, techId: o.techId };
      }));
    }
  );

  server.tool('get_service_order', 'Obtiene una orden de servicio por id o número (OS-####).', { idOrNum: z.string() }, async (args) => {
    let doc = await tcol('serviceOrders').doc(args.idOrNum).get();
    if (!doc.exists) {
      const snap = await tcol('serviceOrders').where('num', '==', args.idOrNum).limit(1).get();
      if (!snap.empty) doc = snap.docs[0];
    }
    if (!doc.exists) return ok({ found: false });
    return ok({ found: true, id: doc.id, ...(doc.data() as any) });
  });

  server.tool(
    'list_invoice_items',
    'Bandeja de facturación: servicios pendientes de facturar o ya facturados.',
    { status: z.enum(['pendiente', 'facturado']).optional(), limit: z.number().optional() },
    async (args) => {
      let q: firestore.Query = tcol('invoiceItems');
      if (args.status) q = q.where('status', '==', args.status);
      const snap = await q.limit(args.limit || 100).get();
      return ok(snap.docs.map((d) => {
        const i = d.data() as any;
        return { id: d.id, soNum: i.soNum, type: i.type, client: i.clientName, licitacion: i.licitacionNum, equipment: i.equipmentSummary, serviceDate: i.serviceDate, status: i.status, invoiceNum: i.invoiceNum || null };
      }));
    }
  );

  server.tool('list_invoices', 'Lista las facturas consolidadas (FC-####).', { limit: z.number().optional() }, async (args) => {
    const snap = await tcol('invoices').limit(args.limit || 50).get();
    return ok(snap.docs.map((d) => {
      const f = d.data() as any;
      return { id: d.id, num: f.num, itemCount: f.itemCount, clients: f.clientNames, note: f.note, createdAt: f.createdAt };
    }));
  });

  server.tool(
    'consolidate_invoice_items',
    'Consolida ítems de facturación pendientes en una factura (FC-####): los marca facturados y mueve sus órdenes a FACTURADA.',
    { itemIds: z.array(z.string()).describe('Ids de invoiceItems pendientes (1–200)'), note: z.string().optional() },
    async (args) => {
      const itemIds = args.itemIds || [];
      if (!itemIds.length || itemIds.length > 200) return ok({ ok: false, error: 'itemIds (1–200) es requerido' });
      const itemRefs = itemIds.map((id) => tcol('invoiceItems').doc(String(id)));
      const invoiceRef = tcol('invoices').doc();
      const counterRef = tcol('counters').doc('invoices');
      try {
        const num = await db.runTransaction(async (tx) => {
          const snaps = await Promise.all(itemRefs.map((r) => tx.get(r)));
          const items: { ref: firestore.DocumentReference; data: any }[] = [];
          snaps.forEach((s, i) => {
            if (!s.exists) throw new Error(`item ${itemIds[i]} no existe`);
            const d = s.data() as any;
            if (d.status !== 'pendiente') throw new Error(`item ${d.soNum} ya está facturado`);
            items.push({ ref: s.ref, data: d });
          });
          const soSnaps = await Promise.all(items.map((it) => (it.data.serviceOrderId ? tx.get(tcol('serviceOrders').doc(it.data.serviceOrderId)) : Promise.resolve(null))));
          const ticketSnaps = await Promise.all(items.map((it) => (it.data.ticketId ? tx.get(tcol('tickets').doc(it.data.ticketId)) : Promise.resolve(null))));
          const cs = await tx.get(counterRef);
          const next = (cs.exists ? (cs.data() as any).value : 1000) + 1;
          const invoiceNum = 'FC-' + next;
          const at = nowCR();
          tx.set(counterRef, { value: next }, { merge: true });
          tx.set(invoiceRef, {
            num: invoiceNum,
            itemIds: itemIds.map(String),
            itemCount: items.length,
            contractIds: [...new Set(items.map((it) => it.data.contractId))],
            clientNames: [...new Set(items.map((it) => it.data.clientName))],
            note: String(args.note || '').slice(0, 200),
            status: 'facturada',
            createdAt: at,
            createdBy: BY,
          });
          items.forEach((it, i) => {
            tx.update(it.ref, { status: 'facturado', invoiceId: invoiceRef.id, invoiceNum, invoicedAt: at, invoiceNote: String(args.note || '') });
            const soSnap = soSnaps[i];
            if (soSnap && soSnap.exists) {
              const so = soSnap.data() as any;
              tx.update(soSnap.ref, { status: 'FACTURADA', history: [...(so.history || []), { status: 'FACTURADA', at, by: BY, note: invoiceNum + (args.note ? ' · ' + args.note : '') }] });
            }
            const tkSnap = ticketSnaps[i];
            if (tkSnap && tkSnap.exists) tx.update(tkSnap.ref, { invoiced: true, invoicedAt: at, invoiceNum, invoiceNote: String(args.note || '') });
          });
          return invoiceNum;
        });
        return ok({ ok: true, invoiceId: invoiceRef.id, num });
      } catch (e: any) {
        return ok({ ok: false, error: e.message || 'no se pudo consolidar' });
      }
    }
  );

  server.tool(
    'export_invoice_csv',
    'Exporta los ítems de facturación a CSV (para contabilidad / Odoo). Filtros opcionales por estado, contrato y rango de fechas.',
    { status: z.enum(['pendiente', 'facturado']).optional(), contractId: z.string().optional(), from: z.string().optional().describe('serviceDate >= YYYY-MM-DD'), to: z.string().optional().describe('serviceDate <= YYYY-MM-DD') },
    async (args) => {
      let q: firestore.Query = tcol('invoiceItems');
      if (args.status) q = q.where('status', '==', args.status);
      if (args.contractId) {
        if (!(await tcol('contracts').doc(String(args.contractId)).get()).exists) return ok({ ok: false, error: 'contrato no encontrado en este tenant' });
        q = q.where('contractId', '==', String(args.contractId));
      }
      const snap = await q.limit(2000).get();
      let rows = snap.docs.map((d) => d.data() as any);
      if (args.from) rows = rows.filter((r) => (r.serviceDate || '') >= args.from!);
      if (args.to) rows = rows.filter((r) => (r.serviceDate || '') <= args.to!);
      rows.sort((a, b) => (a.serviceDate || '').localeCompare(b.serviceDate || ''));
      const esc = (v: any) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
      const header = ['orden', 'tipo', 'licitacion', 'cliente', 'equipo', 'fecha_servicio', 'estado', 'factura', 'facturado_en'];
      const csv = [header.join(',')]
        .concat(rows.map((r) => [r.soNum, r.type, r.licitacionNum, r.clientName, r.equipmentSummary, r.serviceDate, r.status, r.invoiceNum || '', r.invoicedAt || ''].map(esc).join(',')))
        .join('\n');
      return ok({ ok: true, count: rows.length, csv });
    }
  );

  /* ---------------- inventory ---------------- */
  const invKey = (name: string) => (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  async function findProduct(nameOrId: string) {
    const direct = await tcol('inventory').doc(nameOrId).get();
    if (direct.exists) return direct;
    const snap = await tcol('inventory').get();
    const key = invKey(nameOrId);
    return snap.docs.find((d) => ((d.data() as any).nameKey || invKey((d.data() as any).name)) === key) || null;
  }

  server.tool('inventory_list', 'Lista los productos del inventario.', {}, async () => {
    const snap = await tcol('inventory').get();
    return ok(snap.docs.map((d) => { const i = d.data() as any; return { id: d.id, name: i.name, quantity: i.quantity, minQty: i.minQty || 0, purchaseLink: i.purchaseLink || '' }; }));
  });

  server.tool('inventory_low_stock', 'Recomendación de compra: productos en o por debajo del mínimo recomendado.', {}, async () => {
    const snap = await tcol('inventory').get();
    const low = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter((i: any) => (i.minQty || 0) > 0 && (i.quantity || 0) <= i.minQty)
      .map((i: any) => ({ name: i.name, available: i.quantity, min: i.minQty, needed: Math.max(0, i.minQty - i.quantity), purchaseLink: i.purchaseLink || '' }));
    return ok(low);
  });

  server.tool(
    'inventory_upsert',
    'Crea o actualiza un producto del inventario (upsert por nombre).',
    { name: z.string(), quantity: z.number().optional(), minQty: z.number().optional(), purchaseLink: z.string().optional(), description: z.string().optional() },
    async (args) => {
      const key = invKey(args.name);
      const snap = await tcol('inventory').get();
      const existing = snap.docs.find((d) => ((d.data() as any).nameKey || invKey((d.data() as any).name)) === key);
      const payload: any = { name: args.name.trim(), nameKey: key, updatedAt: nowCR() };
      if (args.quantity !== undefined) payload.quantity = args.quantity;
      if (args.minQty !== undefined) payload.minQty = args.minQty;
      if (args.purchaseLink !== undefined) payload.purchaseLink = args.purchaseLink;
      if (args.description !== undefined) payload.description = args.description;
      if (existing) { await existing.ref.set(payload, { merge: true }); return ok({ ok: true, id: existing.id, updated: true }); }
      payload.quantity = payload.quantity || 0;
      payload.minQty = payload.minQty || 0;
      payload.createdAt = nowCR();
      const ref = await tcol('inventory').add(payload);
      return ok({ ok: true, id: ref.id, created: true });
    }
  );

  server.tool(
    'inventory_adjust',
    'Ajusta la cantidad de un producto: set fija el valor, delta lo suma/resta.',
    { product: z.string().describe('nombre o id'), set: z.number().optional(), delta: z.number().optional() },
    async (args) => {
      const doc = await findProduct(args.product);
      if (!doc) return ok({ ok: false, error: 'producto no encontrado' });
      const cur = Number((doc.data() as any).quantity) || 0;
      const next = args.set !== undefined ? args.set : cur + (args.delta || 0);
      await doc.ref.set({ quantity: Math.max(0, next), updatedAt: nowCR() }, { merge: true });
      return ok({ ok: true, name: (doc.data() as any).name, quantity: Math.max(0, next) });
    }
  );

  server.tool('inventory_delete', 'Elimina un producto del inventario.', { product: z.string() }, async (args) => {
    const doc = await findProduct(args.product);
    if (!doc) return ok({ ok: false, error: 'producto no encontrado' });
    await doc.ref.delete();
    return ok({ ok: true });
  });

  server.tool(
    'inventory_movements',
    'Historial de consumo (qué se usó, cuánto, en qué ticket). Filtro opcional por producto.',
    { product: z.string().optional(), limit: z.number().optional() },
    async (args) => {
      const snap = await tcol('inventoryMovements').orderBy('at', 'desc').limit(args.limit || 50).get();
      let rows = snap.docs.map((d) => d.data() as any);
      if (args.product) {
        const key = invKey(args.product);
        rows = rows.filter((m) => invKey(m.productName) === key || m.productId === args.product);
      }
      return ok(rows.map((m) => ({ at: m.at, product: m.productName, qty: m.qty, ticket: m.ticketNum, location: [m.client, m.site].filter(Boolean).join(' · '), tech: m.techName })));
    }
  );

  /* ---------------- clientes receptores (facturación electrónica) ---------------- */
  const identKey = (ident: string) => String(ident || '').trim().toLowerCase().replace(/[\s-]/g, '');
  async function findClient(idOrIdent: string) {
    const direct = await tcol('clients').doc(idOrIdent).get();
    if (direct.exists) return direct;
    const snap = await tcol('clients').get();
    const key = identKey(idOrIdent);
    return snap.docs.find((d) => identKey((d.data() as any).identNumber) === key) || null;
  }

  /** Hace upsert de un cliente por número de identificación. Devuelve {id, created|updated}. */
  async function upsertClient(input: NewClientInput): Promise<{ ok: boolean; id?: string; created?: boolean; updated?: boolean; errors?: string[] }> {
    const errs = validateClient(input);
    if (errs.length) return { ok: false, errors: errs };
    const key = identKey(input.identNumber);
    const snap = await tcol('clients').get();
    const existing = snap.docs.find((d) => identKey((d.data() as any).identNumber) === key);
    const doc: any = buildClientDoc(input, BY);
    if (existing) {
      delete doc.createdAt; // conservar la fecha de creación original
      await existing.ref.set(doc, { merge: true });
      return { ok: true, id: existing.id, updated: true };
    }
    const ref = await tcol('clients').add(doc);
    return { ok: true, id: ref.id, created: true };
  }

  server.tool('clients_list', 'Lista los clientes receptores (datos fiscales para facturación electrónica).', {}, async () => {
    const snap = await tcol('clients').get();
    return ok(snap.docs.map((d) => { const c = d.data() as any; return { id: d.id, name: c.name, identType: c.identType, identNumber: c.identNumber, email: c.email, comercialName: c.comercialName || '', active: c.active !== false }; }));
  });

  server.tool(
    'clients_upsert',
    'Crea o actualiza un cliente receptor (upsert por número de identificación). identType: 1=céd. física, 2=jurídica, 3=DIMEX, 4=NITE.',
    {
      name: z.string(),
      identType: z.number().describe('1=física, 2=jurídica, 3=DIMEX, 4=NITE'),
      identNumber: z.string(),
      email: z.string(),
      comercialName: z.string().optional(),
      ccEmails: z.string().optional(),
      activityCode: z.string().optional(),
      direction: z.string().optional(),
      province: z.number().optional(),
      canton: z.number().optional(),
      district: z.number().optional(),
      neighborhood: z.number().optional(),
      internalCode: z.string().optional(),
    },
    async (args) => ok(await upsertClient(args as NewClientInput))
  );

  server.tool(
    'clients_import',
    'Importa una lista de clientes receptores en lote (upsert por número de identificación).',
    {
      clients: z
        .array(
          z.object({
            name: z.string(),
            identType: z.number(),
            identNumber: z.string(),
            email: z.string(),
            comercialName: z.string().optional(),
            ccEmails: z.string().optional(),
            activityCode: z.string().optional(),
            direction: z.string().optional(),
            province: z.number().optional(),
            canton: z.number().optional(),
            district: z.number().optional(),
            neighborhood: z.number().optional(),
            internalCode: z.string().optional(),
          })
        )
        .describe('Lista de clientes a importar'),
    },
    async (args) => {
      let created = 0;
      let updated = 0;
      const errors: any[] = [];
      for (const c of args.clients) {
        const res = await upsertClient(c as NewClientInput);
        if (!res.ok) errors.push({ identNumber: c.identNumber, errors: res.errors });
        else if (res.created) created++;
        else updated++;
      }
      return ok({ ok: errors.length === 0, created, updated, errors });
    }
  );

  server.tool('clients_delete', 'Elimina un cliente receptor (por id o número de identificación).', { client: z.string().describe('id o número de identificación') }, async (args) => {
    const doc = await findClient(args.client);
    if (!doc) return ok({ ok: false, error: 'cliente no encontrado' });
    await doc.ref.delete();
    return ok({ ok: true });
  });
}
