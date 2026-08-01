-- Add covers_order_item_id: links a coverage/add-on line to a specific previous order item.
-- Add unit_identifier: free-text label (e.g. serial number) that makes a line a named unit in the warehouse.
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS covers_order_item_id UUID NULL REFERENCES order_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_identifier TEXT NULL;
