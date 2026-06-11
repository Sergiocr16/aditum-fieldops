# Rule: UI / Design system

- El design system vive en `web/src/styles/tokens.css` y `web/src/styles/layout.css`. **No los reescribas**;
  reutiliza sus variables (`--navy-*`, `--gold*`, `--st-*`, `--pr-*`, `--r-*`, `--sh-*`) y clases
  (`.card`, `.btn`, `.badge`, `.chip`, `.field`, `.input`, `.data-table`, `.m-*`, etc.) antes de crear CSS nuevo.
- Reutiliza componentes de `web/src/components/ui.tsx` (`Icon`, `Logo`, `Button`, `Modal`, `StatusBadge`,
  `PriorityChip`, `Field`, `Input`, `Select`, `Toggle`, `EmptyState`, `EvidenceThumb`, `Lightbox`,
  `Timeline`, `SharePanel`, `Markdown`, `LangSwitcher`, `toast`). No dupliques.
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
