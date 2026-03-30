ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS stage_definitions jsonb NOT NULL DEFAULT '[]'::jsonb;
