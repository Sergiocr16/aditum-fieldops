/* © 2026 Aditum — Aditum FieldOps — MCP server, Streamable HTTP mode (Cloud Run).
   Per-tenant API keys: Authorization: Bearer fok_{tenantId}_{secret}. The key's
   SHA-256 is the doc id in the global `mcpApiKeys` collection; every tool is
   scoped to the key's tenant. Stateless: one server instance per request.

   Deploy (Cloud Run, service account with roles/datastore.user):
     gcloud run deploy fieldops-mcp --source mcp --region us-central1 \
       --allow-unauthenticated --min-instances 0 --memory 256Mi

   Client (Claude Code):
     claude mcp add fieldops --transport http https://<run-url>/mcp \
       --header "Authorization: Bearer fok_..." */
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { createHash } from 'crypto';
import admin from 'firebase-admin';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerTools } from './tools.js';

admin.initializeApp(); // Cloud Run: application default credentials
const db = admin.firestore();

const keyCache = new Map<string, { tenantId: string; exp: number }>();
// TTL corto: acota la ventana en que una key recién revocada seguiría sirviendo.
const CACHE_TTL_MS = 15_000;

async function authTenant(req: IncomingMessage): Promise<string | null> {
  const raw = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!raw.startsWith('fok_')) return null;
  const hash = createHash('sha256').update(raw).digest('hex');
  const hit = keyCache.get(hash);
  if (hit && hit.exp > Date.now()) return hit.tenantId;
  const doc = await db.collection('mcpApiKeys').doc(hash).get();
  if (!doc.exists || (doc.data() as any).revoked) return null;
  const tenantId = (doc.data() as any).tenantId as string;
  const tenant = await db.collection('tenants').doc(tenantId).get();
  if (!tenant.exists || !(tenant.data() as any).active) return null;
  doc.ref.set({ lastUsedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
  keyCache.set(hash, { tenantId, exp: Date.now() + CACHE_TTL_MS });
  return tenantId;
}

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 4 * 1024 * 1024) reject(new Error('payload too large'));
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : undefined);
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function deny(res: ServerResponse, code: number, msg: string) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: msg }, id: null }));
}

const httpServer = createServer(async (req, res) => {
  const url = (req.url || '').split('?')[0];
  if (url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }
  if (url !== '/mcp') {
    deny(res, 404, 'Not found');
    return;
  }
  let tenantId: string | null = null;
  try {
    tenantId = await authTenant(req);
  } catch (e) {
    console.error('auth error', e);
  }
  if (!tenantId) {
    deny(res, 401, 'Invalid or revoked API key');
    return;
  }
  try {
    const body = req.method === 'POST' ? await readBody(req) : undefined;
    const server = new McpServer({ name: 'aditum-fieldops', version: '2.0.0' });
    registerTools(server, db, tenantId, 'Cliente');
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }); // stateless
    res.on('close', () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (e) {
    console.error('mcp request failed', e);
    if (!res.headersSent) deny(res, 500, 'Internal error');
  }
});

const PORT = Number(process.env.PORT) || 8080;
httpServer.listen(PORT, () => console.log(`Aditum FieldOps MCP server (HTTP) on :${PORT}`));
