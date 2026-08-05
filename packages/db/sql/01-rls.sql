-- =============================================================================
-- Row Level Security — aislamiento entre gimnasios
-- =============================================================================
-- Idempotente: `DROP POLICY IF EXISTS` antes de cada `CREATE POLICY`, de modo
-- que este archivo es la definicion completa y siempre se puede reaplicar.
--
-- Vive fuera de las migraciones generadas por drizzle-kit a proposito: el
-- diffing automatico no gestiona politicas de forma fiable, y este es el limite
-- de seguridad del producto. Debe ser codigo explicito, legible y reafirmable
-- en cualquier momento, no el resultado de un algoritmo de comparacion.
--
-- AL ANADIR UNA TABLA DE NEGOCIO, anade aqui su bloque. Sin excepciones.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Contexto de tenant
-- -----------------------------------------------------------------------------
-- Lee la variable de sesion que fija `withTenant()`.
--
-- El segundo argumento de `current_setting` es `true` (missing_ok): si la
-- variable no existe, devuelve NULL en lugar de lanzar un error. Combinado con
-- `NULLIF(..., '')`, cualquier consulta sin contexto de tenant produce NULL, la
-- comparacion da NULL, la politica no se cumple y el resultado son cero filas.
-- Es decir: **falla en cerrado**. Un fallo de programacion no puede convertirse
-- en una fuga de datos.
CREATE OR REPLACE FUNCTION app_current_gym_id() RETURNS uuid
  LANGUAGE sql
  STABLE
  AS $$ SELECT NULLIF(current_setting('app.gym_id', true), '')::uuid $$;

-- Usuario de la peticion. Se fija junto al gimnasio, en la misma transaccion.
--
-- Existe por un caso concreto: /v1/auth/me tiene que listar los gimnasios a los
-- que pertenece una persona, y eso atraviesa tenants por definicion. Sin esto,
-- la consulta devolveria solo las membresias del gimnasio activo.
--
-- Fallo en cerrado igual que el anterior: sin contexto, NULL.
CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS uuid
  LANGUAGE sql
  STABLE
  AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;


-- -----------------------------------------------------------------------------
-- gyms — el tenant en si. Se compara contra `id`, no contra `gym_id`.
-- -----------------------------------------------------------------------------
ALTER TABLE gyms ENABLE ROW LEVEL SECURITY;

-- Lectura: el gimnasio actual, MAS aquellos a los que pertenece el usuario.
--
-- La segunda parte es simetrica a la de `memberships` y existe por el mismo
-- motivo: /v1/auth/me tiene que devolver el NOMBRE de cada gimnasio de la
-- persona, y esa consulta corre sin contexto de tenant. Sin esto, el JOIN con
-- `gyms` filtraba todas las filas y /me devolvia una lista vacia.
--
-- No abre ninguna via: solo deja ver los gimnasios a los que uno pertenece.
-- Y `app.user_id` lo fija el servidor desde la sesion, nunca la peticion.
--
-- `ended_at IS NULL` NO es un detalle: sin el, a quien se le retira el acceso
-- le seguiria constando este gimnasio. La pertenencia terminada se conserva
-- para el historial, pero no debe abrir ninguna puerta.
DROP POLICY IF EXISTS tenant_isolation ON gyms;
DROP POLICY IF EXISTS tenant_isolation_read ON gyms;
CREATE POLICY tenant_isolation_read ON gyms
  FOR SELECT
  TO gymlab_app
  USING (
    id = app_current_gym_id()
    OR id IN (
      SELECT gym_id FROM memberships
      WHERE user_id = app_current_user_id() AND ended_at IS NULL
    )
  );

-- Escritura: estrictamente el gimnasio activo. El INSERT de register-gym
-- funciona porque la transaccion se abre con `app.gym_id` ya fijado al id
-- recien generado.
DROP POLICY IF EXISTS tenant_isolation_insert ON gyms;
CREATE POLICY tenant_isolation_insert ON gyms
  FOR INSERT
  TO gymlab_app
  WITH CHECK (id = app_current_gym_id());

