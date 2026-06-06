---
name: crear-ticket-fieldops
description: Crea un ticket de Aditum Service en producción a partir de una descripción libre, usando el MCP `fieldops-aditum`. Detecta qué campos faltan y los pregunta (qué hacer, qué verificar, qué grabar/evidencia, checklist, prioridad, técnico, fechas, sitio), propone valores y confirma antes de crear. Úsalo cuando el usuario diga "creá un ticket", "nuevo ticket", "meté una orden de trabajo" o similar.
---

# Crear ticket en Aditum Service (recolección guiada)

Objetivo: crear un ticket completo conversando, **preguntando solo lo que falte**, sin llenar formularios.

## Campos del ticket (parámetros del tool MCP `create_ticket`)

| Campo | Qué es | Obligatorio |
|---|---|---|
| `title` | Título del trabajo | **Sí** |
| `client` | Cliente / condominio / empresa | **Sí** |
| `site` | Sitio / ubicación (caseta, lobby, portón…) | recomendado |
| `address` | Dirección o referencia | recomendado |
| `priority` | `baja` · `media` · `alta` · `urgente` | recomendado (def. media) |
| `technician` | Nombre/correo del técnico a asignar | opcional |
| `scheduled` | Fecha programada `YYYY-MM-DD` | recomendado |
| `deadline` | Fecha límite `YYYY-MM-DD` | opcional |
| `description` | **Qué hacer** (descripción del trabajo) | recomendado |
| `instructions` | Instrucciones paso a paso | opcional |
| `expected` | **Qué verificar** / resultado esperado | recomendado |
| `doneConditions` | Condiciones para darlo por terminado | opcional |
| `observations` | Observaciones / coordinación | opcional |
| `evidenceReq` | **Qué grabar o fotografiar** (evidencia requerida) | recomendado |
| `checklist` | Lista de verificación (array de textos) | recomendado |

## Flujo

1. **Extraé** del mensaje del usuario todo lo que ya venga dado y mapealo a los campos de arriba.
2. **Obligatorios:** si falta `title` o `client`, preguntalos primero.
3. **Detectá el tipo de trabajo** (instalación de lector QR, mantenimiento de portón, pedestal, pantalla,
   cableado, cámara, Raspberry Pi, control de acceso…) para proponer evidencia y checklist.
4. **Preguntá SOLO lo que falte**, agrupado y conciso (no preguntes lo ya dado). Prioridad de preguntas:
   - Sitio / dirección
   - Prioridad
   - Técnico (resolvé el nombre con el tool `list_technicians`; si no hay, dejalo sin asignar)
   - Fecha programada / límite
   - **¿Qué hacer?** (`description` / `instructions`)
   - **¿Qué verificar?** (`expected`)
   - **¿Qué grabar?** (`evidenceReq`)
   - **Checklist**
5. **Proponé automáticamente** un `evidenceReq` y un `checklist` según el tipo de trabajo, y mostralos para
   que el usuario los ajuste o confirme (no los des por hechos sin mostrarlos).
6. **Resumen + confirmación:** mostrá todos los campos que vas a enviar y pedí "¿lo creo?".
7. Al confirmar, llamá **`create_ticket`** con los campos. Reportá el **N° (AD-####)** y a quién quedó
   asignado. Si quedó sin técnico, ofrecé asignarlo con `assign_ticket`.

## Reglas
- **No inventes** cliente, dirección ni datos sensibles: si faltan, preguntá.
- No vuelvas a preguntar lo que el usuario ya dio.
- Español. Fechas en `YYYY-MM-DD`.
- El MCP escribe en **producción**: el ticket aparece de inmediato en la web.
- Si `create_ticket` falla por validación, corregí y reintentá.

## Plantillas sugeridas por tipo de trabajo

**Instalación de lector QR**
- `evidenceReq`: "Grabar video mostrando el equipo instalado y una prueba completa: escaneo de QR válido →
  apertura del acceso, y rechazo de un QR inválido. Foto del lector montado y del controlador conectado."
- `checklist`: Verificar voltaje y conexión eléctrica · Montar el lector · Conectar a la red del condominio ·
  Probar 3 códigos QR válidos · Probar 1 código inválido · Capacitar al guarda · Grabar video de prueba.

**Mantenimiento de portón**
- `evidenceReq`: "Video de 10 ciclos de apertura/cierre sin trabarse. Foto del riel y motor tras el mantenimiento."
- `checklist`: Inspeccionar motor y riel · Lubricar · Ajustar sensores de seguridad · 10 ciclos de prueba · Grabar video.

**Reemplazo de pantalla**
- `evidenceReq`: "Foto de la pantalla nueva encendida con el contenido cargado. Video corto del carrusel funcionando."
- `checklist`: Desmontar la pantalla actual · Instalar la nueva · Cargar contenido · Prueba de 10 min sin fallas · Evidencia.

**Cableado estructurado**
- `evidenceReq`: "Foto del cableado terminado y de la certificación de puntos."
- `checklist`: Tender el cable · Ponchar conectores · Certificar puntos · Probar conectividad · Evidencia.

(Para otros tipos, generá un `evidenceReq` y `checklist` análogos y mostralos para confirmar.)
