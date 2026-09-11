-- ═══════════════════════════════════════════════════════════════════════════
--  Latin Doors: sembrar el modulo `cobros`
-- ═══════════════════════════════════════════════════════════════════════════
--
--  LO QUE SABEMOS (consulta 3 del diagnostico)
--  Las otras cinco empresas tienen EXACTAMENTE la misma forma:
--
--      Artalum, D'JIMENEZ, Empresa de Prueba, J'EDWARD, UltraElec
--      -> 35 filas de cobros, 16 concedidas, 7 roles
--         (administracion, banco, cajero, contabilidad, facturacion,
--          recursos_humanos, sistemas -- `compras` no lo tiene en ninguna)
--
--  Latin Doors: cero. Es la unica. Que las cinco coincidan hasta en el numero
--  de concedidas quita la duda de cual es la forma correcta: no hay que
--  elegir entre versiones distintas, hay una sola y le falta a una empresa.
--
--  Por eso ya no hay que rellenar ningun nombre a mano: la referencia se elige
--  sola (la empresa con mas filas de cobros; con cinco empatadas, la primera
--  por nombre, y da igual cual salga porque son identicas).
--
--  ALCANCE: SOLO `cobros`. A Latin Doors le faltan ademas `nomina`, `conduce`
--  y `retenciones`, pero de esos tres todavia no sabemos si le faltan solo a
--  ella o a todas -- eso lo dicen las consultas 1 y 2 del diagnostico, que
--  siguen pendientes. No se siembra lo que no se ha mirado.
--
--  Esto SI escribe en datos de produccion. Es lo unico que lo hace. El paso 4
--  lo deshace entero.
-- ---------------------------------------------------------------------------

-- ─── 1 ── Confirma el punto de partida ────────────────────────────────────
--  Esperas: `filas_en_latin_doors` = 0 y `filas_en_referencia` = 35.
--  Si `filas_en_latin_doors` no es 0, PARA: alguien sembro algo entremedio y
--  hay que volver a mirar antes de escribir.
WITH ld AS (SELECT id FROM companies WHERE name ILIKE 'Latin Doors%'),
     ref AS (
       SELECT rp.company_id AS id
       FROM role_permissions rp
       JOIN permissions p  ON p.id = rp.permission_id
       JOIN companies  c   ON c.id = rp.company_id
       WHERE p.module = 'cobros'
       GROUP BY rp.company_id, c.name
       ORDER BY COUNT(*) DESC, c.name
       LIMIT 1
     )
SELECT
  (SELECT name FROM companies WHERE id = (SELECT id FROM ref)) AS referencia_elegida,
  COUNT(*) FILTER (WHERE rp.company_id = (SELECT id FROM ld))  AS filas_en_latin_doors,
  COUNT(*) FILTER (WHERE rp.company_id = (SELECT id FROM ref)) AS filas_en_referencia
FROM role_permissions rp
JOIN permissions p ON p.id = rp.permission_id
WHERE p.module = 'cobros';

-- ─── 2 ── Exactamente que entra ───────────────────────────────────────────
--  Corre esto ANTES del paso 3 y mira la lista: es literalmente lo que se
--  inserta, fila por fila. Fijate en `granted`: se copia tal cual. Si la
--  referencia lo tiene en false para algun rol, aqui entra en false -- esto
--  copia una configuracion, no "concede cosas".
WITH ld AS (SELECT id FROM companies WHERE name ILIKE 'Latin Doors%'),
     ref AS (
       SELECT rp.company_id AS id
       FROM role_permissions rp
       JOIN permissions p  ON p.id = rp.permission_id
       JOIN companies  c   ON c.id = rp.company_id
       WHERE p.module = 'cobros'
       GROUP BY rp.company_id, c.name
       ORDER BY COUNT(*) DESC, c.name
       LIMIT 1
     )
SELECT r.name AS rol, p.module, p.action, rp.granted
FROM role_permissions rp
JOIN permissions p ON p.id = rp.permission_id
JOIN roles r       ON r.id = rp.role_id
WHERE rp.company_id = (SELECT id FROM ref)
  AND p.module = 'cobros'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions x
    WHERE x.company_id = (SELECT id FROM ld)
      AND x.role_id = rp.role_id
      AND x.permission_id = rp.permission_id
  )
