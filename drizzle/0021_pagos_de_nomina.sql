-- Lote 295 (el "lote D" de docs/diseno_asientos_nomina.md): el PAGO de una nomina aprobada.
--
-- Una tabla NUEVA, y ninguna columna en `payrolls`, a proposito: la nomina lee su fila entera
-- (`select()`), y una columna declarada antes de aplicar esto la romperia (la leccion de las 0013 y
-- 0015). La tabla NO se declara en el esquema de Drizzle: la lee y escribe solo
-- `services/nomina/pagarNomina.ts`, con SQL propio, y mira si existe ANTES de usarla. Sin esta
-- migracion, pagar contesta 409 nombrandola y nada mas cambia: aplicarla no es urgente.
--
-- Una fila por nomina (`payroll_id` unico): pagar dos veces, seguidas o a la vez, deja un solo pago
-- (lo garantiza tambien el `for update` sobre la nomina). Banco si y solo si no es efectivo.
CREATE TABLE IF NOT EXISTS "pagos_de_nomina" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL REFERENCES "public"."companies"("id"),
	"modo" "environment_mode" NOT NULL,
	"payroll_id" uuid NOT NULL REFERENCES "public"."payrolls"("id"),
	"fecha" date NOT NULL,
	"metodo" varchar(20) NOT NULL,
	"bank_account_id" uuid REFERENCES "public"."bank_accounts"("id"),
	"cash_session_id" uuid REFERENCES "public"."cash_sessions"("id"),
	"referencia" varchar(100),
	"monto" numeric(18, 2) NOT NULL,
	"journal_entry_id" uuid REFERENCES "public"."journal_entries"("id"),
	"created_by" uuid REFERENCES "public"."users"("id"),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pagos_de_nomina_payroll_uq" UNIQUE ("payroll_id"),
	CONSTRAINT "pagos_de_nomina_metodo_ck" CHECK ("metodo" IN ('transfer', 'check', 'cash')),
	CONSTRAINT "pagos_de_nomina_origen_ck" CHECK (("metodo" = 'cash') = ("bank_account_id" IS NULL)),
	CONSTRAINT "pagos_de_nomina_monto_ck" CHECK ("monto" > 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pagos_de_nomina_company_modo_idx" ON "pagos_de_nomina" USING btree ("company_id", "modo");
