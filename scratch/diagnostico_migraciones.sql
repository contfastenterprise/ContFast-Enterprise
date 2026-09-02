-- ============================================================================
--  DIAGNOSTICO DEL LEDGER DE MIGRACIONES  --  SOLO LECTURA
-- ============================================================================
--
--  DOS AVERIAS, Y LA PRIMERA ES UNA BOMBA DE RELOJERIA
--  ----------------------------------------------------
--  1. `drizzle.__drizzle_migrations` registraba solo hasta la 0007. De ahi en
--     adelante las migraciones se aplicaron A MANO y la tabla no se entero.
--
--     Drizzle decide que aplicar comparando UNICAMENTE el `created_at` mas
--     reciente de esa tabla contra el `when` de cada entrada del journal. Ni
--     mira los hashes. Es literalmente:
--
--         if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis)
--
--     Con el ledger en 0007, un `drizzle-kit migrate` intenta reaplicar todo lo
--     posterior y aborta en la primera que no sea idempotente.
--
--  2. El journal tenia 31 entradas para 45 ficheros .sql: catorce huerfanos,
--     escritos a mano y numerados colisionando con los de drizzle-kit. Para la
--     herramienta no existian. Comprobado empiricamente: una base construida
--     desde cero con `migrate` salia SIN products.tracks_inventory, SIN
--     invoice_sequences, SIN bank_account_balances y SIN el trigger que hace
--     inmutables los registros de auditoria.
--
--     Se registraron seis (0025, 0032, 0033, 0034, 0035, 0036). Los demas ya
--     los habia arrastrado una regeneracion posterior, y `0020_setup_storage_-
--     bucket` se deja fuera a proposito: escribe en `storage.buckets`, que solo
--     existe en Supabase, y registrarlo haria fallar toda migracion futura en
--     local o en CI.
--
--  Pegar entero en el editor SQL de Supabase. Una sola consulta.
-- ============================================================================

WITH journal(tag, cuando) AS (VALUES
  ('0000_violet_pestilence', 1780868667570::bigint),
  ('0001_real_timeslip', 1780868703931::bigint),
  ('0002_add_product_fields', 1780868800000::bigint),
  ('0003_high_sphinx', 1780934513884::bigint),
  ('0004_perfect_sleeper', 1780936590492::bigint),
  ('0005_classy_aqueduct', 1780953227060::bigint),
  ('0006_third_synch', 1780958570301::bigint),
  ('0007_wide_dust', 1780971093207::bigint),
  ('0008_sparkling_bug', 1781178674667::bigint),
  ('0009_known_proemial_gods', 1781217421965::bigint),
  ('0010_narrow_tarot', 1781226612769::bigint),
  ('0011_round_forge', 1781391338953::bigint),
  ('0012_ambiguous_texas_twister', 1781799867056::bigint),
  ('0013_next_gauntlet', 1782144592358::bigint),
  ('0014_spotty_king_bedlam', 1782227039285::bigint),
  ('0015_premium_boomer', 1782435879830::bigint),
  ('0016_handy_klaw', 1782441567318::bigint),
  ('0017_breezy_wolfpack', 1782444887858::bigint),
  ('0018_flashy_thor_girl', 1782506651089::bigint),
  ('0019_add_user_avatar_fields', 1782572361776::bigint),
  ('0020_add_rbac_system_tables', 1782574740036::bigint),
  ('0021_marvelous_reavers', 1782679327307::bigint),
  ('0022_dapper_skreet', 1782779457936::bigint),
  ('0023_right_silver_samurai', 1782781405474::bigint),
  ('0024_petite_blizzard', 1782938503006::bigint),
  ('0025_wide_cassandra_nova', 1783632285472::bigint),
  ('0026_glorious_serpent_society', 1783736001048::bigint),
  ('0027_faulty_lake', 1784651897848::bigint),
  ('0028_foamy_iron_fist', 1784664403850::bigint),
  ('0030_reconciliacion', 1784664404850::bigint),
  ('0031_inventario_no_negativo', 1784664405850::bigint),
  ('0025_immutable_audit_logs', 1784664407850::bigint),
  ('0033_producto_sin_inventario', 1784664409850::bigint),
  ('0034_secuencia_codigo_factura', 1784664410850::bigint),
  ('0035_envio_dgii_por_intento', 1784664411850::bigint),
  ('0036_saldo_banco_por_entorno', 1784664412850::bigint),
  ('0032_aislamiento_estructural', 1784664413850::bigint)
),
ledger AS (
  SELECT COALESCE(max(created_at), 0)::bigint AS ultimo, count(*)::int AS filas
  FROM drizzle."__drizzle_migrations"
),
huerfano(tag, existe) AS (VALUES
  ('0011_add_codigo_factura', (to_regclass('public.factura_secuencias') IS NOT NULL OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='codigo_factura'))),
  ('0013_add_retentions', (to_regclass('public.retentions') IS NOT NULL)),
  ('0015_add_indicador_nota_credito', (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invoices' AND column_name='indicador_nota_credito'))),
  ('0020_setup_storage_bucket', (to_regclass('storage.buckets') IS NOT NULL)),
  ('0021_marvelous_reavers_custom', (EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='role_permissions_role_perm_idx'))),
  ('0024_enable_rls_policies', (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'))),
  ('0026_nullable_rnc', (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='rnc_cedula' AND is_nullable='YES'))),
  ('0029_add_checks_cleared_date', (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='checks' AND column_name='cleared_date')))
)
SELECT * FROM (
  SELECT 1 AS orden, '1. LEDGER' AS bloque, 'filas registradas' AS concepto, filas::text AS valor FROM ledger
  UNION ALL
  SELECT 1, '1. LEDGER', 'migraciones en el journal', count(*)::text FROM journal
  UNION ALL
  SELECT 1, '1. LEDGER', 'ultima registrada',
         COALESCE((SELECT tag FROM journal WHERE cuando = (SELECT ultimo FROM ledger)),
                  '(el created_at mas reciente no coincide con ninguna)')
  UNION ALL
  SELECT 2, '2. QUE HARIA drizzle-kit migrate', 'migraciones que intentaria aplicar',
         (SELECT count(*)::text FROM journal, ledger WHERE journal.cuando > ledger.ultimo)
  UNION ALL
  SELECT 2, '2. QUE HARIA drizzle-kit migrate', 'la primera de ellas',
         COALESCE((SELECT tag FROM journal, ledger WHERE journal.cuando > ledger.ultimo
                   ORDER BY cuando LIMIT 1), '(ninguna: el ledger esta al dia)')
  UNION ALL
  SELECT 3, '3. HUERFANOS QUE SIGUEN FUERA DEL JOURNAL', tag,
         CASE WHEN existe THEN 'aplicado (lo arrastro una regeneracion posterior)'
              ELSE 'NO aplicado' END
  FROM huerfano
) t
ORDER BY orden, concepto;
