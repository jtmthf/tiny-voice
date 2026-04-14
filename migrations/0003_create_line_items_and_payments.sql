CREATE TABLE line_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_cents TEXT NOT NULL
);
CREATE INDEX idx_line_items_invoice_id ON line_items(invoice_id);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  amount_cents TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE INDEX idx_payments_invoice_id ON payments(invoice_id);
