DROP INDEX "memberships_gym_user_key";--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "ended_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_ended_by_user_id_users_id_fk" FOREIGN KEY ("ended_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_gym_user_key" ON "memberships" USING btree ("gym_id","user_id") WHERE ended_at IS NULL;