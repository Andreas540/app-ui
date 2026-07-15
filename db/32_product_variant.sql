-- Migration: product variant field
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS variant TEXT;
