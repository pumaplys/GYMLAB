CREATE TYPE "public"."payment_concept" AS ENUM('subscription', 'enrolment', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'card', 'transfer', 'other');--> statement-breakpoint
CREATE TYPE "public"."plan_period" AS ENUM('monthly', 'quarterly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'paused', 'cancelled');--> statement-breakpoint
CREATE TABLE "member_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"started_on" date NOT NULL,
	"current_period_end" date NOT NULL,
	"paused_at" date,
	"paused_days" integer DEFAULT 0 NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"member_id" uuid,
	"subscription_id" uuid,
	"concept" "payment_concept" NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"method" "payment_method" NOT NULL,
	"paid_on" date NOT NULL,
	"note" text,
	"recorded_by_user_id" uuid,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"voided_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_cents" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"period" "plan_period" NOT NULL,
	"status" "plan_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gyms" ADD COLUMN "grace_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "member_subscriptions" ADD CONSTRAINT "member_subscriptions_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_subscriptions" ADD CONSTRAINT "member_subscriptions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_subscriptions" ADD CONSTRAINT "member_subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_member_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."member_subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_voided_by_user_id_users_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_subscriptions_member_vigente_key" ON "member_subscriptions" USING btree ("gym_id","member_id") WHERE status IN ('active', 'paused');--> statement-breakpoint
CREATE INDEX "member_subscriptions_gym_member_idx" ON "member_subscriptions" USING btree ("gym_id","member_id");--> statement-breakpoint
CREATE INDEX "member_subscriptions_gym_period_end_idx" ON "member_subscriptions" USING btree ("gym_id","current_period_end");--> statement-breakpoint
CREATE INDEX "payments_gym_member_idx" ON "payments" USING btree ("gym_id","member_id");--> statement-breakpoint
CREATE INDEX "payments_gym_paid_on_idx" ON "payments" USING btree ("gym_id","paid_on");--> statement-breakpoint
CREATE INDEX "payments_subscription_idx" ON "payments" USING btree ("subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_gym_name_active_key" ON "plans" USING btree ("gym_id",lower("name")) WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "plans_gym_id_idx" ON "plans" USING btree ("gym_id");