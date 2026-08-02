-- Claves ajenas COMPUESTAS (gym_id, id): el tenant viaja en la restriccion.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ ESTE FICHERO ESTA EDITADO A MANO sobre lo que genero drizzle-kit, por dos │
-- │ motivos concretos. Si alguien lo regenera, volveran los dos problemas.    │
-- │                                                                          │
-- │ 1. ORDEN. drizzle emitia las restricciones UNIQUE al final, despues de    │
-- │    las claves ajenas que apuntan a ellas. PostgreSQL exige que la unica   │
-- │    exista primero, asi que la migracion fallaba. Aqui van al principio.   │
-- │                                                                          │
-- │ 2. `ON DELETE SET NULL (columna)`. drizzle no sabe expresar la lista de   │
-- │    columnas (PostgreSQL 15+), y su `set null` a secas pondria a NULL      │
-- │    TAMBIEN `gym_id`, que es NOT NULL: borrar un socio fallaria con        │
-- │    violacion de no-nulo. Solo debe anularse el lado que apunta.           │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- Por que existe esta migracion: con la clave simple, una asignacion de
-- entrenador o una cuota podian declarar `gym_id` del gimnasio A y apuntar a un
-- socio del B. La restriccion solo comprobaba que el socio existiera, no de
-- quien era, y se verifico que la fila incoherente ERA insertable. No habia
-- fuga —al leer, el JOIN con `members` esta filtrado por RLS y la fila
-- desaparecia— pero lo que nos salvaba era la politica de OTRA tabla, no una
-- garantia propia. Ahora la incoherencia es irrepresentable.

-- 1. El lado referenciado: unicas sobre (gym_id, id). Van PRIMERO.
ALTER TABLE "members" ADD CONSTRAINT "members_gym_id_key" UNIQUE("gym_id","id");--> statement-breakpoint
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_gym_id_key" UNIQUE("gym_id","id");--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_gym_id_key" UNIQUE("gym_id","id");--> statement-breakpoint
ALTER TABLE "member_subscriptions" ADD CONSTRAINT "member_subscriptions_gym_id_key" UNIQUE("gym_id","id");--> statement-breakpoint

-- 2. Fuera las claves simples.
ALTER TABLE "member_notes" DROP CONSTRAINT "member_notes_member_id_members_id_fk";--> statement-breakpoint
ALTER TABLE "trainer_assignments" DROP CONSTRAINT "trainer_assignments_trainer_id_trainers_id_fk";--> statement-breakpoint
ALTER TABLE "trainer_assignments" DROP CONSTRAINT "trainer_assignments_member_id_members_id_fk";--> statement-breakpoint
ALTER TABLE "member_subscriptions" DROP CONSTRAINT "member_subscriptions_member_id_members_id_fk";--> statement-breakpoint
ALTER TABLE "member_subscriptions" DROP CONSTRAINT "member_subscriptions_plan_id_plans_id_fk";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_member_id_members_id_fk";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_subscription_id_member_subscriptions_id_fk";--> statement-breakpoint
ALTER TABLE "invitations" DROP CONSTRAINT "invitations_member_id_members_id_fk";--> statement-breakpoint

-- 3. Dentro las compuestas.
ALTER TABLE "member_notes" ADD CONSTRAINT "member_notes_gym_member_fk" FOREIGN KEY ("gym_id","member_id") REFERENCES "public"."members"("gym_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainer_assignments" ADD CONSTRAINT "trainer_assignments_gym_trainer_fk" FOREIGN KEY ("gym_id","trainer_id") REFERENCES "public"."trainers"("gym_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainer_assignments" ADD CONSTRAINT "trainer_assignments_gym_member_fk" FOREIGN KEY ("gym_id","member_id") REFERENCES "public"."members"("gym_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_subscriptions" ADD CONSTRAINT "member_subscriptions_gym_member_fk" FOREIGN KEY ("gym_id","member_id") REFERENCES "public"."members"("gym_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_subscriptions" ADD CONSTRAINT "member_subscriptions_gym_plan_fk" FOREIGN KEY ("gym_id","plan_id") REFERENCES "public"."plans"("gym_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_gym_member_fk" FOREIGN KEY ("gym_id","member_id") REFERENCES "public"."members"("gym_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- 4. Las dos que anulan SOLO su lado (art. 17.3.b: el pago sobrevive desligado
--    con importe y fecha para que el gimnasio cuadre su contabilidad).
ALTER TABLE "payments" ADD CONSTRAINT "payments_gym_member_fk" FOREIGN KEY ("gym_id","member_id") REFERENCES "public"."members"("gym_id","id") ON DELETE SET NULL ("member_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_gym_subscription_fk" FOREIGN KEY ("gym_id","subscription_id") REFERENCES "public"."member_subscriptions"("gym_id","id") ON DELETE SET NULL ("subscription_id") ON UPDATE no action;
