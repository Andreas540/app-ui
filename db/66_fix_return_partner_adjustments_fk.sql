-- return_partner_adjustments.partner_id was incorrectly referencing customers(id).
-- Partners live in the partners table, not customers.
-- Drop and recreate the FK to point at the correct table.

ALTER TABLE public.return_partner_adjustments
  DROP CONSTRAINT IF EXISTS return_partner_adjustments_partner_id_fkey;

ALTER TABLE public.return_partner_adjustments
  ADD CONSTRAINT return_partner_adjustments_partner_id_fkey
  FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;
