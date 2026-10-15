-- Official DRAMA menu. Prices in whole Chilean pesos.
-- Variants look up their product by name; no ids are assumed.
--
-- Design rule: same price = variant; different price = separate product.
-- e.g. Jack Daniels Original/Manzana/Honey share a price, so they are variants;
-- Piscola Alto del Carmen and Piscola Mistral have their own prices, so they are products.

INSERT INTO product (name, unit_price, promo_quantity, promo_price, active, sort_order) VALUES
    ('Cerveza',                 3000, 2,     5000,  true,  1),
    ('Piscola',                 5500, 3,     13000, true,  2),
    ('Piscola Alto del Carmen', 5000, 3,     12000, false, 3),
    ('Piscola Mistral',         5500, 3,     13000, false, 4),
    ('Tropical Gin',            8500, 2,     15000, true,  5),
    ('Gin + Bebida',            6000, 2,     11000, true,  6),
    ('Tequila',                 3000, 3,     8000,  true,  7),
    ('Ballantine',              7000, 2,     13000, true,  8),
    ('Jack Daniels',            8500, 2,     15000, true,  9),
    ('Jagger + Red Bull',       8500, 2,     15000, true,  10),
    ('Jagger + Bebida',         6000, 2,     11000, true,  11),
    ('Red Bull',                3500, NULL,  NULL,  true,  12),
    ('Agua 600cc',              3000, 2,     5000,  true,  13);

INSERT INTO product_variant (product_id, name, active, sort_order) VALUES
    ((SELECT id FROM product WHERE name = 'Cerveza'), 'Normal', true, 1),
    ((SELECT id FROM product WHERE name = 'Cerveza'), '0,0',    true, 2),
    ((SELECT id FROM product WHERE name = 'Jack Daniels'), 'Original', true,  1),
    ((SELECT id FROM product WHERE name = 'Jack Daniels'), 'Manzana',  true,  2),
    ((SELECT id FROM product WHERE name = 'Jack Daniels'), 'Honey',    false, 3);

-- Products without real variants get a single "Única" variant.
INSERT INTO product_variant (product_id, name, active, sort_order)
SELECT id, 'Única', true, 1
FROM product
WHERE name IN (
    'Piscola',
    'Piscola Alto del Carmen',
    'Piscola Mistral',
    'Tropical Gin',
    'Gin + Bebida',
    'Tequila',
    'Ballantine',
    'Jagger + Red Bull',
    'Jagger + Bebida',
    'Red Bull',
    'Agua 600cc'
);
