-- Optional reason for voiding a sale (e.g. "monto mal digitado").
-- Only voided sales can have one, and never a blank one (the backend stores blank as NULL).

ALTER TABLE sale ADD COLUMN void_reason VARCHAR(100);

ALTER TABLE sale ADD CONSTRAINT ck_sale_void_reason
    CHECK (void_reason IS NULL OR (status = 'VOIDED' AND btrim(void_reason) <> ''));
