-- =====================================================================
-- ENLAZAR CADA CUENTA BANCARIA CON SU CUENTA CONTABLE
-- Empresa 38a1a51e-cb4a-4798-ad19-0f44a7ded32d
-- =====================================================================
--
-- REQUISITO PREVIO: haber aplicado la migración 0039, que añade la columna
-- `bank_accounts.chart_account_id`. Sin ella, el paso 2 falla.
--
-- POR QUÉ: hasta ahora el código elegía la cuenta contable del banco con
--
--     assetAccounts.find(a => a.name.toLowerCase().includes('banco'))
--
-- "Efectivo en Caja y Bancos" contiene "banco" y es cuenta de AGRUPACIÓN, así
-- que ganaba el sorteo. Los dos ajustes del 29/08 fueron a parar ahí.
--
-- Situación de partida:
--   · Banreservas  (1202288095)  → existe 1.1.01.03 "Banco de Reservas"
--   · Scotiabank   (03219801680) → NO tiene cuenta en el catálogo
--   · 1.1.01.02 "Banco Popular" existe en el catálogo y no tiene cuenta
--     bancaria detrás. Puede tener saldo de movimientos que nunca pasaron
--     por ella: conviene revisarlo aparte.
--
-- ESTE SCRIPT ESCRIBE. Ejecuta paso por paso y revisa entre uno y otro.
-- =====================================================================


-- ── PASO 1 · Situación actual ────────────────────────────────────────
SELECT ba.id, ba.bank_name, ba.account_number, ba.chart_account_id,
       coa.code, coa.name
FROM bank_accounts ba
LEFT JOIN chart_of_accounts coa ON coa.id = ba.chart_account_id
WHERE ba.company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
ORDER BY ba.bank_name;

-- Y las cuentas de banco disponibles en el catálogo
SELECT id, code, name, is_transactional, status
FROM chart_of_accounts
WHERE company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
  AND code LIKE '1.1.01%'
ORDER BY code;


-- ── PASO 2 · Crear la cuenta contable de Scotiabank ──────────────────
--
-- Se cuelga de 1.1.01 igual que las otras dos, con el siguiente código libre
-- de esa rama. `level` = 3 y `nature` = 'debit' como sus hermanas: si se dejan
-- por defecto, la cuenta sale con level 1 y rompe los totales por jerarquía
-- de la balanza (hallazgo JRN-02).
INSERT INTO chart_of_accounts
  (company_id, code, name, type, nature, level, is_transactional, parent_id, status)
SELECT
  '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'::uuid,
  '1.1.01.04',
  'Scotiabank',
  'asset',
  'debit',
  3,
  true,
  (SELECT id FROM chart_of_accounts
    WHERE company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d' AND code = '1.1.01'),
  'active'
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts
  WHERE company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d' AND code = '1.1.01.04'
);
-- Si 1.1.01.04 ya estuviera ocupada por otra cuenta, no inserta nada: revisa
-- el listado del paso 1 y elige el siguiente código libre.


-- ── PASO 3 · Enlazar las dos cuentas bancarias ───────────────────────
UPDATE bank_accounts ba
SET chart_account_id = coa.id, updated_at = now()
FROM chart_of_accounts coa
WHERE ba.company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
  AND coa.company_id = ba.company_id
  AND ba.chart_account_id IS NULL
  AND (
        (ba.account_number = '1202288095'  AND coa.code = '1.1.01.03')  -- Banreservas
     OR (ba.account_number = '03219801680' AND coa.code = '1.1.01.04')  -- Scotiabank
  );


-- ── PASO 4 · Comprobación ────────────────────────────────────────────
SELECT ba.bank_name, ba.account_number, coa.code, coa.name,
       coa.is_transactional, coa.status
FROM bank_accounts ba
LEFT JOIN chart_of_accounts coa ON coa.id = ba.chart_account_id
WHERE ba.company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
ORDER BY ba.bank_name;
-- Las dos filas deben traer código y nombre, `is_transactional` = true y
-- `status` = 'active'. Si alguna sale con la cuenta vacía, sus movimientos
-- quedarán bloqueados con un error explícito hasta que se configure.


-- ── PASO 5 · Revisar Banco Popular, que no tiene cuenta bancaria ─────
SELECT coa.code, coa.name,
       count(l.id)   AS lineas,
       SUM(l.debit)  AS debitos,
       SUM(l.credit) AS creditos
FROM chart_of_accounts coa
LEFT JOIN journal_entry_lines l ON l.account_id = coa.id
WHERE coa.company_id = '38a1a51e-cb4a-4798-ad19-0f44a7ded32d'
  AND coa.code = '1.1.01.02'
GROUP BY coa.code, coa.name;
-- Si tiene movimientos, son de una cuenta bancaria que no existe: hay que
-- averiguar de dónde salieron antes de darla por buena.
