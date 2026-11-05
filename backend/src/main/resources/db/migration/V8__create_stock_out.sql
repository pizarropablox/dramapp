-- Sold out (DRAMA-51): what runs out during the night, marked by the bar. A mark belongs to one event, so the
-- next event starts without marks and nothing is cleaned up on closing. Rows are never deleted: taking a mark off
-- fills cleared_at, so each stretch without stock stays on record (ran out 03:30, more came 04:00, ran out 04:40).

CREATE TABLE stock_out (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id    BIGINT      NOT NULL,
    variant_id  BIGINT      NOT NULL,
    marked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    marked_by   VARCHAR(20) NOT NULL,
    cleared_at  TIMESTAMPTZ,
    cleared_by  VARCHAR(20),
    CONSTRAINT fk_stock_out_event FOREIGN KEY (event_id) REFERENCES event (id),
    CONSTRAINT fk_stock_out_variant FOREIGN KEY (variant_id) REFERENCES product_variant (id),
    CONSTRAINT ck_stock_out_cleared CHECK ((cleared_at IS NULL) = (cleared_by IS NULL)),
    CONSTRAINT ck_stock_out_cleared_after_marked CHECK (cleared_at IS NULL OR cleared_at >= marked_at)
);

-- At most one current mark per variant and event.
CREATE UNIQUE INDEX ux_stock_out_current ON stock_out (event_id, variant_id) WHERE cleared_at IS NULL;
