-- ============================================================================
--  0036  --  El saldo de cada cuenta bancaria pasa a ser POR ENTORNO
-- ============================================================================
--
--  EL PROBLEMA
--  -----------
--  `bank_accounts` es un catalogo: una fila por cuenta real, sin columna
--  `modo`, y esta bien -- la cuenta del Banco Popular es la misma se mire
--  desde donde se mire. Pero lleva dentro `balance`, que NO es un dato de
--  catalogo sino un saldo que se mueve.
--
--  Resultado: `bank_transactions` si distingue entorno, pero el saldo que esas
--  transacciones mueven es uno solo y compartido. Comprobado en banco de
--  pruebas: un retiro de 75.000 registrado en PRUEBA bajo el saldo REAL de
--  100.000 a 25.000.
--
--  Ese saldo se muestra en el panel de banco, en la pantalla de pagos a
--  suplidores, en la herramienta de saldos del asistente y -- lo mas serio --
--  en el informe de conciliacion bancaria, que es el que se cuadra contra el
--  estado de cuenta que manda el banco.
--
--  LA FORMA DE ARREGLARLO
--  ----------------------
--  La misma que ya usa el inventario en este mismo sistema: `products` es
--  catalogo y `inventory_levels` lleva el `modo`. Aqui, `bank_accounts` sigue
--  siendo catalogo y el saldo se muda a su propia tabla, una fila por cuenta y
--  entorno.
--
--  Se siembran los DOS entornos con el saldo actual: PRODUCCION porque es el
--  que vale, y PRUEBA con una copia, para que quien este practicando arranque
--  desde una situacion realista.
--
--  QUE PASA CON bank_accounts.balance
--  ----------------------------------
--  La columna se queda y se sigue actualizando, pero SOLO desde PRODUCCION.
--  No es duplicar la verdad por gusto: es una red. Si en algun sitio quedara
--  una lectura del campo viejo que no se haya migrado, mostrara el saldo real
--  -- nunca uno contaminado por practicas. Falla hacia el lado seguro.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "bank_account_balances" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id"      uuid NOT NULL REFERENCES "companies"("id"),
  "bank_account_id" uuid NOT NULL REFERENCES "bank_accounts"("id"),
  "modo"            "environment_mode" DEFAULT 'PRODUCCION' NOT NULL,
  "balance"         numeric(15, 2) DEFAULT '0.00' NOT NULL,
  "created_at"      timestamp DEFAULT now() NOT NULL,
  "updated_at"      timestamp DEFAULT now() NOT NULL
);

--  Una sola fila por cuenta y entorno. `bank_account_id` ya es unico dentro de
--  su empresa (es clave primaria de una fila que pertenece a una empresa), asi
--  que con la cuenta y el entorno basta: no se repite el error del indice de
--  inventory_levels, que olvido la empresa porque alli la clave era compuesta
--  por producto y almacen.
CREATE UNIQUE INDEX IF NOT EXISTS "bank_account_balances_cuenta_modo_idx"
  ON "bank_account_balances" USING btree ("bank_account_id", "modo");

CREATE INDEX IF NOT EXISTS "bank_account_balances_company_modo_idx"
  ON "bank_account_balances" USING btree ("company_id", "modo");

--  Siembra: el saldo que hay hoy, en los dos entornos.
INSERT INTO "bank_account_balances" ("company_id", "bank_account_id", "modo", "balance")
SELECT a."company_id", a."id", m."modo", a."balance"
FROM "bank_accounts" a
CROSS JOIN (VALUES ('PRODUCCION'::"environment_mode"), ('PRUEBA'::"environment_mode")) AS m("modo")
WHERE a."deleted_at" IS NULL
ON CONFLICT ("bank_account_id", "modo") DO NOTHING;

--  Comprobacion: toda cuenta viva tiene sus dos filas. Si esto salta, la
--  siembra no cubrio algo y hay que mirarlo ANTES de desplegar el codigo.
DO $$
DECLARE
  faltan integer;
BEGIN
  SELECT count(*) INTO faltan
  FROM "bank_accounts" a
  WHERE a."deleted_at" IS NULL
    AND (SELECT count(*) FROM "bank_account_balances" b
         WHERE b."bank_account_id" = a."id") <> 2;

  IF faltan > 0 THEN
    RAISE EXCEPTION 'Quedan % cuentas bancarias sin sus dos saldos (PRODUCCION y PRUEBA).', faltan;
  END IF;
END $$;
