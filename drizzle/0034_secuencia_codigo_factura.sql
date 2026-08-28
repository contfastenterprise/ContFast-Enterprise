-- 0034: el codigo de factura deja de generarse contando filas
--
-- QUE PASABA
-- ----------
-- 1. `codigo_factura` no tenia ninguna restriccion de unicidad.
--
-- 2. Se generaba contando: `SELECT count(*) ... WHERE codigo_factura LIKE
--    'FAC-2026-%'` y sumando uno. En `invoiceDbBooker` el conteo va dentro de
--    la transaccion, pero COUNT(*) no bloquea nada: dos facturas simultaneas
--    leen el mismo numero y las dos escriben FAC-2026-000123.
--
-- 3. En `POST /api/v1/invoices/draft` el conteo se hacia FUERA de la
--    transaccion y ademas sin filtrar `modo`, asi que los borradores creados en
--    PRUEBA consumian numeros del correlativo real.
--
-- 4. Habian quedado vivos el trigger `trg_assign_codigo_factura` y la funcion
--    `obtener_siguiente_codigo_factura` de la migracion 0011, pero NO la tabla
--    `factura_secuencias` que ambos necesitan. El trigger solo entra si
--    `codigo_factura` llega NULL y la aplicacion siempre lo rellena, asi que no
--    saltaba nunca; cualquier INSERT que omitiera el campo -- un arreglo de
--    datos a mano, un seed, una ruta nueva -- fallaba con
--    "relation public.factura_secuencias does not exist".
--
-- Y aunque se creara esa tabla no serviria: su clave primaria era `anio` a
-- secas. Un solo contador global para todas las empresas y los dos entornos.
--
-- QUE HACE
-- --------
-- Sustituye el conteo por una tabla de secuencias con la misma forma que
-- `quote_sequences` y `supplier_order_sequences`, que ya siguen este patron en
-- este mismo esquema, mas el prefijo: FAC, NC y ND son series distintas.
--
-- El avance se hace con INSERT ... ON CONFLICT DO UPDATE ... RETURNING, que es
-- una sola sentencia y por tanto atomica: no hay ventana entre leer y escribir.

-- ---------------------------------------------------------------------------
-- 1. Retirar el trigger y las funciones huerfanas de la 0011.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_assign_codigo_factura ON public.invoices;
DROP FUNCTION IF EXISTS public.trg_invoices_assign_codigo_factura();
DROP FUNCTION IF EXISTS public.obtener_siguiente_codigo_factura(INTEGER);

-- ---------------------------------------------------------------------------
-- 2. La tabla de secuencias.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "invoice_sequences" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id"       uuid NOT NULL REFERENCES "companies"("id"),
  "modo"             "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
  -- FAC, NC o ND. Cada prefijo lleva su propia numeracion.
  "prefix"           varchar(8) NOT NULL,
  "current_year"     integer NOT NULL,
  "current_sequence" integer NOT NULL,
  "created_at"       timestamp DEFAULT now() NOT NULL,
  "updated_at"       timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "invoice_seq_company_prefix_year_modo_idx"
  ON "invoice_sequences" ("company_id", "prefix", "current_year", "modo");

-- ---------------------------------------------------------------------------
-- 3. Arrancar cada secuencia donde lo dejo el conteo.
--
-- Se toma el MAYOR numero ya emitido, no el conteo de filas: si alguna vez se
-- anulo o borro una factura, contar daria un numero ya usado.
-- ---------------------------------------------------------------------------
INSERT INTO invoice_sequences (company_id, modo, prefix, current_year, current_sequence)
SELECT company_id,
       modo,
       split_part(codigo_factura, '-', 1)              AS prefix,
       split_part(codigo_factura, '-', 2)::int         AS current_year,
       max(split_part(codigo_factura, '-', 3)::int)    AS current_sequence
FROM invoices
WHERE codigo_factura ~ '^(FAC|NC|ND)-[0-9]{4}-[0-9]+$'
GROUP BY company_id, modo, split_part(codigo_factura, '-', 1), split_part(codigo_factura, '-', 2)::int
ON CONFLICT ("company_id", "prefix", "current_year", "modo") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. La unicidad, por empresa y entorno.
--
-- NO global como proponia la 0011: `UNIQUE (codigo_factura)` a secas haria que
-- la primera factura de una empresa bloqueara el FAC-2026-000001 de todas las
-- demas.
--
-- Una restriccion UNIQUE no admite NOT VALID, asi que si ya hay duplicados esto
-- falla. Se comprueba antes para que el error diga cuales son en vez de un
-- "could not create unique index" a secas.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  duplicados text;
BEGIN
  SELECT string_agg(format('%s / %s / %s (x%s)', company_id, modo, codigo_factura, n), E'\n  ')
  INTO duplicados
  FROM (
    SELECT company_id, modo, codigo_factura, count(*) AS n
    FROM invoices
    WHERE codigo_factura IS NOT NULL
    GROUP BY company_id, modo, codigo_factura
    HAVING count(*) > 1
    LIMIT 20
  ) d;

  IF duplicados IS NOT NULL THEN
    RAISE EXCEPTION E'Hay codigos de factura repetidos; la restriccion no puede entrar hasta resolverlos:\n  %', duplicados;
  END IF;
END $$;

-- Hay hasta TRES unicidades heredadas que retirar, y ninguna sirve:
--
--   invoices_codigo_factura_idx / _unique   de la 0011: UNIQUE (codigo_factura)
--     a secas, global entre empresas y entornos.
--
--   invoices_codigo_factura_modo_idx        de la 0026: UNIQUE (codigo_factura,
--     modo). Separa los entornos pero NO las empresas, asi que la primera
--     factura de una empresa bloquea el FAC-2026-000001 de todas las demas. Con
--     una sola empresa facturando no se nota; en cuanto una segunda emite su
--     primera factura del anio, choca.
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_codigo_factura_unique";
DROP INDEX IF EXISTS "invoices_codigo_factura_idx";
DROP INDEX IF EXISTS "invoices_codigo_factura_modo_idx";

-- La correcta. Se declara como indice unico, que es como estan declaradas todas
-- las demas unicidades de este esquema.
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_company_codigo_factura_modo_idx"
  ON "invoices" ("company_id", "codigo_factura", "modo");

-- Nota: PostgreSQL admite varios NULL en un indice unico, asi que las facturas
-- antiguas sin codigo no estorban.