DROP POLICY IF EXISTS tenant_isolation_update ON gyms;
CREATE POLICY tenant_isolation_update ON gyms
  FOR UPDATE
  TO gymlab_app
  USING (id = app_current_gym_id())
  WITH CHECK (id = app_current_gym_id());

DROP POLICY IF EXISTS tenant_isolation_delete ON gyms;
CREATE POLICY tenant_isolation_delete ON gyms
  FOR DELETE
  TO gymlab_app
  USING (id = app_current_gym_id());


-- -----------------------------------------------------------------------------
-- organizations — visible solo la organizacion del gimnasio actual.
-- -----------------------------------------------------------------------------
-- La subconsulta sobre `gyms` ya esta filtrada por la politica de arriba, asi
-- que devuelve unicamente el gimnasio del contexto. No hay recursion: la
-- politica de `gyms` no menciona `organizations`.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- La politica de lectura no cambia: solo se ve la organizacion del gimnasio
-- actual. La subconsulta ya viene filtrada por la politica de `gyms`.
DROP POLICY IF EXISTS tenant_isolation ON organizations;
DROP POLICY IF EXISTS tenant_isolation_read ON organizations;
CREATE POLICY tenant_isolation_read ON organizations
  FOR SELECT
  TO gymlab_app
  USING (id IN (SELECT organization_id FROM gyms));

DROP POLICY IF EXISTS tenant_isolation_write ON organizations;
CREATE POLICY tenant_isolation_write ON organizations
  FOR UPDATE
  TO gymlab_app
  USING (id IN (SELECT organization_id FROM gyms))
  WITH CHECK (id IN (SELECT organization_id FROM gyms));

DROP POLICY IF EXISTS tenant_isolation_delete ON organizations;
CREATE POLICY tenant_isolation_delete ON organizations
  FOR DELETE
  TO gymlab_app
  USING (id IN (SELECT organization_id FROM gyms));

-- INSERT sin restriccion, y es deliberado: es el arranque de un tenant nuevo.
--
-- El problema: /v1/auth/register-gym crea la organizacion y su primer gimnasio
-- cuando todavia no existe ningun gimnasio al que referirse. Una politica
-- `WITH CHECK (id IN (SELECT organization_id FROM gyms))` seria imposible de
-- satisfacer: la fila de `gyms` aun no existe.
--
-- Por que es seguro: **RLS protege frente a la divulgacion**, y un INSERT no
-- divulga nada. Leer sigue estando acotado por la politica de arriba, asi que
-- quien crea una organizacion no puede ver ninguna otra. Quien puede crear
-- gimnasios lo decide la capa de aplicacion, con el codigo de plataforma
-- (ADR-0007, decision 6), que es donde vive esa regla de negocio.
--
-- El peor caso de un fallo aqui son organizaciones huerfanas, no una fuga de
-- datos entre clientes.
DROP POLICY IF EXISTS tenant_bootstrap_insert ON organizations;
CREATE POLICY tenant_bootstrap_insert ON organizations
  FOR INSERT
  TO gymlab_app
  WITH CHECK (true);


-- -----------------------------------------------------------------------------
-- memberships — el patron estandar de toda tabla de negocio.
-- -----------------------------------------------------------------------------
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

-- Lectura: las del gimnasio actual, MAS las propias en cualquier gimnasio.
--
-- La segunda parte existe para /v1/auth/me, que tiene que listar los gimnasios
-- de una persona y eso atraviesa tenants por definicion.
--
-- No abre ninguna via de fuga: `user_id = app_current_user_id()` solo deja ver
-- las filas de uno mismo. Nadie puede ver a que otros gimnasios pertenece otra
-- persona. Y el valor de `app.user_id` lo fija el servidor a partir de la
-- sesion, nunca la peticion.
DROP POLICY IF EXISTS tenant_isolation ON memberships;
DROP POLICY IF EXISTS tenant_isolation_read ON memberships;
CREATE POLICY tenant_isolation_read ON memberships
  FOR SELECT
  TO gymlab_app
  USING (gym_id = app_current_gym_id() OR user_id = app_current_user_id());

