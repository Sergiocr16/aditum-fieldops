# Aditum FieldOps

> Gestión de trabajo técnico en sitio — tickets de mantenimiento, evidencias (foto/PDF/video),
> link público de solo lectura para clientes, y Wiki de documentación.
> **© 2026 Aditum. Software propietario** (ver [LICENSE](./LICENSE)).

Hecho para Aditum (control de acceso, Costa Rica). Dos roles: **Administrador** (escritorio) y
**Técnico** (móvil). Interfaz en **español e inglés**.

## 🚀 Producción

- **Proyecto Firebase:** `fieldops-aditum`
- **App en vivo:** https://fieldops-aditum.web.app  (dominio propio: `https://service.aditumcr.com`, pendiente DNS)
- **Admin:** `admin@aditumcr.com` / `Aditum2026!` (nombre: *Admin Aditum*)
- **Regiones:** Firestore `us-central1` · Functions callables `us-central1` · bucket Storage `us-east1`
  (por eso el trigger `onEvidenceFinalized` corre en `us-east1`).

Estado actual: Hosting, Firestore/Storage rules y las **5 Cloud Functions** desplegadas; datos limpios
(solo el admin + tickets de prueba creados desde el MCP).

---

## Arquitectura

```
Navegador (SPA React)  ──►  Firebase Hosting
   │  Firestore SDK / callable │─ Auth (email/contraseña, claim de rol admin|tech)
   ├──────────────────────────►├─ Firestore (tickets, users, wiki, counters)
   │                           ├─ Storage (evidencias, media de wiki)
   │                           └─ Cloud Functions (técnicos, link público, compresión de video)
   │
Claude Code ──► MCP server (mcp/) ──► Firebase Admin SDK ──► mismo proyecto en producción
```

