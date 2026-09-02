-- ============================================================================
--  FECHAS DE VENCIMIENTO DE LAS SECUENCIAS e-CF: QUE FALTA DE VERDAD
-- ============================================================================
--
--  ESTE FICHERO PEDIA UN DATO QUE NO EXISTE
--  ----------------------------------------
--  La version anterior daba por hecho que el e-32 y el e-34 estaban
--  "incompletos" por no tener `sequence_expiry`, y pedia cargar sus fechas de
--  autorizacion SACF a mano.
--
--  Es falso, y lo corrigio el cliente. La DGII marca
--  `FechaVencimientoSecuencia` como **No Aplica** en el e-32 (Consumo), el
--  e-34 (Nota de Credito) y el e-47. En esos tres el campo NO VA en el
--  documento: no tener fecha es el estado correcto, no un hueco.
--
--      Obligatorio : 31, 33, 41, 43, 44, 45, 46
--      No Aplica   : 32, 34, 47
--
--  Fuente: DGII, "Formato Comprobante Fiscal Electronico (e-CF) v1.0",
--  seccion IdDoc, campo 4. Coincide con los ejemplos de mSeller, que omiten el
--  campo justo en el 32 y el 34.
--
--  QUE HACE AHORA
--  --------------
--  Solo MIRA. No escribe nada. Lista cada secuencia activa y dice si su fecha
--  esta como debe estar:
--
--      FALTA        el tipo la exige y no la tiene  -> no se puede emitir
--      VENCIDA      la tiene, pero ya paso          -> renovar en la DGII
--      OK           la tiene y esta vigente
--      NO APLICA    el tipo no la lleva (32/34/47)  -> vacia es lo correcto
--
--  Lo que salga como FALTA es lo unico que hay que cargar, y se carga desde
--  Ajustes > Secuencias con la fecha que diga la autorizacion SACF -- no desde
--  aqui, para que quede el registro de quien la puso.
--
--  POR QUE IMPORTA QUE ESTO NO ESCRIBA
--  -----------------------------------
--  La fecha que va en el comprobante tiene que ser la de la autorizacion real.
--  Una migracion no puede saberla: solo puede copiar lo que alguien le diga, y
--  entonces el error queda escrito sin que nadie lo revise. Es el mismo patron
--  que el `'31-12-2026'` que origino todo esto.
-- ============================================================================

WITH exigencia(ecf_type, aplica) AS (
  VALUES ('31', true),  ('32', false), ('33', true),  ('34', false),
         ('41', true),  ('43', true),  ('44', true),  ('45', true),
         ('46', true),  ('47', false)
)
SELECT c.name                                        AS "Empresa",
       s.modo                                        AS "Modo",
       'e-' || s.ecf_type                            AS "Tipo",
       coalesce(nullif(btrim(s.sequence_expiry), ''), '(vacia)') AS "Vencimiento",
       CASE
         -- Con fecha cargada se dice, porque NO es inofensivo: los validadores
         -- (`ecfValidator` y `companyRepository`) bloquean la emision cuando la
         -- fecha pasa, sin mirar el tipo. Una fecha que la DGII no usa para
         -- este comprobante puede aun asi impedir facturar.
         WHEN e.aplica IS NOT TRUE AND nullif(btrim(s.sequence_expiry), '') IS NOT NULL
           THEN 'NO APLICA pero TIENE fecha (' || s.sequence_expiry || ') - bloqueara la emision al pasar'
         WHEN e.aplica IS NOT TRUE THEN 'NO APLICA - vacia es lo correcto'
         WHEN nullif(btrim(s.sequence_expiry), '') IS NULL
           THEN 'FALTA - este tipo la exige; no se puede emitir'
         WHEN to_date(s.sequence_expiry, 'DD-MM-YYYY') < current_date
           THEN 'VENCIDA el ' || s.sequence_expiry || ' - renovar SACF'
         ELSE 'OK'
       END                                           AS "Estado",
       s.current_sequence                            AS "Actual",
       s.max_sequence                                AS "Maxima"
  FROM ecf_sequences s
  JOIN companies c ON c.id = s.company_id
  LEFT JOIN exigencia e ON e.ecf_type = s.ecf_type
 WHERE s.deleted_at IS NULL
   AND s.status = 'active'
   AND c.deleted_at IS NULL
 ORDER BY c.name, s.modo, s.ecf_type;


-- ----------------------------------------------------------------------------
-- El resumen: cuantas bloquean la emision hoy.
-- ----------------------------------------------------------------------------
DO $fechas$
DECLARE
  v_faltan integer;
  v_vencidas integer;
  v_detalle text;
BEGIN
  SELECT count(*), string_agg(DISTINCT 'e-' || ecf_type, ', ')
    INTO v_faltan, v_detalle
    FROM ecf_sequences s
   WHERE s.deleted_at IS NULL
     AND s.status = 'active'
     AND s.ecf_type IN ('31', '33', '41', '43', '44', '45', '46')
     AND nullif(btrim(s.sequence_expiry), '') IS NULL;

  SELECT count(*) INTO v_vencidas
    FROM ecf_sequences s
   WHERE s.deleted_at IS NULL
     AND s.status = 'active'
     AND s.ecf_type IN ('31', '33', '41', '43', '44', '45', '46')
     AND nullif(btrim(s.sequence_expiry), '') IS NOT NULL
     AND to_date(s.sequence_expiry, 'DD-MM-YYYY') < current_date;

  IF v_faltan = 0 THEN
    RAISE NOTICE 'Ninguna secuencia bloquea la emision por falta de fecha.';
  ELSE
    RAISE NOTICE '% secuencia(s) SIN fecha en tipos que la exigen (%). Cargarlas en Ajustes > Secuencias.',
      v_faltan, v_detalle;
  END IF;

  IF v_vencidas > 0 THEN
    RAISE NOTICE '% secuencia(s) con la autorizacion YA VENCIDA. Renovar el SACF en la DGII.', v_vencidas;
  END IF;

  RAISE NOTICE 'El e-32, el e-34 y el e-47 sin fecha NO son un problema: su formato no lleva el campo.';
END $fechas$;
