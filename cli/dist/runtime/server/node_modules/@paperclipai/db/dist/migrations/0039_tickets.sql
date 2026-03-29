CREATE TABLE IF NOT EXISTS "tickets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "title" text NOT NULL,
  "description" text,
  "identifier" text,
  "status" text DEFAULT 'active' NOT NULL,
  "current_stage" text DEFAULT 'planning' NOT NULL,
  "stage_order" jsonb DEFAULT '["planning","execution","review","qa","human"]' NOT NULL,
  "created_by_user_id" text,
  "created_by_agent_id" uuid,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tickets_company_idx" ON "tickets" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tickets_company_status_idx" ON "tickets" ("company_id", "status");
--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "ticket_id" uuid REFERENCES "tickets"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "ticket_stage" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issues_company_ticket_idx" ON "issues" ("company_id", "ticket_id");
