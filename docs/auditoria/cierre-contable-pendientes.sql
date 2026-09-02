-- =====================================================================
-- CIERRE DE LOS TRES PENDIENTES CONTABLES
-- Empresa 38a1a51e-cb4a-4798-ad19-0f44a7ded32d  ·  modo PRODUCCION
-- =====================================================================
--
-- SOLO LECTURA. Ninguna consulta de este archivo modifica datos.
--
-- Lo que hace: producir las cifras exactas que necesitas para asentar las
-- correcciones. Los asientos NO se hacen aquí. Se hacen en
--
--     Dashboard > Contabilidad > Nuevo Asiento
--
-- y por una razón de control interno, no de comodidad: por esa vía el asiento
-- queda con su usuario, pasa por la validación de período abierto, por la de
-- cuadre y por las invariantes nuevas (sin negativos, sin debe-y-haber en la
-- misma línea, sin todas las líneas contra la misma cuenta). Un UPDATE en el
-- editor de SQL no deja ninguna de esas huellas, y lo que se está corrigiendo
-- es precisamente un problema de trazabilidad.
--
-- REGLA QUE NO SE ROMPE: los asientos originales NO se tocan. Están en un
-- período cerrado. La corrección se registra con fecha de HOY, en el período
-- abierto, como asiento de reclasificación. El error queda visible y la
-- corrección también. Así es como se audita.
--
-- ORDEN: ejecuta el BLOQUE C primero. El cotejo de los cheques físicos
-- determina cuáles están cobrados, y eso decide la contrapartida del BLOQUE A.
-- =====================================================================


-- =====================================================================
-- BLOQUE C · COTEJO DE CHEQUES CONTRA LOS FÍSICOS  (hazlo primero)
-- =====================================================================

-- C.1  Listado para imprimir y cotejar contra el talonario.
--      Compara UNA A UNA: número, banco, beneficiario, monto y fecha.
SELECT ba.bank_name,
       ba.account_number,
       c.check_number,
       c.issue_date,
       c.due_date,
       c.payee,
       c.amount,
       c.is_guarantee,
       c.status,
       c.cleared_date,
       s.business_name AS proveedor_del_ap
FROM checks c
JOIN bank_accounts ba ON ba.id = c.bank_account_id
LEFT JOIN accounts_payable ap ON ap.id = c.ap_id
LEFT JOIN suppliers s ON s.id = ap.supplier_id
WHERE c.company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
  AND c.modo = 'PRODUCCION'
  AND c.deleted_at IS NULL
ORDER BY ba.bank_name, c.check_number::text;


-- C.2  Saltos en la numeración por banco.
--      Un salto significa una de tres cosas, y las tres hay que resolverlas:
--      un cheque emitido y no registrado, un cheque anulado sin marcar, o un
--      cheque que se registró contra el banco equivocado (el caso del 116).
WITH numerados AS (
  SELECT ba.bank_name,
         c.check_number,
         CASE WHEN c.check_number ~ '^[0-9]+$' THEN c.check_number::bigint END AS n
  FROM checks c
  JOIN bank_accounts ba ON ba.id = c.bank_account_id
  WHERE c.company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
    AND c.modo = 'PRODUCCION' AND c.deleted_at IS NULL
)
SELECT bank_name,
       n                                        AS desde,
       LEAD(n) OVER (PARTITION BY bank_name ORDER BY n) AS hasta,
       LEAD(n) OVER (PARTITION BY bank_name ORDER BY n) - n - 1 AS cheques_que_faltan
FROM numerados
WHERE n IS NOT NULL
ORDER BY bank_name, n;
-- Interesan sólo las filas con `cheques_que_faltan` > 0.


-- C.3  Cheques cuyo asiento contable NO coincide con el banco declarado.
--      Ésta es la firma exacta del error del cheque 116: el formulario
--      preseleccionaba el primer banco de la lista, de modo que el cheque
--      quedaba emitido contra un banco y contabilizado contra otro.
SELECT c.check_number,
       ba.bank_name                AS banco_del_cheque,
       coa_banco.code || ' ' || coa_banco.name AS cuenta_contable_del_banco,
       coa_credito.code || ' ' || coa_credito.name AS cuenta_acreditada_en_el_pago,
       c.amount,
       c.status,
       p.status                    AS estado_del_pago
FROM checks c
JOIN bank_accounts ba              ON ba.id = c.bank_account_id
LEFT JOIN chart_of_accounts coa_banco   ON coa_banco.id = ba.chart_account_id
LEFT JOIN ap_payments p            ON p.check_id = c.id
LEFT JOIN chart_of_accounts coa_credito ON coa_credito.id = p.credit_account_id
WHERE c.company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
  AND c.modo = 'PRODUCCION' AND c.deleted_at IS NULL
  AND (ba.chart_account_id IS DISTINCT FROM p.credit_account_id)
