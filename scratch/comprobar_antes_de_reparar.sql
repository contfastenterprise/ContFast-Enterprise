-- Comprobacion previa al paso 3. Solo lectura.
--
-- POR QUE: Drizzle compara UNICAMENTE el created_at mas reciente del ledger.
-- Si se marcan como aplicadas las ultimas y se deja un hueco en medio, la que
-- quedo en el hueco no se aplicara nunca -- nadie mira los huecos. Asi que hay
-- que saber que hay realmente antes de escribir el ledger.
SELECT '0025 trigger audit inmutable' AS migracion,
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='prevent_audit_log_modification')
            THEN 'aplicada' ELSE 'NO aplicada' END AS estado
UNION ALL SELECT '0032 claves foraneas compuestas',
       CASE WHEN EXISTS (SELECT 1 FROM pg_constraint WHERE conname='accounts_payable_id_company_uq')
            THEN 'aplicada' ELSE 'NO aplicada' END
UNION ALL SELECT '0033 tracks_inventory',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name='products' AND column_name='tracks_inventory')
            THEN 'aplicada' ELSE 'NO aplicada' END
UNION ALL SELECT '0034 invoice_sequences',
       CASE WHEN to_regclass('public.invoice_sequences') IS NOT NULL
            THEN 'aplicada' ELSE 'NO aplicada' END
UNION ALL SELECT '0035 indices de envios DGII',
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='dgii_submissions_invoice_created_idx')
            THEN 'aplicada' ELSE 'NO aplicada' END
UNION ALL SELECT '0036 bank_account_balances',
       CASE WHEN to_regclass('public.bank_account_balances') IS NOT NULL
            THEN 'aplicada' ELSE 'NO aplicada' END
UNION ALL SELECT '--- politicas RLS en public (0024) ---',
       (SELECT count(*)::text || ' politicas' FROM pg_policies WHERE schemaname='public')
UNION ALL SELECT '--- tablas con RLS activado ---',
       (SELECT count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity)
ORDER BY 1;
