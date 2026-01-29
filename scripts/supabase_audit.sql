-- ============================================================================
-- SUPABASE DATABASE AUDIT SCRIPT
-- Motion Granted Production Database
-- Version: 1.0.0
--
-- USAGE: Paste this entire script into Supabase SQL Editor and run.
--        Output will appear in the "Messages" tab as markdown.
--        Copy the output for documentation.
--
-- WARNING: READ-ONLY. No destructive operations.
-- ============================================================================

DO $$
DECLARE
    output TEXT := '';
    r RECORD;
    r2 RECORD;
    section_count INT := 0;
    table_count INT := 0;
    rls_disabled_count INT := 0;
    no_policy_count INT := 0;
    current_table TEXT := '';
    col_list TEXT := '';
    idx_list TEXT := '';
    fk_list TEXT := '';
    policy_list TEXT := '';
    enum_values TEXT := '';
    func_list TEXT := '';
    trigger_list TEXT := '';
    bucket_list TEXT := '';
    migration_list TEXT := '';
BEGIN
    -- ========================================================================
    -- HEADER
    -- ========================================================================
    output := output || '# Supabase Database Audit Report' || E'\n';
    output := output || '_Motion Granted Production_' || E'\n';
    output := output || '_Generated: ' || NOW()::TEXT || '_' || E'\n';
    output := output || E'\n---\n\n';

    -- ========================================================================
    -- SECTION 1: SCHEMA OVERVIEW
    -- ========================================================================
    output := output || '## 1. Schema Overview' || E'\n\n';
    output := output || '| Table | Est. Rows | Size | Last Vacuum | Last Analyze |' || E'\n';
    output := output || '|-------|-----------|------|-------------|--------------|' || E'\n';

    FOR r IN
        SELECT
            schemaname,
            relname AS table_name,
            n_live_tup AS row_count,
            pg_size_pretty(pg_total_relation_size(schemaname || '.' || relname)) AS total_size,
            COALESCE(last_vacuum::TEXT, 'Never') AS last_vacuum,
            COALESCE(last_analyze::TEXT, 'Never') AS last_analyze
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
        ORDER BY relname
    LOOP
        output := output || '| ' || r.table_name || ' | ' ||
                  COALESCE(r.row_count::TEXT, '0') || ' | ' ||
                  r.total_size || ' | ' ||
                  r.last_vacuum || ' | ' ||
                  r.last_analyze || ' |' || E'\n';
        table_count := table_count + 1;
    END LOOP;

    output := output || E'\n**Total Tables:** ' || table_count || E'\n\n';

    -- ========================================================================
    -- SECTION 2: TABLE DEFINITIONS
    -- ========================================================================
    output := output || '---' || E'\n\n';
    output := output || '## 2. Table Definitions' || E'\n\n';

    FOR r IN
        SELECT DISTINCT table_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name
    LOOP
        output := output || '### Table: `' || r.table_name || '`' || E'\n\n';
        output := output || '| Column | Type | Nullable | Default |' || E'\n';
        output := output || '|--------|------|----------|---------|' || E'\n';

        FOR r2 IN
            SELECT
                column_name,
                data_type,
                CASE WHEN character_maximum_length IS NOT NULL
                     THEN data_type || '(' || character_maximum_length || ')'
                     WHEN numeric_precision IS NOT NULL AND data_type = 'numeric'
                     THEN data_type || '(' || numeric_precision || ',' || COALESCE(numeric_scale, 0) || ')'
                     ELSE data_type
                END AS full_type,
                is_nullable,
                COALESCE(SUBSTRING(column_default, 1, 50), '-') AS column_default
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = r.table_name
            ORDER BY ordinal_position
        LOOP
            output := output || '| ' || r2.column_name || ' | ' ||
                      r2.full_type || ' | ' ||
                      r2.is_nullable || ' | ' ||
                      REPLACE(r2.column_default, '|', '\\|') || ' |' || E'\n';
        END LOOP;

        output := output || E'\n';
    END LOOP;

    -- ========================================================================
    -- SECTION 3: PRIMARY KEYS & INDEXES
    -- ========================================================================
    output := output || '---' || E'\n\n';
    output := output || '## 3. Primary Keys & Indexes' || E'\n\n';
    output := output || '| Table | Index Name | Columns | Unique | Primary |' || E'\n';
    output := output || '|-------|------------|---------|--------|---------|' || E'\n';

    FOR r IN
        SELECT
            tablename,
            indexname,
            indexdef,
            CASE WHEN indexdef LIKE '%UNIQUE%' THEN 'Yes' ELSE 'No' END AS is_unique,
            CASE WHEN indexname LIKE '%pkey%' THEN 'Yes' ELSE 'No' END AS is_primary
        FROM pg_indexes
        WHERE schemaname = 'public'
        ORDER BY tablename, indexname
    LOOP
        -- Extract columns from indexdef
        col_list := REGEXP_REPLACE(r.indexdef, '.*\((.*)\).*', '\1');
        output := output || '| ' || r.tablename || ' | ' ||
                  r.indexname || ' | ' ||
                  col_list || ' | ' ||
                  r.is_unique || ' | ' ||
                  r.is_primary || ' |' || E'\n';
    END LOOP;

    output := output || E'\n';

    -- ========================================================================
    -- SECTION 4: FOREIGN KEY RELATIONSHIPS
    -- ========================================================================
    output := output || '---' || E'\n\n';
    output := output || '## 4. Foreign Key Relationships' || E'\n\n';
    output := output || '| Source Table | Column | → Target Table | Target Column | On Delete |' || E'\n';
    output := output || '|--------------|--------|----------------|---------------|-----------|' || E'\n';

    FOR r IN
        SELECT
            tc.table_name AS source_table,
            kcu.column_name AS source_column,
            ccu.table_name AS target_table,
            ccu.column_name AS target_column,
            rc.delete_rule
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
        JOIN information_schema.referential_constraints AS rc
            ON rc.constraint_name = tc.constraint_name
            AND rc.constraint_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
        ORDER BY tc.table_name, kcu.column_name
    LOOP
        output := output || '| ' || r.source_table || ' | ' ||
                  r.source_column || ' | ' ||
                  r.target_table || ' | ' ||
                  r.target_column || ' | ' ||
                  r.delete_rule || ' |' || E'\n';
    END LOOP;

    output := output || E'\n';

    -- ========================================================================
    -- SECTION 5: ROW LEVEL SECURITY AUDIT (CRITICAL)
    -- ========================================================================
    output := output || '---' || E'\n\n';
    output := output || '## 5. Row Level Security Audit' || E'\n\n';
    output := output || '### RLS Status by Table' || E'\n\n';
    output := output || '| Table | RLS Enabled | Policy Count | Status |' || E'\n';
    output := output || '|-------|-------------|--------------|--------|' || E'\n';

    FOR r IN
        SELECT
            c.relname AS table_name,
            c.relrowsecurity AS rls_enabled,
            COALESCE(policy_counts.policy_count, 0) AS policy_count
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN (
            SELECT
                schemaname,
                tablename,
                COUNT(*) AS policy_count
            FROM pg_policies
            GROUP BY schemaname, tablename
        ) policy_counts ON policy_counts.schemaname = n.nspname
                       AND policy_counts.tablename = c.relname
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
        ORDER BY c.relname
    LOOP
        IF NOT r.rls_enabled THEN
            output := output || '| ' || r.table_name || ' | ⚠️ **NO** | ' ||
                      r.policy_count || ' | 🔴 **RLS DISABLED** |' || E'\n';
            rls_disabled_count := rls_disabled_count + 1;
        ELSIF r.policy_count = 0 THEN
            output := output || '| ' || r.table_name || ' | Yes | ' ||
                      r.policy_count || ' | 🟡 **NO POLICIES** |' || E'\n';
            no_policy_count := no_policy_count + 1;
        ELSE
            output := output || '| ' || r.table_name || ' | Yes | ' ||
                      r.policy_count || ' | ✅ OK |' || E'\n';
        END IF;
    END LOOP;

    output := output || E'\n';

    -- RLS Summary
    IF rls_disabled_count > 0 OR no_policy_count > 0 THEN
        output := output || '### ⚠️ RLS WARNINGS' || E'\n\n';
        IF rls_disabled_count > 0 THEN
            output := output || '- **' || rls_disabled_count || ' tables have RLS DISABLED** — Data may be exposed!' || E'\n';
        END IF;
        IF no_policy_count > 0 THEN
            output := output || '- **' || no_policy_count || ' tables have RLS enabled but NO POLICIES** — All access blocked!' || E'\n';
        END IF;
        output := output || E'\n';
    ELSE
        output := output || '### ✅ All tables have RLS enabled with policies' || E'\n\n';
    END IF;

    -- Policy Details
    output := output || '### Policy Details' || E'\n\n';

    FOR r IN
        SELECT DISTINCT tablename
        FROM pg_policies
        WHERE schemaname = 'public'
        ORDER BY tablename
    LOOP
        output := output || '#### `' || r.tablename || '`' || E'\n\n';
        output := output || '| Policy | Command | Roles | Permissive |' || E'\n';
        output := output || '|--------|---------|-------|------------|' || E'\n';

        FOR r2 IN
            SELECT
                policyname,
                cmd,
                COALESCE(array_to_string(roles, ', '), 'public') AS roles,
                CASE WHEN permissive = 'PERMISSIVE' THEN 'Yes' ELSE 'No' END AS permissive,
                COALESCE(SUBSTRING(qual::TEXT, 1, 100), '-') AS using_expr,
                COALESCE(SUBSTRING(with_check::TEXT, 1, 100), '-') AS check_expr
            FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = r.tablename
            ORDER BY policyname
        LOOP
            output := output || '| ' || r2.policyname || ' | ' ||
                      r2.cmd || ' | ' ||
                      r2.roles || ' | ' ||
                      r2.permissive || ' |' || E'\n';
        END LOOP;

        output := output || E'\n';
    END LOOP;

    -- ========================================================================
    -- SECTION 6: ENUMS
    -- ========================================================================
    output := output || '---' || E'\n\n';
    output := output || '## 6. Custom Enum Types' || E'\n\n';

    FOR r IN
        SELECT
            t.typname AS enum_name,
            string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS enum_values
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
        GROUP BY t.typname
        ORDER BY t.typname
    LOOP
        output := output || '### `' || r.enum_name || '`' || E'\n';
        output := output || 'Values: `' || r.enum_values || '`' || E'\n\n';
    END LOOP;

    -- Check if any enums found
    SELECT COUNT(*) INTO section_count
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typtype = 'e';

    IF section_count = 0 THEN
        output := output || '_No custom enum types found in public schema._' || E'\n\n';
    END IF;

    -- ========================================================================
    -- SECTION 7: FUNCTIONS & TRIGGERS
    -- ========================================================================
    output := output || '---' || E'\n\n';
    output := output || '## 7. Functions & Triggers' || E'\n\n';

    -- Functions
    output := output || '### User-Defined Functions' || E'\n\n';
    output := output || '| Function | Return Type | Language | Security |' || E'\n';
    output := output || '|----------|-------------|----------|----------|' || E'\n';

    FOR r IN
        SELECT
            routine_name,
            data_type AS return_type,
            external_language AS language,
            security_type
        FROM information_schema.routines
        WHERE routine_schema = 'public'
          AND routine_type = 'FUNCTION'
        ORDER BY routine_name
    LOOP
        output := output || '| ' || r.routine_name || ' | ' ||
                  COALESCE(r.return_type, 'void') || ' | ' ||
                  r.language || ' | ' ||
                  r.security_type || ' |' || E'\n';
    END LOOP;

    SELECT COUNT(*) INTO section_count
    FROM information_schema.routines
    WHERE routine_schema = 'public' AND routine_type = 'FUNCTION';

    IF section_count = 0 THEN
        output := output || '| _No user-defined functions_ | - | - | - |' || E'\n';
    END IF;

    output := output || E'\n';

    -- Triggers
    output := output || '### Triggers' || E'\n\n';
    output := output || '| Table | Trigger | Event | Timing | Function |' || E'\n';
    output := output || '|-------|---------|-------|--------|----------|' || E'\n';

    FOR r IN
        SELECT
            event_object_table AS table_name,
            trigger_name,
            event_manipulation AS event,
            action_timing AS timing,
            action_statement
        FROM information_schema.triggers
        WHERE trigger_schema = 'public'
        ORDER BY event_object_table, trigger_name
    LOOP
        -- Extract function name from action_statement
        func_list := REGEXP_REPLACE(r.action_statement, '.*EXECUTE FUNCTION ([^\(]+).*', '\1');
        output := output || '| ' || r.table_name || ' | ' ||
                  r.trigger_name || ' | ' ||
                  r.event || ' | ' ||
                  r.timing || ' | ' ||
                  func_list || ' |' || E'\n';
    END LOOP;

    SELECT COUNT(*) INTO section_count
    FROM information_schema.triggers
    WHERE trigger_schema = 'public';

    IF section_count = 0 THEN
        output := output || '| _No triggers_ | - | - | - | - |' || E'\n';
    END IF;

    output := output || E'\n';

    -- ========================================================================
    -- SECTION 8: STORAGE BUCKETS
    -- ========================================================================
    output := output || '---' || E'\n\n';
    output := output || '## 8. Storage Buckets' || E'\n\n';

    BEGIN
        output := output || '| Bucket | Public | Size Limit | Allowed Types |' || E'\n';
        output := output || '|--------|--------|------------|---------------|' || E'\n';

        FOR r IN
            SELECT
                name,
                public,
                COALESCE(file_size_limit::TEXT, 'No limit') AS size_limit,
                COALESCE(array_to_string(allowed_mime_types, ', '), 'All types') AS mime_types
            FROM storage.buckets
            ORDER BY name
        LOOP
            output := output || '| ' || r.name || ' | ' ||
                      CASE WHEN r.public THEN 'Yes' ELSE 'No' END || ' | ' ||
                      r.size_limit || ' | ' ||
                      r.mime_types || ' |' || E'\n';
        END LOOP;

        SELECT COUNT(*) INTO section_count FROM storage.buckets;

        IF section_count = 0 THEN
            output := output || '| _No storage buckets configured_ | - | - | - |' || E'\n';
        END IF;
    EXCEPTION WHEN undefined_table THEN
        output := output || '_Storage schema not accessible or not configured._' || E'\n';
    END;

    output := output || E'\n';

    -- ========================================================================
    -- SECTION 9: AUTH CONFIG
    -- ========================================================================
    output := output || '---' || E'\n\n';
    output := output || '## 9. Supabase Auth Summary' || E'\n\n';

    BEGIN
        SELECT COUNT(*) INTO section_count FROM auth.users;
        output := output || '- **Total Users:** ' || section_count || E'\n';

        -- Check for confirmed users
        SELECT COUNT(*) INTO section_count
        FROM auth.users
        WHERE email_confirmed_at IS NOT NULL;
        output := output || '- **Confirmed Users:** ' || section_count || E'\n';

        -- Check for users created in last 7 days
        SELECT COUNT(*) INTO section_count
        FROM auth.users
        WHERE created_at > NOW() - INTERVAL '7 days';
        output := output || '- **New Users (7 days):** ' || section_count || E'\n';

    EXCEPTION WHEN insufficient_privilege THEN
        output := output || '_Auth schema requires elevated permissions to audit._' || E'\n';
    WHEN undefined_table THEN
        output := output || '_Auth schema not accessible._' || E'\n';
    END;

    output := output || E'\n';

    -- ========================================================================
    -- SECTION 10: MIGRATION HISTORY
    -- ========================================================================
    output := output || '---' || E'\n\n';
    output := output || '## 10. Migration History' || E'\n\n';

    BEGIN
        output := output || '| Version | Name | Applied At |' || E'\n';
        output := output || '|---------|------|------------|' || E'\n';

        FOR r IN
            SELECT
                version,
                name,
                statements_applied_at AS applied_at
            FROM supabase_migrations.schema_migrations
            ORDER BY version DESC
            LIMIT 20
        LOOP
            output := output || '| ' || r.version || ' | ' ||
                      COALESCE(r.name, '-') || ' | ' ||
                      COALESCE(r.applied_at::TEXT, '-') || ' |' || E'\n';
        END LOOP;

        SELECT COUNT(*) INTO section_count
        FROM supabase_migrations.schema_migrations;

        output := output || E'\n**Total Migrations:** ' || section_count || E'\n';

    EXCEPTION WHEN undefined_table THEN
        output := output || '_Migration history table not found (supabase_migrations.schema_migrations)._' || E'\n';
    WHEN undefined_schema THEN
        output := output || '_Migration schema not accessible._' || E'\n';
    END;

    output := output || E'\n';

    -- ========================================================================
    -- FOOTER
    -- ========================================================================
    output := output || '---' || E'\n\n';
    output := output || '## Summary' || E'\n\n';
    output := output || '| Metric | Count |' || E'\n';
    output := output || '|--------|-------|' || E'\n';
    output := output || '| Tables | ' || table_count || ' |' || E'\n';
    output := output || '| RLS Disabled | ' || rls_disabled_count || ' |' || E'\n';
    output := output || '| No Policies | ' || no_policy_count || ' |' || E'\n';
    output := output || E'\n';

    IF rls_disabled_count > 0 THEN
        output := output || '### 🔴 CRITICAL: ' || rls_disabled_count || ' tables have RLS disabled!' || E'\n';
    END IF;

    IF no_policy_count > 0 THEN
        output := output || '### 🟡 WARNING: ' || no_policy_count || ' tables have no RLS policies!' || E'\n';
    END IF;

    output := output || E'\n_End of Audit Report_' || E'\n';

    -- ========================================================================
    -- OUTPUT
    -- ========================================================================
    RAISE NOTICE '%', output;

END $$;
