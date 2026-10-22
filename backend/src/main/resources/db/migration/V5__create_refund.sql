-- Cash given back from the till during an event, apart from any sale: by closing time the original sale
-- cannot be found among hundreds. Voided refunds are kept (status VOIDED) and no longer count.
-- Money is stored as whole Chilean pesos (BIGINT). The products given back may come later in a child
-- table (refund_line), leaving amount as what left the till.

CREATE TABLE refund (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id    BIGINT       NOT NULL,
    amount      BIGINT       NOT NULL,
    reason      VARCHAR(100) NOT NULL,
    status      VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    voided_at   TIMESTAMPTZ,
    CONSTRAINT fk_refund_event FOREIGN KEY (event_id) REFERENCES event (id),
    CONSTRAINT ck_refund_amount CHECK (amount > 0),
    CONSTRAINT ck_refund_reason_not_blank CHECK (btrim(reason) <> ''),
    CONSTRAINT ck_refund_status CHECK (status IN ('ACTIVE', 'VOIDED')),
    CONSTRAINT ck_refund_voided_at CHECK ((status = 'VOIDED') = (voided_at IS NOT NULL)),
    CONSTRAINT ck_refund_voided_after_created CHECK (voided_at IS NULL OR voided_at >= created_at)
);

CREATE INDEX ix_refund_event_status ON refund (event_id, status);
