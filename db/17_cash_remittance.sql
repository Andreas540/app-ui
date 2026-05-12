-- Add 'remittance' as a valid cash transaction type.
-- Remittance = money the employee hands back to the employer from cash surplus.
ALTER TABLE cash_transactions
  DROP CONSTRAINT IF EXISTS cash_transactions_transaction_type_check;

ALTER TABLE cash_transactions
  ADD CONSTRAINT cash_transactions_transaction_type_check
    CHECK (transaction_type IN ('cash_pickup', 'salary', 'expense', 'remittance'));