ORDER BY r.name, p.action;

-- ─── 3 ── La siembra ──────────────────────────────────────────────────────
--  `roles` es una tabla GLOBAL (no tiene company_id), asi que los role_id son
--  los mismos en todas las empresas y la copia es exacta, no una
--  interpretacion de lo que "deberia" tener.
--
--  Idempotente por dos vias: el ON CONFLICT y el indice unico
--  `role_permissions_role_perm_idx` (company_id, role_id, permission_id).
--  Correrlo dos veces no duplica nada.
--
--  `updated_by` va en NULL a proposito: la columna es nullable y esto no lo
--  hizo un usuario. Poner ahi el id de alguien seria falsear el rastro.
WITH ld AS (SELECT id FROM companies WHERE name ILIKE 'Latin Doors%'),
     ref AS (
       SELECT rp.company_id AS id
       FROM role_permissions rp
       JOIN permissions p  ON p.id = rp.permission_id
       JOIN companies  c   ON c.id = rp.company_id
       WHERE p.module = 'cobros'
       GROUP BY rp.company_id, c.name
       ORDER BY COUNT(*) DESC, c.name
       LIMIT 1
     )
INSERT INTO role_permissions (company_id, role_id, permission_id, granted, updated_by)
SELECT (SELECT id FROM ld), rp.role_id, rp.permission_id, rp.granted, NULL
FROM role_permissions rp
JOIN permissions p ON p.id = rp.permission_id
WHERE rp.company_id = (SELECT id FROM ref)
  AND p.module = 'cobros'
  -- Si por lo que sea Latin Doors no apareciera, no insertes nada suelto.
  AND (SELECT id FROM ld) IS NOT NULL
ON CONFLICT (company_id, role_id, permission_id) DO NOTHING;

-- ─── 4 ── Comprobar que quedo igual que la referencia ─────────────────────
--  Las dos ultimas columnas tienen que decir lo mismo en TODAS las filas.
--  Si alguna discrepa, el paso 5 lo deshace.
WITH ld AS (SELECT id FROM companies WHERE name ILIKE 'Latin Doors%'),
     ref AS (
       SELECT rp.company_id AS id
       FROM role_permissions rp
       JOIN permissions p  ON p.id = rp.permission_id
       JOIN companies  c   ON c.id = rp.company_id
       WHERE p.module = 'cobros'
         AND rp.company_id <> (SELECT id FROM companies WHERE name ILIKE 'Latin Doors%')
       GROUP BY rp.company_id, c.name
       ORDER BY COUNT(*) DESC, c.name
       LIMIT 1
     )
SELECT
  r.name AS rol,
  p.action,
  BOOL_OR(rp.granted) FILTER (WHERE rp.company_id = (SELECT id FROM ld))  AS latin_doors,
  BOOL_OR(rp.granted) FILTER (WHERE rp.company_id = (SELECT id FROM ref)) AS referencia
FROM role_permissions rp
JOIN permissions p ON p.id = rp.permission_id
JOIN roles r       ON r.id = rp.role_id
WHERE rp.company_id IN ((SELECT id FROM ld), (SELECT id FROM ref))
  AND p.module = 'cobros'
GROUP BY r.name, p.action
ORDER BY r.name, p.action;

-- ─── 5 ── DESHACER ────────────────────────────────────────────────────────
--  Borra SOLO las filas de cobros de Latin Doors, que es exactamente lo que
--  este script anadio (antes no habia ninguna). Vuelve a depender del
--  respaldo, que es donde estaba.
--
--  WITH ld AS (SELECT id FROM companies WHERE name ILIKE 'Latin Doors%')
--  DELETE FROM role_permissions rp
--  USING permissions p
--  WHERE p.id = rp.permission_id
--    AND rp.company_id = (SELECT id FROM ld)
--    AND p.module = 'cobros';
-- ---------------------------------------------------------------------------
