# CLAUDE.md — Aditum FieldOps

Instrucciones para cualquier sesión de Claude Code en este repositorio. © Aditum (software propietario).

## Qué es

**Aditum FieldOps** — plataforma web de gestión de **órdenes de servicio** (mantenimiento / trabajo
técnico en sitio), con evidencias (fotos, PDF, video), link público de solo lectura para clientes, y un
módulo Wiki de documentación. Multi-tenant. Dos roles: **admin** (escritorio) y **técnico** (móvil)
— más roles de escritorio `coordinador` y `facturacion`. Idioma ES/EN. Hecho para Aditum (control de
acceso en Costa Rica).

> **Modelo unificado (importante).** Antes existían dos entidades: *órdenes de trabajo* (`tickets`) y
> *órdenes de servicio* (`serviceOrders`). Hoy **todo es una sola "Orden"** (`serviceOrders`), con una
> `mode`: **`periodico`** (mantenimiento programado por contrato/equipos, lo genera el scheduler) o
> **`demanda`** (trabajo puntual, ex orden de trabajo: cliente texto libre, checklist ad-hoc, sin equipo
> obligatorio). El módulo `tickets` se quitó de la UI/config; la colección `tickets`, `getPublicTicket`,
> `onTicketWritten` y la ruta pública `/p/:token` **se conservan** solo para que los links viejos sigan
> abriendo (migración: `seed/migrate-tickets-to-orders.mjs`).

## Producción

- Proyecto Firebase: **`fieldops-aditum`** · App: **https://fieldops-aditum.web.app**
  (dominio propio `https://service.aditumcr.com`, pendiente DNS en Cloudflare).
