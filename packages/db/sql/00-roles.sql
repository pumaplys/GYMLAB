-- =============================================================================
-- Permisos del rol de aplicacion
-- =============================================================================
-- Idempotente. El rol `gymlab_app` lo crea antes `scripts/apply-rls.ts`, que es
-- quien maneja la contrasena (aqui no puede ir: este archivo se versiona).
--
-- POR QUE HAY DOS ROLES
--
-- En Postgres, un superusuario y el propietario de una tabla **ignoran las
-- politicas RLS**. Si la aplicacion se conectase con el rol que ejecuta las
-- migraciones, RLS estaria habilitado, las politicas escritas... y el
-- aislamiento seria pura ficcion, sin ningun error que lo delatase.
--
--   gymlab       propietario. Solo migraciones y seed. NO lo usa la aplicacion.
--   gymlab_app   rol de la aplicacion. Sin privilegios especiales -> RLS aplica.
--
-- De ahi que existan dos variables de entorno:
--   DATABASE_URL      -> gymlab      (drizzle-kit)
--   DATABASE_URL_APP  -> gymlab_app  (API en ejecucion y tests)
-- =============================================================================

-- Cinturon adicional, por si alguien intentase ampliarlo mas adelante.
ALTER ROLE gymlab_app NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

GRANT USAGE ON SCHEMA public TO gymlab_app;

-- Permisos de datos, nunca de esquema: la aplicacion no crea ni altera tablas.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gymlab_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gymlab_app;

-- Y lo mismo para las tablas que se creen en el futuro, para no tener que
-- acordarse de repetir el GRANT en cada migracion.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gymlab_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO gymlab_app;
