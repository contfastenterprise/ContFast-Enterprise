-- ============================================================================
--  0040  --  Invariantes contables en la base de datos
-- ============================================================================
--
--  POR QUÉ
--  -------
--  La base no tenía prácticamente ninguna restricción de negocio: un solo CHECK
--  en todo el esquema (`chk_inventory_no_negativo`, y creado NOT VALID). Todo
--  lo demás dependía de que el código validara — y el código tiene tres puntos
--  que insertan asientos a mano, saltándose el motor central.
--
--  Estas restricciones son la última línea: se cumplen venga la escritura de
--  donde venga, incluida una consulta manual.
--
--  VERIFICADO ANTES DE APLICAR (29/08/2026, `verificacion-bd.sql`):
--
--     1.1  asientos descuadrados .................... 0
--     1.3  líneas con debe+haber, ambos 0, negativos . 0
--     4.1  CxC con saldo imposible .................. 0
--     4.2  CxP con saldo imposible .................. 0
--     6.3  compras duplicadas por proveedor + NCF ... 0
--
--  Por eso las restricciones se crean y se validan de inmediato. Si en tu
--  instancia alguna de esas consultas devuelve filas, NO ejecutes este script:
--  sanea primero.
--
--  Hallazgos: JRN-15, DB-03, DB-13, INV-14, ARP-05.
--
--  NOTA sobre el índice único de asientos por `reference`: se descartó. Un
--  contrasiento apunta legítimamente al mismo documento que el asiento que
--  revierte, de modo que ese índice habría bloqueado la propia operación de
--  corregir. La idempotencia necesita una clave de operación propia, no
--  `reference`. Queda para la Fase 2.
-- ============================================================================


-- ── LÍNEAS DE ASIENTO ────────────────────────────────────────────────
--
-- Una línea lleva importe en el debe o en el haber. Nunca en los dos, nunca en
-- ninguno, nunca negativo. Dos líneas {debe 500, haber 500} suman igual que un
-- asiento correcto y no significan nada.
DO $$ BEGIN
  ALTER TABLE "journal_entry_lines"
    ADD CONSTRAINT "chk_jel_importes_no_negativos"
    CHECK (debit >= 0 AND credit >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "journal_entry_lines"
    ADD CONSTRAINT "chk_jel_debe_o_haber"
    CHECK ((debit = 0) <> (credit = 0));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── SALDOS DE CUENTAS POR COBRAR Y POR PAGAR ─────────────────────────
--
-- El saldo va de cero al importe original y sólo baja. Un saldo negativo es un
-- sobrepago que el sistema no sabe representar: se volvía invisible en los
-- listados de pendientes, que filtran por saldo mayor que cero.
--
-- SI EL NEGOCIO NECESITA saldos por encima del importe original (intereses,
-- moras, notas de débito sobre el mismo documento), la segunda restricción de
-- cada tabla hay que retirarla y modelar eso aparte. Hoy no existe ese caso.
DO $$ BEGIN
  ALTER TABLE "accounts_receivable"
    ADD CONSTRAINT "chk_ar_saldo_no_negativo" CHECK (balance >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "accounts_receivable"
    ADD CONSTRAINT "chk_ar_saldo_hasta_importe" CHECK (balance <= amount);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "accounts_payable"
    ADD CONSTRAINT "chk_ap_saldo_no_negativo" CHECK (balance >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "accounts_payable"
    ADD CONSTRAINT "chk_ap_saldo_hasta_importe" CHECK (balance <= amount);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── COMPRAS DUPLICADAS ───────────────────────────────────────────────
--
-- Un doble clic o un reintento por timeout creaba dos compras completas: dos
-- entradas de inventario, dos cuentas por pagar, dos asientos y dos renglones
-- en el 606 con el mismo NCF del proveedor, que es riesgo fiscal directo.
--
-- Índice PARCIAL: los gastos menores sin NCF y las compras borradas quedan
-- fuera. `supplier_id` nulo (gasto menor sin proveedor) también.
CREATE UNIQUE INDEX IF NOT EXISTS "expenses_company_supplier_ncf_modo_uq"
  ON "expenses" ("company_id", "modo", "supplier_id", "ncf")
  WHERE "ncf" IS NOT NULL AND "supplier_id" IS NOT NULL AND "deleted_at" IS NULL;


-- ── VERIFICACIÓN ─────────────────────────────────────────────────────
--
-- Las seis restricciones deben aparecer aquí, y todas con convalidated = true.
SELECT conrelid::regclass::text AS tabla, conname, contype, convalidated
FROM pg_constraint
WHERE conname IN (
  'chk_jel_importes_no_negativos', 'chk_jel_debe_o_haber',
  'chk_ar_saldo_no_negativo', 'chk_ar_saldo_hasta_importe',
  'chk_ap_saldo_no_negativo', 'chk_ap_saldo_hasta_importe'
)
UNION ALL
SELECT 'expenses', indexname, 'i', true
FROM pg_indexes WHERE indexname = 'expenses_company_supplier_ncf_modo_uq'
ORDER BY 1, 2;
