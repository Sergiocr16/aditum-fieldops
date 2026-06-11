# Rule: Login / pantalla de acceso

La pantalla de acceso (`web/src/screens/Login.tsx`) es un componente **bespoke responsive**. No la
"simplifiques" ni la reescribas a un formulario plano: el layout de dos paneles y el comportamiento
móvil son intencionales. Antes de tocarla, entendé esta estructura.

## Layout (desktop, > 860px) — split invertido

Contenedor: `display:flex; flexDirection:row-reverse; minHeight:100dvh; overflow:hidden`. El
`row-reverse` deja el **formulario a la izquierda** y el **banner a la derecha** (en el DOM el banner va
primero). Proporción: **40% formulario / 60% banner**.

- **Derecha — banner (`.login-brand`, `flex:1 1 60%`)**: carrusel de fotos **contenido dentro del
  panel** (`position:relative; overflow:hidden`, imágenes `position:absolute; inset:0;
  background-size:cover`, crossfade por `opacity`). **NO** uses `transform:scale()` ni lo pongas a
  pantalla completa en desktop: eso recorta/magnifica la imagen (se ve "con zoom"). Encima va un scrim
  oscuro (`linear-gradient`) y el contenido de marca **centrado en el medio del carrusel**: logo fijado
  arriba-centro (`position:absolute; top`), hero (badge + `h1` + `p`) centrado vertical y
  horizontalmente (`justify-content:center; align-items:center; text-align:center`), y `© Aditum` fijado
  abajo-centro. Texto blanco.
- **Izquierda — formulario (`.login-right`, `flex:1 1 40%`)**: panel **plano** (fondo degradado claro
  `#f1f4f8 → #e6ebf1`), **sin tarjeta**. Dentro, `.login-formwrap` (ancho máx ~392px) con el logo móvil
  (oculto en desktop), encabezado, error, `<form className="login-form">` y copyright.

## Layout (móvil, ≤ 860px) — card sobre el carrusel

En móvil el banner izquierdo (`.login-brand`) se oculta y el formulario pasa a ser una **card flotante
sobre el carrusel a pantalla completa**:

- `.login-carousel-mobile` (carrusel full-page + scrim, `zIndex:0`) **solo** se muestra aquí.
- `.login-right` se vuelve **transparente** (deja ver el carrusel) y `.login-formwrap` toma estilo de
  **card** (surface, borde, radio, sombra).
- `.login-mobile-logo` (dentro del form) se muestra; el logo del banner ya no aplica.

El mismo estado `slide` alimenta **ambos** carruseles (desktop contenido + móvil full-page), así que
cambian sincronizados. El intervalo es lento a propósito (~8.5s); **sin dots/indicadores**.

## Selector de idioma

Dos instancias, alternadas por breakpoint:
- `.login-lang-desktop` (claro, arriba-**izquierda** sobre el panel plano) — visible > 860px.
- `.login-lang-mobile` (`<LangSwitcher dark />`, arriba-derecha sobre el carrusel) — visible ≤ 860px.

## Dónde vive el CSS

- **`tokens.css`**: base — `.login-right` (degradado + padding), `.login-formwrap` (ancho),
  `.login-lang-mobile{display:none}`, `.login-carousel-mobile{display:none}`, `.login-form .input`,
  `.login-cta`.
- **`layout.css`** (`@media (max-width:860px)`): overrides móviles — oculta `.login-brand` y
  `.login-lang-desktop`; muestra `.login-mobile-logo`, `.login-lang-mobile` y `.login-carousel-mobile`;
  pone `.login-right` transparente y `.login-formwrap` como card.

El **breakpoint es 860px** y debe mantenerse coherente entre `Login.tsx`, `tokens.css` y `layout.css`.

## Copy del hero (i18n)

El texto del banner sale de claves i18n (no hardcodear): `auth.heroBadge`, `auth.heroTitle`,
`auth.heroText` (en `es.json` y `en.json`). Refleja lo que hace el producto — **gestión de trabajo
técnico en sitio** (órdenes de trabajo, mantenimientos, técnicos, evidencia, reporte al cliente). No es
"instalaciones".

## Recuperar contraseña (self-service)

Bajo el campo de contraseña hay un enlace `auth.forgot` que abre un modal → callable
`requestPasswordReset` (anti-enumeración: siempre responde ok). El enlace del correo abre la página
propia `web/src/screens/public/PublicReset.tsx` (ruta pública `/reset?oobCode=...`), con el branding del
tenant. Ver `functions/src/index.ts` (`requestPasswordReset`) y `notifications.ts` (`passwordResetTpl`).

## Al modificar

- Probá **los dos breakpoints** (desktop split + móvil card) y que el carrusel **no se vea con zoom**.
- Respetá el design system: paleta navy/dorado, **nunca teal**; reutilizá `Logo`, `LangSwitcher`,
  `Field`, `Input`, `Icon`, `toast` de `components/ui.tsx`.
- Toda cadena nueva en `es.json` **y** `en.json`.
