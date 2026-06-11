/* © 2026 Aditum — Aditum FieldOps — MCP server, stdio mode (internal use).
   Connects with a service account and scopes every tool to MCP_TENANT_ID.
   For per-client remote access use http.ts (Cloud Run + API key). */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFileSync } from 'fs';
import admin from 'firebase-admin';
import { registerTools } from './tools.js';

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
const TENANT_ID = process.env.MCP_TENANT_ID || 'aditum';
const ACTOR = process.env.MCP_ACTOR || 'Admin';

const server = new McpServer({ name: 'aditum-fieldops', version: '2.0.0' });
registerTools(server, db, TENANT_ID, ACTOR, admin.auth());

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`Aditum FieldOps MCP server running (stdio, tenant: ${TENANT_ID}).`);
