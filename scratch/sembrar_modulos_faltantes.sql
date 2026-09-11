-- ═══════════════════════════════════════════════════════════════════════════
--  `conduce`, `nomina` y `retenciones`: catalogo y reparto
-- ═══════════════════════════════════════════════════════════════════════════
--
--  EL DIAGNOSTICO
--  Los tres modulos existen en el codigo (`PermissionModule`, y dos de ellos
--  en `DEFAULT_ROLE_PERMISSIONS`) pero NO existen en la tabla `permissions`.
--  Por eso ninguna empresa los tiene: no hay nada que conceder. Y sin embargo
--  tienen 10 entradas de menu colgando -- 8 de RRHH, Conduces y Retenciones.
--
--  Hoy funcionan, o no, por el respaldo `DEFAULT_ROLE_PERMISSIONS`:
--      nomina      -> recursos_humanos      (read, write)
--      conduce     -> facturacion           (read, write)
--      retenciones -> NADIE
--
--  UNA COSA QUE HAY QUE SABER ANTES DE SEMBRAR NADA
--  En `middleware/permissions.ts` el orden es: usuario -> ROL -> respaldo. El
--  paso del rol devuelve `roleOverride[0].granted` y CORTA. Es decir:
--
--      una fila explicita con granted = false es MAS ESTRICTA que no tener
--      fila, porque tapa el respaldo.
--
--  Por eso este script NO siembra filas en false "para dejar la tabla
--  completa". Solo escribe las que conceden. Sembrar `nomina:read = false`
--  para todos los roles y luego poner en true al de RRHH parece mas ordenado,
--  pero de paso le quitaria a cualquier rol que hoy dependa del respaldo lo
--  que el respaldo le da. La forma de `cobros` (35 filas, 16 concedidas) viene
--  de otro sembrado y no se copia aqui a ciegas.
--
--  QUE REPARTE
--      nomina      -> recursos_humanos   read, write     (igual que el respaldo)
--      conduce     -> facturacion        read, write     (igual que el respaldo)
--      retenciones -> contabilidad       read, write     (DECISION TUYA, nueva)
--
--  `sistemas` y `administracion` NO llevan fila, y no es un olvido: los dos
--  pasan por encima de la comprobacion antes de mirar la base (paso 1 de
--  `hasPermission`, y lo mismo en el cliente). Una fila para ellos no cambiaria
--  nada; seria decoracion que alguien podria poner en false algun dia creyendo
--  que sirve.
--
--  Se aplica a TODAS las empresas vivas: ninguna tiene estos modulos hoy. Las
--  empresas y los roles con `deleted_at` puesto quedan fuera -- sembrarles
--  permisos seria resucitar a medias algo que alguien dio de baja.
--
--  Esto SI escribe en produccion. El paso 5 lo deshace entero.
-- ---------------------------------------------------------------------------

-- ─── PASO 1 ── El catalogo: que el permiso EXISTA ─────────────────────────
--  Esto no concede nada a nadie. Solo crea las filas en `permissions` para que
--  el permiso se pueda conceder o negar. Es la mitad reversible y sin riesgo.
--  Idempotente: el indice unico es (module, action).
INSERT INTO permissions (module, action, description)
SELECT m.modulo, a.accion, d.texto
FROM (VALUES ('conduce'), ('nomina'), ('retenciones')) AS m(modulo)
CROSS JOIN (VALUES ('read'), ('write'), ('delete'), ('execute'), ('admin')) AS a(accion)
JOIN (VALUES
  ('conduce',     'Conduces y notas de entrega'),
  ('nomina',      'Recursos humanos y nomina'),
  ('retenciones', 'Retenciones fiscales')
) AS d(modulo, texto) ON d.modulo = m.modulo
ON CONFLICT (module, action) DO NOTHING;

-- ─── PASO 2 ── Comprueba el catalogo antes de repartir ────────────────────
--  Esperas 5 acciones para cada uno de los tres.
SELECT module, COUNT(*) AS acciones,
       STRING_AGG(action, ', ' ORDER BY action) AS cuales
FROM permissions
WHERE module IN ('conduce', 'nomina', 'retenciones')
GROUP BY module
ORDER BY module;

-- ─── PASO 3 ── Exactamente que se va a conceder, y a quien ────────────────
--  Corre esto ANTES del paso 4. Son 6 empresas x 3 modulos x 2 acciones = 36
--  filas, todas en granted = true. Si sale otra cosa, para.
WITH reparto(modulo, rol) AS (VALUES
  ('nomina',      'recursos_humanos'),
  ('conduce',     'facturacion'),
  ('retenciones', 'contabilidad')
)
SELECT c.name AS empresa, rp.rol, p.module, p.action
FROM reparto rp
CROSS JOIN companies c
JOIN roles r       ON r.name = rp.rol AND r.deleted_at IS NULL
JOIN permissions p ON p.module = rp.modulo AND p.action IN ('read', 'write')
WHERE c.deleted_at IS NULL
  AND NOT EXISTS (
  SELECT 1 FROM role_permissions x
  WHERE x.company_id = c.id AND x.role_id = r.id AND x.permission_id = p.id
)
ORDER BY c.name, p.module, p.action;

-- ─── PASO 4 ── El reparto ─────────────────────────────────────────────────
--  `roles` es una tabla GLOBAL (sin company_id), asi que el rol se empareja
--  por nombre una sola vez y vale para todas las empresas.
--  `updated_by` en NULL a proposito: esto no lo hizo un usuario, y poner ahi
--  el id de alguien seria falsear el rastro.
WITH reparto(modulo, rol) AS (VALUES
  ('nomina',      'recursos_humanos'),
  ('conduce',     'facturacion'),
  ('retenciones', 'contabilidad')
)
INSERT INTO role_permissions (company_id, role_id, permission_id, granted, updated_by)
SELECT c.id, r.id, p.id, TRUE, NULL
FROM reparto rp
CROSS JOIN companies c
JOIN roles r       ON r.name = rp.rol AND r.deleted_at IS NULL
JOIN permissions p ON p.module = rp.modulo AND p.action IN ('read', 'write')
WHERE c.deleted_at IS NULL
ON CONFLICT (company_id, role_id, permission_id) DO NOTHING;

-- ─── PASO 5 ── Comprobar ──────────────────────────────────────────────────
--  Esperas una fila por empresa y modulo, con `acciones` = 'read, write'.
SELECT c.name AS empresa, r.name AS rol, p.module,
       STRING_AGG(p.action, ', ' ORDER BY p.action) FILTER (WHERE rpm.granted) AS acciones
FROM role_permissions rpm
JOIN companies   c ON c.id = rpm.company_id
JOIN roles       r ON r.id = rpm.role_id
JOIN permissions p ON p.id = rpm.permission_id
WHERE p.module IN ('conduce', 'nomina', 'retenciones')
GROUP BY c.name, r.name, p.module
ORDER BY p.module, c.name;

-- ─── PASO 6 ── DESHACER ───────────────────────────────────────────────────
--  Primero el reparto, despues el catalogo. En ese orden: `role_permissions`
--  apunta a `permissions` por clave foranea.
--
--  DELETE FROM role_permissions rpm
--  USING permissions p
--  WHERE p.id = rpm.permission_id
--    AND p.module IN ('conduce', 'nomina', 'retenciones');
--
--  DELETE FROM permissions
--  WHERE module IN ('conduce', 'nomina', 'retenciones');
-- ---------------------------------------------------------------------------
