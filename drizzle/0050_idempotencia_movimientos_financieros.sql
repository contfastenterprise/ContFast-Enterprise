-- 0050 — Sin idempotencia en asientos/movimientos financieros (P1-11).
--
-- EL PROBLEMA (auditoria 2026-09-03, hallazgo P1-11)
-- ----------------------------------------------------------
-- `financial_movements` no tenia ninguna restriccion que impidiera dos
-- filas para el MISMO documento y el MISMO tipo de movimiento. Un
-- reintento de red o un doble clic que reprocesa un documento ya
-- existente (por ejemplo, confirmar el mismo cheque en garantia dos
-- veces -- `ApService`, los dos caminos que aplican `payment.id` ya
-- existente) genera un segundo movimiento balanceado que ninguna
-- validacion de cuadre detecta, duplicando el saldo de cliente/proveedor.
--
-- LA CORRECCION (parcial -- ver alcance abajo)
-- ---------------------------------------------
-- Se agrega un indice UNICO PARCIAL sobre
-- (company_id, modo, movement_type, document_id) para las filas con
-- status = 'active'. Parcial porque un movimiento anulado no debe
-- bloquear que el mismo documento se vuelva a registrar si el negocio
-- lo permite (hoy ningun codigo crea movimientos 'void', pero la columna
-- status ya lo contempla).
--
-- Antes de crear el indice, esta migracion verifica que no existan YA
-- duplicados activos -- si los hay, NO crea el indice (para no fallar el
-- despliegue) y deja un aviso para investigarlos manualmente. No se
-- fusionan ni se borran filas existentes: esta migracion, como las
-- anteriores, solo cierra el hueco hacia adelante.
--
-- ALCANCE: esto NO cubre un reintento que genera un document_id NUEVO en
-- cada intento (ej. `arRepository.registerReceipt`, que crea una fila
-- con id propio -- `uuidv4()` -- en cada llamada; un segundo intento
-- produciria un customer_receipts.id distinto y por lo tanto pasaria el
-- indice sin problema). Ese caso requiere un mecanismo de
-- idempotency-key en las rutas POST criticas, que la propia auditoria
-- senala como un cambio aparte y que no se incluye en esta migracion.

DO $$
DECLARE
  duplicados_activos integer;
BEGIN
  SELECT COUNT(*) INTO duplicados_activos
  FROM (
    SELECT company_id, modo, movement_type, document_id
    FROM public.financial_movements
    WHERE status = 'active'
    GROUP BY company_id, modo, movement_type, document_id
    HAVING COUNT(*) > 1
  ) dup;

  IF duplicados_activos > 0 THEN
    RAISE NOTICE '0050: se encontraron % combinacion(es) de (company_id, modo, movement_type, document_id) con mas de un movimiento activo. NO se crea el indice unico -- investigar y resolver esos duplicados antes de reintentar esta migracion.', duplicados_activos;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'fin_mov_company_modo_type_doc_uniq') THEN
      CREATE UNIQUE INDEX fin_mov_company_modo_type_doc_uniq
        ON public.financial_movements (company_id, modo, movement_type, document_id)
        WHERE status = 'active';
      RAISE NOTICE '0050: indice unico fin_mov_company_modo_type_doc_uniq creado.';
    ELSE
      RAISE NOTICE '0050: fin_mov_company_modo_type_doc_uniq ya existia. Nada que crear.';
    END IF;
  END IF;
END $$;

-- ── VERIFICACION ────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM public.financial_movements) AS "Movimientos totales",
  (SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'fin_mov_company_modo_type_doc_uniq') AS "Indice creado (1) o no (0)",
  (SELECT COUNT(*) FROM (
    SELECT company_id, modo, movement_type, document_id
    FROM public.financial_movements
    WHERE status = 'active'
    GROUP BY company_id, modo, movement_type, document_id
    HAVING COUNT(*) > 1
  ) dup) AS "Combinaciones duplicadas activas (deberia ser 0)";
