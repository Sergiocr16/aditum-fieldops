# Rule: Security

- **Autorización por usuario en cada endpoint** (defensa en profundidad): toda callable valida
  `request.auth` y el claim de rol; las de admin rechazan no-admins; las acciones de técnico exigen que el
  `uid` sea el `techId` del ticket. Replica la restricción en `firestore.rules`/`storage.rules`.
- **Secretos**: nunca en el repo. Config de cliente en `web/.env` (`VITE_*`), service account en
  `secrets/` (gitignored), secretos de Functions con `firebase functions:secrets:set`. Revisa que `.env` y
  `*service-account*.json` estén ignorados antes de commitear.
- **Tokens públicos**: 32 bytes aleatorios (`crypto.getRandomValues`), no secuenciales. Validar
  activo/estado/expiración en `getPublicTicket`.
- **Archivos**: validar tipo y tamaño en cliente y en Storage rules (imágenes jpg/png/webp, video
  mp4/mov/webm ≤200MB, pdf). No ejecutar archivos subidos.
- **Markdown de Wiki**: renderizar SIEMPRE con `components/Markdown.tsx` (DOMPurify). No introducir
  `dangerouslySetInnerHTML` sin sanitizar.
- **Datos sensibles**: la vista pública nunca debe incluir información interna.
