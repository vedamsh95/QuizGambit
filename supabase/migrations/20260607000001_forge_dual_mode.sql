-- Add lens_mode and target_lens columns to categories_library
-- This enables the Forge dual-mode architecture (diverse + focused)

-- Check if columns don't already exist before adding
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'categories_library' AND column_name = 'lens_mode'
  ) THEN
    ALTER TABLE categories_library
    ADD COLUMN lens_mode text DEFAULT 'diverse' NOT NULL
    CHECK (lens_mode IN ('diverse', 'focused'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'categories_library' AND column_name = 'target_lens'
  ) THEN
    ALTER TABLE categories_library
    ADD COLUMN target_lens text;
  END IF;
END $$;
