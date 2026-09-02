-- =====================================================================
-- CORRECCIÓN DE CUENTAS EN PAGOS PENDIENTES DE COBRO
-- Empresa 38a1a51e-cb4a-4798-ad19-0f44a7ded32d
-- Auditoría contable · hallazgos ARP-02 y JRN-12
-- =====================================================================
--
-- SITUACIÓN
-- ---------
-- Cuatro cheques en garantía siguen pendientes, por 1.641.837,04 en total,
-- con vencimientos entre el 01/09 y el 19/09/2026:
--
--     #116  01/09   740.792,60   Banreservas
--     #121  10/09   678.570,47   Scotiabank
--     #120  17/09    78.381,82   Scotiabank
--     #123  19/09   144.092,15   Scotiabank
--
-- Sus registros de pago guardan estas dos cuentas:
--
--     credit_account_id -> 1.1.02  Cuentas por Cobrar   (debía ser el banco)
--     debit_account_id  -> 2.1.01  Cuentas por Pagar    (cuenta de AGRUPACIÓN)
--
-- El origen es el código de registro de compras, que pedía la cuenta '1.1.02'
-- llamándola "Efectivo en Bancos" -- nombre heredado de un plan de cuentas de
-- tres niveles --, mientras que en el catálogo real 1.1.02 es Cuentas por
-- Cobrar. La resolución de cuentas buscaba por código e ignoraba el nombre.
--
-- POR QUÉ CORREGIRLO AHORA
-- ------------------------
-- El asiento de un cheque en garantía NO se registra al emitirlo, sino al
-- cobrarlo, y se construye con las dos cuentas tal como estén guardadas en ese
-- momento. Corregirlas antes del vencimiento es la diferencia entre que se
-- contabilicen correctamente por sí solos, o sumar 1.641.837,04 al error ya
-- existente y tener que reclasificarlo después.
--
-- ALCANCE
-- -------
-- Sólo pagos con estado `pending_guarantee` y cheque `pending`. Los pagos ya
-- aplicados NO se tocan: el historial se corrige con asientos de
-- reclasificación, nunca reescribiendo registros pasados.
--
-- Ambas sentencias son idempotentes: ejecutarlas dos veces no cambia nada.
--
-- ESTE SCRIPT ESCRIBE. Ejecute paso por paso y revise entre uno y otro.
-- Si desea atomicidad, envuelva los pasos 2 y 3 en BEGIN; ... COMMIT;
-- =====================================================================


-- ── PASO 1 · ESTADO ACTUAL ───────────────────────────────────────────
SELECT ch.check_number, ch.due_date, ba.bank_name, p.amount,
       d.code AS debe_actual,  d.name AS debe_nombre,
       c.code AS haber_actual, c.name AS haber_nombre,
       p.id AS pago_id
FROM ap_payments p
JOIN checks ch            ON ch.id = p.check_id
JOIN bank_accounts ba     ON ba.id = ch.bank_account_id
JOIN chart_of_accounts d  ON d.id  = p.debit_account_id
JOIN chart_of_accounts c  ON c.id  = p.credit_account_id
WHERE p.company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
  AND p.status  = 'pending_guarantee'
  AND ch.status = 'pending'
ORDER BY ch.due_date;


-- ── PASO 2 · HABER: la cuenta contable del banco de cada cheque ──────
--
-- Cada cheque sale de un banco concreto, de modo que la cuenta se toma del
-- enlace `bank_accounts.chart_account_id` de ESA cuenta bancaria (migración
-- 0039), no de una cuenta genérica.
UPDATE ap_payments p
SET credit_account_id = ba.chart_account_id,
    updated_at        = now()
FROM checks ch
JOIN bank_accounts ba ON ba.id = ch.bank_account_id
WHERE p.check_id   = ch.id
  AND p.company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
  AND p.status     = 'pending_guarantee'
  AND ch.status    = 'pending'
  AND ba.chart_account_id IS NOT NULL
  AND p.credit_account_id IS DISTINCT FROM ba.chart_account_id;


-- ── PASO 3 · DEBE: la cuenta transaccional de proveedores ────────────
--
-- 2.1.01 es cuenta de agrupación y no admite movimientos: postear contra ella
-- duplica el saldo entre padre e hija. La cuenta correcta, 2.1.01.01 "Cuentas
-- por Pagar Proveedores", ya existe en el catálogo y es transaccional.
UPDATE ap_payments p
SET debit_account_id = cxp.id,
    updated_at       = now()
FROM checks ch,
     chart_of_accounts cxp
WHERE p.check_id   = ch.id
  AND p.company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
  AND p.status     = 'pending_guarantee'
  AND ch.status    = 'pending'
  AND cxp.company_id      = p.company_id
  AND cxp.code            = '2.1.01.01'
  AND cxp.is_transactional = true
  AND cxp.status          = 'active'
  AND cxp.deleted_at IS NULL
  AND p.debit_account_id IS DISTINCT FROM cxp.id;


-- ── PASO 4 · VERIFICACIÓN ────────────────────────────────────────────
SELECT ch.check_number, ch.due_date, ba.bank_name, p.amount,
       d.code AS debe,  d.name AS debe_nombre,  d.is_transactional AS debe_ok,
       c.code AS haber, c.name AS haber_nombre, c.is_transactional AS haber_ok
FROM ap_payments p
JOIN checks ch            ON ch.id = p.check_id
JOIN bank_accounts ba     ON ba.id = ch.bank_account_id
JOIN chart_of_accounts d  ON d.id  = p.debit_account_id
JOIN chart_of_accounts c  ON c.id  = p.credit_account_id
WHERE p.company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
  AND p.status  = 'pending_guarantee'
  AND ch.status = 'pending'
ORDER BY ch.due_date;
--
-- RESULTADO ESPERADO — las cuatro filas:
--
--   debe   = 2.1.01.01  Cuentas por Pagar Proveedores   · debe_ok  = true
--   haber  = 1.1.01.03  Banco de Reservas   (cheque 116)
--            1.1.01.04  Scotiabank          (cheques 120, 121, 123)
--                                                        · haber_ok = true
--
-- Ninguna debe mostrar 1.1.02 ni 2.1.01. Si alguna lo hace, no continúe.


-- ── PASO 5 · CONTROL: que no queden otros pagos pendientes mal ───────
--
-- Cualquier pago pendiente cuya cuenta de haber no sea la del banco de su
-- cheque, o cuyo debe sea una cuenta de agrupación.
SELECT ch.check_number, ba.bank_name, p.amount,
       d.code AS debe, c.code AS haber,
       CASE WHEN NOT d.is_transactional THEN 'debe en cuenta de agrupación'
            WHEN c.id IS DISTINCT FROM ba.chart_account_id THEN 'haber no es el banco del cheque'
       END AS problema
FROM ap_payments p
JOIN checks ch            ON ch.id = p.check_id
JOIN bank_accounts ba     ON ba.id = ch.bank_account_id
JOIN chart_of_accounts d  ON d.id  = p.debit_account_id
JOIN chart_of_accounts c  ON c.id  = p.credit_account_id
WHERE p.company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
  AND p.status  = 'pending_guarantee'
  AND ch.status = 'pending'
  AND (NOT d.is_transactional OR c.id IS DISTINCT FROM ba.chart_account_id);
-- Debe devolver cero filas.
