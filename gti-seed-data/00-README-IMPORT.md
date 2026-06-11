# Seed data: catálogos fiscales para la integración GTI

Paquete de datos exportado de la BD de producción local de `aditum-jh` (MySQL 8, schema `aditum`, charset `utf8mb4`). Contiene los **4 catálogos de Hacienda Costa Rica** que la integración GTI necesita para validar y armar documentos electrónicos. Complementa la guía `GTI-INTEGRATION-GUIDE.md`.

## Contenido del paquete

| Archivo | Tabla | Filas | Para qué lo usa GTI |
|---|---|---|---|
| `00-schema.sql` | — | — | `CREATE TABLE IF NOT EXISTS` de las 4 tablas |
| `01-electronic_bill_identification_type.sql` | `electronic_bill_identification_type` | **5** | Tipo de identificación del receptor → `Receptor.TipoIdent` (el campo `fiscal_code` es el código que se envía: 1=Cédula física, 2=Cédula jurídica, 3=Dimex, 4=Nite, 10=Extranjera) |
| `02-fiscal_activity_code.sql` | `fiscal_activity_code` | **1,108** | Catálogo de actividades económicas de Hacienda → valida `CodigoActividad` del emisor y `Receptor.ActividadEconomica` |
| `03-fiscal_territorial_division.sql` | `fiscal_territorial_division` | **7,670** | División territorial de CR con códigos fiscales → `Receptor.Provincia/Canton/Distrito/Barrio` (se envía el campo `fiscal_id` numérico, no el nombre) |
| `04-cabys_code.sql` | `cabys_code` | **48,086** | Catálogo CABYS de Hacienda → `Lineas[].Codigo` de cada línea de factura (se envía `category_code`) |

### Estructura jerárquica (importante)

- **`fiscal_territorial_division`** es un árbol vía `belongs_to_id` (self-FK): 7 Provincias → 84 Cantones → 492 Distritos → 7,087 Barrios o Poblados. Los selects en cascada de la UI filtran por `belongs_to_id`.
- **`cabys_code`** es un árbol vía `superior_category_id` (self-FK): 27,680 categorías intermedias + 20,406 categorías finales (`is_final_category=1`). **Solo las finales** se asignan a ítems de facturación.

Por las self-FK, los dumps **preservan los IDs originales**. No reasignar IDs al importar: el orden de inserción de los dumps ya respeta la jerarquía (padres antes que hijos), pero igual se desactivan los FK checks por seguridad.

## Importación

```bash
# 1. Crear tablas si no existen
mysql -u<user> -p<pass> --default-character-set=utf8mb4 <schema> < 00-schema.sql

# 2. Importar datos (en este orden)
mysql -u<user> -p<pass> --default-character-set=utf8mb4 <schema> \
  -e "SET FOREIGN_KEY_CHECKS=0; SOURCE 01-electronic_bill_identification_type.sql; SOURCE 02-fiscal_activity_code.sql; SOURCE 03-fiscal_territorial_division.sql; SOURCE 04-cabys_code.sql; SET FOREIGN_KEY_CHECKS=1;"
```

O archivo por archivo:

```bash
for f in 01-*.sql 02-*.sql 03-*.sql 04-*.sql; do
  mysql -u<user> -p<pass> --default-character-set=utf8mb4 <schema> \
    -e "SET FOREIGN_KEY_CHECKS=0; SOURCE $f; SET FOREIGN_KEY_CHECKS=1;"
done
```

> ⚠️ **Charset**: siempre `--default-character-set=utf8mb4`. Los datos tienen tildes y ñ ("San José", "Cédula física", "Cantón"); importar con latin1 los corrompe.
>
> ⚠️ **Tablas con datos previos**: los dumps son `INSERT INTO` puros (sin `DROP`/`TRUNCATE`). Si las tablas destino ya tienen filas, vaciarlas primero (`SET FOREIGN_KEY_CHECKS=0; TRUNCATE ...`) para evitar colisiones de PK.

## Validación post-import

```sql
-- Conteos exactos esperados
SELECT 'identification_types' k, COUNT(*) v FROM electronic_bill_identification_type      -- 5
UNION ALL SELECT 'activity_codes', COUNT(*) FROM fiscal_activity_code                     -- 1108
UNION ALL SELECT 'territorial', COUNT(*) FROM fiscal_territorial_division                 -- 7670
UNION ALL SELECT 'cabys', COUNT(*) FROM cabys_code;                                       -- 48086

-- Jerarquía territorial
SELECT territorial_type, COUNT(*) FROM fiscal_territorial_division GROUP BY territorial_type;
-- Provincia=7, Cantón=84, Distrito=492, Barrio o Poblado=7087

-- Spot checks
SELECT name FROM fiscal_territorial_division WHERE fiscal_id='1' AND territorial_type='Provincia';
-- → San José (con tilde — verifica encoding)
SELECT COUNT(*) FROM cabys_code WHERE is_final_category=1;   -- 20406
SELECT COUNT(*) FROM fiscal_territorial_division WHERE belongs_to_id IS NULL;  -- 7 (solo provincias)
SELECT COUNT(*) FROM cabys_code c LEFT JOIN cabys_code p ON c.superior_category_id=p.id
 WHERE c.superior_category_id IS NOT NULL AND p.id IS NULL;  -- 0 (integridad del árbol)
```

## Cómo se relacionan con el resto del modelo

En aditum-jh estas tablas son referenciadas por FK desde:

- `receiving_client` → `identification_type_id`, `province_id`, `canton_id`, `district_id`, `neighborhood_id` (FKs físicas; los datos fiscales del cliente receptor).
- `custom_charge_type` → `cabys_code_id` (columna sin constraint físico, relación manejada por JPA; el código CABYS de cada ítem facturable).

Por eso es **crítico preservar los IDs** si el otro sistema va a replicar el mismo modelo. Si el otro sistema usa su propio modelo, igual debe conservar `fiscal_id` (territorial), `fiscal_code` (tipos de ID), `activity_code` y `category_code` (CABYS) — esos son los valores que viajan a GTI.

---

*Exportado el 2026-06-11 con `mysqldump --no-create-info --skip-add-drop-table --extended-insert --default-character-set=utf8mb4` desde la BD local de aditum-jh.*
