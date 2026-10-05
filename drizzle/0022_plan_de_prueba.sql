-- Lote 300 (segunda parte): QUE plan lleva la prueba gratis lo dice una casilla, no un nombre.
--
-- Decision del dueño (2026-10-05): en Administracion > Planes cada plan tiene una casilla "Plan de
-- prueba" y solo uno puede estar marcado. La prueba de toda empresa nueva toma ese plan, se llame
-- como se llame. Hasta aqui se buscaba por el nombre "Plan Básico", y renombrarlo rompia las altas.
--
-- La columna NO se declara en el esquema de Drizzle, a proposito: `plans` se lee entera en varios
-- sitios y, declarada antes de aplicar esto, los romperia (la leccion de las 0013 y 0015). La lee y
-- escribe solo `services/suscripcion/planDePrueba.ts`, que mira si existe ANTES de nombrarla. Sin
-- esta migracion el plan se sigue buscando por nombre: aplicarla no es urgente.
--
-- Tres sentencias, cada una sin avisos la primera vez (la regla de la 0019: un NOTICE lo toma por
-- error el lanzador de la base desechable). Con IF NOT EXISTS y el NOT EXISTS del UPDATE, aplicarla
-- dos veces no cambia nada.

-- 1. La casilla.
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "es_plan_de_prueba" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

-- 2. Solo uno marcado: lo impide la BASE, no solo la pantalla (indice unico parcial).
CREATE UNIQUE INDEX IF NOT EXISTS "plans_un_solo_plan_de_prueba" ON "plans" ("es_plan_de_prueba") WHERE "es_plan_de_prueba";
--> statement-breakpoint

-- 3. Para que nada cambie al aplicarla: se marca el plan que hasta hoy se buscaba por nombre (el mas
--    antiguo si hubiera dos), y solo si no hay ya uno marcado.
UPDATE "plans" SET "es_plan_de_prueba" = true
WHERE "id" = (SELECT "id" FROM "plans" WHERE lower(btrim("name")) = 'plan básico' ORDER BY "created_at", "id" LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM "plans" WHERE "es_plan_de_prueba");
