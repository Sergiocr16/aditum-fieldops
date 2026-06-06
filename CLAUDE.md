# CLAUDE.md — Aditum FieldOps

Instrucciones para cualquier sesión de Claude Code en este repositorio. © Aditum (software propietario).

## Qué es

**Aditum FieldOps** — plataforma web de gestión de tickets de mantenimiento / trabajo técnico en sitio,
con evidencias (fotos, PDF, video), link público de solo lectura para clientes, y un módulo Wiki de
documentación. Dos roles: **admin** (escritorio) y **técnico** (móvil). Idioma ES/EN. Hecho para Aditum
(control de acceso en Costa Rica).

## Producción

- Proyecto Firebase: **`fieldops-aditum`** · App: **https://fieldops-aditum.web.app**
  (dominio propio `https://service.aditumcr.com`, pendiente DNS en Cloudflare).
- Admin: **admin@aditumcr.com / Aditum2026!** (nombre *Admin Aditum*).
- Regiones: Firestore **us-central1**, callables **us-central1**, bucket Storage **us-east1**
  (por eso `onEvidenceFinalized` corre en **us-east1**).
- Las 5 Functions, reglas y hosting están desplegadas.

## Stack

- **Frontend** (`web/`): Vite + React 18 + TypeScript + React Router. Diseño con CSS plano en
  `web/src/styles/tokens.css` y `layout.css` (NO reescribir — es el design system). i18n con `react-i18next`.
- **Backend**: Firebase — Auth (custom claims `role: admin|tech`), Firestore, Storage, Cloud Functions
  (`functions/`, Node 20, v2). Despliegue en Firebase Hosting + Functions.
- **shared/**: lógica común (validación, numeración de tickets, tipos) consumida por `functions/` y `mcp/`
  como dependencia `file:` (`@aditum/fieldops-shared`). **Tras editar `shared/`, recompilarlo**
  (`npm --prefix shared run build`).
- **mcp/**: servidor MCP (stdio) que crea/gestiona tickets y wiki en producción vía Admin SDK.
- **seed/**: script de admin inicial + datos demo.

## Comandos

> Usa **Node 20** (`nvm use 20`) y **`firebase-tools@13`** (la v14/15 exige Java 21; hay Java 17).

```bash
# Web
npm --prefix web install && npm --prefix web run dev   # http://localhost:5173 (usa web/.env.development -> emuladores)
npm --prefix web run build                              # genera web/dist (usa web/.env -> producción)

# Emuladores (raíz)
npm --prefix shared run build && npm --prefix functions run build
npx firebase-tools@13 emulators:start --only auth,functions,firestore,storage --project demo-aditum-fieldops

# Seed (emuladores)
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  FIREBASE_PROJECT_ID=demo-aditum-fieldops node seed/seed.mjs

# Deploy a producción (el SA debe ser Owner para las Functions)
export GOOGLE_APPLICATION_CREDENTIALS="$PWD/secrets/service-account.json"
export XDG_CONFIG_HOME="/tmp/fo-fbconfig"        # aísla la config -> fuerza auth por service account (evita 401)
npm --prefix web run build
npx firebase-tools@13 deploy --project fieldops-aditum --non-interactive

# MCP
npm --prefix mcp run build                       # se usa vía .mcp.json (server "fieldops-aditum")
```

### Gotchas de deploy (importante)
- **`shared` está vendorizado** en `functions/src/shared.ts` (Firebase no sube deps `file:` externas). Si
  cambiás `shared/src/index.ts`, recopiá: `cp shared/src/index.ts functions/src/shared.ts`.
- **`XDG_CONFIG_HOME` vacío** fuerza al CLI a usar el service account (sin esto da `401`).
- **Trigger de Storage en `us-east1`** (región del bucket). Debe coincidir con el bucket.
- Si una callable queda con **CORS** tras deploy (invoker no aplicado), borrá y recreá:
  `npx firebase-tools@13 functions:delete <fn> --region us-central1 --force` y volvé a desplegar.

## Modelo de datos (Firestore)

- `users/{uid}`: name, email, role, phone, active, initials, createdAt. (Solo se escribe vía Functions.)
- `tickets/{id}`: num (AD-####), title, client, site, address, priority, status, techId, fechas,
  description/instructions/expected/doneConditions/observations/evidenceReq, techNote/techObs, readyAt,
  `checklist[]`, `evidence[]`, `history[]`, `comments[]`, `approval?`, `share{token,active,...}`.
- `counters/tickets`: contador atómico para `num`.
- `wikiCategories/{id}`, `wikiPages/{id}` (status DRAFT|PUBLISHED|INACTIVE, contentMarkdown, attachments[]).

Estados de ticket: pendiente, asignado, en_proceso, listo_revision, aprobado, rechazado, cerrado.

**Comportamientos clave:**
- Técnico: contraseña **auto-generada y oculta** en el formulario; se muestra en la tarjeta de
  credenciales al crear; acción **Regenerar contraseña** (`resetTechnicianPassword`).
- Link público: `getPublicTicket` muestra el reporte si el link está **activo** (no exige un estado
  concreto del ticket); valida token + expiración y devuelve un DTO **saneado**.

## Reglas que DEBES seguir

Ver `.claude/rules/`. En resumen:
- **UI** (`ui-design-system.md`): reutiliza tokens/clases y componentes de `web/src/components/ui.tsx`.
  Paleta navy/dorado. **NUNCA teal.**
- **i18n** (`i18n.md`): toda cadena nueva va en `web/src/i18n/locales/es.json` **y** `en.json`. Sin texto fijo.
- **Firebase/Seguridad** (`firebase.md`, `security.md`): roles validados en Functions Y en
  `firestore.rules`/`storage.rules`. Tokens públicos aleatorios. La vista pública nunca expone datos
  internos (comentarios/historial/links). Secretos solo en `.env`/Functions secrets, nunca en git.
- **Workflow** (`workflow.md`): **no commit/push automático**. Español por defecto. Zona America/Costa_Rica.
  Correr emuladores antes de deploy.

## Cómo agregar cosas (atajos)

- **Nueva pantalla** → skill `/add-screen`.
- **Nuevo campo de ticket** (end-to-end) → skill `/add-ticket-field`.
- **Claves de traducción** → skill `/add-i18n-keys`.
- **Deploy** → skill `/deploy-fieldops`.
- **Nueva Cloud Function**: agrégala en `functions/src/index.ts`, valida `request.auth` + claim de rol.
- **Crear tickets/wiki desde Claude** → MCP `aditum-fieldops` (ver README, sección MCP).
