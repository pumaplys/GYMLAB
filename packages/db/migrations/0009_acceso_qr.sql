CREATE TYPE "public"."access_decision" AS ENUM('ALLOW', 'WARN', 'DENY');--> statement-breakpoint
CREATE TYPE "public"."access_reason" AS ENUM('OK', 'DUES_WARN', 'DUES_EXPIRED', 'NO_SUBSCRIPTION', 'MEMBER_INACTIVE', 'TOKEN_EXPIRED', 'TOKEN_REUSED', 'BAD_SIGNATURE', 'UNKNOWN_MEMBER');--> statement-breakpoint
CREATE TABLE "access_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"member_id" uuid,
	"decision" "access_decision" NOT NULL,
	"reason" "access_reason" NOT NULL,
	"jti" uuid,
	"is_retry" boolean DEFAULT false NOT NULL,
	"scanned_by_user_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access_tokens" (
	"jti" uuid PRIMARY KEY NOT NULL,
	"gym_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"decision" "access_decision" NOT NULL,
	"reason" "access_reason" NOT NULL,
	"consumed_by_session_id" text NOT NULL,
	"consumed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gyms" ADD COLUMN "access_events_retention_months" integer DEFAULT 12 NOT NULL;--> statement-breakpoint
ALTER TABLE "access_events" ADD CONSTRAINT "access_events_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_events" ADD CONSTRAINT "access_events_scanned_by_user_id_users_id_fk" FOREIGN KEY ("scanned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- EDITADO A MANO sobre lo que genero drizzle, igual que en la migracion 0008 con
-- `payments`: la clave es compuesta, y un `SET NULL` a secas pondria a NULL
-- tambien `gym_id`, que es NOT NULL. Borrar un socio fallaria. Solo debe anularse
-- el lado que apunta — sintaxis de PostgreSQL 15+ que drizzle no sabe expresar.
ALTER TABLE "access_events" ADD CONSTRAINT "access_events_gym_member_fk" FOREIGN KEY ("gym_id","member_id") REFERENCES "public"."members"("gym_id","id") ON DELETE SET NULL ("member_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_gym_member_fk" FOREIGN KEY ("gym_id","member_id") REFERENCES "public"."members"("gym_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_events_gym_occurred_idx" ON "access_events" USING btree ("gym_id","occurred_at");--> statement-breakpoint
CREATE INDEX "access_events_gym_member_idx" ON "access_events" USING btree ("gym_id","member_id");--> statement-breakpoint
CREATE INDEX "access_tokens_expires_at_idx" ON "access_tokens" USING btree ("expires_at");