-- Escritura: estrictamente dentro del gimnasio activo. Aqui no hay excepcion.
DROP POLICY IF EXISTS tenant_isolation_insert ON memberships;
CREATE POLICY tenant_isolation_insert ON memberships
  FOR INSERT
  TO gymlab_app
  WITH CHECK (gym_id = app_current_gym_id());

DROP POLICY IF EXISTS tenant_isolation_update ON memberships;
CREATE POLICY tenant_isolation_update ON memberships
  FOR UPDATE
  TO gymlab_app
  USING (gym_id = app_current_gym_id())
  WITH CHECK (gym_id = app_current_gym_id());

DROP POLICY IF EXISTS tenant_isolation_delete ON memberships;
CREATE POLICY tenant_isolation_delete ON memberships
  FOR DELETE
  TO gymlab_app
  USING (gym_id = app_current_gym_id());


-- -----------------------------------------------------------------------------
-- invitations — patron estandar.
-- -----------------------------------------------------------------------------
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON invitations;
CREATE POLICY tenant_isolation ON invitations
  FOR ALL
  TO gymlab_app
  USING (gym_id = app_current_gym_id())
  WITH CHECK (gym_id = app_current_gym_id());


-- -----------------------------------------------------------------------------
-- consents — patron estandar.
-- -----------------------------------------------------------------------------
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON consents;
CREATE POLICY tenant_isolation ON consents
  FOR ALL
  TO gymlab_app
  USING (gym_id = app_current_gym_id())
  WITH CHECK (gym_id = app_current_gym_id());


-- -----------------------------------------------------------------------------
-- members — patron estandar.
-- -----------------------------------------------------------------------------
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON members;
CREATE POLICY tenant_isolation ON members
  FOR ALL
  TO gymlab_app
  USING (gym_id = app_current_gym_id())
  WITH CHECK (gym_id = app_current_gym_id());


-- -----------------------------------------------------------------------------
-- member_counters — patron estandar.
-- -----------------------------------------------------------------------------
-- Aqui `gym_id` es ademas la clave primaria: un contador por gimnasio.
ALTER TABLE member_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON member_counters;
CREATE POLICY tenant_isolation ON member_counters
  FOR ALL
  TO gymlab_app
  USING (gym_id = app_current_gym_id())
  WITH CHECK (gym_id = app_current_gym_id());


-- -----------------------------------------------------------------------------
-- member_notes — patron estandar.
-- -----------------------------------------------------------------------------
-- El socio no las ve, pero eso NO lo impone RLS: lo impone la autorizacion de
-- la aplicacion, porque el socio consulta su ficha dentro de su propio
-- gimnasio y RLS no distingue roles. Es autorizacion de aplicacion y necesita
-- sus propios tests.
ALTER TABLE member_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON member_notes;
CREATE POLICY tenant_isolation ON member_notes
  FOR ALL
  TO gymlab_app
  USING (gym_id = app_current_gym_id())
  WITH CHECK (gym_id = app_current_gym_id());


-- -----------------------------------------------------------------------------
-- trainers — patron estandar.
-- -----------------------------------------------------------------------------
ALTER TABLE trainers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON trainers;
CREATE POLICY tenant_isolation ON trainers
  FOR ALL
  TO gymlab_app
  USING (gym_id = app_current_gym_id())
  WITH CHECK (gym_id = app_current_gym_id());


-- -----------------------------------------------------------------------------
-- trainer_assignments — patron estandar, y NO basta.
-- -----------------------------------------------------------------------------
-- Esta politica impide que un gimnasio vea las asignaciones de otro. NO impide
-- que un entrenador vea las de un companero: para PostgreSQL, dentro del mismo
-- gimnasio los dos son el mismo rol `gymlab_app`.
--
-- Que cada entrenador vea solo a SUS socios es autorizacion de aplicacion, vive
-- en TrainersService y tiene sus propios tests de abuso. Se deja escrito aqui
-- para que nadie lea esta politica y suponga que el filtro ya esta hecho.
ALTER TABLE trainer_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON trainer_assignments;
CREATE POLICY tenant_isolation ON trainer_assignments
  FOR ALL
  TO gymlab_app
  USING (gym_id = app_current_gym_id())
  WITH CHECK (gym_id = app_current_gym_id());


