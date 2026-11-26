-- Charging with the Point Smart and printing the vale (DRAMA-71). Only adds tables: sale does not change.
-- No credentials or card data are ever stored here.

-- One charge sent to a Point Smart. A sale may have several.
CREATE TABLE point_order (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sale_id             BIGINT      NOT NULL,
    terminal_id         VARCHAR(64) NOT NULL,
    mp_order_id         VARCHAR(64),
    idempotency_key     VARCHAR(64) NOT NULL,
    status              VARCHAR(64),          -- as Mercado Pago sends it; NULL until it answers
    status_detail       VARCHAR(64),
    creation_error      VARCHAR(64),          -- Mercado Pago rejected it: no order exists
    amount              BIGINT      NOT NULL, -- whole pesos, subtotal + tip
    mp_payment_id       VARCHAR(64),
    reference_id        VARCHAR(64),
    created_by          VARCHAR(20) NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_checked_at     TIMESTAMPTZ,
    cancel_requested_at TIMESTAMPTZ,
    paid_on_voided_sale BOOLEAN     NOT NULL DEFAULT false,
    resolved_outcome    VARCHAR(20),          -- closed by hand, reading the screen of the Smart
    resolved_at         TIMESTAMPTZ,
    resolved_by         VARCHAR(20),
    CONSTRAINT fk_point_order_sale FOREIGN KEY (sale_id) REFERENCES sale (id),
    CONSTRAINT ck_point_order_amount CHECK (amount > 0),
    CONSTRAINT ck_point_order_creation_error CHECK (creation_error IS NULL OR status IS NULL),
    CONSTRAINT ck_point_order_outcome CHECK (resolved_outcome IN ('PAID', 'NOT_PAID')),
    CONSTRAINT ck_point_order_resolved CHECK (
        (resolved_outcome IS NULL) = (resolved_at IS NULL)
        AND (resolved_at IS NULL) = (resolved_by IS NULL)
    )
);

CREATE UNIQUE INDEX ux_point_order_mp_order ON point_order (mp_order_id);
CREATE UNIQUE INDEX ux_point_order_idempotency_key ON point_order (idempotency_key);
CREATE INDEX ix_point_order_sale ON point_order (sale_id);

-- A terminal takes one order at a time, counting the one still being sent (status NULL).
CREATE UNIQUE INDEX ux_point_order_open ON point_order (terminal_id)
    WHERE resolved_at IS NULL AND creation_error IS NULL
        AND (status IS NULL OR status IN ('created', 'at_terminal', 'action_required'));

-- Every vale sent to print, with who asked for it. Apart from point_order: a cash sale has no order, and a sale
-- may be printed more than once.
CREATE TABLE vale_print (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sale_id      BIGINT      NOT NULL,
    terminal_id  VARCHAR(64) NOT NULL,
    kind         VARCHAR(10) NOT NULL,
    mp_action_id VARCHAR(64),
    status       VARCHAR(64),                 -- as Mercado Pago sends it; NULL until it answers
    error        VARCHAR(64),                 -- Mercado Pago rejected it for sure: nothing came out
    requested_by VARCHAR(20) NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_vale_print_sale FOREIGN KEY (sale_id) REFERENCES sale (id),
    CONSTRAINT ck_vale_print_kind CHECK (kind IN ('ORIGINAL', 'REPRINT')),
    CONSTRAINT ck_vale_print_error CHECK (error IS NULL OR mp_action_id IS NULL)
);

-- A single original vale per sale: two phones seeing the payment at once never print it twice. A rejected one never
-- came out, so it makes room for another original; one without an answer may have, so it does not.
CREATE UNIQUE INDEX ux_vale_print_original ON vale_print (sale_id) WHERE kind = 'ORIGINAL' AND error IS NULL;
CREATE UNIQUE INDEX ux_vale_print_action ON vale_print (mp_action_id);
CREATE INDEX ix_vale_print_sale ON vale_print (sale_id);
CREATE INDEX ix_vale_print_terminal ON vale_print (terminal_id, requested_at);
