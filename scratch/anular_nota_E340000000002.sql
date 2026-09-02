-- ============================================================================
--  E340000000002 — MIRAR PRIMERO, Y BORRAR SOLO SI DE VERDAD HACE FALTA
-- ============================================================================
--
--  LEE ESTO ANTES DE EJECUTAR NADA
--  -------------------------------
--  Si esa nota la rechazo la DGII, lo normal NO es borrarla.
--
--  El e-NCF se reserva ANTES de enviar (auditoria DB-04), asi que ese numero ya
--  esta consumido pase lo que pase. La fila con estado `rejected` es lo que
--  EXPLICA por que existe ese numero y por que no hay comprobante detras. Si se
--  borra, queda un hueco en la secuencia sin ninguna constancia -- y ante una
--  fiscalizacion un hueco sin explicar es peor que un rechazo documentado.
--
--  Lo habitual es: dejarla como esta, y emitir una nota NUEVA con el siguiente
--  numero una vez corregido el payload.
--
--  Borrala solo si es basura que ensucio produccion -- por ejemplo una prueba
--  emitida por error contra el ambiente real -- y aun asi, con borrado SUAVE.
--
--  POR QUE SUAVE Y NO `DELETE`
--  ---------------------------
--  Diez tablas referencian una factura (lineas, impuestos, envios, cuentas por
--  cobrar, movimientos de caja e inventario, notas, conduces, retenciones). Un
--  `DELETE` o falla por las claves foraneas o arrastra el rastro entero. El
--  sistema usa `deleted_at` en todas partes justo para esto: la fila deja de
--  contar en todos los listados y calculos, pero sigue ahi para explicar el
--  numero.
--
--  QUE HACE ESTE FICHERO
--  ---------------------
--  El bloque 1 SOLO MIRA. Ejecutalo primero y mandame el resultado.
--  El bloque 2 esta COMENTADO a proposito: descomentalo solo si, viendo el
--  bloque 1, decides que hay que retirarla.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  BLOQUE 1 — QUE ES Y QUE TIENE COLGANDO. No escribe nada.
-- ----------------------------------------------------------------------------
SELECT i.ncf                                        AS "e-NCF",
       'e-' || i.ecf_type                           AS "Tipo",
       i.modo                                       AS "Modo",
       i.status                                     AS "Estado",
       to_char(i.created_at, 'DD-MM-YYYY HH24:MI')  AS "Emitida",
       i.total                                      AS "Total",
       coalesce(i.modified_ncf, '(ninguno)')        AS "Modifica al NCF",
       coalesce(i.security_code, '(nulo)')          AS "Cod. seguridad",
       CASE WHEN i.deleted_at IS NULL THEN 'activa' ELSE 'ya anulada' END AS "Situacion",
       left(coalesce(i.dgii_message, '(nulo)'), 160) AS "Mensaje de la DGII",
       -- Lo que arrastra. Si algo de esto no es 0, hay efectos que revisar.
       (SELECT count(*) FROM invoice_lines        x WHERE x.invoice_id = i.id) AS "Lineas",
       (SELECT count(*) FROM invoice_taxes        x WHERE x.invoice_id = i.id) AS "Impuestos",
       (SELECT count(*) FROM dgii_submissions     x WHERE x.invoice_id = i.id) AS "Envios",
       (SELECT count(*) FROM accounts_receivable  x WHERE x.invoice_id = i.id) AS "Cta. por cobrar",
       (SELECT count(*) FROM cash_movements       x WHERE x.invoice_id = i.id) AS "Mov. de caja",
       (SELECT count(*) FROM inventory_movements  x WHERE x.invoice_id = i.id) AS "Mov. de inventario",
       (SELECT count(*) FROM credit_debit_notes   x WHERE x.invoice_id = i.id) AS "Enlaces de nota"
  FROM invoices i
 WHERE i.ncf = 'E340000000002';


-- ----------------------------------------------------------------------------
--  BLOQUE 2 — RETIRARLA. Descomentar solo si el bloque 1 lo justifica.
--
--  Marca la nota como anulada y deja escrito POR QUE. No borra ninguna fila:
--  el numero sigue siendo explicable.
--
--  Se niega a correr si la nota arrastra cuentas por cobrar, movimientos de
--  caja o de inventario: eso significa que tuvo efectos contables y retirarla a
--  secas los dejaria descuadrados. En ese caso hay que deshacerlos primero, y
--  eso se decide mirando, no con un script generico.
-- ----------------------------------------------------------------------------

/*
DO $anular$
DECLARE
  v_id uuid;
  v_estado text;
  v_efectos integer;
BEGIN
  SELECT id, status INTO v_id, v_estado
    FROM invoices WHERE ncf = 'E340000000002' AND deleted_at IS NULL;

  IF v_id IS NULL THEN
    RAISE NOTICE 'No hay ninguna E340000000002 activa. Nada que hacer.';
    RETURN;
  END IF;

  SELECT (SELECT count(*) FROM accounts_receivable WHERE invoice_id = v_id)
       + (SELECT count(*) FROM cash_movements      WHERE invoice_id = v_id)
       + (SELECT count(*) FROM inventory_movements WHERE invoice_id = v_id)
    INTO v_efectos;

  IF v_efectos > 0 THEN
    RAISE EXCEPTION
      'La nota arrastra % efecto(s) contables. Retirarla asi dejaria descuadrado el saldo o el inventario: revisar antes.',
      v_efectos;
  END IF;

  UPDATE invoices
     SET deleted_at = now(),
         dgii_message = coalesce(dgii_message || ' | ', '')
                        || 'Retirada manualmente el ' || to_char(now(), 'DD-MM-YYYY')
                        || '. El e-NCF queda consumido y sin comprobante: no se reutiliza.',
         updated_at = now()
   WHERE id = v_id;

  RAISE NOTICE 'E340000000002 retirada (estaba en %). El numero NO se reutiliza.', v_estado;
  RAISE NOTICE 'La siguiente nota sale con el numero que siga en la secuencia.';
END $anular$;

SELECT ncf AS "e-NCF", status AS "Estado",
       CASE WHEN deleted_at IS NULL THEN 'activa' ELSE 'retirada' END AS "Situacion"
  FROM invoices WHERE ncf = 'E340000000002';
*/