-- -----------------------------------------------------------------------------
-- plans — patron estandar.
-- -----------------------------------------------------------------------------
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON plans;
CREATE POLICY tenant_isolation ON plans
  FOR ALL
  TO gymlab_app
  USING (gym_id = app_current_gym_id())
  WITH CHECK (gym_id = app_current_gym_id());


-- -----------------------------------------------------------------------------
-- member_subscriptions — patron estandar.
-- -----------------------------------------------------------------------------
-- Que un socio solo vea SU cuota y no la de sus companeros no lo impone RLS: el
-- socio consulta dentro de su propio gimnasio y la politica no distingue roles.
-- Es autorizacion de aplicacion, con sus propios tests.
ALTER TABLE member_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON member_subscriptions;
CREATE POLICY tenant_isolation ON member_subscriptions
  FOR ALL
  TO gymlab_app
  USING (gym_id = app_current_gym_id())
  WITH CHECK (gym_id = app_current_gym_id());


-- -----------------------------------------------------------------------------
-- payments — aislado por tenant Y ademas sin borrado.
-- -----------------------------------------------------------------------------
-- Un registro de dinero que la aplicacion puede borrar en silencio no sirve como
-- registro de dinero. Igual que en `audit_log`, el caracter append-only no se
-- deja al codigo: se retira el permiso.
--
-- UPDATE si se conserva, al contrario que en `audit_log`, porque anular un pago
-- es un UPDATE (`voided_at`, motivo y autor) y es la via prevista para corregir
-- un error. Lo que no existe es hacer desaparecer la fila.
--
-- El REVOKE va despues del GRANT de 00-roles.sql, que concede permisos sobre
-- todas las tablas. El orden de los dos archivos importa.
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON payments;
CREATE POLICY tenant_isolation ON payments
  FOR ALL
  TO gymlab_app
  USING (gym_id = app_current_gym_id())
  WITH CHECK (gym_id = app_current_gym_id());

REVOKE DELETE ON payments FROM gymlab_app;


-- -----------------------------------------------------------------------------
-- access_tokens — patron estandar.
-- -----------------------------------------------------------------------------
ALTER TABLE access_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON access_tokens;
CREATE POLICY tenant_isolation ON access_tokens
  FOR ALL
  TO gymlab_app
  USING (gym_id = app_current_gym_id())
  WITH CHECK (gym_id = app_current_gym_id());


-- -----------------------------------------------------------------------------
-- access_events — patron estandar.
-- -----------------------------------------------------------------------------
ALTER TABLE access_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON access_events;
CREATE POLICY tenant_isolation ON access_events
  FOR ALL
  TO gymlab_app
  USING (gym_id = app_current_gym_id())
  WITH CHECK (gym_id = app_current_gym_id());


-- -----------------------------------------------------------------------------
-- exercises, routines, routine_items, routine_assignments — patron estandar.
-- -----------------------------------------------------------------------------
-- Que un entrenador vea solo las rutinas de SUS socios no lo impone RLS: dentro
-- de un gimnasio la politica no distingue roles. Es autorizacion de aplicacion,
-- vive en TrainingService y tiene sus propios tests de abuso — igual que pasaba
-- con las asignaciones de entrenador.
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON exercises;
CREATE POLICY tenant_isolation ON exercises
  FOR ALL
  TO gymlab_app
  USING (gym_id = app_current_gym_id())
  WITH CHECK (gym_id = app_current_gym_id());

