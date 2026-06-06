---
name: crear-ticket-fieldops
description: Crea un ticket de Aditum FieldOps en producción a partir de una descripción libre, usando el MCP `aditum-fieldops`. Pregunta solo lo que falte (cliente, sitio, prioridad, técnico, checklist) y confirma antes de crear. Úsalo cuando el usuario diga "creá un ticket", "nuevo ticket", "metí una orden de trabajo" o similar.
---

# Crear ticket en Aditum FieldOps

Objetivo: crear un ticket sin llenar formularios, conversando.

## Pasos

1. **Entiende la descripción libre** del usuario (qué trabajo, dónde, para quién).
2. **Resuelve el técnico** si lo mencionó: llama al tool MCP `list_technicians` y haz match por nombre.
   Si no mencionó técnico, el ticket queda **sin asignar** (estado `pendiente`).
3. **Completa lo que falte** preguntando SOLO los campos faltantes y relevantes:
   - `client` (cliente/condominio) — obligatorio
   - `title` — obligatorio (puedes proponerlo)
   - `site`, `address`, `priority` (baja/media/alta/urgente), `scheduled`, `deadline`
   - `evidenceReq` (qué debe grabar/fotografiar el técnico)
4. **Propón un checklist** según el tipo de trabajo (ej. instalación de lector QR, mantenimiento de portón,
   reemplazo de pantalla, cableado). Muéstralo para que el usuario lo ajuste.
5. **Muestra un resumen** y pide confirmación.
6. Al confirmar, llama al tool MCP **`create_ticket`** con los campos. Reporta el **número AD-####** y a
   quién quedó asignado.

## Notas

- El MCP escribe en el proyecto Firebase **de producción**: el ticket aparece de inmediato en la web.
- Si `create_ticket` falla por validación, corrige y reintenta.
- Para asignar después: `assign_ticket`. Para agregar ítems: `add_checklist_items`.

## Checklists sugeridos (ejemplos)

- **Lector QR**: voltaje y conexión eléctrica; montar lector; conexión a red; probar 3 QR; capacitar guarda;
  grabar video de prueba.
- **Portón**: inspeccionar motor y riel; lubricar; ajustar sensores; 10 ciclos de apertura/cierre; video.
- **Pantalla**: desmontar actual; instalar nueva; cargar contenido; prueba 10 min; foto + video.
