-- =====================================================================
-- RESIDUO DE LOS SALDOS BANCARIOS — TODO EN UNA SOLA CONSULTA
-- Empresa 38a1a51e-cb4a-4798-ad19-0f44a7ded32d
-- =====================================================================
--
-- SOLO LECTURA. Es UNA sentencia: cópiala entera y ejecútala de una vez.
-- El editor de Supabase sólo muestra el resultado de la última sentencia de
-- lo que se le pegue, así que todos los diagnósticos van unidos en un mismo
-- resultado, con una columna `bloque` que dice cuál es cuál.
--
-- QUÉ BUSCA: de dónde salen estos dos residuos.
--
--                    saldo del módulo   suma de movimientos      residuo
--   Banreservas          -22.703,49          299.757,47       -322.460,96
--   Scotiabank           163.920,70           67.648,63         +96.272,07
--
-- SI NO APARECE EL BLOQUE 1, no hay movimientos borrados y ése candidato
-- queda descartado. Lo mismo con las filas de PRUEBA del bloque 2.
-- =====================================================================

WITH b AS (
  SELECT id, bank_name, account_number, balance, created_at
  FROM bank_accounts
  WHERE company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
    AND deleted_at IS NULL
)

-- 1 · MOVIMIENTOS BORRADOS: su efecto se quedó en el contador y ellos
--     desaparecieron de la lista.
SELECT '1 · BORRADOS'                      AS bloque,
       b.bank_name                         AS banco,
       t.modo::text                        AS modo,
       count(*)::bigint                    AS n,
       SUM(CASE WHEN t.type IN ('deposit','transfer_in')
                THEN t.amount ELSE -t.amount END) AS efecto_en_el_saldo,
       MIN(t.date)::text || ' a ' || MAX(t.date)::text AS detalle
FROM bank_transactions t
JOIN b ON b.id = t.bank_account_id
WHERE t.deleted_at IS NOT NULL
GROUP BY 1, 2, 3

UNION ALL

-- 2 · MOVIMIENTOS VIVOS POR ENTORNO: si hay filas de PRUEBA, su efecto está
--     metido en el saldo de PRODUCCION (el saldo vivía en el catálogo antes
--     de la migración 0036, y el catálogo no tiene `modo`).
SELECT '2 · VIVOS POR ENTORNO',
       b.bank_name,
       t.modo::text,
       count(*)::bigint,
       SUM(CASE WHEN t.type IN ('deposit','transfer_in')
                THEN t.amount ELSE -t.amount END),
       MIN(t.date)::text || ' a ' || MAX(t.date)::text
FROM bank_transactions t
JOIN b ON b.id = t.bank_account_id
WHERE t.deleted_at IS NULL
GROUP BY 1, 2, 3

UNION ALL

-- 3 · SALDOS GUARDADOS: el contador por entorno y el espejo del catálogo.
--     El espejo debe coincidir con el saldo de PRODUCCION; si no coincide,
--     hubo escrituras que no pasaron por `ajustarSaldo`.
SELECT '3 · SALDOS GUARDADOS',
       b.bank_name,
       COALESCE(bb.modo::text, '(sin fila)'),
       NULL::bigint,
       bb.balance,
       'espejo catalogo = ' || b.balance::text ||
       '   ·   actualizado = ' || COALESCE(bb.updated_at::text, '-')
FROM b
LEFT JOIN bank_account_balances bb ON bb.bank_account_id = b.id

UNION ALL

-- 4 · CUÁNDO SE CREÓ CADA CUENTA. Si el primer movimiento es muy posterior,
--     lo de en medio es lo que falta por registrar.
SELECT '4 · CUENTA CREADA',
       b.bank_name,
       b.account_number,
       NULL::bigint,
       NULL::numeric,
       b.created_at::text
FROM b

ORDER BY 1, 2, 3;
