-- Migration: Exact COA Parent Mapping & Auto-Increment for Party Provisioning
-- 1. Ensure parent_code column exists on chart_of_accounts
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS parent_code TEXT;

-- 2. Backfill parent_code on existing child accounts
UPDATE chart_of_accounts SET parent_code = '1130-00'
WHERE code LIKE '1130-%' AND code <> '1130-00' AND (parent_code IS NULL OR parent_code <> '1130-00');

UPDATE chart_of_accounts SET parent_code = '2110-00'
WHERE code LIKE '2110-%' AND code <> '2110-00' AND (parent_code IS NULL OR parent_code <> '2110-00');

UPDATE chart_of_accounts SET parent_code = '2120-00'
WHERE code LIKE '2120-%' AND code <> '2120-00' AND (parent_code IS NULL OR parent_code <> '2120-00');

-- Backfill from parent_id relation where available
UPDATE chart_of_accounts SET parent_code = p.code
FROM chart_of_accounts p
WHERE chart_of_accounts.parent_id = p.id
  AND chart_of_accounts.parent_code IS NULL;

-- 3. Replace create_party_with_coa with exact mapping and flawless auto-increment
CREATE OR REPLACE FUNCTION public.create_party_with_coa(
    p_name text,
    p_type text,
    p_phone text DEFAULT NULL::text,
    p_trn text DEFAULT NULL::text,
    p_credit_limit numeric DEFAULT 0,
    p_inventory_account_id uuid DEFAULT NULL::uuid,
    p_expense_account text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_parent_code TEXT;
    v_prefix TEXT;
    v_account_type TEXT;
    v_parent_acc_id INT;
    v_parent_type_id INT;
    v_coa_parent_id UUID;
    v_new_account_id_int INT;
    v_new_coa_id UUID;
    v_new_code TEXT;
    v_max_suffix INT := 0;
    v_curr_suffix INT := 0;
    v_next_num INT := 1;
    v_party_id TEXT;
    v_party_code TEXT;
    v_party_suffix TEXT;
    v_party_prefix TEXT;
    v_clean_type TEXT;
    v_effective_party_type TEXT;
    v_account_map JSONB;
    v_existing_legacy_id TEXT;
    r RECORD;
BEGIN
    v_clean_type := UPPER(TRIM(p_type));
    
    -- 1. Exact Parent Code & Type Mapping based on entity_type
    IF v_clean_type LIKE '%COURIER%' OR v_clean_type LIKE '%FREIGHT%' OR v_clean_type LIKE '%LOGISTICS%' THEN
        v_parent_code := '2120-00';
        v_prefix := '2120-';
        v_account_type := 'LIABILITY';
        v_party_suffix := ' (Courier)';
        v_party_prefix := 'COU-';
        v_effective_party_type := 'COURIER';
    ELSIF v_clean_type LIKE '%AGENT%' OR v_clean_type LIKE '%BROKER%' THEN
        -- Default to Trade Payables (2110-00) for Agents/Brokers as specified
        v_parent_code := '2110-00';
        v_prefix := '2110-';
        v_account_type := 'LIABILITY';
        v_party_suffix := ' (Agent)';
        v_party_prefix := 'AGT-';
        v_effective_party_type := 'AGENT';
    ELSIF v_clean_type LIKE '%SUPPLIER%' OR v_clean_type LIKE '%VENDOR%' THEN
        v_parent_code := '2110-00';
        v_prefix := '2110-';
        v_account_type := 'LIABILITY';
        v_party_suffix := ' (Supplier)';
        v_party_prefix := 'SUP-';
        v_effective_party_type := 'SUPPLIER';
    ELSE
        -- Default to Client/Customer (1130-00) Asset
        v_parent_code := '1130-00';
        v_prefix := '1130-';
        v_account_type := 'ASSET';
        v_party_suffix := ' (Customer)';
        v_party_prefix := 'CLI-';
        v_effective_party_type := 'CLIENT';
    END IF;

    -- 2. Find parent in accounts table
    SELECT account_id, account_type_id INTO v_parent_acc_id, v_parent_type_id
    FROM accounts
    WHERE account_code = v_parent_code
    LIMIT 1;

    -- Fallback parent IDs if not found
    IF v_parent_acc_id IS NULL THEN
        IF v_parent_code = '2120-00' THEN v_parent_acc_id := 5099; v_parent_type_id := 2;
        ELSIF v_parent_code = '2110-00' THEN v_parent_acc_id := 5098; v_parent_type_id := 2;
        ELSE v_parent_acc_id := 5089; v_parent_type_id := 1;
        END IF;
    END IF;

    -- 3. Find parent in chart_of_accounts table
    SELECT id INTO v_coa_parent_id
    FROM chart_of_accounts 
    WHERE code = v_parent_code 
    LIMIT 1;

    -- 4. Flawless Auto-Increment Logic:
    -- Query chart_of_accounts filtering by resolved parent_code (or parent_id / prefix)
    -- Order by code DESC, extract suffix, increment by 1, pad with zero (start at 01 if none)
    v_max_suffix := 0;

    FOR r IN (
        SELECT code FROM chart_of_accounts 
        WHERE (parent_code = v_parent_code OR parent_id = v_coa_parent_id OR code LIKE (v_prefix || '%'))
          AND code <> v_parent_code
          AND code ~ CONCAT('^', v_prefix, '[0-9]+$')
        UNION
        SELECT code FROM coa_accounts 
        WHERE (parent_code = v_parent_code OR parent_id = v_coa_parent_id::text OR code LIKE (v_prefix || '%'))
          AND code <> v_parent_code
          AND code ~ CONCAT('^', v_prefix, '[0-9]+$')
        UNION
        SELECT account_code as code FROM accounts 
        WHERE (parent_id = v_parent_acc_id OR account_code LIKE (v_prefix || '%'))
          AND account_code <> v_parent_code
          AND account_code ~ CONCAT('^', v_prefix, '[0-9]+$')
        ORDER BY code DESC
    ) LOOP
        BEGIN
            v_curr_suffix := SUBSTRING(r.code FROM CONCAT('^', v_prefix, '([0-9]+)$'))::int;
            IF v_curr_suffix > v_max_suffix THEN
                v_max_suffix := v_curr_suffix;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- ignore non-integer suffix
        END;
    END LOOP;

    v_next_num := v_max_suffix + 1;
    IF v_next_num < 1 THEN
        v_next_num := 1;
    END IF;

    v_new_code := CONCAT(v_prefix, LPAD(v_next_num::TEXT, 2, '0'));

    -- Guard loop to ensure absolute uniqueness across all accounting tables
    WHILE EXISTS (SELECT 1 FROM accounts WHERE account_code = v_new_code) 
       OR EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = v_new_code)
       OR EXISTS (SELECT 1 FROM coa_accounts WHERE code = v_new_code) LOOP
        v_next_num := v_next_num + 1;
        v_new_code := CONCAT(v_prefix, LPAD(v_next_num::TEXT, 2, '0'));
    END LOOP;

    -- 5. ENSURE SEQUENCE SYNC TO PREVENT accounts_pkey (23505) VIOLATION
    PERFORM setval('accounts_account_id_seq', GREATEST((SELECT COALESCE(MAX(account_id), 0) FROM accounts), 1));

    -- INSERT REAL TRANSACTION ACCOUNT INTO accounts TABLE
    INSERT INTO accounts (
        account_code,
        account_name,
        account_type_id,
        parent_id,
        is_active,
        is_transactional,
        account_level
    )
    VALUES (
        v_new_code,
        p_name,
        v_parent_type_id,
        v_parent_acc_id,
        true,
        true,
        3
    )
    RETURNING account_id INTO v_new_account_id_int;

    -- 6. Keep chart_of_accounts and coa_accounts synced
    IF v_coa_parent_id IS NOT NULL THEN
        INSERT INTO chart_of_accounts (id, code, name, account_type, parent_id, parent_code, current_balance)
        VALUES (
            gen_random_uuid(),
            v_new_code, 
            CONCAT(p_name, v_party_suffix),
            v_account_type, 
            v_coa_parent_id, 
            v_parent_code,
            0.00
        )
        ON CONFLICT (code) DO UPDATE SET 
            name = EXCLUDED.name,
            account_type = EXCLUDED.account_type,
            parent_id = EXCLUDED.parent_id,
            parent_code = EXCLUDED.parent_code
        RETURNING id INTO v_new_coa_id;
    END IF;

    -- Look up existing legacy coa_accounts id to preserve, or generate fresh UUID
    SELECT id INTO v_existing_legacy_id FROM coa_accounts WHERE code = v_new_code LIMIT 1;
    IF v_existing_legacy_id IS NULL THEN
        v_existing_legacy_id := gen_random_uuid()::text;
    END IF;

    INSERT INTO coa_accounts (id, code, name, type, sub_type, currency, current_balance, is_active, parent_id, parent_code, tier_level)
    VALUES (
        v_existing_legacy_id,
        v_new_code,
        CONCAT(p_name, v_party_suffix),
        v_account_type,
        CASE 
            WHEN v_effective_party_type = 'COURIER' THEN 'Accounts Payable - Courier & Logistics'
            WHEN v_effective_party_type = 'AGENT' THEN 'Accounts Payable - Trade'
            WHEN v_effective_party_type = 'SUPPLIER' THEN 'Accounts Payable - Trade' 
            ELSE 'Accounts Receivable - Trade' 
        END,
        'AED',
        0.00,
        true,
        v_coa_parent_id::text,
        v_parent_code,
        3
    )
    ON CONFLICT (code) DO UPDATE SET 
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        parent_code = EXCLUDED.parent_code,
        is_active = true;

    -- 7. Generate party id & sequential party code
    v_party_id := gen_random_uuid()::text;
    v_party_code := CONCAT(
        v_party_prefix,
        LPAD((SELECT COALESCE(MAX(SUBSTRING(code FROM '[0-9]+')::int), 0) + 1 FROM parties WHERE code ~ '[0-9]+')::TEXT, 4, '0')
    );

    WHILE EXISTS (SELECT 1 FROM parties WHERE code = v_party_code) LOOP
        v_party_code := CONCAT(v_party_prefix, LPAD((SUBSTRING(v_party_code FROM '[0-9]+')::int + 1)::TEXT, 4, '0'));
    END LOOP;

    -- 8. Build dynamic account map
    IF v_effective_party_type = 'COURIER' THEN
        v_account_map := jsonb_build_object(
            'payableAccountId', v_new_code,
            'courierPayableAccountId', v_new_code,
            'clearingAccountId', COALESCE(NULLIF(p_expense_account, ''), '1310-00'),
            'expenseAccountId', COALESCE(NULLIF(p_expense_account, ''), '5110-00')
        );
    ELSIF v_effective_party_type = 'AGENT' THEN
        v_account_map := jsonb_build_object(
            'payableAccountId', v_new_code,
            'agentPayableAccountId', v_new_code,
            'clearingAccountId', COALESCE(NULLIF(p_expense_account, ''), '1310-00'),
            'expenseAccountId', COALESCE(NULLIF(p_expense_account, ''), '5110-00')
        );
    ELSIF v_effective_party_type = 'SUPPLIER' THEN
        v_account_map := jsonb_build_object(
            'payableAccountId', v_new_code,
            'receivableAccountId', '1130-00',
            'clearingAccountId', COALESCE(NULLIF(p_expense_account, ''), '1310-00'),
            'inventoryAccountId', p_inventory_account_id
        );
    ELSE
        v_account_map := jsonb_build_object(
            'payableAccountId', '2110-00',
            'receivableAccountId', v_new_code,
            'revenueAccountId', '4110-00'
        );
    END IF;

    -- 9. INSERT PARTY INTO parties TABLE with newly created account code immediately linked to coa_account_id
    INSERT INTO parties (
        id,
        code,
        name,
        company_name, 
        type,
        party_type, 
        phone,
        trn_no,
        credit_limit,
        current_balance,
        is_active,
        currency,
        linked_account_id,
        coa_account_id,
        account_map
    )
    VALUES (
        v_party_id,
        v_party_code,
        p_name,
        p_name,
        v_effective_party_type,
        v_effective_party_type,
        p_phone,
        p_trn,
        p_credit_limit,
        0.00,
        true,
        'AED',
        v_new_account_id_int,
        v_new_code,
        v_account_map
    );

    RETURN jsonb_build_object(
        'success', true,
        'party_id', v_party_id,
        'party_code', v_party_code,
        'account_id', v_new_account_id_int,
        'code', v_new_code,
        'account_code', v_new_code,
        'coa_account_id', v_new_code,
        'parent_code', v_parent_code,
        'account_type', v_account_type
    );
END;
$function$;
