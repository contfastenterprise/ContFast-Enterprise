-- =====================================================================
-- ABRIR PERÍODOS CONTABLES — agosto a diciembre de 2026
-- Empresa 1d731da2-3885-4252-a45b-305b969172a7 · entorno PRODUCCION
-- =====================================================================
--
-- POR QUÉ: esa empresa sólo tiene definido el período 07/2026. Desde el 1 de
-- agosto no puede contabilizar nada: `isPeriodOpen` busca un período abierto
-- que contenga la fecha, no lo encuentra, y todo lo que genera asiento aborta
-- con "El periodo contable para la fecha ... está cerrado o no existe".
-- El auto-bootstrap que crea un período sobre la marcha SÓLO actúa cuando la
-- empresa no tiene ninguno, así que aquí no se dispara.
--
-- Afecta a: emisión de facturas, compras y gastos, pagos a proveedores y
-- movimientos bancarios. Los cobros de clientes NO fallan, porque construyen
-- el asiento a mano y se saltan la validación (hallazgo JRN-05, aún abierto).
--
-- ESTE SCRIPT SÍ ESCRIBE. Es el único de la auditoría que lo hace. Ejecuta
-- primero el paso 1, revisa, y sólo entonces el paso 2.
--
-- Nombres en formato MM/AAAA, el mismo que usa el sistema.
-- =====================================================================


-- ── PASO 1 · ANTES: qué hay hoy ──────────────────────────────────────
SELECT company_id, modo, name, start_date, end_date, status
FROM accounting_periods
WHERE company_id = '1d731da2-3885-4252-a45b-305b969172a7'
ORDER BY modo, start_date;


-- ── PASO 2 · Crear los períodos que falten ───────────────────────────
--
-- El NOT EXISTS hace la operación repetible: si vuelves a ejecutarla no
-- duplica nada. `accounting_periods` no tiene índice único que lo impida,
-- de modo que la guarda va en la consulta.
-- `modo` es un enum (`environment_mode`), no texto: el cast es obligatorio.
INSERT INTO accounting_periods (company_id, modo, name, start_date, end_date, status)
SELECT v.company_id, v.modo::environment_mode, v.name, v.start_date::date, v.end_date::date, 'open'
FROM (VALUES
  ('1d731da2-3885-4252-a45b-305b969172a7'::uuid, 'PRODUCCION', '08/2026', '2026-08-01', '2026-08-31'),
  ('1d731da2-3885-4252-a45b-305b969172a7'::uuid, 'PRODUCCION', '09/2026', '2026-09-01', '2026-09-30'),
  ('1d731da2-3885-4252-a45b-305b969172a7'::uuid, 'PRODUCCION', '10/2026', '2026-10-01', '2026-10-31'),
  ('1d731da2-3885-4252-a45b-305b969172a7'::uuid, 'PRODUCCION', '11/2026', '2026-11-01', '2026-11-30'),
  ('1d731da2-3885-4252-a45b-305b969172a7'::uuid, 'PRODUCCION', '12/2026', '2026-12-01', '2026-12-31')
) AS v(company_id, modo, name, start_date, end_date)
WHERE NOT EXISTS (
  SELECT 1 FROM accounting_periods p
  WHERE p.company_id = v.company_id
    AND p.modo::text = v.modo
    AND p.start_date = v.start_date::date
);


-- ── PASO 3 · DESPUÉS: comprobar el resultado ─────────────────────────
SELECT company_id, modo, name, start_date, end_date, status
FROM accounting_periods
WHERE company_id = '1d731da2-3885-4252-a45b-305b969172a7'
ORDER BY modo, start_date;

-- Y la comprobación que de verdad importa: ¿hay período abierto para hoy?
SELECT count(*) AS periodos_abiertos_para_hoy
FROM accounting_periods
WHERE company_id = '1d731da2-3885-4252-a45b-305b969172a7'
  AND modo = 'PRODUCCION'
  AND status = 'open'
  AND CURRENT_DATE BETWEEN start_date AND end_date;
-- Debe devolver 1. Si devuelve 0, no ejecutes nada más y avisa.


-- =====================================================================
-- NOTAS
-- =====================================================================
--
-- 1. La otra empresa (38a1a51e…) no necesita nada: su período "periodo 2026"
--    cubre del 1 de agosto al 31 de diciembre. Pero el 1 de enero de 2027 se
--    quedará igual que ésta, porque nadie crea los períodos del año siguiente.
--
-- 2. Julio quedó CERRADO en la empresa 38a1a51e el 1 de agosto, con su
--    `closed_by` registrado. Ojo: ese cierre no es hermético. Los recibos de
--    cobro y los movimientos bancarios insertan el asiento directamente, sin
--    pasar por la validación de período, así que todavía se pueden inyectar
--    asientos con fecha de julio por esas dos vías (JRN-05 / DB-05, Fase 2.5).
--
-- 3. Esto es un parche de datos, no la solución. La solución es sembrar los
--    períodos al crear la empresa y convertir el auto-bootstrap en un error
--    explícito, en vez de que el control se cree a sí mismo en silencio
--    (JRN-11, Fase 2.8). Mientras eso no esté, hay que acordarse de abrir el
--    año cada enero.
--
-- 4. En el entorno PRUEBA ninguna de las dos empresas tiene períodos, de modo
--    que ahí sí actúa el auto-bootstrap y no hace falta tocar nada.
