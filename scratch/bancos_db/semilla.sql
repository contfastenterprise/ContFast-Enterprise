-- Semilla de la base desechable de los bancos de integracion.
--
-- POR QUE EXISTE: los bancos de `deuda_bancos.txt` se escribieron contra una
-- base de pruebas cuya semilla NUNCA se commiteo (vivia en el entorno de otra
-- sesion; `verificar_f1_03.ts` ya lo cuenta de su /tmp/seed_hr.sql). Esta se
-- reconstruyo a partir de lo que cada banco da por hecho: los identificadores
-- fijos y los nombres que les pone (`A`, `USER_A`, `ALM`, `PC01`, `ANA`...).
--
-- Solo lleva el CATALOGO comun (empresas, usuarios, almacenes, productos,
-- empleados). Lo transaccional lo crea cada banco y lo vacia `_limpieza.ts`.
--
-- Empieza vaciando TODO `public`: asi sirve igual para sembrar que para
-- reponer entre un banco y el siguiente. El candado esta en el guion y en
-- `candado.ts`; esto solo se ejecuta contra la base con la marca.

DO $$
DECLARE lista text;
BEGIN
  IF shobj_description((SELECT oid FROM pg_database WHERE datname = current_database()), 'pg_database')
     IS DISTINCT FROM 'contfast: base DESECHABLE de los bancos de integracion' THEN
    RAISE EXCEPTION 'semilla.sql: esta base no lleva la marca de desechable';
  END IF;
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
    INTO lista FROM pg_tables WHERE schemaname = 'public';
  IF lista IS NOT NULL THEN EXECUTE 'TRUNCATE ' || lista || ' CASCADE'; END IF;
END $$;

-- Empresas: A es la que opera; B es "la otra", la que los bancos de
-- aislamiento intentan alcanzar desde A.
-- Los NOMBRES importan: `verificar_conteo.ts` pasa `--empresa=Alfa SRL` a su
-- guion, y `verificar_grupo_c.ts` agrupa sus resultados por nombre.
INSERT INTO companies (id, name, rnc) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Alfa SRL', '101000001'),
  ('22222222-2222-2222-2222-222222222222', 'Beta SRL', '101000002');

INSERT INTO company_settings (company_id) VALUES
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

-- Lote 299: las dos empresas con un PLAN vigente y sin limites. Desde ese lote,
-- sin plan vigente no se emite, ni se calcula nomina, ni se crean asientos
-- manuales, usuarios o almacenes (es la decision del dueño), asi que una semilla
-- sin suscripcion dejaria a los bancos de esas rutas en un 403 que no vigilan.
-- `verificar_limites_del_plan_db.ts` cambia el plan de A a su gusto y lo repone.
INSERT INTO plans (id, name, price, max_ecf_limit, max_users, max_warehouses) VALUES
  ('eeeeeeee-0000-0000-0000-000000000299', 'Plan de los bancos', 0, -1, -1, -1);
INSERT INTO subscriptions (company_id, plan_id, status, current_period_start, current_period_end) VALUES
  ('11111111-1111-1111-1111-111111111111', 'eeeeeeee-0000-0000-0000-000000000299', 'active', '2026-01-01', '2099-12-31'),
  ('22222222-2222-2222-2222-222222222222', 'eeeeeeee-0000-0000-0000-000000000299', 'active', '2026-01-01', '2099-12-31');

INSERT INTO roles (id, name, is_fixed) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin', true);

INSERT INTO users (id, company_id, role_id, name, email, password_hash) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Ana Alfa', 'ana@alfa.do', 'x'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Beto Beta', 'beto@beta.do', 'x');
-- (`verificar_conteo.ts` identifica al usuario por correo: ana@alfa.do, y
-- comprueba que beto@beta.do, de la otra empresa, no puede aplicar.)

