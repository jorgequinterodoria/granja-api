-- Add UNIQUE constraints for (farm_id, name) on sections and pens if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uniq_sections_farm_name'
  ) THEN
    ALTER TABLE sections
    ADD CONSTRAINT uniq_sections_farm_name UNIQUE (farm_id, name);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uniq_pens_farm_name'
  ) THEN
    ALTER TABLE pens
    ADD CONSTRAINT uniq_pens_farm_name UNIQUE (farm_id, name);
  END IF;
END
$$;
