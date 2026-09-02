-- 0042 — "0%" son DOS cosas distintas para la DGII, y hasta ahora eran una.
--
-- QUE PASABA
-- ----------
-- El formulario ofrecia una sola opcion, "0% Exento", y de ahi salia `taxRate = 0`.
-- Pero el formato e-CF de la DGII (v1.0) distingue dos casos que no son lo mismo
-- ni fiscal ni contablemente:
--
--   IndicadorFacturacion 4 = EXENTO
--       Bienes y servicios exentos por ley. No se cobra ITBIS y el vendedor NO
--       recupera el ITBIS que pago en sus compras: se le queda como costo.
--       El importe suma a MontoExento.
--
--   IndicadorFacturacion 3 = GRAVADO A TASA 0%
--       Basicamente exportaciones. Tampoco se cobra ITBIS, pero el vendedor SI
--       conserva el credito del ITBIS de sus insumos y puede acreditarlo o pedir
--       reembolso. El importe suma a MontoGravadoI3, no a MontoExento.
--
-- Con una sola opcion, una exportacion se declaraba como exenta y se regalaba
-- el credito. Y el sistema no guardaba en ningun sitio cual de las dos era, asi
-- que tampoco se podia corregir despues: el dato no existia.
--
-- QUE HACE ESTA MIGRACION
-- -----------------------
-- Anade a las lineas la CATEGORIA de ITBIS, que es la intencion de quien
-- factura, no un numero derivado.
--
--   NULL        se deduce como hasta ahora: tasa > 0 -> gravado; tasa 0 -> exento.
--               Es lo que hace que TODAS las lineas existentes se comporten
--               exactamente igual que antes de esta migracion.
--   'exento'    exento por ley (indicador 4)
--   'tasa_cero' gravado a tasa 0%, exportacion (indicador 3)
--
-- No se rellena ninguna fila existente. Deducir "exento" para las que tienen
-- tasa 0 daria el mismo resultado, pero seria escribir una intencion que nadie
-- declaro -- y este proyecto ya tuvo bastante de eso. NULL significa "no se
-- dijo", y se deduce en el unico sitio que lo decide.
--
-- OJO: la rama 'tasa_cero' NO se ha validado todavia contra un envio real. La
-- colocacion del tramo I3 en los Totales hay que confirmarla con un envio en
-- PRUEBA antes de usarla para una exportacion de verdad.

DO $$
DECLARE
  v_facturas    integer;
  v_cotiza      integer;
BEGIN
  -- ── invoice_lines ─────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='invoice_lines' AND column_name='tax_category'
  ) THEN
    ALTER TABLE public.invoice_lines ADD COLUMN tax_category varchar(16);
  END IF;

  -- ── quote_lines ───────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='quote_lines' AND column_name='tax_category'
  ) THEN
    ALTER TABLE public.quote_lines ADD COLUMN tax_category varchar(16);
  END IF;

  -- Solo se admiten los dos valores conocidos, o NULL. Sin esto, un dia entra
  -- 'Exento' con mayuscula o 'exportacion' y el indicador se calcula mal en
  -- silencio, que es justo el modo de fallo que esta migracion viene a cerrar.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='invoice_lines_tax_category_ck') THEN
    ALTER TABLE public.invoice_lines
      ADD CONSTRAINT invoice_lines_tax_category_ck
      CHECK (tax_category IS NULL OR tax_category IN ('exento','tasa_cero'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='quote_lines_tax_category_ck') THEN
    ALTER TABLE public.quote_lines
      ADD CONSTRAINT quote_lines_tax_category_ck
      CHECK (tax_category IS NULL OR tax_category IN ('exento','tasa_cero'));
  END IF;

  -- Una categoria distinta de NULL solo tiene sentido con tasa 0: 'exento' o
  -- 'tasa_cero' con tasa 18% seria una contradiccion, y una contradiccion
  -- guardada acaba imprimiendose.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='invoice_lines_tax_category_tasa_ck') THEN
    ALTER TABLE public.invoice_lines
      ADD CONSTRAINT invoice_lines_tax_category_tasa_ck
      CHECK (tax_category IS NULL OR tax_rate = 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='quote_lines_tax_category_tasa_ck') THEN
    ALTER TABLE public.quote_lines
      ADD CONSTRAINT quote_lines_tax_category_tasa_ck
      CHECK (tax_category IS NULL OR tax_rate = 0);
  END IF;

  SELECT count(*) INTO v_facturas FROM public.invoice_lines WHERE tax_rate = 0;
  SELECT count(*) INTO v_cotiza   FROM public.quote_lines   WHERE tax_rate = 0;

  RAISE NOTICE '0042: % linea(s) de factura y % de cotizacion estan a tasa 0.', v_facturas, v_cotiza;
  RAISE NOTICE '0042: todas quedan como EXENTO (categoria NULL se deduce exento). Si alguna era';
  RAISE NOTICE '0042: una exportacion, hay que marcarla a mano como tasa_cero.';

  -- Comprobaciones finales.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='invoice_lines'
       AND column_name='tax_category' AND is_nullable='YES'
  ) THEN
    RAISE EXCEPTION '0042: invoice_lines.tax_category no quedo creada como NULLABLE.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='quote_lines'
       AND column_name='tax_category' AND is_nullable='YES'
  ) THEN
    RAISE EXCEPTION '0042: quote_lines.tax_category no quedo creada como NULLABLE.';
  END IF;

  IF (SELECT count(*) FROM pg_constraint
       WHERE conname IN ('invoice_lines_tax_category_ck','quote_lines_tax_category_ck',
                         'invoice_lines_tax_category_tasa_ck','quote_lines_tax_category_tasa_ck')) <> 4 THEN
    RAISE EXCEPTION '0042: faltan restricciones de tax_category.';
  END IF;
END $$;
