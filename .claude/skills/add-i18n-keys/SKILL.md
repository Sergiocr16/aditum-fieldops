---
name: add-i18n-keys
description: Agrega o sincroniza claves de traducción en los catálogos ES y EN de Aditum FieldOps y valida que no falten en ningún idioma. Úsalo al agregar texto nuevo a la UI.
---

# Agregar/sincronizar claves i18n

Catálogos: `web/src/i18n/locales/es.json` y `web/src/i18n/locales/en.json`.

1. Identifica el **namespace** correcto (`common, auth, tickets, ticketForm, ticketDetail, technicians,
   share, mobile, public, publicError, wiki, status, priority, ...`).
2. Agrega la clave en **es.json** (texto en español) y en **en.json** (traducción al inglés). Las dos
   estructuras deben ser idénticas en claves.
3. Usa la clave en el componente con `t('namespace.clave')`. Para interpolación: `t('k', { var })` y
   `"... {{var}} ..."` en el JSON.
4. **Valida que ambos catálogos tengan exactamente las mismas claves** (sin faltantes ni sobrantes). Por
   ejemplo, compara los árboles JSON y reporta diferencias antes de terminar.
5. Verifica el build: `npm --prefix web run build` (Node 18+).
