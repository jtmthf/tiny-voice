CREATE TABLE revenue_by_month (
  month TEXT NOT NULL,
  currency TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  payment_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (month, currency)
);
CREATE INDEX idx_revenue_by_month_month ON revenue_by_month(month);
