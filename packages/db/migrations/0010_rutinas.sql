CREATE TYPE "public"."muscle_group" AS ENUM('chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'cardio', 'full_body');--> statement-breakpoint
CREATE TABLE "exercise_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"muscle_group" "muscle_group" NOT NULL,
	"equipment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"template_id" uuid,
	"name" text NOT NULL,
	"muscle_group" "muscle_group" NOT NULL,
	"equipment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercises_gym_id_key" UNIQUE("gym_id","id")
);
--> statement-breakpoint
CREATE TABLE "routine_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"routine_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"assigned_by_trainer_id" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routine_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"routine_id" uuid NOT NULL,
	"exercise_id" uuid,
	"exercise_name" text NOT NULL,
	"position" integer NOT NULL,
	"sets" integer NOT NULL,
	"reps" text NOT NULL,
	"rest_seconds" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "routines_gym_id_key" UNIQUE("gym_id","id")
);
--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_template_id_exercise_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."exercise_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_assignments" ADD CONSTRAINT "routine_assignments_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_assignments" ADD CONSTRAINT "routine_assignments_gym_routine_fk" FOREIGN KEY ("gym_id","routine_id") REFERENCES "public"."routines"("gym_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_assignments" ADD CONSTRAINT "routine_assignments_gym_member_fk" FOREIGN KEY ("gym_id","member_id") REFERENCES "public"."members"("gym_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- EDITADO A MANO, como en 0008 y 0009: la clave es compuesta y un `SET NULL` a
-- secas anularia tambien `gym_id`, que es NOT NULL. Solo debe anularse el lado
-- que apunta (sintaxis de PostgreSQL 15+ que drizzle no sabe expresar).
ALTER TABLE "routine_assignments" ADD CONSTRAINT "routine_assignments_gym_trainer_fk" FOREIGN KEY ("gym_id","assigned_by_trainer_id") REFERENCES "public"."trainers"("gym_id","id") ON DELETE SET NULL ("assigned_by_trainer_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_items" ADD CONSTRAINT "routine_items_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_items" ADD CONSTRAINT "routine_items_gym_routine_fk" FOREIGN KEY ("gym_id","routine_id") REFERENCES "public"."routines"("gym_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Igual que arriba. Y es la clave que hace posible la promesa de ADR-0012: el
-- gimnasio borra un ejercicio cuando quiere, y la rutina conserva su nombre
-- copiado en lugar de quedarse con un hueco.
ALTER TABLE "routine_items" ADD CONSTRAINT "routine_items_gym_exercise_fk" FOREIGN KEY ("gym_id","exercise_id") REFERENCES "public"."exercises"("gym_id","id") ON DELETE SET NULL ("exercise_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_templates_name_key" ON "exercise_templates" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_gym_name_key" ON "exercises" USING btree ("gym_id","name");--> statement-breakpoint
CREATE INDEX "exercises_gym_muscle_idx" ON "exercises" USING btree ("gym_id","muscle_group");--> statement-breakpoint
CREATE UNIQUE INDEX "routine_assignments_active_key" ON "routine_assignments" USING btree ("gym_id","routine_id","member_id") WHERE ended_at IS NULL;--> statement-breakpoint
CREATE INDEX "routine_assignments_gym_member_idx" ON "routine_assignments" USING btree ("gym_id","member_id");--> statement-breakpoint
CREATE INDEX "routine_assignments_gym_routine_idx" ON "routine_assignments" USING btree ("gym_id","routine_id");--> statement-breakpoint
CREATE UNIQUE INDEX "routine_items_routine_position_key" ON "routine_items" USING btree ("gym_id","routine_id","position");--> statement-breakpoint
CREATE INDEX "routine_items_gym_routine_idx" ON "routine_items" USING btree ("gym_id","routine_id");--> statement-breakpoint
CREATE INDEX "routines_gym_id_idx" ON "routines" USING btree ("gym_id");
--> statement-breakpoint
-- Catalogo inicial de la plataforma (ADR-0012).
--
-- Va en la misma migracion que crea la tabla porque son datos de REFERENCIA, no
-- datos de usuario: forman parte de la definicion del esquema tanto como las
-- columnas. Sembrarlos aparte obligaria a recordar un paso mas al levantar el
-- entorno, y un catalogo vacio deja el modulo de rutinas inservible.
--
-- Cubren lo que hace el 90% de la gente en una sala. Cada gimnasio recibe su
-- copia al darse de alta y a partir de ahi son suyos: los renombra, los ajusta o
-- los borra sin que esto cambie.
INSERT INTO "exercise_templates" ("name", "muscle_group", "equipment") VALUES
  ('Press de banca', 'chest', 'Barra'),
  ('Press de banca inclinado', 'chest', 'Barra'),
  ('Press de banca con mancuernas', 'chest', 'Mancuernas'),
  ('Aperturas con mancuernas', 'chest', 'Mancuernas'),
  ('Contractor de pecho', 'chest', 'Maquina'),
  ('Cruces en polea', 'chest', 'Polea'),
  ('Fondos en paralelas', 'chest', 'Peso corporal'),
  ('Flexiones', 'chest', 'Peso corporal'),
  ('Dominadas', 'back', 'Peso corporal'),
  ('Jalon al pecho', 'back', 'Polea'),
  ('Jalon tras nuca', 'back', 'Polea'),
  ('Remo con barra', 'back', 'Barra'),
  ('Remo con mancuerna a una mano', 'back', 'Mancuernas'),
  ('Remo en polea baja', 'back', 'Polea'),
  ('Remo en maquina', 'back', 'Maquina'),
  ('Peso muerto', 'back', 'Barra'),
  ('Peso muerto rumano', 'back', 'Barra'),
  ('Hiperextensiones', 'back', 'Banco'),
  ('Pull over', 'back', 'Mancuernas'),
  ('Sentadilla', 'legs', 'Barra'),
  ('Sentadilla frontal', 'legs', 'Barra'),
  ('Sentadilla bulgara', 'legs', 'Mancuernas'),
  ('Prensa de piernas', 'legs', 'Maquina'),
  ('Extension de cuadriceps', 'legs', 'Maquina'),
  ('Curl femoral tumbado', 'legs', 'Maquina'),
  ('Curl femoral sentado', 'legs', 'Maquina'),
  ('Zancadas', 'legs', 'Mancuernas'),
  ('Hip thrust', 'legs', 'Barra'),
  ('Elevacion de gemelos de pie', 'legs', 'Maquina'),
  ('Elevacion de gemelos sentado', 'legs', 'Maquina'),
  ('Abductores en maquina', 'legs', 'Maquina'),
  ('Aductores en maquina', 'legs', 'Maquina'),
  ('Sentadilla goblet', 'legs', 'Mancuernas'),
  ('Press militar', 'shoulders', 'Barra'),
  ('Press de hombros con mancuernas', 'shoulders', 'Mancuernas'),
  ('Elevaciones laterales', 'shoulders', 'Mancuernas'),
  ('Elevaciones frontales', 'shoulders', 'Mancuernas'),
  ('Pajaro', 'shoulders', 'Mancuernas'),
  ('Face pull', 'shoulders', 'Polea'),
  ('Encogimientos de hombros', 'shoulders', 'Mancuernas'),
  ('Remo al menton', 'shoulders', 'Barra'),
  ('Curl de biceps con barra', 'arms', 'Barra'),
  ('Curl de biceps con mancuernas', 'arms', 'Mancuernas'),
  ('Curl martillo', 'arms', 'Mancuernas'),
  ('Curl concentrado', 'arms', 'Mancuernas'),
  ('Curl en banco Scott', 'arms', 'Barra'),
  ('Extension de triceps en polea', 'arms', 'Polea'),
  ('Press frances', 'arms', 'Barra'),
  ('Patada de triceps', 'arms', 'Mancuernas'),
  ('Fondos en banco', 'arms', 'Peso corporal'),
  ('Extension de triceps sobre la cabeza', 'arms', 'Mancuernas'),
  ('Curl de muneca', 'arms', 'Barra'),
  ('Plancha', 'core', 'Peso corporal'),
  ('Plancha lateral', 'core', 'Peso corporal'),
  ('Crunch abdominal', 'core', 'Peso corporal'),
  ('Elevacion de piernas colgado', 'core', 'Peso corporal'),
  ('Rueda abdominal', 'core', 'Rueda'),
  ('Russian twist', 'core', 'Balon medicinal'),
  ('Crunch en polea', 'core', 'Polea'),
  ('Mountain climbers', 'core', 'Peso corporal'),
  ('Elevacion de rodillas en paralelas', 'core', 'Peso corporal'),
  ('Cinta de correr', 'cardio', 'Maquina'),
  ('Bicicleta estatica', 'cardio', 'Maquina'),
  ('Eliptica', 'cardio', 'Maquina'),
  ('Remo ergometro', 'cardio', 'Maquina'),
  ('Comba', 'cardio', 'Comba'),
  ('Escaladora', 'cardio', 'Maquina'),
  ('Bicicleta de asalto', 'cardio', 'Maquina'),
  ('Burpees', 'full_body', 'Peso corporal'),
  ('Clean and press', 'full_body', 'Barra'),
  ('Swing con kettlebell', 'full_body', 'Kettlebell'),
  ('Thruster', 'full_body', 'Barra'),
  ('Paseo del granjero', 'full_body', 'Mancuernas'),
  ('Battle ropes', 'full_body', 'Cuerdas');
