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
DROP POLICY IF EXISTS tenant_isolation ON gyms;
DROP POLICY IF EXISTS tenant_isolation_read ON gyms;
CREATE POLICY tenant_isolation_read ON gyms
  FOR SELECT
  TO gymlab_app
  USING (
    id = app_current_gym_id()
    OR id IN (SELECT gym_id FROM memberships WHERE user_id = app_current_user_id())
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
