/* © 2026 Aditum — Aditum FieldOps — Firebase initialization */
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const REGION = import.meta.env.VITE_FUNCTIONS_REGION || 'us-central1';
export const PUBLIC_BASE_URL = import.meta.env.VITE_PUBLIC_BASE_URL || window.location.origin;

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, REGION);

if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  // usar el host desde el que se abre la app (localhost o IP LAN) para que
  // otras máquinas de la red puedan conectarse a los emuladores
  const EMU_HOST = window.location.hostname || '127.0.0.1';
  connectAuthEmulator(auth, `http://${EMU_HOST}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, EMU_HOST, 8080);
  connectStorageEmulator(storage, EMU_HOST, 9199);
  connectFunctionsEmulator(functions, EMU_HOST, 5001);
}
