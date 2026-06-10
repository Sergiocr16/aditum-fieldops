/* © 2026 Aditum — Aditum FieldOps — MCP tools (tenant-scoped).
   Every tool operates strictly inside tenants/{tenantId}/...; the technicians
   lookup uses the global `users` collection filtered by tenantId. */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { firestore } from 'firebase-admin';
import {
  createTicketWithNumber,
  createContractWithNumber,
  buildEquipmentDoc,
  validateEquipment,
  buildWikiPageDoc,
  validateWikiPage,
  nowCR,
  addMonthsCR,
  STATUSES,
  WIKI_STATUSES,
  PERIODICITIES,
  PeriodicityMonths,
} from '@aditum/fieldops-shared';

type Db = firestore.Firestore;

const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] });

export function registerTools(server: McpServer, db: Db, tenantId: string, actor = 'Admin') {
  const BY = 'MCP · ' + actor;
  const tcol = (name: string) => db.collection('tenants').doc(tenantId).collection(name);

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

  server.tool('list_equipment_types', 'Lista los tipos de equipo del catálogo.', {}, async () => {
    const snap = await tcol('equipmentTypes').get();
    return ok(snap.docs.map((d) => ({ id: d.id, name: (d.data() as any).name, active: (d.data() as any).active, templateVersion: (d.data() as any).activeTemplateVersion || 0 })));
  });

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

  /* ---------------- service orders & billing ---------------- */
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
}
