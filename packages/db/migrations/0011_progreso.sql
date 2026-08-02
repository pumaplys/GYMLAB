CREATE TABLE "body_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"measured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"weight_kg" numeric(5, 2),
	"body_fat_percent" numeric(4, 1),
	"chest_cm" numeric(5, 1),
	"waist_cm" numeric(5, 1),
	"hip_cm" numeric(5, 1),
	"arm_cm" numeric(4, 1),
	"thigh_cm" numeric(4, 1),
	"notes" text,
	"recorded_by_user_id" uuid,
	"consent_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consents" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "consents" ADD COLUMN "member_id" uuid;--> statement-breakpoint
ALTER TABLE "body_metrics" ADD CONSTRAINT "body_metrics_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "body_metrics" ADD CONSTRAINT "body_metrics_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "body_metrics" ADD CONSTRAINT "body_metrics_gym_member_fk" FOREIGN KEY ("gym_id","member_id") REFERENCES "public"."members"("gym_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "body_metrics_gym_member_idx" ON "body_metrics" USING btree ("gym_id","member_id","measured_at");--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_gym_member_fk" FOREIGN KEY ("gym_id","member_id") REFERENCES "public"."members"("gym_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consents_gym_member_idx" ON "consents" USING btree ("gym_id","member_id");--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_sujeto_check" CHECK (user_id IS NOT NULL OR member_id IS NOT NULL);