ALTER TABLE routines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON routines;
CREATE POLICY tenant_isolation ON routines
  FOR ALL
  TO gymlab_app
  USING (gym_id = app_current_gym_id())
  WITH CHECK (gym_id = app_current_gym_id());

ALTER TABLE routine_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON routine_items;
CREATE POLICY tenant_isolation ON routine_items
  FOR ALL
  TO gymlab_app
  USING (gym_id = app_current_gym_id())
  WITH CHECK (gym_id = app_current_gym_id());

ALTER TABLE routine_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON routine_assignments;
CREATE POLICY tenant_isolation ON routine_assignments
  FOR ALL
  TO gymlab_app
  USING (gym_id = app_current_gym_id())
  WITH CHECK (gym_id = app_current_gym_id());


-- -----------------------------------------------------------------------------
-- body_metrics — patron estandar, y la tabla mas sensible del producto.
-- -----------------------------------------------------------------------------
-- Categoria especial del RGPD (art. 9). RLS impide que un gimnasio vea los datos
-- de salud de otro, que es lo que evita una brecha notificable.
--
-- Lo que RLS NO hace, y hay que tener presente: dentro de un gimnasio no
-- distingue roles, asi que que recepcion no acceda y que un entrenador vea solo a
-- sus asignados es autorizacion de aplicacion. Y tampoco comprueba el
-- consentimiento: eso vive en ProgressService, que rechaza toda escritura sin uno
-- vigente.
ALTER TABLE body_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON body_metrics;
CREATE POLICY tenant_isolation ON body_metrics
  FOR ALL
  TO gymlab_app
  USING (gym_id = app_current_gym_id())
  WITH CHECK (gym_id = app_current_gym_id());


-- -----------------------------------------------------------------------------
-- exercise_templates — SIN RLS, decision consciente (ADR-0012).
-- -----------------------------------------------------------------------------
-- No lleva `gym_id`: son datos de referencia de la plataforma, como una lista de
-- paises. No hay nada que aislar porque no pertenecen a nadie.
--
-- La aplicacion solo LEE. Escribirlos es sembrar el catalogo, y eso ocurre en una
-- migracion con el rol propietario. Se retiran los permisos de escritura para que
-- un fallo de programacion no pueda tocar el catalogo de toda la plataforma desde
-- una peticion de un gimnasio.
REVOKE INSERT, UPDATE, DELETE ON exercise_templates FROM gymlab_app;

COMMENT ON TABLE exercise_templates IS
  'Catalogo de ejercicios de la plataforma. Sin gym_id ni RLS a proposito: son datos de referencia (ADR-0012). Se copian a cada gimnasio al darse de alta; la aplicacion solo lee.';


-- -----------------------------------------------------------------------------
-- Purga de acceso — LA UNICA EXCEPCION A RLS EN TODO EL PRODUCTO.
-- -----------------------------------------------------------------------------
-- El problema: la retencion de `access_events` es POR GIMNASIO, asi que el
-- trabajo de purga necesita recorrer todos los gimnasios. Y no puede: con el rol
-- de la aplicacion, la politica de `gyms` solo deja ver el gimnasio activo y
-- aquellos a los que pertenece el usuario. Un trabajo de fondo no tiene ninguno
-- de los dos.
--
-- Las alternativas y por que se descartaron:
--
--   * Conectar el worker con el rol PROPIETARIO. Funciona y es lo comodo, pero
--     mete una conexion que se salta RLS dentro del proceso que atiende
--     peticiones. Un fallo ahi deja de estar acotado.
--   * Abrir una politica de lectura general sobre `gyms`. Desactivaria justo lo
--     que protege el producto.
--   * Programar un trabajo por gimnasio. Alguien tendria que enumerarlos igual.
--
-- Lo que se hace: una funcion SECURITY DEFINER, es decir, se ejecuta con los
-- permisos de su propietario (`gymlab`) y por tanto ve todas las filas. La
-- aplicacion no gana ningun privilegio general: gana EXACTAMENTE esta capacidad,
-- que solo sabe borrar filas caducadas y no devuelve ni un dato personal.
--
-- `SET search_path = public` es obligatorio en una funcion SECURITY DEFINER: sin
-- el, quien pudiera manipular el search_path podria hacer que resolviera a otras
-- tablas y ejecutar codigo con los permisos del propietario.
CREATE OR REPLACE FUNCTION app_purge_access_data()
  RETURNS TABLE (tokens_borrados bigint, eventos_borrados bigint)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  DECLARE
    n_tokens bigint;
    n_eventos bigint;
  BEGIN
    -- Los tokens consumidos solo existen para impedir la reutilizacion y para
    -- tolerar un reintento de red. Una hora despues de caducar no sirven a nadie.
    DELETE FROM access_tokens WHERE expires_at < now() - INTERVAL '1 hour';
    GET DIAGNOSTICS n_tokens = ROW_COUNT;

    -- Cada gimnasio con su propio plazo.
    DELETE FROM access_events e
      USING gyms g
     WHERE e.gym_id = g.id
       AND e.occurred_at < now() - (g.access_events_retention_months * INTERVAL '1 month');
    GET DIAGNOSTICS n_eventos = ROW_COUNT;

    RETURN QUERY SELECT n_tokens, n_eventos;
  END;
  $$;