- **web/** — Vite + React + TypeScript (SPA). Design system en `web/src/styles/{tokens,layout}.css`.
  i18n ES/EN con `react-i18next`. Markdown de Wiki sanitizado con DOMPurify.
- **functions/** — Cloud Functions v2 (Node 20): `createTechnician`, `updateTechnician`,
  `resetTechnicianPassword`, `getPublicTicket` (sin auth, DTO saneado), `onEvidenceFinalized`
  (comprime video con ffmpeg, en `us-east1`).
- **shared/** — lógica común (validación, numeración `AD-####`, tipos). La usan `mcp/` (vía `file:`) y
  `functions/` (**vendorizada** como `functions/src/shared.ts`, ver nota de deploy).
- **mcp/** — servidor MCP para crear/gestionar tickets y wiki desde Claude Code.
- **seed/** — admin inicial, datos demo y provisión de APIs/DB.

## Modelo de datos (Firestore)

`users`, `tickets` (con `checklist[]`, `evidence[]`, `history[]`, `comments[]`, `share{token,active,...}`),
`counters/tickets`, `wikiCategories`, `wikiPages`. Detalle en [CLAUDE.md](./CLAUDE.md).

## Requisitos de tooling (importante)

- **Node 20** (Vite 5 necesita 18+; usamos 20). `nvm use 20`.
- **Java 17+** para los emuladores.
- **Firebase CLI fijado a la v13** (`firebase-tools@13`): la v14/15 exige **Java 21** para emuladores.
  Con Java 17 se usa `npx firebase-tools@13`.

## Desarrollo local (emuladores)

`web/.env.development` ya apunta a emuladores (`VITE_USE_EMULATORS=true`, proyecto `demo-aditum-fieldops`).

```bash
npm --prefix shared run build && npm --prefix functions run build
npx firebase-tools@13 emulators:start --only auth,functions,firestore,storage --project demo-aditum-fieldops

# Sembrar admin (contra emuladores):
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  FIREBASE_PROJECT_ID=demo-aditum-fieldops node seed/seed.mjs

# Front:
npm --prefix web run dev      # http://localhost:5173
```

## Configuración y secretos

- `web/.env` — config **real** de producción (`VITE_FIREBASE_*`, `VITE_PUBLIC_BASE_URL=https://service.aditumcr.com`,
  `VITE_USE_EMULATORS=false`). Gitignored; plantilla en `web/.env.example`.
- `secrets/service-account.json` — clave del service account (gitignored). La usan `seed/` y `mcp/`.
- Todos los `.env*` (excepto `.env.example`) están gitignored.

## Despliegue a producción (proceso verificado)

El service account debe tener rol **Owner** para que el CLI cree los bindings IAM de las Functions
(invoker público + agentes de Eventarc). Con `Editor` solo alcanza para reglas y hosting.

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"
export GOOGLE_APPLICATION_CREDENTIALS="$PWD/secrets/service-account.json"
export XDG_CONFIG_HOME="/tmp/fo-fbconfig"   # aísla la config del CLI -> fuerza auth por service account
export GOOGLE_CLOUD_PROJECT="fieldops-aditum"

# 1) (solo la primera vez) habilitar APIs + crear la base Firestore (us-central1)
node seed/provision.mjs                      # enable de APIs; la DB se crea en consola o por API con Owner
# 2) sembrar el admin en producción
FIREBASE_SERVICE_ACCOUNT=secrets/service-account.json FIREBASE_PROJECT_ID=fieldops-aditum node seed/seed.mjs
# 3) build del front y deploy de todo
npm --prefix web run build
npx firebase-tools@13 deploy --project fieldops-aditum --non-interactive
```

**Notas / gotchas aprendidos en el despliegue:**
- **`XDG_CONFIG_HOME` a una carpeta vacía** evita que el CLI use una sesión cacheada y lo fuerza a usar
  `GOOGLE_APPLICATION_CREDENTIALS` (si no, da `401 invalid authentication credentials`).
- **`shared` vendorizado en functions**: Firebase no sube dependencias `file:` externas a la carpeta de
  funciones, por eso `functions/src/shared.ts` es una copia de `shared/src/index.ts`. **Si cambiás
  `shared`, volvé a copiarlo:** `cp shared/src/index.ts functions/src/shared.ts`.
- **Región del trigger de Storage**: el bucket quedó en `us-east1`; `onEvidenceFinalized` está fijado a esa
  región (`STORAGE_REGION`). Deben coincidir o el deploy falla.
- Si al desplegar una callable cambia de IAM y queda con **CORS** (`No Access-Control-Allow-Origin`), es
  que el *invoker* público no se aplicó: borrá y recreá esas funciones
  (`firebase functions:delete <fn> --region us-central1 --force` y volvé a `deploy`).
- `firebase.json` fija `"site": "fieldops-aditum"` en hosting.

## Dominio propio (`service.aditumcr.com` vía Cloudflare)

1. Firebase Console → Hosting → **Agregar dominio personalizado** → `service.aditumcr.com`.
2. En Cloudflare DNS agregá el **TXT** de verificación que indique Firebase; verificá.
3. Agregá los **registros A** que muestre Firebase, en **DNS only (nube gris)** para que emita el SSL.
4. Cuando figure *Connected*, opcionalmente activá el proxy de Cloudflare con SSL **Full (strict)**.

`VITE_PUBLIC_BASE_URL` ya está en `https://service.aditumcr.com`, así que los links públicos usan ese dominio.

## Roles y permisos

- **Admin**: usuarios, tickets, aprobar/rechazar, links públicos, wiki.
- **Técnico**: solo sus tickets asignados + wiki publicada.
- **Público**: sin login; solo `getPublicTicket` con un token **activo** (muestra el reporte saneado).

## Funciones de negocio destacadas

- **Técnicos**: la **contraseña se genera automáticamente** (oculta en el formulario) y se muestra en la
  tarjeta de credenciales copiables al crear; acción **Regenerar contraseña** por técnico
  (`resetTechnicianPassword`).
- **Link público**: si está **activo**, el reporte es visible (el control es activar/desactivar el link).
- **Evidencias**: subida resumable con progreso; los videos se comprimen en el servidor
  (`onEvidenceFinalized`, ffmpeg 720p).
- **Wiki**: Markdown sanitizado, adjuntos, categorías, búsqueda; soporta `@[video](url)`.

## Módulo de inventario

- Colección `inventory/{id}` (`name, quantity, minQty, purchaseLink, description`) e historial
  `inventoryMovements/{id}` (consumo por ticket).
- **Pantalla admin "Inventario":** importar productos desde **Excel** (upsert por nombre; columnas:
  Nombre, Cantidad, Link de compra, Descripción, Mínimo recomendado), descargar plantilla, crear/editar,
  panel **"Próximo a comprar / Reabastecer"** (items en o bajo el mínimo, con link de compra) y pestaña
  **"Historial de consumo"** (qué/cuánto se usó, en qué ticket, cliente/sitio y técnico).
- **En el ticket (técnico):** sección **"Materiales / repuestos usados"** — selecciona productos del
  inventario (cantidad + comentario) y un campo libre para consumos fuera de inventario.
- **Rebaja automática al aprobar:** el stock se descuenta **solo cuando el admin aprueba** el ticket, de
  forma atómica e idempotente (en `onTicketWritten`), generando los movimientos del historial.
- **Visibilidad:** el consumo se ve solo en admin y técnico; **no** aparece en el link público.
- Reglas: `inventory` lectura para staff, escritura admin; `inventoryMovements` lectura admin, escritura
  solo por la Function.

## Notificaciones por correo

Cloud Function `onTicketWritten` (trigger Firestore sobre `tickets`) envía correos por **Gmail SMTP**
(Nodemailer) — funciona venga el cambio de la web, la app del técnico o el MCP:

| Evento | Destinatario |
|---|---|
| Asignación / reasignación | Técnico (su correo) |
| Listo para revisión | Admin (`ADMIN_NOTIFY_EMAIL`, por defecto `partners@aditumcr.com`) |
| Rechazado (con comentario) | Técnico |
| Aprobado | Técnico |

Config: secrets `SMTP_USER` / `SMTP_PASS` (Gmail + **App Password**) en Secret Manager; env
`ADMIN_NOTIFY_EMAIL` y `APP_URL` en `functions/.env`. Para (re)configurar:

```bash
printf 'cuenta@dominio' | npx firebase-tools@13 functions:secrets:set SMTP_USER --data-file=-
printf 'app-password-16' | npx firebase-tools@13 functions:secrets:set SMTP_PASS --data-file=-
npx firebase-tools@13 deploy --only functions:onTicketWritten
```

## MCP — crear tickets/wiki desde Claude Code

El server `mcp/` se conecta al proyecto **de producción** vía Admin SDK (mismo Firestore que la web), así
que lo creado aparece de inmediato en la app.

1. `cp mcp/.env.example mcp/.env` (apunta a `../secrets/service-account.json`).
2. `npm --prefix mcp run build`.
3. El repo trae `.mcp.json` que registra el server **`fieldops-aditum`** para Claude Code (ejecutado desde
   la raíz del repo). **Reiniciá Claude Code** para que lo detecte y aprobalo (o usá `/mcp`).
4. Usá el skill **`/crear-ticket-fieldops`** o pedí en lenguaje natural: *"creá un ticket de instalación de
   lector QR en Vista Real para Carlos, prioridad alta"*.

Tools del MCP: `create_ticket`, `list_technicians`, `list_tickets`, `get_ticket`, `assign_ticket`,
`add_checklist_items`, `wiki_list_pages`, `wiki_get_page`, `wiki_create_page`, `wiki_update_page`,
`wiki_set_status`, `wiki_list_categories`, `wiki_create_category`, `inventory_list`,
`inventory_low_stock`, `inventory_upsert`, `inventory_adjust`, `inventory_delete`, `inventory_movements`.

## Seguridad

- Roles por **custom claims**, validados en **Cloud Functions** y en **`firestore.rules`/`storage.rules`**.
- Subida de archivos validada por tipo y tamaño (cliente + Storage rules; videos ≤ 200MB).
- Tokens públicos largos y aleatorios; la vista pública nunca expone datos internos.
- Markdown de la Wiki sanitizado.
- **Secretos solo en `.env`/`secrets/` (gitignored).** ⚠️ Si una clave de service account se compartió por
  un canal inseguro, **rotala** (Consola → Cuentas de servicio → eliminar y generar otra).

## Contribuir / cómo agregar features

Lee [CLAUDE.md](./CLAUDE.md) y `.claude/rules/`. Skills: `/add-screen`, `/add-ticket-field`,
`/add-i18n-keys`, `/deploy-fieldops`, `/crear-ticket-fieldops`.

Convención: **no se hace commit/push automático** (salvo pedido explícito). No se exporta PDF; el
entregable compartible es el link público.
