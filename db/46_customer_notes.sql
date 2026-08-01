-- Customer notes: free-text entries that appear in the chronological customer log
CREATE TABLE IF NOT EXISTS customer_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  customer_id UUID NOT NULL,
  note_text   TEXT NOT NULL,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_notes_lookup
  ON customer_notes (tenant_id, customer_id, created_at);