-- Nadie mas que la aplicacion. `PUBLIC` incluiria a cualquier rol futuro.
REVOKE EXECUTE ON FUNCTION app_purge_access_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_purge_access_data() TO gymlab_app;


-- -----------------------------------------------------------------------------
-- audit_log — aislado por tenant Y ademas append-only.
-- -----------------------------------------------------------------------------
-- Un registro de auditoria que la propia aplicacion puede reescribir no sirve
-- como registro de auditoria. Aqui el caracter append-only no se deja al codigo:
-- se imponen dos politicas que solo cubren SELECT e INSERT, y se le retiran al
-- rol de la aplicacion los permisos de UPDATE y DELETE.
--
-- El REVOKE va despues del GRANT de 00-roles.sql, que concede permisos sobre
-- todas las tablas. El orden de los dos archivos importa.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_select ON audit_log;
CREATE POLICY tenant_isolation_select ON audit_log
  FOR SELECT
  TO gymlab_app
  USING (gym_id = app_current_gym_id());

DROP POLICY IF EXISTS tenant_isolation_insert ON audit_log;
CREATE POLICY tenant_isolation_insert ON audit_log
  FOR INSERT
  TO gymlab_app
  WITH CHECK (gym_id = app_current_gym_id());

REVOKE UPDATE, DELETE ON audit_log FROM gymlab_app;


-- -----------------------------------------------------------------------------
-- auth_events — GLOBAL, sin RLS, decision consciente.
-- -----------------------------------------------------------------------------
-- Un intento de login fallido no tiene gimnasio: todavia no se sabe quien lo
-- intenta. Con RLS, esos registros serian invisibles justo para el dueno que
-- quiere comprobar si le estan atacando la cuenta.
COMMENT ON TABLE auth_events IS
  'Eventos de autenticacion. Global y sin RLS a proposito: un login fallido no tiene gimnasio asociado. Retencion 90 dias (RGPD art. 5.1.e).';


-- -----------------------------------------------------------------------------
-- users — SIN RLS de tenant, decision consciente.
-- -----------------------------------------------------------------------------
-- El login necesita buscar por email antes de saber a que gimnasio pertenece la
-- persona. Una politica aqui haria imposible autenticarse.
--
-- Se compensa con una restriccion de diseno: `users` guarda solo identidad y
-- credenciales. Ningun dato de negocio y, sobre todo, ningun dato de salud.
-- Todo lo demas cuelga de tablas con `gym_id` y politica.
--
-- Este comentario queda en la base de datos para que quien lo lea dentro de un
-- ano no piense que es un olvido.
COMMENT ON TABLE users IS
  'Identidad global. Sin RLS de tenant a proposito: el login precede al contexto de gimnasio. Solo credenciales e identificacion, nunca datos de negocio ni de salud.';
