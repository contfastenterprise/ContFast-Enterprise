-- ============================================================================
--  0039  --  Guardar la tasa de ITBIS de CADA linea
-- ============================================================================
--
--  EL FALLO
--  --------
--  Se elige otra tasa en la factura (16% o 0% exento) y al imprimir sale 18%.
--  Reproducido con el codigo real (scratch/reproducir_itbis.ts):
--
--      elegida     -> navegador -> se guarda -> se imprime
--      18% ITBIS   -> 18%       -> 18%       -> 18%   OK
--      16% ITBIS   -> 16%       -> 16%       -> 16%   OK
--      0%  Exento  -> 18%       -> 18%       -> 18%   MAL
--
--  La causa de fondo no es ninguno de los sitios donde se nota, sino ESTA:
--  `invoice_lines` no tiene columna de tasa. Sus columnas eran id, invoice_id,
--  product_id, quantity, unit_price, discount, subtotal, total, warehouse_id.
--  Ninguna guarda a que tasa se facturo la linea.
--
--  Lo unico que quedaba era el resumen agregado de `invoice_taxes` (una fila
--  por tasa distinta). Con eso no se puede reconstruir que tasa llevaba cada
--  linea, asi que todo lo de aguas abajo se lo inventaba:
--
--    - al recuperar un BORRADOR, el formulario forzaba `taxRate: 0.18`;
--    - la nota de ajuste leia `line.taxRate`, que siempre venia vacio, y caia
--      tambien en 0.18;
--    - la plantilla de impresion cogia la PRIMERA tasa del resumen y se la
--      aplicaba a todas las lineas.
--
--  UNIDADES: OJO, LAS DOS TABLAS NO USAN LA MISMA
--  ----------------------------------------------
--    invoice_taxes.rate  ->  PORCENTAJE   (18.00, 16.00)  -- ya era asi
--    invoice_lines.tax_rate -> FRACCION   (0.1800, 0.1600) -- la nueva
--
--  No se unifican a proposito: `invoice_taxes.rate` ya esta escrita asi en
--  produccion y la plantilla la divide entre 100. Cambiarla obligaria a migrar
--  datos y a tocar codigo que hoy funciona. La fraccion es la unidad que usa el
--  dominio (`taxRate: 0.18` en toda la aplicacion), asi que la columna nueva la
--  sigue. Queda escrito aqui porque mezclar las dos es facil, y hay una
--  comprobacion en `scratch/verificar_itbis_por_linea.ts` que fija las dos.
--
--  POR QUE ADMITE NULO, Y POR QUE NO LLEVA VALOR POR DEFECTO
--  --------------------------------------------------------
--  Un `DEFAULT 0.18` seria repetir el error que esta auditoria lleva toda la
--  sesion persiguiendo: el silencio leido como el caso corriente. Sin defecto,
--  quien inserte una linea tiene que decir la tasa.
--
--  Y admite NULO por las facturas VIEJAS. Para las que tienen una sola tasa en
--  su resumen, la tasa de cada linea se deduce sin ambiguedad y se rellena.
--  Para las que tienen DOS o mas, no hay forma de saber que linea llevaba cual:
--  ahi se queda NULO, que significa "no consta" -- y es mejor que un 18%
--  inventado que nadie podria distinguir de uno real.
-- ============================================================================

ALTER TABLE "invoice_lines" ADD COLUMN IF NOT EXISTS "tax_rate" numeric(6, 4);

COMMENT ON COLUMN "invoice_lines"."tax_rate" IS
  'Tasa de ITBIS de la linea, como FRACCION (0.1800 = 18%). Ojo: invoice_taxes.rate va en PORCENTAJE. NULO = factura vieja con varias tasas, no se puede deducir.';

--  Relleno de lo ya emitido, solo donde es deducible.
DO $$
DECLARE
  con_una    integer;
  ambiguas   integer;
  sin_datos  integer;
BEGIN
  --  Facturas cuyo resumen tiene UNA sola tasa de ITBIS: todas sus lineas
  --  llevaban esa. Es deducible y se rellena.
  WITH unica AS (
    SELECT t.invoice_id, min(t.rate) AS rate
      FROM invoice_taxes t
     WHERE upper(t.tax_type) = 'ITBIS'
     GROUP BY t.invoice_id
    HAVING count(DISTINCT t.rate) = 1
  )
  UPDATE invoice_lines l
     SET tax_rate = u.rate / 100.0
    FROM unica u
   WHERE l.invoice_id = u.invoice_id
     AND l.tax_rate IS NULL;
  GET DIAGNOSTICS con_una = ROW_COUNT;

  --  Facturas con DOS o mas tasas: no se puede repartir. Se quedan nulas.
  SELECT count(*) INTO ambiguas
    FROM invoice_lines l
   WHERE l.tax_rate IS NULL
     AND EXISTS (
       SELECT 1 FROM invoice_taxes t
        WHERE t.invoice_id = l.invoice_id AND upper(t.tax_type) = 'ITBIS'
        GROUP BY t.invoice_id HAVING count(DISTINCT t.rate) > 1);

  --  Facturas sin resumen de ITBIS (exentas antiguas, o sin impuestos).
  SELECT count(*) INTO sin_datos
    FROM invoice_lines l
   WHERE l.tax_rate IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM invoice_taxes t
        WHERE t.invoice_id = l.invoice_id AND upper(t.tax_type) = 'ITBIS');

  RAISE NOTICE '0039: % lineas rellenadas desde el resumen (una sola tasa).', con_una;
  RAISE NOTICE '0039: % lineas quedan NULAS por tener la factura varias tasas (no deducible).', ambiguas;
  RAISE NOTICE '0039: % lineas quedan NULAS por no haber resumen de ITBIS.', sin_datos;

  --  Comprobacion: que la columna existe y que ninguna quedo con un valor
  --  imposible. Que las ordenes no den error no basta.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'invoice_lines' AND column_name = 'tax_rate') THEN
    RAISE EXCEPTION '0039 FALLO: la columna tax_rate no quedo creada.';
  END IF;

  IF EXISTS (SELECT 1 FROM invoice_lines WHERE tax_rate IS NOT NULL AND (tax_rate < 0 OR tax_rate > 1)) THEN
    RAISE EXCEPTION '0039 FALLO: hay tasas fuera del rango 0..1. La columna va en FRACCION (0.18), no en porcentaje.';
  END IF;

  RAISE NOTICE '0039: COMPROBADA. invoice_lines.tax_rate existe y sus valores estan en fraccion.';
END $$;
