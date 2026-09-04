DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND column_name = 'company_id'
    LOOP
        -- Enable RLS
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.table_name);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', r.table_name);
        
        -- Drop policy if exists
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I', r.table_name);
        
        -- Create the policy
        EXECUTE format('
            CREATE POLICY tenant_isolation_policy ON %I
            FOR ALL
            USING (
                (NULLIF(current_setting(''app.current_company_id'', true), '''') IS NULL) OR
                (company_id = NULLIF(current_setting(''app.current_company_id'', true), '''')::uuid)
            )
            WITH CHECK (
                (NULLIF(current_setting(''app.current_company_id'', true), '''') IS NULL) OR
                (company_id = NULLIF(current_setting(''app.current_company_id'', true), '''')::uuid)
            )
        ', r.table_name);
        
        RAISE NOTICE 'Enabled RLS and tenant policy on table %', r.table_name;
    END LOOP;
END $$;
