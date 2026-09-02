-- =====================================================================
-- CORRECCIÓN DEL BANCO DEL CHEQUE 116  +  REVISIÓN DEL RESTO
-- Empresa 38a1a51e-cb4a-4798-ad19-0f44a7ded32d
-- =====================================================================
--
-- El cheque en garantía 116 (740.792,60, vence 01/09/2026) está registrado
-- contra Banreservas y en realidad es de Scotiabank. El error es de origen:
-- el formulario de compras preseleccionaba el primer banco de la lista.
--
-- IMPORTANTE — el orden importa. La cuenta contable del pago se DERIVA del
-- banco del cheque, así que primero se corrige el banco y sólo después la
-- cuenta. Al revés, se propaga el error.
--
-- Este cheque sigue PENDIENTE, de modo que todavía no ha movido ningún saldo
-- bancario ni generado asiento: la corrección no arrastra nada.
--
-- ESTE SCRIPT ESCRIBE.
-- =====================================================================


-- ── PASO 1 · ANTES ───────────────────────────────────────────────────
SELECT ch.check_number, ch.amount, ch.due_date, ch.status,
       ba.bank_name AS banco_registrado, ba.account_number,
       c.code AS haber_actual, c.name AS haber_nombre
FROM checks ch
JOIN bank_accounts ba      ON ba.id = ch.bank_account_id
LEFT JOIN ap_payments p    ON p.check_id = ch.id
LEFT JOIN chart_of_accounts c ON c.id = p.credit_account_id
WHERE ch.company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
  AND ch.check_number = '116';


-- ── PASO 2 · El cheque 116 pasa a Scotiabank ─────────────────────────
--
-- Sólo si sigue pendiente: un cheque ya cobrado movió saldo y asiento contra
-- el banco equivocado, y eso no se arregla reescribiéndolo.
UPDATE checks ch
SET bank_account_id = ba.id,
    updated_at      = now()
FROM bank_accounts ba
WHERE ch.company_id     = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
  AND ch.check_number   = '116'
  AND ch.status         = 'pending'
  AND ba.company_id     = ch.company_id
  AND ba.account_number = '03219801680'   -- Scotiabank
  AND ch.bank_account_id IS DISTINCT FROM ba.id;


-- ── PASO 3 · La cuenta contable sigue al banco ───────────────────────
--
-- Idéntico al paso 2 de `corregir-pagos-pendientes.sql`. Si aquél ya se
-- ejecutó, este vuelve a alinear el 116 con su banco nuevo; los otros tres no
-- cambian. Es idempotente.
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


-- ── PASO 4 · VERIFICACIÓN ────────────────────────────────────────────
SELECT ch.check_number, ch.due_date, ba.bank_name, p.amount,
       d.code AS debe,  d.is_transactional AS debe_ok,
       c.code AS haber, c.name AS haber_nombre
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
-- Los CUATRO cheques deben quedar ahora con:
--   banco  = Scotiabank      → haber = 1.1.01.04
--   debe   = 2.1.01.01 Cuentas por Pagar Proveedores, debe_ok = true


-- =====================================================================
-- ── PASO 5 · CONTROL SOBRE TODOS LOS CHEQUES ────────────────────────
-- =====================================================================
--
-- Si el 116 tenía el banco equivocado, conviene revisar los demás. Los que ya
-- están COBRADOS son los que preocupan: al aplicarse movieron el saldo de su
-- banco y generaron el asiento contra la cuenta de ese banco. Si alguno estaba
-- mal, hay dinero atribuido a un banco del que nunca salió.
--
-- Revisa esta lista contra los cheques físicos, uno por uno.
SELECT ch.check_number, ch.issue_date, ch.due_date, ch.cleared_date,
       ch.status, ch.is_guarantee, ch.amount, ch.payee,
       ba.bank_name AS banco_registrado, ba.account_number
FROM checks ch
JOIN bank_accounts ba ON ba.id = ch.bank_account_id
WHERE ch.company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
  AND ch.deleted_at IS NULL
ORDER BY ch.issue_date, ch.check_number;

-- Y el movimiento bancario que generó cada cheque ya cobrado, para cotejar
-- contra el estado de cuenta real de cada banco.
SELECT ba.bank_name, bt.date, bt.amount, bt.type, bt.description
FROM bank_transactions bt
JOIN bank_accounts ba ON ba.id = bt.bank_account_id
WHERE bt.company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
  AND bt.description ILIKE '%cheque%'
ORDER BY ba.bank_name, bt.date;
