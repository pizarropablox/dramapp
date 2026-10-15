-- Sales model: events, menu (products and variants) and bar sales.
-- Money is stored as whole Chilean pesos (BIGINT). Timestamps are TIMESTAMPTZ.

CREATE TABLE event (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    event_date  DATE         NOT NULL,
    status      VARCHAR(20)  NOT NULL,
    opened_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    closed_at   TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_event_name_not_blank CHECK (btrim(name) <> ''),
    CONSTRAINT ck_event_status CHECK (status IN ('OPEN', 'CLOSED')),
    CONSTRAINT ck_event_closed_at CHECK ((status = 'CLOSED') = (closed_at IS NOT NULL)),
    CONSTRAINT ck_event_close_after_open CHECK (closed_at IS NULL OR closed_at >= opened_at)
);

-- At most one OPEN event at a time.
CREATE UNIQUE INDEX ux_event_single_open ON event (status) WHERE status = 'OPEN';

CREATE TABLE product (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    unit_price      BIGINT       NOT NULL,
    promo_quantity  INTEGER,
    promo_price     BIGINT,
    active          BOOLEAN      NOT NULL DEFAULT true,
    sort_order      INTEGER      NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_product_name_not_blank CHECK (btrim(name) <> ''),
    CONSTRAINT ck_product_unit_price CHECK (unit_price > 0),
    CONSTRAINT ck_product_promo_quantity CHECK (promo_quantity >= 2),
    CONSTRAINT ck_product_promo_price CHECK (promo_price > 0),
    CONSTRAINT ck_product_promo_pair CHECK ((promo_quantity IS NULL) = (promo_price IS NULL))
);

CREATE UNIQUE INDEX ux_product_name ON product (lower(name));

CREATE TABLE product_variant (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id  BIGINT       NOT NULL,
    name        VARCHAR(100) NOT NULL,
    active      BOOLEAN      NOT NULL DEFAULT true,
    sort_order  INTEGER      NOT NULL DEFAULT 0,
    CONSTRAINT fk_product_variant_product FOREIGN KEY (product_id) REFERENCES product (id),
    CONSTRAINT ck_product_variant_name_not_blank CHECK (btrim(name) <> '')
);

-- Also serves lookups by product_id.
CREATE UNIQUE INDEX ux_product_variant_product_name ON product_variant (product_id, lower(name));

CREATE TABLE sale (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id        BIGINT       NOT NULL,
    payment_method  VARCHAR(20)  NOT NULL,
    subtotal        BIGINT       NOT NULL,
    tip             BIGINT       NOT NULL DEFAULT 0,
    status          VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    voided_at       TIMESTAMPTZ,
    CONSTRAINT fk_sale_event FOREIGN KEY (event_id) REFERENCES event (id),
    CONSTRAINT ck_sale_payment_method CHECK (payment_method IN ('MERCADO_PAGO', 'EFECTIVO')),
    CONSTRAINT ck_sale_subtotal CHECK (subtotal > 0),
    CONSTRAINT ck_sale_tip CHECK (tip >= 0),
    CONSTRAINT ck_sale_status CHECK (status IN ('ACTIVE', 'VOIDED')),
    CONSTRAINT ck_sale_voided_at CHECK ((status = 'VOIDED') = (voided_at IS NOT NULL)),
    CONSTRAINT ck_sale_voided_after_created CHECK (voided_at IS NULL OR voided_at >= created_at)
);

CREATE INDEX ix_sale_event_status ON sale (event_id, status);

CREATE TABLE sale_line (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sale_id         BIGINT   NOT NULL,
    variant_id      BIGINT   NOT NULL,
    quantity        INTEGER  NOT NULL,
    unit_price      BIGINT   NOT NULL,
    promo_quantity  INTEGER,
    promo_price     BIGINT,
    CONSTRAINT fk_sale_line_sale FOREIGN KEY (sale_id) REFERENCES sale (id),
    CONSTRAINT fk_sale_line_variant FOREIGN KEY (variant_id) REFERENCES product_variant (id),
    CONSTRAINT ck_sale_line_quantity CHECK (quantity > 0),
    CONSTRAINT ck_sale_line_unit_price CHECK (unit_price > 0),
    CONSTRAINT ck_sale_line_promo_quantity CHECK (promo_quantity >= 2),
    CONSTRAINT ck_sale_line_promo_price CHECK (promo_price > 0),
    CONSTRAINT ck_sale_line_promo_pair CHECK ((promo_quantity IS NULL) = (promo_price IS NULL))
);

CREATE INDEX ix_sale_line_sale ON sale_line (sale_id);
CREATE INDEX ix_sale_line_variant ON sale_line (variant_id);
