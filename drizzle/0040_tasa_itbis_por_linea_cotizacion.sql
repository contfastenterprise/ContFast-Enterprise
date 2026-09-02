-- ============================================================================
--  0040  --  Guardar la tasa de ITBIS de cada linea de COTIZACION
-- ============================================================================
--
--  EL FALLO
--  --------
--  Se emite una cotizacion con una tasa (16% o exento), se pasa a factura, y la
--  factura sale al 18%.
--
--  Es el mismo agujero que la 0039 arreglo para las facturas, en la tabla de al
--  lado: `quote_lines` tampoco tenia columna de tasa. Sus columnas eran id,
--  quote_id, product_id, quantity, unit_price, discount, subtotal, total.
--
--  Y en este caso el propio codigo lo tenia escrito. En
--  `QuoteService.prepareInvoicePayload`, que es lo que se llama al convertir:
--
--      // We need to fetch the taxRate from quoteTaxes or reconstruct it
--      // We don't store taxRate per line directly, so frontend might need to
--      // refetch it or we can compute it from unitPrice, subtotal and taxes.
--
--  El payload de conversion simplemente NO llevaba `taxRate`. Y al recibirlo,
--  el formulario de facturas ponia `taxRate: 0.18` a pelo
--  (dashboard/invoices/page.tsx, en el bloque del `quoteId`). Asi que daba
--  igual lo que dijera la cotizacion: la factura nacia al 18%.
--
--  UNIDADES: OJO, LAS DOS TABLAS NO USAN LA MISMA
--  ----------------------------------------------
--    quote_taxes.rate       ->  PORCENTAJE   (18.00, 16.00)  -- ya era asi
--    quote_lines.tax_rate   ->  FRACCION     (0.1800)        -- la nueva
--
--  Igual que en la 0039, y por el mismo motivo: la fraccion es la unidad del
--  dominio y el porcentaje ya estaba escrito en produccion. Hay una
--  comprobacion que fija las dos.
--
--  POR QUE ADMITE NULO, Y POR QUE NO LLEVA VALOR POR DEFECTO
--  --------------------------------------------------------
--  Un `DEFAULT 0.18` seria repetir el fallo que se esta arreglando: el silencio
--  leido como el caso corriente.
--
--  Admite NULO por las cotizaciones VIEJAS. Donde el resumen tiene una sola
--  tasa, se deduce sin ambiguedad y se rellena. Donde tiene dos o mas, no hay
--  forma de saber que linea llevaba cual: se queda NULO, que significa "no
--  consta", y al convertir se avisa en vez de inventar un 18%.
-- ============================================================================

ALTER TABLE "quote_lines" ADD COLUMN IF NOT EXISTS "tax_rate" numeric(6, 4);

COMMENT ON COLUMN "quote_lines"."tax_rate" IS
  'Tasa de ITBIS de la linea, como FRACCION (0.1800 = 18%). Ojo: quote_taxes.rate va en PORCENTAJE. NULO = factura vieja con varias tasas, no se puede deducir.';

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
    SELECT t.quote_id, min(t.rate) AS rate
      FROM quote_taxes t
     WHERE upper(t.tax_type) = 'ITBIS'
     GROUP BY t.quote_id
    HAVING count(DISTINCT t.rate) = 1
  )
  UPDATE quote_lines l
     SET tax_rate = u.rate / 100.0
    FROM unica u
   WHERE l.quote_id = u.quote_id
     AND l.tax_rate IS NULL;
  GET DIAGNOSTICS con_una = ROW_COUNT;

  --  Facturas con DOS o mas tasas: no se puede repartir. Se quedan nulas.
  SELECT count(*) INTO ambiguas
    FROM quote_lines l
   WHERE l.tax_rate IS NULL
     AND EXISTS (
       SELECT 1 FROM quote_taxes t
        WHERE t.quote_id = l.quote_id AND upper(t.tax_type) = 'ITBIS'
        GROUP BY t.quote_id HAVING count(DISTINCT t.rate) > 1);

  --  Facturas sin resumen de ITBIS (exentas antiguas, o sin impuestos).
  SELECT count(*) INTO sin_datos
    FROM quote_lines l
   WHERE l.tax_rate IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM quote_taxes t
        WHERE t.quote_id = l.quote_id AND upper(t.tax_type) = 'ITBIS');

  RAISE NOTICE '0040: % lineas rellenadas desde el resumen (una sola tasa).', con_una;
  RAISE NOTICE '0040: % lineas quedan NULAS por tener la factura varias tasas (no deducible).', ambiguas;
  RAISE NOTICE '0040: % lineas quedan NULAS por no haber resumen de ITBIS.', sin_datos;

  --  Comprobacion: que la columna existe y que ninguna quedo con un valor
  --  imposible. Que las ordenes no den error no basta.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'quote_lines' AND column_name = 'tax_rate') THEN
    RAISE EXCEPTION '0040 FALLO: la columna tax_rate no quedo creada.';
  END IF;

  IF EXISTS (SELECT 1 FROM quote_lines WHERE tax_rate IS NOT NULL AND (tax_rate < 0 OR tax_rate > 1)) THEN
    RAISE EXCEPTION '0040 FALLO: hay tasas fuera del rango 0..1. La columna va en FRACCION (0.18), no en porcentaje.';
  END IF;

  RAISE NOTICE '0040: COMPROBADA. quote_lines.tax_rate existe y sus valores estan en fraccion.';
END $$;