ORDER BY c.check_number::text;
-- Toda fila que aparezca aquí está contabilizada contra un banco que no es el
-- suyo. Si el cheque físico dice Scotiabank, manda el cheque físico.


-- =====================================================================
-- BLOQUE A · LOS PAGOS DE CHEQUES EN GARANTÍA YA ASENTADOS
-- =====================================================================
--
-- Lo que pasó: el flujo de compra con cheque en garantía resolvía la cuenta de
-- salida con `getOrCreateAccount(tx, companyId, '1.1.02', 'Efectivo en Bancos')`,
-- que busca por CÓDIGO y desprecia el nombre. En este catálogo 1.1.02 no es
-- "Efectivo en Bancos": es CUENTAS POR COBRAR. El asiento quedó:
--
--     Debe   Cuentas por Pagar        X
--     Haber  Cuentas por Cobrar       X      ← el banco nunca se acreditó
--
-- La deuda con el proveedor bajó bien. Lo que está mal es el otro lado: se
-- redujo el saldo de lo que le deben a la empresa sin que ningún cliente pagara
-- nada. El mayor de CxC dejó de cuadrar con el auxiliar de clientes.

-- A.1  Los pagos afectados, uno por uno, con su cheque y su estado.
SELECT p.id                        AS pago_id,
       p.payment_date,
       p.amount,
       p.status                    AS estado_pago,
       cd.code || ' ' || cd.name   AS debita,
       cc.code || ' ' || cc.name   AS acredita,
       cc.is_transactional         AS acreditada_admite_movimientos,
       c.check_number,
       c.status                    AS estado_cheque,
       c.cleared_date,
       ba.bank_name,
       s.business_name             AS proveedor
FROM ap_payments p
JOIN chart_of_accounts cd ON cd.id = p.debit_account_id
JOIN chart_of_accounts cc ON cc.id = p.credit_account_id
LEFT JOIN checks c        ON c.id = p.check_id
LEFT JOIN bank_accounts ba ON ba.id = c.bank_account_id
JOIN accounts_payable ap  ON ap.id = p.ap_id
LEFT JOIN suppliers s     ON s.id = ap.supplier_id
WHERE p.company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
  AND p.modo = 'PRODUCCION'
  AND (cc.code IN ('1.1.02') OR cc.is_transactional = false)
ORDER BY p.payment_date, c.check_number::text;


-- A.2  ESTAS SON LAS CIFRAS DEL ASIENTO.
--      Separadas por cuenta mal acreditada y por estado del cheque, porque la
--      contrapartida correcta depende de si el cheque ya se cobró o no.
SELECT cc.code || ' ' || cc.name AS cuenta_mal_acreditada,
       CASE
         WHEN c.status = 'cleared' THEN 'COBRADO — va contra el banco'
         WHEN c.id IS NULL         THEN 'sin cheque — revisar uno a uno'
         ELSE                           'NO COBRADO — va contra pasivo de cheques'
       END                       AS tratamiento,
       ba.bank_name,
       count(*)                  AS n_pagos,
       SUM(p.amount)             AS importe
FROM ap_payments p
JOIN chart_of_accounts cc ON cc.id = p.credit_account_id
LEFT JOIN checks c        ON c.id = p.check_id
LEFT JOIN bank_accounts ba ON ba.id = c.bank_account_id
WHERE p.company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
  AND p.modo = 'PRODUCCION'
  AND p.status <> 'voided'
  AND (cc.code IN ('1.1.02') OR cc.is_transactional = false)
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;


-- A.3  LA PRUEBA. Mayor de Cuentas por Cobrar contra el auxiliar de clientes.
--      La diferencia tiene que ser exactamente el importe del bloque A.2 que
--      fue a parar a 1.1.02. Si coincide, el diagnóstico está confirmado y el
--      asiento de A.2 lo cierra. Si no coincide, hay algo más y hay que
--      buscarlo antes de asentar nada.
WITH mayor AS (
  SELECT COALESCE(SUM(l.debit - l.credit), 0) AS saldo_mayor
  FROM journal_entry_lines l
  JOIN chart_of_accounts a ON a.id = l.account_id
  JOIN journal_entries e   ON e.id = l.journal_entry_id
  WHERE l.company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
    AND l.modo = 'PRODUCCION'
    AND e.deleted_at IS NULL AND e.status = 'posted'
    AND a.code LIKE '1.1.02%'
),
auxiliar AS (
  SELECT COALESCE(SUM(balance), 0) AS saldo_auxiliar
  FROM accounts_receivable
  WHERE company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
    AND modo = 'PRODUCCION' AND deleted_at IS NULL
)
SELECT saldo_mayor, saldo_auxiliar, saldo_auxiliar - saldo_mayor AS diferencia
FROM mayor, auxiliar;


