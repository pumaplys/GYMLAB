ALTER TABLE "invitations" ADD COLUMN "member_id" uuid;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitations_member_id_idx" ON "invitations" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "members_gym_user_key" ON "members" USING btree ("gym_id","user_id") WHERE user_id IS NOT NULL;