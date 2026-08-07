ALTER TABLE customer_payment_tokens
  ADD COLUMN IF NOT EXISTS exp_date TEXT;
