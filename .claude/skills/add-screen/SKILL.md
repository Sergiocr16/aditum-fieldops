---
name: add-screen
description: Agrega una pantalla nueva a Aditum FieldOps siguiendo el design system, i18n y el router por estado. Úsalo cuando el usuario quiera "agregar una pantalla/vista/módulo" al panel admin o a la app móvil del técnico.
---

# Agregar una pantalla

1. **Decide el área**: admin (`web/src/screens/admin/`, escritorio) o técnico (`web/src/screens/mobile/`,
   móvil). Crea `NuevaPantalla.tsx`.
2. **Reutiliza UI**: importa de `web/src/components/ui.tsx` y usa clases/variables del design system.
   Para admin, envuelve el contenido con `PageHeader` (de `screens/admin/AdminShell.tsx`).
3. **i18n**: agrega todas las cadenas a `web/src/i18n/locales/es.json` y `en.json` (skill `/add-i18n-keys`)
   y úsalas con `t(...)`.
4. **Datos**: usa el `ctx` (prop `AppCtx`) para tickets/técnicos y `ctx.go/back`. Para Wiki usa `useWiki()`.
   Si necesitas otra colección, sigue el patrón de `lib/wiki.ts` (suscripción `onSnapshot` con filtro por rol).
5. **Routing**: en `web/src/App.tsx`, agrega el `route` en el switch correspondiente (admin o técnico) y un
   `ctx.go('miRuta')` desde donde se navega.
6. **Navegación**: si va en el menú admin, añade el item en `nav` y `activeKey`/`titles` de `AdminShell.tsx`.
7. **Permisos**: respeta el rol. Si lee una colección nueva, agrega reglas en `firestore.rules`.
8. **Verifica**: `npm --prefix web run build` (Node 18+) sin errores y prueba el flujo.
