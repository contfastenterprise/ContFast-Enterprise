-- =====================================================================
-- DE DÓNDE SALE EL RESIDUO DE LOS SALDOS BANCARIOS
-- Empresa 38a1a51e-cb4a-4798-ad19-0f44a7ded32d
-- =====================================================================
--
-- SOLO LECTURA.
--
-- LO QUE YA SABEMOS, de la consulta 4:
--
--                     saldo del módulo    suma de movimientos     residuo
--   Banreservas           -22.703,49            299.757,47      -322.460,96
--   Scotiabank            163.920,70             67.648,63        +96.272,07
--
-- El saldo del módulo NO es la suma de sus movimientos. Es un contador
-- incremental: `balance = balance + delta` en cada movimiento, partiendo del
-- `initialBalance` que se teclea al crear la cuenta. O sea:
--
--     saldo = saldo_inicial + Σ movimientos que llamaron a ajustarSaldo
--
-- Y el saldo inicial YA NO SE PUEDE LEER: `ajustarSaldo` sobrescribe
-- `bank_accounts.balance` con el saldo corriente en cada movimiento. Sólo queda
-- deducirlo, y el residuo de arriba es esa deducción — mezclada con todo lo
-- demás que haya movido el contador sin dejar rastro en la lista viva.
--
-- HAY TRES CANDIDATOS Y SE PARECEN. Este guion los separa.
-- =====================================================================


-- ── CANDIDATO 1 · MOVIMIENTOS BORRADOS ───────────────────────────────
--
-- Un movimiento borrado en blando (`deleted_at`) desaparece de la lista pero
-- su efecto sobre el contador se quedó. Si nadie revirtió el saldo al borrar,
-- el residuo es exactamente esto.
SELECT ba.bank_name,
       t.modo,
       count(*)                                                          AS n_borrados,
       SUM(CASE WHEN t.type IN ('deposit','transfer_in')
                THEN t.amount ELSE -t.amount END)                        AS efecto_neto,
       MIN(t.date) AS desde, MAX(t.date) AS hasta
FROM bank_transactions t
JOIN bank_accounts ba ON ba.id = t.bank_account_id
WHERE t.company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
  AND t.deleted_at IS NOT NULL
GROUP BY ba.bank_name, t.modo
ORDER BY ba.bank_name;


-- ── CANDIDATO 2 · MOVIMIENTOS DE PRUEBA QUE TOCARON EL SALDO REAL ────
--
-- Antes de la migración 0036 el saldo vivía dentro del catálogo, que no tiene
-- `modo`. Un movimiento registrado en el entorno de PRUEBA bajaba el saldo
-- REAL. Ése es el motivo por el que existe `bank_account_balances`.
--
-- Si hay movimientos de PRUEBA anteriores a la 0036, su efecto está metido en
-- el saldo de PRODUCCIÓN y hay que sacarlo. Un residuo NEGATIVO grande —el
-- caso de Banreservas— encaja con esto mejor que con ninguna otra cosa: nadie
-- abre una cuenta con un saldo inicial de −322.460,96.
SELECT ba.bank_name,
       t.modo,
       count(*)                                                          AS n_movimientos,
       SUM(CASE WHEN t.type IN ('deposit','transfer_in')
                THEN t.amount ELSE -t.amount END)                        AS efecto_neto,
       MIN(t.date) AS desde, MAX(t.date) AS hasta
FROM bank_transactions t
JOIN bank_accounts ba ON ba.id = t.bank_account_id
WHERE t.company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
  AND t.deleted_at IS NULL
GROUP BY ba.bank_name, t.modo
ORDER BY ba.bank_name, t.modo;

-- Y los saldos que hay guardados por entorno, más el espejo del catálogo.
SELECT ba.bank_name, ba.account_number,
       ba.balance          AS espejo_en_el_catalogo,
       b.modo,
       b.balance           AS saldo_del_entorno,
       b.created_at        AS fila_creada,
       b.updated_at        AS ultima_actualizacion
FROM bank_accounts ba
LEFT JOIN bank_account_balances b ON b.bank_account_id = ba.id
WHERE ba.company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
  AND ba.deleted_at IS NULL
ORDER BY ba.bank_name, b.modo;
-- El espejo del catálogo debe coincidir con el saldo de PRODUCCION. Si no
-- coincide, hubo escrituras que no pasaron por `ajustarSaldo`.


-- ── CANDIDATO 3 · EL SALDO INICIAL QUE NUNCA SE ASENTÓ ───────────────
--
-- `createBankAccount` guarda `initialBalance` en el catálogo y NO GENERA
-- NINGÚN ASIENTO. Lo que se teclee ahí entra al módulo de bancos y no existe
-- para la contabilidad. Ése sí es un saldo de apertura de verdad, y es el
-- único de los tres candidatos que se corrige con el asiento que discutimos.
--
-- No se puede leer directamente (el espejo lo sobrescribió), pero sí se puede
-- acorralar: el residuo, una vez descontados los candidatos 1 y 2, es esto.
--
--   residuo_total  −  borrados  −  efecto de PRUEBA  =  saldo inicial tecleado
--
-- Rellena con los números de arriba. Si el resultado da CERO, no hubo saldo
-- inicial y no hay nada que asentar: todo el desajuste era basura del contador.

-- Fecha de creación de cada cuenta y su primer movimiento, para saber a qué
-- fecha correspondería la apertura si la hubiera.
SELECT ba.bank_name, ba.account_number,
       ba.created_at::date AS cuenta_creada,
       MIN(t.date)         AS primer_movimiento,
       count(t.id)         AS n_movimientos_vivos
FROM bank_accounts ba
LEFT JOIN bank_transactions t ON t.bank_account_id = ba.id
                             AND t.deleted_at IS NULL AND t.modo = 'PRODUCCION'
WHERE ba.company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
  AND ba.deleted_at IS NULL
GROUP BY ba.bank_name, ba.account_number, ba.created_at
ORDER BY ba.bank_name;


-- ── EL LIBRO DE BANCO, MOVIMIENTO A MOVIMIENTO ───────────────────────
--
-- Con el saldo corrido. Póngase al lado el estado de cuenta del banco: donde
-- las dos columnas dejen de coincidir, ahí empieza el problema. Este listado
-- es además el que se usa para la conciliación mensual.
SELECT ba.bank_name,
       t.date, t.type, t.amount, t.reference, t.description, t.status,
       SUM(CASE WHEN t.type IN ('deposit','transfer_in') THEN t.amount ELSE -t.amount END)
         OVER (PARTITION BY ba.id ORDER BY t.date, t.created_at
               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS acumulado_sin_saldo_inicial
FROM bank_transactions t
JOIN bank_accounts ba ON ba.id = t.bank_account_id
WHERE t.company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
  AND t.modo = 'PRODUCCION' AND t.deleted_at IS NULL
ORDER BY ba.bank_name, t.date, t.created_at;
