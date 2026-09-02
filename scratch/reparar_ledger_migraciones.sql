-- ============================================================================
--  REPARAR EL LEDGER DE MIGRACIONES
-- ============================================================================
--
--  GENERADO. No editar a mano.
--
--      npx tsx scratch/generar_reparacion_ledger.ts
--
--  Generado el 2026-09-02 desde drizzle/meta/_journal.json
--  (43 entradas; la ultima, 0042_exento_o_tasa_cero).
--
--  QUE ARREGLA
--  -----------
--  `drizzle.__drizzle_migrations` se quedo en la 0007. De ahi en adelante las
--  migraciones se aplicaron a mano y la tabla no se entero, asi que para drizzle
--  hay migraciones pendientes que en realidad ya estan puestas.
--
--  Hoy eso no rompe un despliegue: `migrate.ts` no esta enganchado a ningun
--  script de npm (`build` es `next build` a secas), asi que Vercel no lo llama.
--  Y si alguien lo ejecutase a mano, drizzle mete TODAS las pendientes en UNA
--  sola transaccion: fallaria al crear algo que ya existe y lo desharia todo.
--  Falla ruidosamente y no rompe nada.
--
--  El precio real es otro: mientras el ledger mienta, `migrate` no puede
--  avanzar, y por tanto ninguna migracion nueva se aplica por la via normal.
--
--  LA TRAMPA QUE HAY QUE CONOCER
--  -----------------------------
--  Drizzle compara UNICAMENTE el `created_at` mas reciente del ledger contra el
--  `when` de cada entrada del journal. Ni mira los hashes:
--
--      if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis)
--
--  Como solo cuenta el maximo, un hueco en medio NO se recupera JAMAS.
--
--  Comprobado, no supuesto. Con una version anterior de este fichero y la 0035
--  sin aplicar: el ledger quedaba en 36 filas, `migrate` reportaba 1 pendiente
--  y la 0035 no aparecia ni registrada ni pendiente. Se habia perdido en
--  silencio. Por eso este fichero se niega a correr si algo falta, y por eso
--  ahora se GENERA en vez de mantenerse a mano: la version vieja de un fichero
--  escrito a mano es indistinguible de la buena hasta que ya es tarde.
--
--  ORDEN DE USO
--  ------------
--  Aplicar primero las migraciones que falten, y DESPUES ejecutar esto. La
--  guarda comprueba una por una que esten de verdad puestas -- mirando sus
--  objetos en la base, no fiandose de nadie -- y aborta nombrando las que
--  falten.
--
--  Va entero dentro de un solo DO: una sola sentencia, que PostgreSQL deshace
--  completa si algo falla. No puede quedar a medias.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS drizzle;
CREATE TABLE IF NOT EXISTS drizzle."__drizzle_migrations" (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);

DO $reparar$
DECLARE
  faltan text[] := ARRAY[]::text[];
  n_antes integer;
  n_despues integer;
  tope bigint;
  pendientes text[];
