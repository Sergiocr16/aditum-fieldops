# Rule: Firebase

- **Multi-tenant**: todo vive bajo `tenants/{tid}/...`. Las reglas validan `request.auth.token.tenantId == tid`.
- **Auth/roles**: el rol vive en *custom claims* (`role` y `roles[]`: `admin|coordinador|facturacion|tech`),
  seteados por Cloud Functions. Nunca confíes solo en el doc `users`; valida el claim en backend.
- **Escritura de `users`**: solo vía Cloud Functions (Admin SDK). El cliente no escribe `users`.
- **Órdenes (`serviceOrders`)** — entidad unificada (`mode: periodico|demanda`). Las preventivas las crea el
  **scheduler** (id determinístico `co_{contractId}_{YYYYMMDD}`, idempotente); las correctivas/demanda las
  crea el admin client-side con transacción sobre `counters/serviceOrders`. Las transiciones de estado
  escriben en `history` y respetan `SO_TRANSITIONS` (ver `shared`).
- **Reglas como segunda capa**: mantené `firestore.rules`/`storage.rules` estrictas. El técnico solo
  lee/escribe órdenes donde `techId == auth.uid`, en `EN_PROGRESO`, y solo la lista blanca de campos
  (`equipments,checklist,photos,evidence,visits,materials,materialsNote,observations,techObs,readyAt` — el
  checklist/condición por equipo va dentro de `equipments[]`; los `segments` de fichaje dentro de `visits`).
  Si agregás un campo que el técnico escribe, sumalo a esa lista. `start/complete/approve/reject` van por
  **callable** (Admin SDK). El doc `equipment` solo lo escribe `isOps`; la condición fijada por el técnico
  en la orden se propaga al equipo desde el trigger.
- **Storage**: rutas `tenants/{tid}/serviceOrders/{id}/...` y `.../wiki/{pageId}/...`. Valida `contentType`
  y tamaño (img/video/pdf ≤200MB). La compresión de video la hace `onEvidenceFinalized` (tickets y serviceOrders).
- **Vista pública**: SOLO vía callable con token — `getPublicServiceReport` (`/r/:token`) y, legacy,
  `getPublicTicket` (`/p/:token`). DTO **saneado**: nunca expongas comentarios internos, historial,
  materiales/inventario, datos de otros tenants ni colecciones directas.
- **shared/**: si cambiás validación/numeración/tipos/helpers, editá `shared/src/index.ts`, recompilá
  (`npm --prefix shared run build`) y **vendorizá** a `functions/src/shared.ts`.
- **Nueva Cloud Function**: agrégala en `functions/src/index.ts`, valida `request.auth` y el claim de rol
  antes de actuar.
