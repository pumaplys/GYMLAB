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


-- -----------------------------------------------------------------------------
-- gyms — el tenant en si. Se compara contra `id`, no contra `gym_id`.
-- -----------------------------------------------------------------------------
ALTER TABLE gyms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON gyms;
CREATE POLICY tenant_isolation ON gyms
  FOR ALL
  TO gymlab_app
  USING (id = app_current_gym_id())
  WITH CHECK (id = app_current_gym_id());


-- -----------------------------------------------------------------------------
-- organizations — visible solo la organizacion del gimnasio actual.
-- -----------------------------------------------------------------------------
-- La subconsulta sobre `gyms` ya esta filtrada por la politica de arriba, asi
-- que devuelve unicamente el gimnasio del contexto. No hay recursion: la
-- politica de `gyms` no menciona `organizations`.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON organizations;
CREATE POLICY tenant_isolation ON organizations
  FOR ALL
  TO gymlab_app
  USING (id IN (SELECT organization_id FROM gyms))
  WITH CHECK (id IN (SELECT organization_id FROM gyms));


-- -----------------------------------------------------------------------------
-- memberships — el patron estandar de toda tabla de negocio.
-- -----------------------------------------------------------------------------
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON memberships;
CREATE POLICY tenant_isolation ON memberships
  FOR ALL
  TO gymlab_app
  USING (gym_id = app_current_gym_id())
  WITH CHECK (gym_id = app_current_gym_id());


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