BEGIN
  SELECT count(*) INTO n_antes FROM drizzle."__drizzle_migrations";
  RAISE NOTICE 'Ledger: % filas antes de reparar.', n_antes;

  -- ------------------------------------------------------------------
  -- 1. GUARDA. Nada de esto se puede quedar por debajo del maximo sin
  --    estar aplicado de verdad: quedaria enterrado para siempre.
  --
  --    La ultima del journal (0042_exento_o_tasa_cero)
  --    NO se comprueba aqui: puede estar legitimamente pendiente, y va al
  --    final justamente para que `migrate` la aplique sin dejar hueco.
  -- ------------------------------------------------------------------
  IF NOT (EXISTS (SELECT 1 FROM pg_proc WHERE proname='prevent_audit_log_modification')) THEN
    faltan := array_append(faltan, '0025_immutable_audit_logs (falta la funcion prevent_audit_log_modification)');
  END IF;

  IF NOT (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='tracks_inventory')) THEN
    faltan := array_append(faltan, '0033_producto_sin_inventario (falta la columna products.tracks_inventory)');
  END IF;

  IF NOT (to_regclass('public.invoice_sequences') IS NOT NULL) THEN
    faltan := array_append(faltan, '0034_secuencia_codigo_factura (falta la tabla invoice_sequences)');
  END IF;

  IF NOT (EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='dgii_submissions_invoice_created_idx')) THEN
    faltan := array_append(faltan, '0035_envio_dgii_por_intento (falta el indice dgii_submissions_invoice_created_idx)');
  END IF;

  IF NOT (to_regclass('public.bank_account_balances') IS NOT NULL) THEN
    faltan := array_append(faltan, '0036_saldo_banco_por_entorno (falta la tabla bank_account_balances)');
  END IF;

  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND policyname='sin_acceso_publico')) THEN
    faltan := array_append(faltan, '0037_negar_acceso_publico (falta la politica sin_acceso_publico)');
  END IF;

  IF NOT (to_regclass('public.v_public_products') IS NOT NULL AND pg_get_viewdef('public.v_public_products'::regclass, true) LIKE '%pli.company_id = p.company_id%') THEN
    faltan := array_append(faltan, '0038_vistas_publicas_por_empresa (falta el arreglo de la vista v_public_products)');
  END IF;

  IF NOT (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoice_lines' AND column_name='tax_rate')) THEN
    faltan := array_append(faltan, '0039_tasa_itbis_por_linea (falta la columna invoice_lines.tax_rate)');
  END IF;

  IF NOT (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quote_lines' AND column_name='tax_rate')) THEN
    faltan := array_append(faltan, '0040_tasa_itbis_por_linea_cotizacion (falta la columna quote_lines.tax_rate)');
  END IF;

  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_payable_id_company_uq')) THEN
    faltan := array_append(faltan, '0032_aislamiento_estructural (falta la restriccion accounts_payable_id_company_uq)');
  END IF;

  IF NOT (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='dgii_submissions' AND column_name='security_code')) THEN
    faltan := array_append(faltan, '0041_codigo_seguridad_por_envio (falta la columna dgii_submissions.security_code)');
  END IF;

  IF array_length(faltan, 1) > 0 THEN
    RAISE EXCEPTION E'ABORTADO: hay migraciones anteriores que NO estan aplicadas.\nRegistrarlas ahora las enterraria para siempre (drizzle solo mira el created_at maximo).\nAplica primero estas y vuelve a ejecutar:\n  - %', array_to_string(faltan, E'\n  - ');
  END IF;

  -- ------------------------------------------------------------------
  -- 2. Registrar. Cada INSERT es idempotente por hash, y las que tienen
  --    marcador solo se registran si su marcador existe en la base: no se
  --    apunta en el ledger nada que no sea cierto.
  -- ------------------------------------------------------------------
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT '2c8e559e04d9efe19fb56ede2f6f1ee32d604ed8aba8a723b8aab57588c5c772', 1780868667570::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = '2c8e559e04d9efe19fb56ede2f6f1ee32d604ed8aba8a723b8aab57588c5c772');  --  0000_violet_pestilence
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT '9a42ae395d5ca9e658c09611144bdcd96bbb4c0a55a65828be4728f801a1c323', 1780868703931::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = '9a42ae395d5ca9e658c09611144bdcd96bbb4c0a55a65828be4728f801a1c323');  --  0001_real_timeslip
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT '845c51f6e319091b3f2830abb046be4889f612aa4f671176c6acda3ccfcb1ed3', 1780868800000::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = '845c51f6e319091b3f2830abb046be4889f612aa4f671176c6acda3ccfcb1ed3');  --  0002_add_product_fields
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT '6c73f66821421537009babecd965bbd77e500337ec424b52d8bf4d160018c751', 1780934513884::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = '6c73f66821421537009babecd965bbd77e500337ec424b52d8bf4d160018c751');  --  0003_high_sphinx
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT 'f455d0eb5fb7b290f2f59fdfbd6f9bdb261a32671d1b018d4e87ec2002b1a693', 1780936590492::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = 'f455d0eb5fb7b290f2f59fdfbd6f9bdb261a32671d1b018d4e87ec2002b1a693');  --  0004_perfect_sleeper
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT '036a0bf343d15c6f38c48d678bb749c8c920d009cdd523704472bd8114926a5e', 1780953227060::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = '036a0bf343d15c6f38c48d678bb749c8c920d009cdd523704472bd8114926a5e');  --  0005_classy_aqueduct
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT 'b96321445f90bd238841bc979b58618f73f712aff574d170d8f264c78226090f', 1780958570301::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = 'b96321445f90bd238841bc979b58618f73f712aff574d170d8f264c78226090f');  --  0006_third_synch
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT '8c87e27d4a7b37d4aa13a320dd7af4d320ed6903e4fb9c298f45b76d6d96e92d', 1780971093207::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = '8c87e27d4a7b37d4aa13a320dd7af4d320ed6903e4fb9c298f45b76d6d96e92d');  --  0007_wide_dust
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT '220fe4cc38b0893960c11118498c4b363f9e4837773ff69e84bb6d7e55738ca1', 1781178674667::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = '220fe4cc38b0893960c11118498c4b363f9e4837773ff69e84bb6d7e55738ca1');  --  0008_sparkling_bug
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT 'ab5adab3377c8b428f0b1f98df372f977d53be1d91b6ed00d786395937adbfbb', 1781217421965::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = 'ab5adab3377c8b428f0b1f98df372f977d53be1d91b6ed00d786395937adbfbb');  --  0009_known_proemial_gods
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT 'b7bd9aac4dc9c9450360b49cc19bff3411784836a071200a85cd0a580dd59cb4', 1781226612769::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = 'b7bd9aac4dc9c9450360b49cc19bff3411784836a071200a85cd0a580dd59cb4');  --  0010_narrow_tarot
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT '382fecff577639491ece2fe1b935e2256d7c5741abfc372da5143b7b0a7e583e', 1781391338953::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = '382fecff577639491ece2fe1b935e2256d7c5741abfc372da5143b7b0a7e583e');  --  0011_round_forge
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT '3acd576657726a91624276825151625ef7fb864c57505dfd9161216d932e80a2', 1781799867056::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = '3acd576657726a91624276825151625ef7fb864c57505dfd9161216d932e80a2');  --  0012_ambiguous_texas_twister
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT 'e2f570325e4752eb9b5b9581903a92e21865a8859e05a043e290a39426122094', 1782144592358::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = 'e2f570325e4752eb9b5b9581903a92e21865a8859e05a043e290a39426122094');  --  0013_next_gauntlet
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT 'bb53b418c065ddee26a1c30eecfe55f726c0b154e68cd8b59d5bb7e73a47e815', 1782227039285::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = 'bb53b418c065ddee26a1c30eecfe55f726c0b154e68cd8b59d5bb7e73a47e815');  --  0014_spotty_king_bedlam
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT '9555a161f62a9ff4126c798c233693746778a61ef745c10870e2050f1727fbee', 1782435879830::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = '9555a161f62a9ff4126c798c233693746778a61ef745c10870e2050f1727fbee');  --  0015_premium_boomer
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT '9a1a93a161de2f3be32ef2f03d3b0fa4b6d8045bc35cfd3543b587609a3386d9', 1782441567318::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = '9a1a93a161de2f3be32ef2f03d3b0fa4b6d8045bc35cfd3543b587609a3386d9');  --  0016_handy_klaw
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT '39f622566690137440763968331addf8f308efb8fc8f1d7bdf1644c93943215a', 1782444887858::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = '39f622566690137440763968331addf8f308efb8fc8f1d7bdf1644c93943215a');  --  0017_breezy_wolfpack
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT 'd4747426397a20cfe0ee299376240ef9d021cf1ea419895adce769704042ec94', 1782506651089::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = 'd4747426397a20cfe0ee299376240ef9d021cf1ea419895adce769704042ec94');  --  0018_flashy_thor_girl
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT '596a7115b1982d86cc4eb86dfdb83f50fd1d03a13899b66794c5aea05c368d5a', 1782572361776::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = '596a7115b1982d86cc4eb86dfdb83f50fd1d03a13899b66794c5aea05c368d5a');  --  0019_add_user_avatar_fields
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT '134d4e6d1d9310c7bca1e2d56b0209f0fe5b0d1901d3174fde11368f78187ff3', 1782574740036::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = '134d4e6d1d9310c7bca1e2d56b0209f0fe5b0d1901d3174fde11368f78187ff3');  --  0020_add_rbac_system_tables
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT '7d4cee75f27c16d38559aae172990b688861adb47f3a9f36f5d3ecdd408d49a4', 1782679327307::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = '7d4cee75f27c16d38559aae172990b688861adb47f3a9f36f5d3ecdd408d49a4');  --  0021_marvelous_reavers
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT '1d3e48a9d93ab4ac4118682b01856bbf1c4fd41ddd067d3c2a33020c76d6cb32', 1782779457936::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = '1d3e48a9d93ab4ac4118682b01856bbf1c4fd41ddd067d3c2a33020c76d6cb32');  --  0022_dapper_skreet
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT 'e689d19af04cab51aff78ef4734dae6ebd27e89772441f7aeb384d40af366ee6', 1782781405474::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = 'e689d19af04cab51aff78ef4734dae6ebd27e89772441f7aeb384d40af366ee6');  --  0023_right_silver_samurai
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT 'f5ac221a77930b61abe875b49563a279cfd88a06575824a469f8d4f4286f49fd', 1782938503006::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = 'f5ac221a77930b61abe875b49563a279cfd88a06575824a469f8d4f4286f49fd');  --  0024_petite_blizzard
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT '399c445c8c781afd8def7088802587436ad25af228632b53ea2540391daca3be', 1783632285472::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = '399c445c8c781afd8def7088802587436ad25af228632b53ea2540391daca3be');  --  0025_wide_cassandra_nova
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT 'efbf521207af2f0f82636426b045e704b83816d9db03c0448c3860b0d527787f', 1783736001048::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = 'efbf521207af2f0f82636426b045e704b83816d9db03c0448c3860b0d527787f');  --  0026_glorious_serpent_society
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT 'd146d151499b4bcc9efbe0451d11131e732a55ce4b4f8f367b0643aad3b9fcf9', 1784651897848::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = 'd146d151499b4bcc9efbe0451d11131e732a55ce4b4f8f367b0643aad3b9fcf9');  --  0027_faulty_lake
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT '18e64ba519b676c06b4d5247aeaa4f2287b4d8afe20039320d64fc0eaf0bee9e', 1784664403850::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = '18e64ba519b676c06b4d5247aeaa4f2287b4d8afe20039320d64fc0eaf0bee9e');  --  0028_foamy_iron_fist
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT 'b2f10b63ce9915dcb4f17f3d9544a849897d21b02a3eb41fb19e7baf3e6aba7e', 1784664404850::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = 'b2f10b63ce9915dcb4f17f3d9544a849897d21b02a3eb41fb19e7baf3e6aba7e');  --  0030_reconciliacion
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT '8ac2881a7c55752bba5ca0bf5760fe8ae1706aa3eccd480e84f6b1c4ec74eaf4', 1784664405850::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = '8ac2881a7c55752bba5ca0bf5760fe8ae1706aa3eccd480e84f6b1c4ec74eaf4');  --  0031_inventario_no_negativo
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT 'f1261f7329d6beeed1cd5366e3a2317b84bae40f940d9bb5e79913190e64ec0d', 1784664407850::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = 'f1261f7329d6beeed1cd5366e3a2317b84bae40f940d9bb5e79913190e64ec0d')
     AND (EXISTS (SELECT 1 FROM pg_proc WHERE proname='prevent_audit_log_modification'));  --  0025_immutable_audit_logs
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT 'd047f6f3f6c267b23817b534663fc33b37df5bd49826502e6d618ce12ea3b6ad', 1784664409850::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = 'd047f6f3f6c267b23817b534663fc33b37df5bd49826502e6d618ce12ea3b6ad')
     AND (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='tracks_inventory'));  --  0033_producto_sin_inventario
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT 'c80bb7aa4b93615798be84d92abfbec533876fc605985951d7ff3f582f9f0937', 1784664410850::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = 'c80bb7aa4b93615798be84d92abfbec533876fc605985951d7ff3f582f9f0937')
     AND (to_regclass('public.invoice_sequences') IS NOT NULL);  --  0034_secuencia_codigo_factura
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT '2ca85f56f96a609bd730954133f2d41d1c3b2b470bd0014280c571913d1e95b8', 1784664411850::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = '2ca85f56f96a609bd730954133f2d41d1c3b2b470bd0014280c571913d1e95b8')
     AND (EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='dgii_submissions_invoice_created_idx'));  --  0035_envio_dgii_por_intento
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT '69e54f5f31e9ab4c17276895a90006e62b415b5379755dd5f4afa983d34f7708', 1784664412850::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = '69e54f5f31e9ab4c17276895a90006e62b415b5379755dd5f4afa983d34f7708')
     AND (to_regclass('public.bank_account_balances') IS NOT NULL);  --  0036_saldo_banco_por_entorno
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT 'e62accc58b3a04d0ecfd9371faa9b3c0255ae9b4746e062501ee49eb62817763', 1784664413850::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = 'e62accc58b3a04d0ecfd9371faa9b3c0255ae9b4746e062501ee49eb62817763')
     AND (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND policyname='sin_acceso_publico'));  --  0037_negar_acceso_publico
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT 'd766e589dd3a7d6fca72bf0da5acc29d454ca57d22d2f550bfeb834badf8ccb3', 1784664414850::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = 'd766e589dd3a7d6fca72bf0da5acc29d454ca57d22d2f550bfeb834badf8ccb3')
     AND (to_regclass('public.v_public_products') IS NOT NULL AND pg_get_viewdef('public.v_public_products'::regclass, true) LIKE '%pli.company_id = p.company_id%');  --  0038_vistas_publicas_por_empresa
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT '57afce1b903053fd256e258c2a38f6c05a6e6e060272d3fc08c06d2df77f17b1', 1784664415850::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = '57afce1b903053fd256e258c2a38f6c05a6e6e060272d3fc08c06d2df77f17b1')
     AND (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoice_lines' AND column_name='tax_rate'));  --  0039_tasa_itbis_por_linea
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT '4bb19bf0157e572011ed7fe6dd1f9d80a518e1472340b94987b3a79154264e4e', 1784664416850::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = '4bb19bf0157e572011ed7fe6dd1f9d80a518e1472340b94987b3a79154264e4e')
     AND (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quote_lines' AND column_name='tax_rate'));  --  0040_tasa_itbis_por_linea_cotizacion
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT 'fdc05a03f53060c3a7998ae09234dba133c91e0fbde7d050d365ec52589261cb', 1784664417850::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = 'fdc05a03f53060c3a7998ae09234dba133c91e0fbde7d050d365ec52589261cb')
     AND (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_payable_id_company_uq'));  --  0032_aislamiento_estructural
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT 'da4785e9300d222f7689349ecd8b9e292f68693dbf47c744a38ca4842e227822', 1784664418850::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = 'da4785e9300d222f7689349ecd8b9e292f68693dbf47c744a38ca4842e227822')
     AND (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='dgii_submissions' AND column_name='security_code'));  --  0041_codigo_seguridad_por_envio
  INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
  SELECT 'b315100edd38aaf613c17fa7032470763aacd269af1cb6c88147dbc1a83403a2', 1784664419850::bigint
   WHERE NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" WHERE hash = 'b315100edd38aaf613c17fa7032470763aacd269af1cb6c88147dbc1a83403a2')
     AND (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoice_lines' AND column_name='tax_category'));  --  0042_exento_o_tasa_cero

  -- ------------------------------------------------------------------
  -- 3. Poner al dia las marcas de tiempo.
  --
  --    Los INSERT de arriba son idempotentes por hash: si la fila ya estaba,
  --    no la tocan. El problema es que el `when` de una entrada CAMBIA cuando
  --    se mete otra migracion delante en el journal. Observado con la 0032:
  --    estaba aplicada Y registrada, pero con su marca vieja, que quedaba por
  --    debajo de la ultima. `migrate` la veia como PENDIENTE.
  -- ------------------------------------------------------------------
  WITH journal(tag, cuando, h) AS (VALUES
           ('0000_violet_pestilence', 1780868667570::bigint, '2c8e559e04d9efe19fb56ede2f6f1ee32d604ed8aba8a723b8aab57588c5c772'),
           ('0001_real_timeslip', 1780868703931::bigint, '9a42ae395d5ca9e658c09611144bdcd96bbb4c0a55a65828be4728f801a1c323'),
           ('0002_add_product_fields', 1780868800000::bigint, '845c51f6e319091b3f2830abb046be4889f612aa4f671176c6acda3ccfcb1ed3'),
           ('0003_high_sphinx', 1780934513884::bigint, '6c73f66821421537009babecd965bbd77e500337ec424b52d8bf4d160018c751'),
           ('0004_perfect_sleeper', 1780936590492::bigint, 'f455d0eb5fb7b290f2f59fdfbd6f9bdb261a32671d1b018d4e87ec2002b1a693'),
           ('0005_classy_aqueduct', 1780953227060::bigint, '036a0bf343d15c6f38c48d678bb749c8c920d009cdd523704472bd8114926a5e'),
           ('0006_third_synch', 1780958570301::bigint, 'b96321445f90bd238841bc979b58618f73f712aff574d170d8f264c78226090f'),
           ('0007_wide_dust', 1780971093207::bigint, '8c87e27d4a7b37d4aa13a320dd7af4d320ed6903e4fb9c298f45b76d6d96e92d'),
           ('0008_sparkling_bug', 1781178674667::bigint, '220fe4cc38b0893960c11118498c4b363f9e4837773ff69e84bb6d7e55738ca1'),
           ('0009_known_proemial_gods', 1781217421965::bigint, 'ab5adab3377c8b428f0b1f98df372f977d53be1d91b6ed00d786395937adbfbb'),
           ('0010_narrow_tarot', 1781226612769::bigint, 'b7bd9aac4dc9c9450360b49cc19bff3411784836a071200a85cd0a580dd59cb4'),
           ('0011_round_forge', 1781391338953::bigint, '382fecff577639491ece2fe1b935e2256d7c5741abfc372da5143b7b0a7e583e'),
           ('0012_ambiguous_texas_twister', 1781799867056::bigint, '3acd576657726a91624276825151625ef7fb864c57505dfd9161216d932e80a2'),
           ('0013_next_gauntlet', 1782144592358::bigint, 'e2f570325e4752eb9b5b9581903a92e21865a8859e05a043e290a39426122094'),
           ('0014_spotty_king_bedlam', 1782227039285::bigint, 'bb53b418c065ddee26a1c30eecfe55f726c0b154e68cd8b59d5bb7e73a47e815'),
           ('0015_premium_boomer', 1782435879830::bigint, '9555a161f62a9ff4126c798c233693746778a61ef745c10870e2050f1727fbee'),
           ('0016_handy_klaw', 1782441567318::bigint, '9a1a93a161de2f3be32ef2f03d3b0fa4b6d8045bc35cfd3543b587609a3386d9'),
           ('0017_breezy_wolfpack', 1782444887858::bigint, '39f622566690137440763968331addf8f308efb8fc8f1d7bdf1644c93943215a'),
           ('0018_flashy_thor_girl', 1782506651089::bigint, 'd4747426397a20cfe0ee299376240ef9d021cf1ea419895adce769704042ec94'),
           ('0019_add_user_avatar_fields', 1782572361776::bigint, '596a7115b1982d86cc4eb86dfdb83f50fd1d03a13899b66794c5aea05c368d5a'),
           ('0020_add_rbac_system_tables', 1782574740036::bigint, '134d4e6d1d9310c7bca1e2d56b0209f0fe5b0d1901d3174fde11368f78187ff3'),
           ('0021_marvelous_reavers', 1782679327307::bigint, '7d4cee75f27c16d38559aae172990b688861adb47f3a9f36f5d3ecdd408d49a4'),
           ('0022_dapper_skreet', 1782779457936::bigint, '1d3e48a9d93ab4ac4118682b01856bbf1c4fd41ddd067d3c2a33020c76d6cb32'),
           ('0023_right_silver_samurai', 1782781405474::bigint, 'e689d19af04cab51aff78ef4734dae6ebd27e89772441f7aeb384d40af366ee6'),
           ('0024_petite_blizzard', 1782938503006::bigint, 'f5ac221a77930b61abe875b49563a279cfd88a06575824a469f8d4f4286f49fd'),
           ('0025_wide_cassandra_nova', 1783632285472::bigint, '399c445c8c781afd8def7088802587436ad25af228632b53ea2540391daca3be'),
           ('0026_glorious_serpent_society', 1783736001048::bigint, 'efbf521207af2f0f82636426b045e704b83816d9db03c0448c3860b0d527787f'),
           ('0027_faulty_lake', 1784651897848::bigint, 'd146d151499b4bcc9efbe0451d11131e732a55ce4b4f8f367b0643aad3b9fcf9'),
           ('0028_foamy_iron_fist', 1784664403850::bigint, '18e64ba519b676c06b4d5247aeaa4f2287b4d8afe20039320d64fc0eaf0bee9e'),
           ('0030_reconciliacion', 1784664404850::bigint, 'b2f10b63ce9915dcb4f17f3d9544a849897d21b02a3eb41fb19e7baf3e6aba7e'),
           ('0031_inventario_no_negativo', 1784664405850::bigint, '8ac2881a7c55752bba5ca0bf5760fe8ae1706aa3eccd480e84f6b1c4ec74eaf4'),
           ('0025_immutable_audit_logs', 1784664407850::bigint, 'f1261f7329d6beeed1cd5366e3a2317b84bae40f940d9bb5e79913190e64ec0d'),
           ('0033_producto_sin_inventario', 1784664409850::bigint, 'd047f6f3f6c267b23817b534663fc33b37df5bd49826502e6d618ce12ea3b6ad'),
           ('0034_secuencia_codigo_factura', 1784664410850::bigint, 'c80bb7aa4b93615798be84d92abfbec533876fc605985951d7ff3f582f9f0937'),
           ('0035_envio_dgii_por_intento', 1784664411850::bigint, '2ca85f56f96a609bd730954133f2d41d1c3b2b470bd0014280c571913d1e95b8'),
           ('0036_saldo_banco_por_entorno', 1784664412850::bigint, '69e54f5f31e9ab4c17276895a90006e62b415b5379755dd5f4afa983d34f7708'),
           ('0037_negar_acceso_publico', 1784664413850::bigint, 'e62accc58b3a04d0ecfd9371faa9b3c0255ae9b4746e062501ee49eb62817763'),
           ('0038_vistas_publicas_por_empresa', 1784664414850::bigint, 'd766e589dd3a7d6fca72bf0da5acc29d454ca57d22d2f550bfeb834badf8ccb3'),
           ('0039_tasa_itbis_por_linea', 1784664415850::bigint, '57afce1b903053fd256e258c2a38f6c05a6e6e060272d3fc08c06d2df77f17b1'),
           ('0040_tasa_itbis_por_linea_cotizacion', 1784664416850::bigint, '4bb19bf0157e572011ed7fe6dd1f9d80a518e1472340b94987b3a79154264e4e'),
           ('0032_aislamiento_estructural', 1784664417850::bigint, 'fdc05a03f53060c3a7998ae09234dba133c91e0fbde7d050d365ec52589261cb'),
           ('0041_codigo_seguridad_por_envio', 1784664418850::bigint, 'da4785e9300d222f7689349ecd8b9e292f68693dbf47c744a38ca4842e227822'),
           ('0042_exento_o_tasa_cero', 1784664419850::bigint, 'b315100edd38aaf613c17fa7032470763aacd269af1cb6c88147dbc1a83403a2')
  )
  UPDATE drizzle."__drizzle_migrations" m
     SET created_at = j.cuando
    FROM journal j
   WHERE m.hash = j.h AND m.created_at IS DISTINCT FROM j.cuando;
  GET DIAGNOSTICS n_despues = ROW_COUNT;
  IF n_despues > 0 THEN
    RAISE NOTICE 'Marcas de tiempo corregidas en % fila(s) (el journal se reordeno).', n_despues;
  END IF;

  -- ------------------------------------------------------------------
  -- 4. Comprobar que no quedo ningun hueco por debajo del maximo.
  -- ------------------------------------------------------------------
  SELECT count(*), max(created_at) INTO n_despues, tope FROM drizzle."__drizzle_migrations";

  SELECT array_agg(v.tag ORDER BY v.cuando) INTO faltan
    FROM (VALUES
           ('0000_violet_pestilence', 1780868667570::bigint, '2c8e559e04d9efe19fb56ede2f6f1ee32d604ed8aba8a723b8aab57588c5c772'),
           ('0001_real_timeslip', 1780868703931::bigint, '9a42ae395d5ca9e658c09611144bdcd96bbb4c0a55a65828be4728f801a1c323'),
           ('0002_add_product_fields', 1780868800000::bigint, '845c51f6e319091b3f2830abb046be4889f612aa4f671176c6acda3ccfcb1ed3'),
           ('0003_high_sphinx', 1780934513884::bigint, '6c73f66821421537009babecd965bbd77e500337ec424b52d8bf4d160018c751'),
           ('0004_perfect_sleeper', 1780936590492::bigint, 'f455d0eb5fb7b290f2f59fdfbd6f9bdb261a32671d1b018d4e87ec2002b1a693'),
           ('0005_classy_aqueduct', 1780953227060::bigint, '036a0bf343d15c6f38c48d678bb749c8c920d009cdd523704472bd8114926a5e'),
           ('0006_third_synch', 1780958570301::bigint, 'b96321445f90bd238841bc979b58618f73f712aff574d170d8f264c78226090f'),
           ('0007_wide_dust', 1780971093207::bigint, '8c87e27d4a7b37d4aa13a320dd7af4d320ed6903e4fb9c298f45b76d6d96e92d'),
           ('0008_sparkling_bug', 1781178674667::bigint, '220fe4cc38b0893960c11118498c4b363f9e4837773ff69e84bb6d7e55738ca1'),
           ('0009_known_proemial_gods', 1781217421965::bigint, 'ab5adab3377c8b428f0b1f98df372f977d53be1d91b6ed00d786395937adbfbb'),
           ('0010_narrow_tarot', 1781226612769::bigint, 'b7bd9aac4dc9c9450360b49cc19bff3411784836a071200a85cd0a580dd59cb4'),
           ('0011_round_forge', 1781391338953::bigint, '382fecff577639491ece2fe1b935e2256d7c5741abfc372da5143b7b0a7e583e'),
           ('0012_ambiguous_texas_twister', 1781799867056::bigint, '3acd576657726a91624276825151625ef7fb864c57505dfd9161216d932e80a2'),
           ('0013_next_gauntlet', 1782144592358::bigint, 'e2f570325e4752eb9b5b9581903a92e21865a8859e05a043e290a39426122094'),
           ('0014_spotty_king_bedlam', 1782227039285::bigint, 'bb53b418c065ddee26a1c30eecfe55f726c0b154e68cd8b59d5bb7e73a47e815'),
           ('0015_premium_boomer', 1782435879830::bigint, '9555a161f62a9ff4126c798c233693746778a61ef745c10870e2050f1727fbee'),
           ('0016_handy_klaw', 1782441567318::bigint, '9a1a93a161de2f3be32ef2f03d3b0fa4b6d8045bc35cfd3543b587609a3386d9'),
           ('0017_breezy_wolfpack', 1782444887858::bigint, '39f622566690137440763968331addf8f308efb8fc8f1d7bdf1644c93943215a'),
           ('0018_flashy_thor_girl', 1782506651089::bigint, 'd4747426397a20cfe0ee299376240ef9d021cf1ea419895adce769704042ec94'),
           ('0019_add_user_avatar_fields', 1782572361776::bigint, '596a7115b1982d86cc4eb86dfdb83f50fd1d03a13899b66794c5aea05c368d5a'),
           ('0020_add_rbac_system_tables', 1782574740036::bigint, '134d4e6d1d9310c7bca1e2d56b0209f0fe5b0d1901d3174fde11368f78187ff3'),
           ('0021_marvelous_reavers', 1782679327307::bigint, '7d4cee75f27c16d38559aae172990b688861adb47f3a9f36f5d3ecdd408d49a4'),
           ('0022_dapper_skreet', 1782779457936::bigint, '1d3e48a9d93ab4ac4118682b01856bbf1c4fd41ddd067d3c2a33020c76d6cb32'),
           ('0023_right_silver_samurai', 1782781405474::bigint, 'e689d19af04cab51aff78ef4734dae6ebd27e89772441f7aeb384d40af366ee6'),
           ('0024_petite_blizzard', 1782938503006::bigint, 'f5ac221a77930b61abe875b49563a279cfd88a06575824a469f8d4f4286f49fd'),
           ('0025_wide_cassandra_nova', 1783632285472::bigint, '399c445c8c781afd8def7088802587436ad25af228632b53ea2540391daca3be'),
           ('0026_glorious_serpent_society', 1783736001048::bigint, 'efbf521207af2f0f82636426b045e704b83816d9db03c0448c3860b0d527787f'),
           ('0027_faulty_lake', 1784651897848::bigint, 'd146d151499b4bcc9efbe0451d11131e732a55ce4b4f8f367b0643aad3b9fcf9'),
           ('0028_foamy_iron_fist', 1784664403850::bigint, '18e64ba519b676c06b4d5247aeaa4f2287b4d8afe20039320d64fc0eaf0bee9e'),
           ('0030_reconciliacion', 1784664404850::bigint, 'b2f10b63ce9915dcb4f17f3d9544a849897d21b02a3eb41fb19e7baf3e6aba7e'),
           ('0031_inventario_no_negativo', 1784664405850::bigint, '8ac2881a7c55752bba5ca0bf5760fe8ae1706aa3eccd480e84f6b1c4ec74eaf4'),
           ('0025_immutable_audit_logs', 1784664407850::bigint, 'f1261f7329d6beeed1cd5366e3a2317b84bae40f940d9bb5e79913190e64ec0d'),
           ('0033_producto_sin_inventario', 1784664409850::bigint, 'd047f6f3f6c267b23817b534663fc33b37df5bd49826502e6d618ce12ea3b6ad'),
           ('0034_secuencia_codigo_factura', 1784664410850::bigint, 'c80bb7aa4b93615798be84d92abfbec533876fc605985951d7ff3f582f9f0937'),
           ('0035_envio_dgii_por_intento', 1784664411850::bigint, '2ca85f56f96a609bd730954133f2d41d1c3b2b470bd0014280c571913d1e95b8'),
           ('0036_saldo_banco_por_entorno', 1784664412850::bigint, '69e54f5f31e9ab4c17276895a90006e62b415b5379755dd5f4afa983d34f7708'),
           ('0037_negar_acceso_publico', 1784664413850::bigint, 'e62accc58b3a04d0ecfd9371faa9b3c0255ae9b4746e062501ee49eb62817763'),
           ('0038_vistas_publicas_por_empresa', 1784664414850::bigint, 'd766e589dd3a7d6fca72bf0da5acc29d454ca57d22d2f550bfeb834badf8ccb3'),
           ('0039_tasa_itbis_por_linea', 1784664415850::bigint, '57afce1b903053fd256e258c2a38f6c05a6e6e060272d3fc08c06d2df77f17b1'),
           ('0040_tasa_itbis_por_linea_cotizacion', 1784664416850::bigint, '4bb19bf0157e572011ed7fe6dd1f9d80a518e1472340b94987b3a79154264e4e'),
           ('0032_aislamiento_estructural', 1784664417850::bigint, 'fdc05a03f53060c3a7998ae09234dba133c91e0fbde7d050d365ec52589261cb'),
           ('0041_codigo_seguridad_por_envio', 1784664418850::bigint, 'da4785e9300d222f7689349ecd8b9e292f68693dbf47c744a38ca4842e227822'),
           ('0042_exento_o_tasa_cero', 1784664419850::bigint, 'b315100edd38aaf613c17fa7032470763aacd269af1cb6c88147dbc1a83403a2')
         ) AS v(tag, cuando, h)
   WHERE v.cuando < tope
     AND NOT EXISTS (SELECT 1 FROM drizzle."__drizzle_migrations" m WHERE m.hash = v.h);

  IF faltan IS NOT NULL THEN
    RAISE EXCEPTION 'FALLO: quedaron huecos por debajo del maximo (%). Serian irrecuperables: %', tope, array_to_string(faltan, ', ');
  END IF;

  RAISE NOTICE 'COMPROBADO: % filas (antes %), ultimo created_at %, sin huecos.', n_despues, n_antes, tope;

  -- ------------------------------------------------------------------
  -- 5. Que queda pendiente. Como las altas de arriba son condicionales al
  --    marcador de cada migracion, "no registrada" significa exactamente "no
  --    aplicada", y basta con mirar quien no quedo en el ledger. No se
  --    escribe a mano: la version anterior decia siempre "la 0032", y eso
  --    dejo de ser cierto en cuanto la 0032 se aplico.
  -- ------------------------------------------------------------------
  SELECT array_agg(t.tag ORDER BY t.tag) INTO pendientes
    FROM (VALUES
           ('0025_immutable_audit_logs', 'f1261f7329d6beeed1cd5366e3a2317b84bae40f940d9bb5e79913190e64ec0d'),
           ('0033_producto_sin_inventario', 'd047f6f3f6c267b23817b534663fc33b37df5bd49826502e6d618ce12ea3b6ad'),
           ('0034_secuencia_codigo_factura', 'c80bb7aa4b93615798be84d92abfbec533876fc605985951d7ff3f582f9f0937'),
           ('0035_envio_dgii_por_intento', '2ca85f56f96a609bd730954133f2d41d1c3b2b470bd0014280c571913d1e95b8'),
           ('0036_saldo_banco_por_entorno', '69e54f5f31e9ab4c17276895a90006e62b415b5379755dd5f4afa983d34f7708'),
           ('0037_negar_acceso_publico', 'e62accc58b3a04d0ecfd9371faa9b3c0255ae9b4746e062501ee49eb62817763'),
           ('0038_vistas_publicas_por_empresa', 'd766e589dd3a7d6fca72bf0da5acc29d454ca57d22d2f550bfeb834badf8ccb3'),
           ('0039_tasa_itbis_por_linea', '57afce1b903053fd256e258c2a38f6c05a6e6e060272d3fc08c06d2df77f17b1'),
           ('0040_tasa_itbis_por_linea_cotizacion', '4bb19bf0157e572011ed7fe6dd1f9d80a518e1472340b94987b3a79154264e4e'),
           ('0032_aislamiento_estructural', 'fdc05a03f53060c3a7998ae09234dba133c91e0fbde7d050d365ec52589261cb'),
           ('0041_codigo_seguridad_por_envio', 'da4785e9300d222f7689349ecd8b9e292f68693dbf47c744a38ca4842e227822'),
           ('0042_exento_o_tasa_cero', 'b315100edd38aaf613c17fa7032470763aacd269af1cb6c88147dbc1a83403a2')
         ) AS t(tag, h)
   WHERE NOT EXISTS (
     SELECT 1 FROM drizzle."__drizzle_migrations" m WHERE m.hash = t.h
   );

  IF pendientes IS NOT NULL THEN
    RAISE NOTICE 'Sin registrar (no aplicadas): %. `migrate` las aplicara.', array_to_string(pendientes, ', ');
  ELSE
    RAISE NOTICE 'No queda ninguna migracion pendiente.';
  END IF;
END $reparar$;
