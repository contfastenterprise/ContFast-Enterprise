-- =====================================================================
-- SALDO DE APERTURA DE BANCOS — COMPROBACIONES PREVIAS AL ASIENTO
-- Empresa 38a1a51e-cb4a-4798-ad19-0f44a7ded32d  ·  modo PRODUCCION
-- =====================================================================
--
-- SOLO LECTURA.
--
-- Se ha decidido que los ajustes bancarios del 29/08 son saldo de apertura y
-- que la contrapartida son Resultados acumulados de ejercicios anteriores.
-- Antes de asentar hay que responder tres preguntas. Si alguna sale mal, el
-- asiento cambia — no lo hagas hasta tenerlas.
-- =====================================================================


-- ── 1 · ¿EXISTE LA CUENTA DE RESULTADOS ACUMULADOS? ──────────────────
--
-- Tiene que ser TRANSACCIONAL, activa y de naturaleza acreedora. Si sólo
-- existe la de agrupación (3.2 o 3.3 sin hijas), hay que crear la hija: postear
-- contra la agrupación es exactamente el error que estamos corrigiendo.
SELECT code, name, type, nature, level, is_transactional, status
FROM chart_of_accounts
WHERE company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
  AND (code LIKE '3%' OR type = 'equity')
  AND deleted_at IS NULL
ORDER BY code;


-- ── 2 · ¿HAY YA UN ASIENTO DE APERTURA? ──────────────────────────────
--
-- ÉSTA ES LA PREGUNTA QUE DECIDE SI EL TRATAMIENTO ES CORRECTO.
--
-- Cargar el saldo de apertura de UN banco contra Resultados acumulados sólo es
-- correcto si el resto del balance de apertura se cargó con el mismo criterio.
-- Si al arrancar el sistema se cargaron inventario y clientes pero no el banco,
-- esto es una omisión y la contrapartida es Resultados acumulados: correcto.
-- Si NO se cargó nada, entonces "Resultados acumulados" no es una cuenta, es un
-- número de cuadre, y el patrimonio del balance deja de significar nada.
--
-- Los diez primeros asientos de la empresa:
SELECT e.date, e.description, e.reference,
       a.code || ' ' || a.name AS cuenta, l.debit, l.credit
FROM journal_entries e
JOIN journal_entry_lines l ON l.journal_entry_id = e.id
JOIN chart_of_accounts a   ON a.id = l.account_id
WHERE e.company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
  AND e.modo = 'PRODUCCION' AND e.deleted_at IS NULL
ORDER BY e.date, e.created_at, a.code
LIMIT 40;

-- Y el saldo actual de las cuentas de patrimonio: si están todas en cero, no
-- hubo apertura de ningún tipo.
SELECT a.code, a.name,
       SUM(l.credit - l.debit) AS saldo_acreedor
FROM journal_entry_lines l
JOIN chart_of_accounts a ON a.id = l.account_id
JOIN journal_entries e   ON e.id = l.journal_entry_id
WHERE l.company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
  AND l.modo = 'PRODUCCION'
  AND e.deleted_at IS NULL AND e.status = 'posted'
  AND (a.code LIKE '3%' OR a.type = 'equity')
GROUP BY a.code, a.name
ORDER BY a.code;


-- ── 3 · ¿CUÁNTO ES, EXACTAMENTE, Y CONTRA QUÉ ESTÁ HOY? ──────────────
--
-- El detalle de los dos movimientos del 29/08 y de las líneas que generaron.
-- De aquí salen las cifras y las cuentas del asiento.
SELECT t.id AS movimiento, t.date, ba.bank_name,
       coa_banco.code || ' ' || coa_banco.name AS cuenta_del_banco,
       t.type, t.amount, t.description,
       e.id AS asiento,
       a.code || ' ' || a.name AS cuenta_de_la_linea,
       a.is_transactional,
       l.debit, l.credit
FROM bank_transactions t
JOIN bank_accounts ba ON ba.id = t.bank_account_id
LEFT JOIN chart_of_accounts coa_banco ON coa_banco.id = ba.chart_account_id
LEFT JOIN journal_entries e     ON e.reference = t.id::text AND e.company_id = t.company_id
LEFT JOIN journal_entry_lines l ON l.journal_entry_id = e.id
LEFT JOIN chart_of_accounts a   ON a.id = l.account_id
WHERE t.company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
  AND t.modo = 'PRODUCCION' AND t.deleted_at IS NULL
  AND t.date >= '2026-08-28'
ORDER BY t.created_at, a.code;


-- ── 4 · EL NÚMERO QUE HAY QUE PODER DEFENDER ─────────────────────────
--
-- El saldo de apertura que se reconoce tiene que ser IGUAL al saldo del estado
-- de cuenta bancario a la fecha de corte. Ni redondeado, ni "aproximadamente".
-- Esta consulta te da lo que el sistema cree hoy; el estado de cuenta lo tienes
-- que poner tú al lado.
SELECT ba.bank_name, ba.account_number,
       COALESCE(b.balance, 0) AS saldo_modulo_bancos,
       COALESCE(SUM(CASE WHEN t.type IN ('deposit','transfer_in')
                         THEN t.amount ELSE -t.amount END), 0) AS suma_de_movimientos
FROM bank_accounts ba
LEFT JOIN bank_account_balances b ON b.bank_account_id = ba.id AND b.modo = 'PRODUCCION'
LEFT JOIN bank_transactions t     ON t.bank_account_id = ba.id AND t.modo = 'PRODUCCION'
                                 AND t.deleted_at IS NULL
WHERE ba.company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
  AND ba.deleted_at IS NULL
GROUP BY ba.bank_name, ba.account_number, b.balance
ORDER BY ba.bank_name;
