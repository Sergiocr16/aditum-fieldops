/* © 2026 Aditum — Aditum FieldOps — MCP server (Firebase Admin SDK -> production)
   Lets Claude Code create/manage tickets and wiki pages in the live Firebase project. */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync } from 'fs';
import admin from 'firebase-admin';
import {
  createTicketWithNumber,
  buildWikiPageDoc,
  validateWikiPage,
  nowCR,
  STATUSES,
  PRIORITIES,
  WIKI_STATUSES,
} from '@aditum/fieldops-shared';

/* ---------------- Firebase Admin init ---------------- */
function initFirebase() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const saPath = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (saPath) {
    const sa = JSON.parse(readFileSync(saPath, 'utf8'));
    admin.initializeApp({ credential: admin.credential.cert(sa), projectId: projectId || sa.project_id });
  } else {
    admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId });
  }
  return admin.firestore();
}
const db = initFirebase();
const BY = 'MCP · ' + (process.env.MCP_ACTOR || 'Admin');

const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] });

async function findTechId(nameOrId?: string | null): Promise<{ id: string | null; name?: string }> {
  if (!nameOrId) return { id: null };
  const direct = await db.collection('users').doc(nameOrId).get();
  if (direct.exists) return { id: direct.id, name: (direct.data() as any).name };
  const snap = await db.collection('users').where('role', '==', 'tech').get();
  const q = nameOrId.toLowerCase();
  const match = snap.docs.find((d) => ((d.data() as any).name || '').toLowerCase().includes(q) || ((d.data() as any).email || '').toLowerCase().includes(q));
  return match ? { id: match.id, name: (match.data() as any).name } : { id: null };
}

/* ---------------- MCP server ---------------- */
const server = new McpServer({ name: 'aditum-fieldops', version: '1.0.0' });

server.tool(
  'create_ticket',
  'Crea un ticket de trabajo técnico en Aditum FieldOps (producción). Devuelve el número AD-#### asignado.',
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
    const res = await createTicketWithNumber(db, input, BY, tech.name);
    return ok({ created: true, id: res.id, num: res.num, technician: tech.name || null });
  }
);

server.tool('list_technicians', 'Lista los técnicos (para resolver nombre -> id).', {}, async () => {
  const snap = await db.collection('users').where('role', '==', 'tech').get();
  return ok(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any), name: (d.data() as any).name, active: (d.data() as any).active })));
});

