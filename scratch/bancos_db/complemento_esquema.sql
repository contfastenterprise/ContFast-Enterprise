-- Lo que el esquema de Drizzle declara y las migraciones de `drizzle/` NO crean.
--
-- P1-12 (a2d63ce, costo promedio ponderado) creo estas dos columnas A MANO en la
-- base de verdad y nunca genero su migracion; `drizzle/0001_sour_sprite.sql` lo
-- cuenta y quito el ALTER porque en la base ya existian. Asi que una base
-- construida SOLO con las migraciones no las tiene, y todo lo que lee
-- `inventory_levels` revienta con "column average_cost does not exist".
--
-- Medido el 2026-09-19 con `deriva_esquema.ts` contra la base recien migrada:
-- 92 tablas, ninguna falta; faltan estas dos columnas y ninguna mas. El guion
-- vuelve a medirlo en cada `reiniciar`, asi que una tercera no pasa en silencio.
--
-- Si algun dia se crea la migracion que falta (`ADD COLUMN IF NOT EXISTS`, no
-- hace nada en la base real), este fichero sobra.

ALTER TABLE inventory_levels ADD COLUMN IF NOT EXISTS average_cost numeric(15, 4) DEFAULT '0.0000' NOT NULL;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS unit_cost numeric(15, 4);