-- =====================================================================
-- BLOQUE B · LOS DOS AJUSTES BANCARIOS DEL 29/08
-- =====================================================================

-- B.1  Los movimientos y el asiento que generó cada uno.
SELECT t.date, ba.bank_name, t.type, t.amount, t.description, t.reference,
       e.id  AS asiento,
       a.code || ' ' || a.name AS cuenta,
       a.is_transactional,
       l.debit, l.credit
FROM bank_transactions t
JOIN bank_accounts ba      ON ba.id = t.bank_account_id
LEFT JOIN journal_entries e      ON e.reference = t.id::text
                                AND e.company_id = t.company_id
LEFT JOIN journal_entry_lines l  ON l.journal_entry_id = e.id
LEFT JOIN chart_of_accounts a    ON a.id = l.account_id
WHERE t.company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
  AND t.modo = 'PRODUCCION' AND t.deleted_at IS NULL
  AND t.date >= '2026-08-28'
ORDER BY t.date, t.created_at, a.code;


-- B.2  EL TEST QUE DECIDE LA CONTRAPARTIDA.
--      ¿El dinero de esos ajustes es anterior a que la empresa empezara a
--      operar en el sistema, o es de movimientos posteriores que nunca se
--      registraron? La respuesta cambia la cuenta de contrapartida por completo.
SELECT ba.bank_name,
       ba.created_at::date            AS cuenta_creada_el,
       MIN(t.date)                    AS primer_movimiento,
       MAX(t.date)                    AS ultimo_movimiento,
       count(*)                       AS n_movimientos,
       SUM(CASE WHEN t.type IN ('deposit','transfer_in') THEN t.amount ELSE -t.amount END) AS neto_modulo_bancos
FROM bank_transactions t
JOIN bank_accounts ba ON ba.id = t.bank_account_id
WHERE t.company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
  AND t.modo = 'PRODUCCION' AND t.deleted_at IS NULL
GROUP BY ba.bank_name, ba.created_at
ORDER BY ba.bank_name;


-- B.3  Módulo de bancos contra el mayor, banco por banco.
--      El descuadre es la medida del daño: el ajuste de 1.015.727,93 subió el
--      saldo del módulo y no movió el mayor, porque llevaba el debe y el haber
--      contra la misma cuenta.
WITH modulo AS (
  SELECT ba.id, ba.bank_name, ba.chart_account_id,
         COALESCE(b.balance, 0) AS saldo_modulo
  FROM bank_accounts ba
  LEFT JOIN bank_account_balances b
         ON b.bank_account_id = ba.id AND b.modo = 'PRODUCCION'
  WHERE ba.company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
    AND ba.deleted_at IS NULL
),
mayor AS (
  SELECT l.account_id, SUM(l.debit - l.credit) AS saldo_mayor
  FROM journal_entry_lines l
  JOIN journal_entries e ON e.id = l.journal_entry_id
  WHERE l.company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
    AND l.modo = 'PRODUCCION'
    AND e.deleted_at IS NULL AND e.status = 'posted'
  GROUP BY l.account_id
)
SELECT m.bank_name,
       coa.code || ' ' || coa.name AS cuenta_contable,
       m.saldo_modulo,
       COALESCE(g.saldo_mayor, 0)  AS saldo_mayor,
       m.saldo_modulo - COALESCE(g.saldo_mayor, 0) AS descuadre
FROM modulo m
LEFT JOIN chart_of_accounts coa ON coa.id = m.chart_account_id
LEFT JOIN mayor g               ON g.account_id = m.chart_account_id
ORDER BY m.bank_name;


-- B.4  Y qué quedó tirado en la cuenta de AGRUPACIÓN 1.1.01, que no debería
--      tener ni un movimiento propio.
SELECT e.date, e.description, e.reference, l.debit, l.credit
FROM journal_entry_lines l
JOIN chart_of_accounts a ON a.id = l.account_id
JOIN journal_entries e   ON e.id = l.journal_entry_id
WHERE l.company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
  AND l.modo = 'PRODUCCION'
  AND a.code = '1.1.01'
  AND e.deleted_at IS NULL
ORDER BY e.date, e.created_at;
-- Todo lo que salga aquí hay que bajarlo a la subcuenta que le toque
-- (1.1.01.02, .03 o .04) con un asiento de reclasificación.
