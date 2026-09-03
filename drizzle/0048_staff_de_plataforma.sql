-- 0048 — El staff de ContFast se marca aparte del rol, no con el.
--
-- EL PROBLEMA (auditoria 2026-09-03, hallazgo P0-01/P0-03)
-- ----------------------------------------------------------
-- `sistemas` es uno de los 6 roles ESTANDAR que se siembran en CADA empresa
-- nueva (ver utils/defaultRoles.ts), descrito como "Ingeniero de sistemas -
-- Acceso Total tecnico". No es, y nunca fue, un rol reservado al operador de
-- la plataforma (ContFast). Pero cuatro endpoints solo comprobaban el NOMBRE
-- del rol:
--
--   * GET  /api/v1/admin/companies            -- lista TODAS las empresas
--   * POST /api/v1/auth/switch-company        -- emite sesion en CUALQUIER empresa
--   * PUT/DELETE /api/v1/admin/companies/[id] -- edita/desactiva CUALQUIER empresa
--   * POST .../admin/companies/[id]/clear-sandbox -- purga datos de CUALQUIER empresa
--   * GET  /api/v1/admin/subscriptions         -- expone la facturacion de TODAS
--
-- Consecuencia real: el "ingeniero de sistemas" de una empresa cliente
-- cualquiera -- rol estandar, no excepcional -- podia leer, modificar o
-- purgar datos de facturacion, banca, nomina y contabilidad de CUALQUIER
-- OTRA empresa de la plataforma.
--
-- LA CORRECCION
-- --------------
-- Una columna INDEPENDIENTE del rol y de la empresa: `is_platform_staff`.
-- Por defecto false para todo el mundo. El codigo (middleware/auth.ts,
-- proxy.ts, y los 5 endpoints de arriba) ahora exige `role = 'sistemas' AND
-- is_platform_staff = true` para las operaciones que cruzan empresas -- ver
-- docs/auditoria/auditoria_2026-09-03.md.
--
-- ESTA MIGRACION NO ACTIVA A NADIE. El PASO 2 de mas abajo esta comentado a
-- proposito: activar la cuenta real de ContFast es una decision que toma
-- quien administra la base de datos, no un valor por defecto de una
-- migracion. Sin ese paso, TODO el staff de sistemas de TODAS las empresas
-- pierde el acceso cruzado hasta que se active explicitamente al menos una
-- cuenta -- es la direccion segura para equivocarse, si algo sale mal aqui.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'users' AND column_name = 'is_platform_staff') THEN
    ALTER TABLE public.users
      ADD COLUMN is_platform_staff boolean NOT NULL DEFAULT false;
    RAISE NOTICE '0048: columna is_platform_staff creada (todos en false).';
  ELSE
    RAISE NOTICE '0048: la columna is_platform_staff ya existia. Nada que crear.';
  END IF;
END $$;

COMMENT ON COLUMN public.users.is_platform_staff IS
  'Marca al staff de ContFast, independiente del rol y de la empresa. NO es lo mismo que el rol "sistemas" (que es un rol estandar de cada empresa cliente). Ver hallazgo P0-01/P0-03 de la auditoria 2026-09-03.';

-- ── PASO 2 (manual, deliberadamente comentado) ───────────────────────
-- Para activar tu(s) cuenta(s) real(es) de ContFast, edita el correo abajo y
-- ejecuta este UPDATE por separado -- NO lo descomentes dentro de esta
-- migracion, para que quede como un acto consciente y quede su propio
-- registro de cuando se hizo:
--
--   UPDATE public.users
--      SET is_platform_staff = true
--    WHERE email = 'tu-correo-de-sistemas@ejemplo.com';
--
-- Repite el UPDATE por cada cuenta que de verdad necesite administrar todas
-- las empresas. No hace falta que esa cuenta tenga el rol 'sistemas' en una
-- empresa "especial": la marca es independiente del rol con el que se
-- inicie sesion en cada empresa.

-- ── VERIFICACION ────────────────────────────────────────────────────
SELECT u.email                    AS "Usuario",
       c.name                     AS "Empresa donde tiene su cuenta",
       r.name                     AS "Rol en esa empresa",
       u.is_platform_staff        AS "Staff de plataforma"
  FROM public.users u
  JOIN public.companies c ON c.id = u.company_id
  JOIN public.roles r ON r.id = u.role_id
 WHERE u.deleted_at IS NULL
 ORDER BY u.is_platform_staff DESC, c.name;
-- "Staff de plataforma" tiene que ser false para todas las filas justo
-- despues de aplicar esta migracion (antes de que corras el PASO 2 a mano).
