-- The PK (month, currency) already covers month-only queries since month is the leftmost column.
DROP INDEX IF EXISTS idx_revenue_by_month_month;
