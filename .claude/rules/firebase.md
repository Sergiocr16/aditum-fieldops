# Rule: Firebase

- **Auth/roles**: el rol vive en un *custom claim* (`role: 'admin' | 'tech'`), seteado por Cloud Functions
  al crear usuarios. Nunca confíes solo en el doc `users`; valida el claim en backend.
- **Escritura de `users`**: solo vía Cloud Functions (Admin SDK). El cliente no escribe `users` (las rules
  lo prohíben).
- **Tickets**: el cliente (admin) los crea con una transacción sobre `counters/tickets` para el número
  `AD-####`. Las transiciones de estado escriben siempre una entrada en `history` (ver `web/src/lib/actions.ts`).
- **Reglas como segunda capa**: además de validar en Functions, mantené `firestore.rules` y `storage.rules`
  estrictas. Un técnico solo lee/escribe tickets donde `techId == auth.uid` y en estados editables, y solo
  los campos de la lista blanca (`status,checklist,evidence,history,materials,materialsNote,readyAt,
  techNote,techObs,visits`). Si agregás un campo que el técnico escribe (ej. otro de `visits`), sumalo a
  esa lista en `firestore.rules`.
- **Storage**: rutas `tickets/{ticketId}/...` y `wiki/{pageId}/...`. Valida `contentType` y tamaño en las
  rules. La compresión de video la hace `onEvidenceFinalized`.
- **Vista pública**: SOLO vía la function `getPublicTicket` (token). Nunca expongas comentarios internos,
  historial, datos de otros tickets ni colecciones directas al público.
- **shared/**: si cambias validación/numeración/tipos compartidos, edita `shared/src/index.ts` y recompila
  (`npm --prefix shared run build`) para que functions y mcp lo tomen.
- **Nueva Cloud Function**: agrégala en `functions/src/index.ts`, valida `request.auth` y el claim de rol
  con `assertAdmin` (o equivalente para técnico) antes de actuar.
