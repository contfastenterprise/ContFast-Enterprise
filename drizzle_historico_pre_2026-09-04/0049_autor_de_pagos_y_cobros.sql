-- 0049 — Pagos y cobros sin autor identificable.
--
-- EL PROBLEMA (auditoria 2026-09-03, hallazgo P1-13)
-- ----------------------------------------------------------
-- `ap_payments` (pagos a proveedores) y `customer_receipts` (cobros a
-- clientes) no tienen columna `created_by`. Ante un pago o un cobro
-- cuestionado no hay forma de determinar, consultando la fila, que usuario
-- lo registro.
--
-- El unico rastro indirecto que existia era, para los pagos a proveedores,
-- el `journal_entries.created_by` del asiento contable vinculado por
-- `journal_entries.reference = ap_payments.id` -- un campo de texto suelto,
-- no una FK (ver la nota de la sesion sobre `reference` como acoplamiento
-- debil). Para los cobros a clientes no habia ni siquiera eso: `arRepository
-- .registerReceipt` no genera ningun asiento contable.
--
-- LA CORRECCION
-- --------------
-- Se agregan DOS columnas nuevas a cada tabla, ambas NULAS (no se puede
-- rellenar con certeza el autor de un pago o cobro ya existente, y esta
-- migracion no adivina uno):
--
--   * created_by -- quien registro el pago/cobro. A partir de esta
--     migracion, el codigo (ApService.registerPayment / ArRepository
--     .registerReceipt) lo rellena siempre con el usuario de la sesion.
--   * voided_by -- quien lo anulo. Se deja preparada para cuando exista una
--     funcion de anulacion (hoy no existe ninguna ruta que ponga
--     ap_payments.status en 'voided' ni que borre un customer_receipt) --
--     agregarla ahora evita una segunda migracion cuando esa funcion se
--     escriba.
--
-- Los pagos y cobros HISTORICOS (ya en la base antes de esta migracion) se
-- quedan con created_by/voided_by en NULL -- no se reconstruye ni se adivina
-- quien los registro. Ver PLAN.md / instrucciones de la sesion: solo se
-- cierra el hueco hacia adelante.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'ap_payments' AND column_name = 'created_by') THEN
    ALTER TABLE public.ap_payments
      ADD COLUMN created_by uuid REFERENCES public.users(id);
    RAISE NOTICE '0049: columna ap_payments.created_by creada.';
  ELSE
    RAISE NOTICE '0049: ap_payments.created_by ya existia. Nada que crear.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'ap_payments' AND column_name = 'voided_by') THEN
    ALTER TABLE public.ap_payments
      ADD COLUMN voided_by uuid REFERENCES public.users(id);
    RAISE NOTICE '0049: columna ap_payments.voided_by creada.';
  ELSE
    RAISE NOTICE '0049: ap_payments.voided_by ya existia. Nada que crear.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'customer_receipts' AND column_name = 'created_by') THEN
    ALTER TABLE public.customer_receipts
      ADD COLUMN created_by uuid REFERENCES public.users(id);
    RAISE NOTICE '0049: columna customer_receipts.created_by creada.';
  ELSE
    RAISE NOTICE '0049: customer_receipts.created_by ya existia. Nada que crear.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'customer_receipts' AND column_name = 'voided_by') THEN
    ALTER TABLE public.customer_receipts
      ADD COLUMN voided_by uuid REFERENCES public.users(id);
    RAISE NOTICE '0049: columna customer_receipts.voided_by creada.';
  ELSE
    RAISE NOTICE '0049: customer_receipts.voided_by ya existia. Nada que crear.';
  END IF;
END $$;

COMMENT ON COLUMN public.ap_payments.created_by IS
  'Usuario que registro el pago. NULL en pagos anteriores a esta migracion (P1-13, auditoria 2026-09-03) -- no se reconstruye.';
COMMENT ON COLUMN public.ap_payments.voided_by IS
  'Usuario que anulo el pago. Columna preparada para cuando exista una funcion de anulacion; hoy ningun codigo la rellena.';
COMMENT ON COLUMN public.customer_receipts.created_by IS
  'Usuario que registro el cobro. NULL en cobros anteriores a esta migracion (P1-13, auditoria 2026-09-03) -- no se reconstruye.';
COMMENT ON COLUMN public.customer_receipts.voided_by IS
  'Usuario que anulo el cobro. Columna preparada para cuando exista una funcion de anulacion; hoy ningun codigo la rellena.';

-- ── VERIFICACION ────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM public.ap_payments) AS "Pagos totales",
  (SELECT COUNT(*) FROM public.ap_payments WHERE created_by IS NOT NULL) AS "Pagos con autor (deberia ser 0 justo despues de aplicar)",
  (SELECT COUNT(*) FROM public.customer_receipts) AS "Cobros totales",
  (SELECT COUNT(*) FROM public.customer_receipts WHERE created_by IS NOT NULL) AS "Cobros con autor (deberia ser 0 justo despues de aplicar)";
