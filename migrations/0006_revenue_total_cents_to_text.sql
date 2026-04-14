-- H3: total_cents was INTEGER, truncating bigint to Number.
-- Align with other money columns (line_items.unit_price_cents, payments.amount_cents) which use TEXT.
ALTER TABLE revenue_by_month RENAME TO revenue_by_month_old;

CREATE TABLE revenue_by_month (
  month TEXT NOT NULL,
  currency TEXT NOT NULL,
  total_cents TEXT NOT NULL,
  payment_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (month, currency)
);

INSERT INTO revenue_by_month (month, currency, total_cents, payment_count, updated_at)
SELECT month, currency, CAST(total_cents AS TEXT), payment_count, updated_at
FROM revenue_by_month_old;

DROP TABLE revenue_by_month_old;
