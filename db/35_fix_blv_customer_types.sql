-- Fix two BLV-tenant customers that were stored as 'Direct' due to the
-- hardcoded UI bug. Their tenant uses directLabel = 'BLV', so the correct
-- stored value is 'BLV'.
UPDATE customers
SET customer_type = 'BLV'
WHERE tenant_id = 'c00e0058-3dec-4300-829d-cca7e3033ca6'
  AND id IN (
    'e9b35783-d3e4-42a6-93ec-369a902d2f46',
    'd1267c2f-6d1a-4456-b780-ae633a74926f'
  )
  AND customer_type = 'Direct';
