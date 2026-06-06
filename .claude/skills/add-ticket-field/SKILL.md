---
name: add-ticket-field
description: Agrega un campo nuevo al modelo de Ticket de extremo a extremo (tipo, formulario admin, detalle, vista pública, i18n y, si aplica, MCP/seed). Úsalo cuando el usuario quiera "agregar un campo al ticket".
---

# Agregar un campo al ticket (end-to-end)

Recorre TODOS estos puntos para el campo `nuevoCampo`:

1. **Tipo**: agrégalo a la interfaz `Ticket` en `web/src/lib/types.ts` y, si es compartido, a
   `shared/src/index.ts` (`NewTicketInput`, `buildTicketDoc`) y recompila shared.
2. **Formulario admin**: añade el control en `web/src/screens/admin/TicketForm.tsx` (estado `f`, `set(...)`,
   y guarda en `updateTicket`/`buildNewTicket`). Usa `Field`/`Input`/`Textarea`/`Select`.
3. **Detalle admin**: muéstralo en `web/src/screens/admin/TicketDetail.tsx` (usa `InfoRow`/`Prose`/`Block`).
4. **Detalle técnico** (si aplica): `web/src/screens/mobile/MobileTicket.tsx`.
5. **Vista pública** (si debe ser visible al cliente): agrégalo al DTO saneado de `getPublicTicket` en
   `functions/src/index.ts` **y** a `web/src/screens/public/PublicView.tsx`. Si es interno, NO lo expongas.
6. **i18n**: nuevas etiquetas en `es.json` y `en.json` (skill `/add-i18n-keys`).
7. **MCP/seed** (opcional): si quieres crearlo desde Claude, agrégalo a `create_ticket` en `mcp/src/index.ts`
   y al payload de `shared`. Actualiza `seed/seed.mjs` si corresponde.
8. **Verifica**: `npm --prefix web run build` y, si tocaste shared/functions/mcp, recompílalos.
