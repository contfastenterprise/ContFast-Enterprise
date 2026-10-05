-- Lote 290: el salario minimo con el que se calculan los TOPES de la TSS, por empresa.
--
-- Estaba fijado en el codigo (16.262,50). Decision del contador (via el dueño, 2026-10-04): es
-- RD$10.000,00, y como dato de la empresa ("nada estatico", lote 171). El codigo lo siembra al dar
-- de alta una empresa; las existentes lo reciben con scratch/_to_delete/salario_minimo_tss.ts.
--
-- Solo AÑADE una columna nula. NO se declara en el esquema de Drizzle, a proposito: la nomina lee
-- la fila entera de `payroll_configs` (`select()`, `.returning()`), y declarada antes de aplicar esto
-- la romperia (la leccion de las 0013 y 0015). El codigo mira si existe antes de nombrarla, y sin
-- ella (o sin valor) calcula con 10.000: aplicarla no es urgente, pero sin ella no se puede cambiar.
--
-- UNA sentencia, con la restriccion dentro de la columna (`IF NOT EXISTS` sin avisos; ver la 0019).
ALTER TABLE "payroll_configs" ADD COLUMN IF NOT EXISTS "salario_minimo_tss" numeric(18, 2)
  CONSTRAINT "payroll_configs_salario_minimo_tss_positivo" CHECK ("salario_minimo_tss" IS NULL OR "salario_minimo_tss" > 0);
