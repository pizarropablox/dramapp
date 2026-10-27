-- Menu order of the Venta grid (DRAMA-53). Data only: just product.sort_order changes.
--
-- The grid has 2 columns and fills row by row, left to right:
--   Agua 600cc        | Cerveza
--   Piscola Alto      | Piscola Mistral
--   Tropical Gin      | Gin + Bebida
--   Jack Daniels      | Ballantine
--   Jagger + Red Bull | Jagger + Bebida
--   Red Bull          | Tequila
-- Active products take sort_order 1 to 12; the inactive generic "Piscola" goes after them (13).
-- Prices, promos, variants and the active flag are untouched.
-- Rows are found by product name (unique, see ux_product_name), never by id. Every UPDATE must hit
-- exactly one row and the final order is checked; otherwise the migration fails and Flyway rolls it back.

DO $$
DECLARE
    affected       INTEGER;
    expected_order TEXT[] := ARRAY[
        'Agua 600cc',
        'Cerveza',
        'Piscola Alto',
        'Piscola Mistral',
        'Tropical Gin',
        'Gin + Bebida',
        'Jack Daniels',
        'Ballantine',
        'Jagger + Red Bull',
        'Jagger + Bebida',
        'Red Bull',
        'Tequila'
    ];
    active_count   INTEGER := array_length(expected_order, 1);
    actual_order   TEXT[];
    actual_sorts   INTEGER[];
BEGIN
    FOR i IN 1..active_count LOOP
        UPDATE product
        SET sort_order = i, updated_at = now()
        WHERE name = expected_order[i] AND active;
        GET DIAGNOSTICS affected = ROW_COUNT;
        IF affected <> 1 THEN
            RAISE EXCEPTION 'V7: expected to set sort_order % on 1 active product "%", updated %',
                i, expected_order[i], affected;
        END IF;
    END LOOP;

    UPDATE product
    SET sort_order = active_count + 1, updated_at = now()
    WHERE name = 'Piscola' AND NOT active;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN
        RAISE EXCEPTION 'V7: expected to set sort_order % on 1 inactive product "Piscola", updated %',
            active_count + 1, affected;
    END IF;

    -- Final checks: the active menu is exactly the requested order, numbered 1 to 12, and every inactive
    -- product comes after it.
    SELECT coalesce(array_agg(name ORDER BY sort_order, id), ARRAY[]::TEXT[]),
           coalesce(array_agg(sort_order ORDER BY sort_order, id), ARRAY[]::INTEGER[])
    INTO actual_order, actual_sorts
    FROM product
    WHERE active;
    IF actual_order IS DISTINCT FROM expected_order THEN
        RAISE EXCEPTION 'V7: active products in menu order are [%], expected [%]',
            array_to_string(actual_order, ', '), array_to_string(expected_order, ', ');
    END IF;
    IF actual_sorts IS DISTINCT FROM ARRAY(SELECT generate_series(1, active_count)) THEN
        RAISE EXCEPTION 'V7: active sort_order values are [%], expected 1 to %',
            array_to_string(actual_sorts, ', '), active_count;
    END IF;

    SELECT count(*) INTO affected
    FROM product
    WHERE NOT active AND sort_order <= active_count;
    IF affected <> 0 THEN
        RAISE EXCEPTION 'V7: % inactive product(s) still sort among the active ones', affected;
    END IF;
END $$;
