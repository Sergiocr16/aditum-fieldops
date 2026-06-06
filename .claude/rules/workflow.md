# Rule: Workflow

- **No hacer commit ni push automáticos.** Deja los cambios en el working tree; el equipo decide cuándo.
- **Idioma**: español por defecto en comunicación y contenido; UI bilingüe ES/EN.
- **Zona horaria**: America/Costa_Rica (UTC-6) para fechas/timestamps (`web/src/lib/time.ts`,
  `shared` `nowCR`).
- **Node 18+** para construir el frontend (Vite 5). Usa `nvm use 20` si tu node por defecto es viejo.
- **Antes de deploy**: build del frontend (`npm --prefix web run build`) y, si tocaste backend, probar con
  emuladores. Recompila `shared` si lo cambiaste.
- **No exportar a PDF**: el entregable compartible es el link público de solo lectura.
- Verificación funcional: probar el flujo real (login → crear → técnico → evidencia → aprobar → link
  público) antes de dar por terminado.
