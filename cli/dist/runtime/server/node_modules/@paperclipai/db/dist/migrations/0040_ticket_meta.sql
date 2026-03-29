ALTER TABLE tickets ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS instructions text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS lead_agent_id uuid REFERENCES agents(id) ON DELETE SET NULL;
