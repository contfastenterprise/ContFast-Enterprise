-- ============================================================================
--  E340000000002: ESTA COMO "ENVIADA" Y LA DGII LA RECHAZO
-- ============================================================================
--
--  QUE PASO
--  --------
--  mSeller rechazo la nota por la estructura del XML y contesto asi:
--
--      {"trackId": null,
--       "error":   "Estructura del archivo XML invalida. ",
--       "mensaje": "The element 'Totales' has invalid child element
--                   'MontoExento'. List of possible elements expected: ..."}
--
--  HTTP 200, sin `status`, sin `estado`, sin `dgiiResponse`. El sistema busca
--  el veredicto en esos campos, no lo encuentra, y concluye "enviado, pendiente
--  de confirmar". El motivo real estaba en `error` y `mensaje`, dos campos que
--  no se miraban.
--
--  Ya esta corregido en el codigo: el rechazo se busca DENTRO de la respuesta.
--  Pero la fila que quedo mal no se arregla sola.
--
--  POR QUE IMPORTA MAS DE LO QUE PARECE
--  ------------------------------------
--  Mientras la nota figure como 'submitted', el buscador la cuenta como un
--  ajuste EN VUELO y deja fuera a su factura -- E310000000020 -- para que nadie
--  emita una segunda nota sobre lo mismo. Eso es lo correcto para una nota que
--  puede acabar aceptandose; solo que esta no puede: ya fue rechazada.
--
--  Por eso la factura no aparece en el buscador aunque el filtro este arreglado.
--
--  QUE HACE ESTO
--  -------------
--  Deja la nota en el estado que le corresponde -- `rejected` -- con el motivo
--  real escrito. No borra nada, no toca la factura, no libera ningun numero: el
--  e-NCF de la nota sigue consumido, que es lo que la DGII espera.
--
--  Al terminar, E310000000020 vuelve a aparecer y se le puede emitir la nota
--  con el siguiente numero.
--
--  Es seguro correrlo dos veces.
-- ============================================================================

DO $corregir$
DECLARE
  v_id uuid;
  v_estado text;
  v_factura text;
BEGIN
  SELECT i.id, i.status, f.ncf
    INTO v_id, v_estado, v_factura
    FROM invoices i
    LEFT JOIN invoices f ON f.id = i.modified_invoice_id
   WHERE i.ncf = 'E340000000002' AND i.deleted_at IS NULL;

  IF v_id IS NULL THEN
    RAISE NOTICE 'No existe E340000000002 activa. Nada que hacer.';
    RETURN;
  END IF;

  IF v_estado = 'rejected' THEN
    RAISE NOTICE 'E340000000002 ya figura como rechazada. Nada que cambiar.';
    RETURN;
  END IF;

  IF v_estado <> 'submitted' THEN
    RAISE EXCEPTION
      'E340000000002 esta en "%", no en "submitted". Esto solo corrige el caso conocido: revisar antes de tocarla.',
      v_estado;
  END IF;

  UPDATE invoices
     SET status = 'rejected',
         dgii_message =
           'Rechazado por la DGII: Estructura del archivo XML invalida. '
           || 'The element ''Totales'' has invalid child element ''MontoExento''. '
           || '(Corregido a mano: la respuesta no traia campo de estado y el sistema '
           || 'la habia guardado como enviada.)',
         updated_at = now()
   WHERE id = v_id;

  UPDATE dgii_submissions
     SET status = 'rejected',
         updated_at = now()
   WHERE invoice_id = v_id
     AND status = 'submitted';

  RAISE NOTICE 'E340000000002 queda como RECHAZADA.';
  IF v_factura IS NOT NULL THEN
    RAISE NOTICE 'La factura % vuelve a estar libre para emitirle una nota.', v_factura;
  END IF;
  RAISE NOTICE 'El e-NCF de la nota sigue consumido: la siguiente sale con el numero que toque.';
END $corregir$;

-- Como queda: la nota, y la factura que tenia bloqueada.
SELECT i.ncf                     AS "e-NCF",
       'e-' || i.ecf_type        AS "Tipo",
       i.status                  AS "Estado",
       coalesce(f.ncf, '-')      AS "Modifica a",
       coalesce(f.status, '-')   AS "Estado de esa factura",
       left(coalesce(i.dgii_message, '-'), 90) AS "Mensaje"
  FROM invoices i
  LEFT JOIN invoices f ON f.id = i.modified_invoice_id
 WHERE i.ncf IN ('E340000000002', 'E310000000020')
   AND i.deleted_at IS NULL;
