CREATE TABLE "auth_throttle" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL
);