- Admin: **admin@aditumcr.com** (nombre *Admin Aditum*). La contraseña NO se documenta aquí;
  está en el gestor de secretos del equipo. Rotala si alguna vez se sembró con el default viejo.
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
- **mcp/**: servidor MCP (stdio) que crea/gestiona órdenes/wiki/inventario/fiscal en producción vía Admin SDK.
- **seed/**: admin inicial (`seed.mjs`), datos demo (`demo.mjs`) y migraciones (`migrate-*.mjs`).

## Comandos

> Usa **Node 20** (`nvm use 20`) y **`firebase-tools@13`** (la v14/15 exige Java 21; hay Java 17).

```bash
# Web
npm --prefix web install && npm --prefix web run dev   # http://localhost:5173 (usa web/.env.development -> emuladores)
npm --prefix web run build                              # genera web/dist (usa web/.env -> producción)

# Emuladores (raíz)
npm --prefix shared run build && npm --prefix functions run build
npx firebase-tools@13 emulators:start --only auth,functions,firestore,storage --project demo-aditum-fieldops

# Seed (emuladores): base (admin + técnicos) y luego datos demo del modelo unificado
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  FIREBASE_PROJECT_ID=demo-aditum-fieldops node seed/seed.mjs
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 FIREBASE_PROJECT_ID=demo-aditum-fieldops \
  BASE_HOST=localhost node seed/demo.mjs   # contratos (periódico/quincenal/demanda), equipos, órdenes multi-equipo, fichaje

# Migraciones (idempotentes; correr en prod ANTES de desplegar el modelo unificado)
#   seed/migrate-tickets-to-orders.mjs      tickets -> serviceOrders (mode=demanda)
#   seed/migrate-orders-multiequipment.mjs  single -> equipments[]; cadencia a contrato; limpia eq_* PROGRAMADA

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

## Modelo de datos (Firestore, multi-tenant: todo bajo `tenants/{tid}/...`)

- `users/{uid}`: name, email, role(`roles[]`), phone, active, initials, modules?. (Solo se escribe vía Functions.)
- **`serviceOrders/{id}`** — la entidad central ("Orden"). Campos:
  - `num`, `type` (`preventivo|correctivo`), **`mode`** (`periodico|demanda`), `status`, `techId`, `client{name,email,phone}`, fechas (`planDate/scheduledDate/scheduledTime`), `notify{}`, `skipNotice`.
  - **Multi-equipo**: `equipments[]` = `{equipmentId, equipmentSnapshot{...}, checklistTemplateId, checklistTemplateVersion, checklist:SOChecklistEntry[], condition}` — una orden agrupa **todos los equipos** del contrato; cada equipo trae su checklist de plantilla (se carga al **iniciar**) y su **condición** registrada en esa orden. (Campos legacy single `equipmentId/equipmentSnapshot/checklist` se conservan; usar el helper `soEquipments(so)` para leer.)
  - **Demanda** (ex OT): `title/site/address/priority/description`, `checklist[]` ad-hoc (`{text,done}`), `evidence[]` (img/video/pdf), `materials[]/materialsNote/materialsApplied`, `requiresReview`, `approval?`, `comments[]`.
  - **Trabajo por día**: `visits[]` = `{id,date,techId,techName,note,segments[],hours}`. **Fichaje**: `segments[]` = `{start,end}` (tramos iniciar→salir; `end:null` = en curso); `hours` = total del día (recalculado al cerrar). Cada `evidence[]`/`checklist[]` lleva `visitId`.
  - `signature?`, `photos[]`, `observations`, `reportShare{token,active,...}`, billing (`requiresInvoice/chargeTypeId/clientId/billAmount/billCurrency/billingApplied/invoiceItemId`), `cadenceApplied`, `history[]`.
- **Estados** (`SO_TRANSITIONS` en `shared`): `PROGRAMADA → NOTIFICADA → CONFIRMADA/REAGENDADA → EN_PROGRESO → SERVICIO_TERMINADO → [EN_REVISION] → PENDIENTE_FACTURAR → FACTURADA → CERRADA` (+ `CANCELADA`). `EN_REVISION` es la compuerta de aprobación interna (default en demanda; `requiresReview`).
- `contracts/{id}`: `num`, `licitacionNum` (Nº licitación **o** contrato), `clientName/Email/Phone`, **`modality`** (`periodico|demanda`), `defaultPeriodicityMonths` (1/2/3/6/12 **y `0.5` = quincenal**), `defaultTechId`, `noticeDaysBefore`, `nextScheduledDate`/`lastServiceDate` (**cadencia a nivel contrato**), `active`.
- `equipment/{id}`: `contractId, typeId, brand, model, serial, location, active`, **`condition`** (`operativo|mal_estado|en_reparacion|fuera_servicio`) + **`conditionHistory[]`** (`{condition,at,by,orderId?,orderNum?,note?}`). La periodicidad por equipo ya **no** se usa (cadencia del contrato). Un equipo `fuera_servicio` **sigue agendándose** (solo se marca con badge).
- `equipmentTypes/{id}` (`activeTemplateVersion`) + `checklistTemplates/{typeId}_v{n}` (plantilla de checklist por tipo).
- `counters/{serviceOrders|contracts|...}`: contadores atómicos. Numeración por contrato: `co_{contractId}_{YYYYMMDD}` (id determinístico, scheduler idempotente).
- `wikiCategories/{id}`, `wikiPages/{id}`; `inventory/{id}` + `inventoryMovements/{id}`; cola fiscal `invoiceItems/{id}`, `invoices/{id}`, `clients/{id}`, `chargeTypes/{id}` (GTI).

**Comportamientos clave:**
- **Scheduler** (`functions/src/scheduler.ts`): por contrato `periodico` activo, genera **una orden** con `equipments[]` de todos los equipos según la periodicidad del contrato (`addPeriodCR`: `<1` mes = +15 días). Ignora contratos `demanda`.
- **Ciclo orden** (`functions/src/serviceOrders.ts`, trigger `onServiceOrderWritten` + callables `startServiceOrder`/`completeServiceOrder`/`requestServiceReview`/`approveServiceOrder`/`rejectServiceOrder`): `start` bindea la plantilla de cada equipo; `complete` valida el checklist de **todos** los equipos + firma; el trigger maneja revisión interna (`EN_REVISION`), reporte público, rebaje de inventario (idempotente `materialsApplied`), `invoiceItem` (un item por orden, resumen multi-equipo) y **recálculo de cadencia a nivel contrato**.
- **Fichaje de horas** (solo demanda): el técnico hace **Iniciar trabajo / Salir del sitio** por día (varias sesiones); contador en vivo. Total por orden en detalle/reporte; **Reporte de horas** global (`HoursReport.tsx`) por técnico y rango (con gráfico + drill-down a la orden). Helpers `minutesBetween/visitWorkedMinutes/fmtDuration` (en `shared` y `web/src/lib/time.ts`).
- **Estado del equipo**: el técnico/admin fija la `condition` por equipo **en la orden**; al terminar, el trigger `onServiceOrderWritten` la **propaga al equipo maestro** y agrega al `conditionHistory` (Admin SDK; idempotente con `conditionApplied`). El admin también la cambia en la ficha de equipo (queda en historial). Badge `EquipmentConditionBadge` (en ui) reutilizado en lista de equipos, detalle de orden, móvil y reporte público.
- **Link público**: `getPublicServiceReport` (`/r/:token`) muestra el reporte saneado (equipos+checklists, visitas con horas por día, evidencia, firma). El consumo de inventario **no** va al público. `/p/:token` (`getPublicTicket`) se conserva para tickets viejos.
- **Notificaciones** (`functions/src/notifications.ts`, Gmail SMTP, secrets `SMTP_USER`/`SMTP_PASS`): asignación, confirmación/reagenda, listo-para-revisión (→ tenant `notifyEmail`), aprobación/rechazo, reporte al cliente.
- Técnico: contraseña auto-generada; **Regenerar contraseña** (`resetTechnicianPassword`). Recuperación self-service (`requestPasswordReset` → `/reset`).
- UI de visitas/equipos: acordeón compartido `web/src/components/visits.tsx` (`VisitBar`/`VisitDayChip`); editor de checklist compartido `web/src/components/ChecklistEditor.tsx`; normalización multi-equipo `soEquipments()` (en `shared` y `web/src/lib/serviceOrders.ts`).

## Reglas que DEBES seguir

Ver `.claude/rules/`. En resumen:
- **UI** (`ui-design-system.md`): reutiliza tokens/clases y componentes de `web/src/components/ui.tsx`.
  Paleta navy/dorado. **NUNCA teal.** Modales: ancho escalado por el `Modal`. Flujos con navegación
  propia (ej. *Tipos de equipo*) van como **pantalla**, no como modal.
- **Login** (`login.md`): pantalla de acceso a medida (split 40% form / 60% banner-carrusel en desktop;
  card sobre carrusel a pantalla completa en móvil; breakpoint 860px). **Léela antes de tocar
  `Login.tsx`** o las clases `.login-*`.
- **i18n** (`i18n.md`): toda cadena nueva va en `web/src/i18n/locales/es.json` **y** `en.json`. Sin texto fijo.
- **Firebase/Seguridad** (`firebase.md`, `security.md`): roles validados en Functions Y en
  `firestore.rules`/`storage.rules`. Tokens públicos aleatorios. La vista pública nunca expone datos
  internos (comentarios/historial/links). Secretos solo en `.env`/Functions secrets, nunca en git.
- **Workflow** (`workflow.md`): **no commit/push automático**. Español por defecto. Zona America/Costa_Rica.
  Correr emuladores antes de deploy.

## Cómo agregar cosas (atajos)

- **Nueva pantalla** → skill `/add-screen`.
- **Nuevo campo de orden** (end-to-end) → skill `/add-ticket-field` (aplica al modelo `serviceOrders`).
- **Claves de traducción** → skill `/add-i18n-keys` (siempre ES **y** EN).
- **Deploy** → skill `/deploy-fieldops`.
- **Tras tocar `shared/src/index.ts`**: recompilar (`npm --prefix shared run build`) y **vendorizar** a `functions/src/shared.ts`.
- **Nueva Cloud Function**: agrégala en `functions/src/index.ts`, valida `request.auth` + claim de rol.
- **Crear órdenes/wiki desde Claude** → MCP `aditum-fieldops` (ver README, sección MCP).
