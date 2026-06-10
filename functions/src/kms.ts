/* © 2026 Aditum — Aditum FieldOps — Cloud KMS envelope for tenant SMTP passwords.
   In the emulator (no KMS) we store a marked base64 plaintext so the flow can be
   tested locally; production always goes through KMS. */
import * as logger from 'firebase-functions/logger';

const PROJECT = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || '';
const LOCATION = process.env.KMS_LOCATION || 'us-central1';
const KEYRING = process.env.KMS_KEYRING || 'fieldops';
const KEY = process.env.KMS_KEY || 'tenant-smtp';

const IS_EMULATOR = !!process.env.FUNCTIONS_EMULATOR;
const PLAIN_PREFIX = 'plain:'; // emulator-only marker

function keyName() {
  return `projects/${PROJECT}/locations/${LOCATION}/keyRings/${KEYRING}/cryptoKeys/${KEY}`;
}

let client: any = null;
function kmsClient() {
  if (!client) {
    const { KeyManagementServiceClient } = require('@google-cloud/kms');
    client = new KeyManagementServiceClient();
  }
  return client;
}

export async function encryptSecret(plaintext: string): Promise<string> {
  if (IS_EMULATOR) return PLAIN_PREFIX + Buffer.from(plaintext, 'utf8').toString('base64');
  const [res] = await kmsClient().encrypt({ name: keyName(), plaintext: Buffer.from(plaintext, 'utf8') });
  return Buffer.from(res.ciphertext).toString('base64');
}

export async function decryptSecret(ciphertext: string): Promise<string> {
  if (ciphertext.startsWith(PLAIN_PREFIX)) {
    // Un marcador de texto plano del emulador NUNCA debe aparecer en producción:
    // si pasara, abortamos en vez de devolver el secreto en claro.
    if (!IS_EMULATOR) {
      logger.error('decryptSecret: marcador plaintext detectado fuera del emulador; abortando');
      throw new Error('Refusing to use emulator-only plaintext secret in production.');
    }
    return Buffer.from(ciphertext.slice(PLAIN_PREFIX.length), 'base64').toString('utf8');
  }
  const [res] = await kmsClient().decrypt({ name: keyName(), ciphertext: Buffer.from(ciphertext, 'base64') });
  return Buffer.from(res.plaintext).toString('utf8');
}
