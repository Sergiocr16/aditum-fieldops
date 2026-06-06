/* Provisiona APIs + Firestore DB usando el token OAuth del service account. */
import { GoogleAuth } from 'google-auth-library';
import { readFileSync } from 'fs';

const keyFile = process.env.FIREBASE_SERVICE_ACCOUNT || '../secrets/service-account.json';
const sa = JSON.parse(readFileSync(keyFile, 'utf8'));
const projectId = sa.project_id;
const auth = new GoogleAuth({ keyFile, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
const client = await auth.getClient();
const token = (await client.getAccessToken()).token;
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

async function api(url, opts = {}) {
  const r = await fetch(url, { headers: H, ...opts });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, body };
}

const APIS = ['firestore.googleapis.com', 'firebasestorage.googleapis.com', 'storage.googleapis.com', 'cloudfunctions.googleapis.com', 'cloudbuild.googleapis.com', 'artifactregistry.googleapis.com', 'run.googleapis.com', 'eventarc.googleapis.com', 'identitytoolkit.googleapis.com'];

console.log('Proyecto:', projectId);
for (const svc of APIS) {
  const r = await api(`https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${svc}:enable`, { method: 'POST', body: '{}' });
  console.log(`enable ${svc}: ${r.status}` + (r.status >= 400 ? ' ' + JSON.stringify(r.body?.error?.status || r.body) : ''));
}

// Wait a bit for Firestore API to propagate
await new Promise((r) => setTimeout(r, 8000));

// Create default Firestore database (Native mode)
const loc = process.env.FS_LOCATION || 'nam5';
const create = await api(`https://firestore.googleapis.com/v1/projects/${projectId}/databases?databaseId=(default)`, {
  method: 'POST',
  body: JSON.stringify({ type: 'FIRESTORE_NATIVE', locationId: loc, concurrencyMode: 'PESSIMISTIC' }),
});
console.log('create firestore (default):', create.status, JSON.stringify(create.body?.error?.status || create.body?.name || create.body));
