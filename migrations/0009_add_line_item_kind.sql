-- Add a discriminator field to line_items so late-fee detection doesn't rely
-- on string-prefix matching against the description column.
ALTER TABLE line_items ADD COLUMN kind TEXT NOT NULL DEFAULT 'regular';

-- Heal existing late-fee rows using the legacy prefix convention (one-time).
UPDATE line_items SET kind = 'lateFee' WHERE description LIKE 'Late fee%';
