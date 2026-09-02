-- ============================================================================
--  BORRAR LAS FECHAS DE VENCIMIENTO QUE NO VIENEN DE NINGUNA AUTORIZACION
-- ============================================================================
--
--  DE DONDE SALE ESTO
--  ------------------
--  El e-32 y el e-34 de PRODUCCION tenian cargadas `31-12-2026` y `31-12-2028`.
--  No salen de un SACF: se pusieron a mano siguiendo una instruccion mia que
--  era equivocada -- yo pedi esas fechas creyendo que faltaban, y para esos dos
--  tipos la DGII marca el campo como **No Aplica**.
--
--  POR QUE HAY QUE QUITARLAS AUNQUE YA NO HAGAN DANO
--  -------------------------------------------------
--  El codigo ya las ignora: no se envian, no se imprimen y ya no bloquean la
--  emision. Pero mientras esten ahi, la tabla afirma un dato fiscal que nadie
--  autorizo. La proxima persona que las lea -- o el proximo agente -- las
--  tomara por buenas. Es exactamente el patron que veniamos quitando.
--
--  QUE BORRA, EXACTAMENTE
--  ----------------------
--  Solo la fecha, solo en e-32, e-34 y e-47, y solo si esta puesta. No toca
--  numeracion, ni rangos, ni ninguna otra columna. Los tipos que SI llevan
--  vencimiento (31, 33, 41, 43, 44, 45, 46) no se tocan: ahi la fecha es real
--  y obligatoria.
--
--  Es seguro correrlo dos veces.
-- ============================================================================

DO $limpiar$
DECLARE
  v_antes text;
  v_n integer;
BEGIN
  SELECT string_agg(
           c.name || ' / ' || s.modo || ' / e-' || s.ecf_type || ' = ' || s.sequence_expiry,
           E'\n              ' ORDER BY c.name, s.modo, s.ecf_type)
    INTO v_antes
    FROM ecf_sequences s
    JOIN companies c ON c.id = s.company_id
   WHERE s.deleted_at IS NULL
     AND s.ecf_type IN ('32', '34', '47')
     AND nullif(btrim(s.sequence_expiry), '') IS NOT NULL;

  IF v_antes IS NULL THEN
    RAISE NOTICE 'No hay ninguna fecha que quitar. Nada que hacer.';
    RETURN;
  END IF;

  RAISE NOTICE 'Se van a borrar estas fechas:';
  RAISE NOTICE '              %', v_antes;

  UPDATE ecf_sequences
     SET sequence_expiry = NULL,
         updated_at = now()
   WHERE deleted_at IS NULL
     AND ecf_type IN ('32', '34', '47')
     AND nullif(btrim(sequence_expiry), '') IS NOT NULL;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE '% secuencia(s) actualizada(s). El campo queda NULO, que es lo correcto para estos tipos.', v_n;
END $limpiar$;

-- Como quedan. Ninguna de e-32/e-34/e-47 deberia mostrar fecha.
SELECT c.name              AS "Empresa",
       s.modo              AS "Modo",
       'e-' || s.ecf_type  AS "Tipo",
       coalesce(nullif(btrim(s.sequence_expiry), ''), '(nula)') AS "Vencimiento"
  FROM ecf_sequences s
  JOIN companies c ON c.id = s.company_id
 WHERE s.deleted_at IS NULL AND s.status = 'active' AND c.deleted_at IS NULL
 ORDER BY c.name, s.modo, s.ecf_type;