-- Almacenes: dos de A (PRINCIPAL, SUCURSAL) y uno de B (CENTRAL).
INSERT INTO warehouses (id, company_id, name, code) VALUES
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Principal', 'PRINCIPAL'),
  ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Sucursal', 'SUCURSAL'),
  ('cccccccc-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'Central', 'CENTRAL');

-- Productos. Los SKU van con guion (PC-01, BI-03, SV-01): `verificar_conteo.ts`
-- carga el conteo por SKU y `verificar_gastos_cruzados.ts` lo compara. El
-- costo de PC-01 es 7.500: `verificar_bi.ts` valora 20 unidades en 150.000.
-- Los de `dddddddd-...0a` a `...0e` NO van aqui: los crea `verificar_conteo.ts`
-- (los borra y los vuelve a insertar).
INSERT INTO products (id, company_id, sku, name, price, cost, tracks_inventory) VALUES
  ('dddddddd-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'PC-01', 'Puerta caoba', 1000, 7500, true),
  ('dddddddd-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'BI-03', 'Bisagra', 100, 40, true),
  ('dddddddd-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'SV-01', 'Sellador', 500, 200, true),
  ('dddddddd-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', 'PB-01', 'Producto de B', 1000, 600, true);

-- Empleados: ANA y LUIS (mensuales) y SARA (QUINCENAL) en A; BETO en B.
-- La frecuencia de Sara importa: `verificar_f1_03.ts` comprueba que una
-- nomina mensual no se lleva sus conceptos.
INSERT INTO employees (id, company_id, employee_code, first_name, last_name, cedula, birth_date, contract_type, payment_frequency, salary, hire_date) VALUES
  ('eeee0000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'A-01', 'Ana', 'Perez', '00100000001', '1990-01-01', 'indefinido', 'mensual', 50000, '2020-01-15'),
  ('eeee0000-0000-0000-0000-00000000000b', '11111111-1111-1111-1111-111111111111', 'A-02', 'Luis', 'Gomez', '00100000002', '1988-05-10', 'indefinido', 'mensual', 40000, '2022-03-01'),
  ('eeee0000-0000-0000-0000-00000000000c', '11111111-1111-1111-1111-111111111111', 'A-03', 'Sara', 'Diaz', '00100000003', '1995-07-20', 'indefinido', 'quincenal', 35000, '2025-06-01'),
  ('eeee0000-0000-0000-0000-00000000000d', '22222222-2222-2222-2222-222222222222', 'B-01', 'Beto', 'Ruiz', '00100000004', '1985-11-30', 'indefinido', 'mensual', 45000, '2019-09-01');

-- Planes (lote 300): los tres de PRODUCCION, con sus nombres y limites (medidos
-- el 2026-10-05). Toda alta de empresa crea ahora su prueba gratis con los
-- limites del "Plan Básico" y FALLA si no lo encuentra, asi que sin estas filas
-- los bancos que dan de alta empresas (registro, Administracion) no podrian.
-- La semilla NO da suscripcion a Alfa ni a Beta: como las cinco empresas de
-- PRODUCCION sin plan, son las que el guion `prueba_gratis_empresas.ts` atiende.
INSERT INTO plans (id, name, price, max_ecf_limit, max_users, max_warehouses, active) VALUES
  ('f1a40000-0000-0000-0000-000000000001', 'Plan Básico', 2000, 100, 2, 1, true),
  ('f1a40000-0000-0000-0000-000000000002', 'Plan Profesional', 3500, 500, 5, 2, true),
  ('f1a40000-0000-0000-0000-000000000003', 'Plan Corporativo', 6000, 2000, 15, 5, true);
-- Con la migracion 0022 (siempre aplicada aqui, que migra todo drizzle/), el plan de la prueba es
-- el MARCADO: se marca el Basico, como hace la propia 0022 en una base con datos. Condicional para
-- que la semilla siga valiendo en un arbol sin la 0022.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'plans' AND column_name = 'es_plan_de_prueba') THEN
    EXECUTE 'UPDATE plans SET es_plan_de_prueba = true WHERE id = ''f1a40000-0000-0000-0000-000000000001''';
  END IF;
END $$;
