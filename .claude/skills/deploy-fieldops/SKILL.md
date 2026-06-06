---
name: deploy-fieldops
description: Construye y despliega Aditum FieldOps a producción en Firebase (hosting + functions + rules), con verificaciones previas. Pide confirmación antes de desplegar. Úsalo cuando el usuario diga "deploy", "publicar", "subir a producción".
---

# Deploy de Aditum FieldOps

> Requiere Node 18+ y `firebase login`. **Pide confirmación explícita antes de `firebase deploy`.**

1. **Pre-flight**:
   - Recompila shared: `npm --prefix shared run build`.
   - Typecheck/build web: `npm --prefix web run build` (debe pasar sin errores).
   - Build functions: `npm --prefix functions run build`.
   - Confirma el `projectId` en `.firebaserc` y que `web/.env` apunta a producción
     (`VITE_USE_EMULATORS=false`, `VITE_PUBLIC_BASE_URL` correcto).
2. **Confirma** con el usuario qué se va a desplegar (hosting/functions/rules) y a qué proyecto.
3. **Deploy**:
   - Todo: `firebase deploy`
   - Selectivo: `firebase deploy --only hosting` / `--only functions` / `--only firestore:rules,storage`
4. **Post-deploy**: reporta la URL (`https://<projectId>.web.app`) y verifica login + un flujo básico.

No hagas commit/push automático. No despliegues sin confirmación del usuario.
