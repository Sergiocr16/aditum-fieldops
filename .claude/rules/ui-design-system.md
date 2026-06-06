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
