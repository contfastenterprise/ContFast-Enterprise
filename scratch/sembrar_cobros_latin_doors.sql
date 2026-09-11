-- ═══════════════════════════════════════════════════════════════════════════
--  Latin Doors: sembrar las filas `cobros` que hoy no tiene
-- ═══════════════════════════════════════════════════════════════════════════
--
--  EL PROBLEMA
--  Latin Doors S.R.L no tiene ni una fila con module='cobros' en
--  `role_permissions` -- solo `proveedores:read` para sus 8 roles. La pantalla
--  de cobros le funciona igual, pero NO porque este permitida: funciona por el
--  respaldo `DEFAULT_ROLE_PERMISSIONS` que hay en `src/constants/rolePermissions.ts`
--  (y su gemelo en `src/middleware/permissions.ts`), pensado para roles "aun no
--  sembrados". Es una red, no una configuracion. Si algun dia se quita, se
--  reordena, o alguien edita permisos desde la pantalla de administracion y eso
--  escribe filas explicitas, el comportamiento de esa empresa cambia sin que
--  nadie haya tocado a Latin Doors.
--
--  LO QUE HACE ESTE SCRIPT
--  NO inventa permisos. COPIA los que ya tiene una empresa sana, emparejando
--  por rol. `roles` es una tabla GLOBAL (no tiene company_id), asi que los
--  role_id son los mismos en todas las empresas y la copia es exacta, no una
--  interpretacion mia de lo que "deberia" tener.
--
--  Va por pasos y no hace nada hasta el paso 4. Lee los pasos 1 a 3 primero.
--
--  OJO: esto SI toca datos de produccion. Es lo unico de este lote que lo hace,
--  y lo hace porque me lo pediste. El paso 6 lo deshace entero.
-- ---------------------------------------------------------------------------

-- ─── PASO 1 ── Las empresas, y cuantas filas `cobros` tiene cada una ───────
--  Esperas ver Latin Doors con 0 y las demas con un numero igual entre si.
--  Apunta el nombre EXACTO de Latin Doors y el de la que uses de referencia.
SELECT
  c.id,
  c.name,
  COUNT(*) FILTER (WHERE p.module = 'cobros')                     AS filas_cobros,
  COUNT(*) FILTER (WHERE p.module = 'cobros' AND rp.granted)      AS cobros_concedidos,
  COUNT(*)                                                        AS filas_en_total
FROM companies c
LEFT JOIN role_permissions rp ON rp.company_id = c.id
LEFT JOIN permissions p       ON p.id = rp.permission_id
GROUP BY c.id, c.name
ORDER BY filas_cobros, c.name;

-- ─── PASO 2 ── ¿Le falta solo `cobros`, o hay mas huecos? ──────────────────
--  Compara modulo a modulo Latin Doors contra la referencia. Si aparece algun
--  otro modulo con `en_latin_doors = 0`, dimelo ANTES de seguir: este script
--  solo siembra `cobros`, y ampliarlo a ciegas seria justo lo que no hacemos.
WITH ld AS (SELECT id FROM companies WHERE name ILIKE 'Latin Doors%'),
     ref AS (SELECT id FROM companies WHERE name ILIKE 'PON AQUI LA REFERENCIA%')
SELECT
  p.module,
  COUNT(*) FILTER (WHERE rp.company_id = (SELECT id FROM ld))  AS en_latin_doors,
  COUNT(*) FILTER (WHERE rp.company_id = (SELECT id FROM ref)) AS en_referencia
FROM role_permissions rp
JOIN permissions p ON p.id = rp.permission_id
WHERE rp.company_id IN ((SELECT id FROM ld), (SELECT id FROM ref))
GROUP BY p.module
ORDER BY en_latin_doors, p.module;

-- ─── PASO 3 ── Exactamente que se va a insertar ────────────────────────────
--  Corre esto ANTES del paso 4 y mira la lista. Es literalmente lo que entra.
--  Fijate en la columna `granted`: se copia tal cual. Si la referencia tiene
--  `cobros:write` en false para algun rol, aqui tambien entrara en false --
--  que es lo correcto: copiar la configuracion, no "conceder cosas".
WITH ld AS (SELECT id FROM companies WHERE name ILIKE 'Latin Doors%'),
     ref AS (SELECT id FROM companies WHERE name ILIKE 'PON AQUI LA REFERENCIA%')
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

-- ─── PASO 4 ── La siembra ──────────────────────────────────────────────────
--  Idempotente por dos vias: el NOT EXISTS y el indice unico
--  `role_permissions_role_perm_idx` (company_id, role_id, permission_id).
--  Correrlo dos veces no duplica nada.
--
--  `updated_by` va en NULL a proposito: la columna es nullable y esto no lo
--  hizo un usuario. Dejar puesto ahi el id de alguien seria falsear el rastro.
WITH ld AS (SELECT id FROM companies WHERE name ILIKE 'Latin Doors%'),
     ref AS (SELECT id FROM companies WHERE name ILIKE 'PON AQUI LA REFERENCIA%')
INSERT INTO role_permissions (company_id, role_id, permission_id, granted, updated_by)
SELECT (SELECT id FROM ld), rp.role_id, rp.permission_id, rp.granted, NULL
FROM role_permissions rp
JOIN permissions p ON p.id = rp.permission_id
WHERE rp.company_id = (SELECT id FROM ref)
  AND p.module = 'cobros'
ON CONFLICT (company_id, role_id, permission_id) DO NOTHING;

-- ─── PASO 5 ── Comprobar que quedo igual que la referencia ─────────────────
--  Las dos columnas de la derecha tienen que decir lo mismo en cada fila.
WITH ld AS (SELECT id FROM companies WHERE name ILIKE 'Latin Doors%'),
     ref AS (SELECT id FROM companies WHERE name ILIKE 'PON AQUI LA REFERENCIA%')
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

-- ─── PASO 6 ── DESHACER, si algo no cuadra ─────────────────────────────────
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
