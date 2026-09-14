-- Que borrar una identidad deje de ser imposible.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ `invited_by_user_id` ERA RESTRICT, Y ESO BLOQUEABA EL ARTICULO 17.       │
-- │                                                                          │
-- │ PostgreSQL RECHAZABA borrar la cuenta de cualquiera que hubiera invitado │
-- │ a alguien — es decir, de cualquier dueño o recepcion en activo. El       │
-- │ RESTRICT se puso para proteger el rastro de «quien dio acceso a quien»,  │
-- │ y esa intencion sigue siendo buena: la fila se conserva. Lo que no puede │
-- │ es impedir que una persona ejerza su derecho de supresion.               │
-- │                                                                          │
-- │ SET NULL conserva el hecho —hubo una invitacion, a este correo, con este │
-- │ rol, en esta fecha— y deja de conservar a la persona. Que es exactamente │
-- │ lo que hacen ya `audit_log.actor_user_id` y `payments.recorded_by_user_id`│
-- │ en este mismo esquema.                                                   │
-- │                                                                          │
-- │ La columna pasa a admitir NULL. `NULL` significa «la cuenta que invito   │
-- │ ya no existe», no «no se sabe quien invito»: mientras la cuenta viva, el │
-- │ valor esta.                                                              │
-- └──────────────────────────────────────────────────────────────────────────┘
ALTER TABLE "invitations" ALTER COLUMN "invited_by_user_id" DROP NOT NULL;

ALTER TABLE "invitations" DROP CONSTRAINT "invitations_invited_by_user_id_users_id_fk";

ALTER TABLE "invitations"
  ADD CONSTRAINT "invitations_invited_by_user_id_users_id_fk"
  FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ Y EL CORREO DEL INVITADO, QUE UNA CLAVE AJENA NO ALCANZA.               │
-- │                                                                          │
-- │ `invitations.email` es un dato personal que vive en una columna de texto │
-- │ suelta, no en una relacion. Una invitacion de PERSONAL no tiene          │
-- │ `member_id`, asi que no cae por la cascada de la ficha: al borrar la     │
-- │ cuenta de quien la acepto, su correo se quedaba ahi.                     │
-- │                                                                          │
-- │ Poner la FK a NULL no habria bastado, y por eso existe este indice: el   │
-- │ servicio de borrado busca por correo y lo sustituye. El indice ya estaba │
-- │ (`invitations_email_idx`), asi que aqui no hace falta crear nada — se    │
-- │ deja escrito para que se entienda por que esa busqueda es barata.        │
-- └──────────────────────────────────────────────────────────────────────────┘

-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ LA OTRA PII QUE NO CUELGA DE NINGUNA CLAVE AJENA.                       │
-- │                                                                          │
-- │ `auth_events.email_attempted` guarda el correo TECLEADO en cada intento  │
-- │ de entrada, con exito o sin el. Al borrar la cuenta, `user_id` se ponia  │
-- │ a NULL por la clave ajena y el correo seguia escrito en claro.           │
-- │                                                                          │
-- │ No hace falta ningun indice nuevo: `auth_events_email_idx` ya esta sobre │
-- │ esa columna. Lo comprobe despues de crear uno duplicado.                 │
-- │                                                                          │
-- │ Lo resuelve el servicio de borrado, no el esquema. Se deja escrito aqui  │
-- │ para que quien lea la migracion sepa que ese caso esta contemplado.      │
-- └──────────────────────────────────────────────────────────────────────────┘