server.tool(
  'list_tickets',
  'Lista tickets con filtros opcionales por estado y técnico.',
  { status: z.enum(STATUSES as [string, ...string[]]).optional(), technician: z.string().optional(), limit: z.number().optional() },
  async (args) => {
    let q: FirebaseFirestore.Query = db.collection('tickets');
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

server.tool('get_ticket', 'Obtiene un ticket por id o por número (AD-####).', { idOrNum: z.string() }, async (args) => {
  let doc = await db.collection('tickets').doc(args.idOrNum).get();
  if (!doc.exists) {
    const snap = await db.collection('tickets').where('num', '==', args.idOrNum).limit(1).get();
    if (!snap.empty) doc = snap.docs[0];
  }
  if (!doc.exists) return ok({ found: false });
  return ok({ found: true, id: doc.id, ...(doc.data() as any) });
});

server.tool('assign_ticket', 'Asigna o reasigna un ticket a un técnico.', { idOrNum: z.string(), technician: z.string() }, async (args) => {
  let doc = await db.collection('tickets').doc(args.idOrNum).get();
  if (!doc.exists) {
    const snap = await db.collection('tickets').where('num', '==', args.idOrNum).limit(1).get();
    if (!snap.empty) doc = snap.docs[0];
  }
  if (!doc.exists) return ok({ ok: false, error: 'not found' });
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
  let doc = await db.collection('tickets').doc(args.idOrNum).get();
  if (!doc.exists) {
    const snap = await db.collection('tickets').where('num', '==', args.idOrNum).limit(1).get();
    if (!snap.empty) doc = snap.docs[0];
  }
  if (!doc.exists) return ok({ ok: false, error: 'not found' });
  const t = doc.data() as any;
  const newItems = args.items.filter((x) => x.trim()).map((text, i) => ({ id: 'm' + Date.now() + i, text: text.trim(), done: false, by: null, at: null }));
  await doc.ref.set({ checklist: [...(t.checklist || []), ...newItems] }, { merge: true });
  return ok({ ok: true, added: newItems.length });
});

/* ---------------- Wiki tools ---------------- */
server.tool('wiki_list_categories', 'Lista las categorías de la Wiki.', {}, async () => {
  const snap = await db.collection('wikiCategories').get();
  return ok(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
});

server.tool('wiki_create_category', 'Crea una categoría de Wiki.', { name: z.string(), description: z.string().optional() }, async (args) => {
  const ref = await db.collection('wikiCategories').add({ name: args.name, description: args.description || '', active: true, orderIndex: 0, createdAt: nowCR(), updatedAt: nowCR() });
  return ok({ id: ref.id, name: args.name });
});

server.tool(
  'wiki_list_pages',
  'Lista páginas de la Wiki (opcionalmente filtra por estado).',
  { status: z.enum(WIKI_STATUSES as [string, ...string[]]).optional() },
  async (args) => {
    let q: FirebaseFirestore.Query = db.collection('wikiPages');
    if (args.status) q = q.where('status', '==', args.status);
    const snap = await q.get();
    return ok(snap.docs.map((d) => { const p = d.data() as any; return { id: d.id, title: p.title, status: p.status, categoryId: p.categoryId, updatedAt: p.updatedAt }; }));
  }
);

server.tool('wiki_get_page', 'Obtiene una página de Wiki por id.', { id: z.string() }, async (args) => {
  const doc = await db.collection('wikiPages').doc(args.id).get();
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
      const direct = await db.collection('wikiCategories').doc(args.category).get();
      if (direct.exists) categoryId = direct.id;
      else {
        const snap = await db.collection('wikiCategories').get();
        const m = snap.docs.find((d) => ((d.data() as any).name || '').toLowerCase() === args.category!.toLowerCase());
        categoryId = m ? m.id : null;
      }
    }
    const docData = buildWikiPageDoc({ title: args.title, contentMarkdown: args.contentMarkdown, categoryId, status: args.status }, BY);
    const ref = await db.collection('wikiPages').add(docData);
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
      const snap = await db.collection('wikiCategories').get();
      const m = snap.docs.find((d) => d.id === args.category || ((d.data() as any).name || '').toLowerCase() === (args.category || '').toLowerCase());
      patch.categoryId = m ? m.id : null;
    }
    await db.collection('wikiPages').doc(args.id).set(patch, { merge: true });
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
    await db.collection('wikiPages').doc(args.id).set(patch, { merge: true });
    return ok({ ok: true, status: args.status });
  }
);

/* ---------------- Inventory tools ---------------- */
const invKey = (name: string) => (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
async function findProduct(nameOrId: string) {
  const direct = await db.collection('inventory').doc(nameOrId).get();
  if (direct.exists) return direct;
  const snap = await db.collection('inventory').get();
  const key = invKey(nameOrId);
  return snap.docs.find((d) => ((d.data() as any).nameKey || invKey((d.data() as any).name)) === key) || null;
}

server.tool('inventory_list', 'Lista los productos del inventario.', {}, async () => {
  const snap = await db.collection('inventory').get();
  return ok(snap.docs.map((d) => { const i = d.data() as any; return { id: d.id, name: i.name, quantity: i.quantity, minQty: i.minQty || 0, purchaseLink: i.purchaseLink || '' }; }));
});

server.tool('inventory_low_stock', 'Recomendación de compra: productos en o por debajo del mínimo recomendado.', {}, async () => {
  const snap = await db.collection('inventory').get();
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
    const snap = await db.collection('inventory').get();
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
    const ref = await db.collection('inventory').add(payload);
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
    let snap = await db.collection('inventoryMovements').orderBy('at', 'desc').limit(args.limit || 50).get();
    let rows = snap.docs.map((d) => d.data() as any);
    if (args.product) {
      const key = invKey(args.product);
      rows = rows.filter((m) => invKey(m.productName) === key || m.productId === args.product);
    }
    return ok(rows.map((m) => ({ at: m.at, product: m.productName, qty: m.qty, ticket: m.ticketNum, location: [m.client, m.site].filter(Boolean).join(' · '), tech: m.techName })));
  }
);

/* ---------------- start ---------------- */
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('Aditum FieldOps MCP server running (stdio).');
