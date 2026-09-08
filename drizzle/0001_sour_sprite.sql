-- P2-27: restriccion unica de codigo de empleado y cedula, por empresa.
--
-- drizzle-kit genero ademas dos ALTER TABLE anadiendo inventory_levels.average_cost
-- e inventory_movements.unit_cost. Se han QUITADO A MANO: esas dos columnas ya
-- existen en la base con exactamente la forma que declara el esquema
-- (comprobado en information_schema.columns), asi que el ALTER habria fallado con
-- "column already exists" y se habria caido la migracion entera, indices incluidos.
--
-- Vienen de P1-12 (a2d63ce, costo promedio ponderado): ese commit declaro las
-- columnas en el esquema y las creo en la base, pero nunca genero su migracion, asi
-- que la instantanea de drizzle-kit se quedo atras y las arrastraba a la siguiente.
-- Con esta migracion la instantanea se pone al dia y dejan de aparecer.

CREATE UNIQUE INDEX "employees_company_code_uq" ON "employees" USING btree ("company_id","employee_code") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "employees_company_cedula_uq" ON "employees" USING btree ("company_id","cedula") WHERE deleted_at IS NULL;