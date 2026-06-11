# Rule: UI / Design system

- El design system vive en `web/src/styles/tokens.css` y `web/src/styles/layout.css`. **No los reescribas**;
  reutiliza sus variables (`--navy-*`, `--gold*`, `--st-*`, `--pr-*`, `--r-*`, `--sh-*`) y clases
  (`.card`, `.btn`, `.badge`, `.chip`, `.field`, `.input`, `.data-table`, `.m-*`, etc.) antes de crear CSS nuevo.
- Reutiliza componentes de `web/src/components/ui.tsx` (`Icon`, `Logo`, `Button`, `Modal`, `StatusBadge`,
  `PriorityChip`, `Field`, `Input`, `Select`, `Toggle`, `EmptyState`, `EvidenceThumb`, `Lightbox`,
  `MediaGallery`, `Timeline`, `SharePanel`, `Markdown`, `LangSwitcher`, `toast`). No dupliques.
- **Evidencias (fotos/videos/PDF)**: usa `MediaGallery` de `ui.tsx` — grid de miniaturas con tope de
  tamaño (`aspect-ratio`), lightbox interno (teclado + flechas), video con primer frame + overlay de play
  y los PDF como filas de archivo. **No** renderices imágenes a ancho completo apiladas. Reúsalo en admin,
  móvil y reporte público. Prop `captions` muestra desc/fecha bajo cada tile (vista admin).
- **Visitas (trabajo por día)**: el acordeón por día vive en `web/src/components/visits.tsx`
  (`VisitBar` + `VisitDayChip`, chip de fecha tipo calendario). Reúsalo en móvil, detalle admin y reporte
  público para que las 3 vistas queden consistentes. **No** uses bordes laterales de color como acento
  (anti-patrón): el chip de fecha es el ancla visual. Motion solo en `transform` (chevron) y `.fade-in`;
  no animes `height`.
- Iconos: usa los del set `ICONS` (prop `name` de `<Icon/>`). Si falta uno, agrégalo al objeto `ICONS`.
- Paleta: azul marino (`--navy-*`) + dorado (`--gold*`) + neutros. **Prohibido el color teal.**
- Móvil first para pantallas del técnico (`screens/mobile/`), escritorio para admin (`screens/admin/`).
- Mantén estados vacíos (`EmptyState`), de carga y de error en pantallas nuevas.
- **Modales anchos**: el `Modal` de `ui.tsx` escala el `width` numérico (~×1.9, tope 1140px) para que los
  formularios respiren. Pasá un `width` base razonable; no metas `maxWidth` propio compitiendo con eso.
- **Pantalla vs modal**: un flujo con su propia navegación o lista (ej. *Tipos de equipo*, editor de
  plantillas) va como **pantalla** (`ctx.go('ruta')` + ruta en `App.tsx`), **no** como modal. Reservá los
  modales para confirmaciones y formularios cortos de un paso.
- **Login**: es un componente responsive a medida (split 40/60 en desktop, card sobre carrusel en móvil).
  Tiene su propia regla — ver `.claude/rules/login.md` **antes** de tocar `Login.tsx` o sus clases
  `.login-*` en `tokens.css`/`layout.css`.
