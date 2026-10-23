-- Official October 2026 menu (DRAMA-46). Past sales keep their prices (sale_line snapshots).
--
-- The generic "Piscola" is deactivated (never deleted); "Piscola Alto del Carmen" is renamed
-- "Piscola Alto" and, with "Piscola Mistral", takes its place in the menu (sort_order 3 and 4).
-- Rows are found by product name (unique, see ux_product_name), never by id. Every UPDATE must hit
-- exactly one row and the final menu is checked; otherwise the migration fails and Flyway rolls it back.

DO $$
DECLARE
    affected        INTEGER;
    expected_active TEXT[] := ARRAY[
        'Cerveza',
        'Piscola Alto',
        'Piscola Mistral',
        'Tropical Gin',
        'Gin + Bebida',
        'Tequila',
        'Ballantine',
        'Jack Daniels',
        'Jagger + Red Bull',
        'Jagger + Bebida',
        'Red Bull',
        'Agua 600cc'
    ];
    actual_active   TEXT[];
BEGIN
    UPDATE product
    SET active = false, updated_at = now()
    WHERE name = 'Piscola';
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN
        RAISE EXCEPTION 'V6: expected to deactivate 1 product "Piscola", updated %', affected;
    END IF;

    UPDATE product
    SET name = 'Piscola Alto', active = true, unit_price = 5000, promo_quantity = 3, promo_price = 12000,
        updated_at = now()
    WHERE name = 'Piscola Alto del Carmen';
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN
        RAISE EXCEPTION 'V6: expected to rename and activate 1 product "Piscola Alto del Carmen", updated %',
            affected;
    END IF;

    UPDATE product
    SET active = true, unit_price = 6000, promo_quantity = 3, promo_price = 14000, updated_at = now()
    WHERE name = 'Piscola Mistral';
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN
        RAISE EXCEPTION 'V6: expected to activate and reprice 1 product "Piscola Mistral", updated %', affected;
    END IF;

    UPDATE product
    SET unit_price = 8500, promo_quantity = 2, promo_price = 14000, updated_at = now()
    WHERE name = 'Tropical Gin';
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN
        RAISE EXCEPTION 'V6: expected to reprice 1 product "Tropical Gin", updated %', affected;
    END IF;

    -- Final check: the active menu is exactly the official one.
    SELECT coalesce(array_agg(name ORDER BY name), ARRAY[]::TEXT[]) INTO actual_active
    FROM product
    WHERE active;
    IF actual_active IS DISTINCT FROM (SELECT array_agg(n ORDER BY n) FROM unnest(expected_active) AS n) THEN
        RAISE EXCEPTION 'V6: active products are [%], expected [%]',
            array_to_string(actual_active, ', '), array_to_string(expected_active, ', ');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM product WHERE name = 'Piscola' AND NOT active) THEN
        RAISE EXCEPTION 'V6: product "Piscola" must exist and be inactive';
    END IF;

    SELECT count(*) INTO affected
    FROM product_variant v
    JOIN product p ON p.id = v.product_id
    WHERE p.name IN ('Piscola Alto', 'Piscola Mistral') AND v.name = 'Única' AND v.active;
    IF affected <> 2 THEN
        RAISE EXCEPTION 'V6: expected an active "Única" variant in both "Piscola Alto" and "Piscola Mistral", found %',
            affected;
    END IF;
END $$;
