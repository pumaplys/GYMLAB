-- Estado de una rutina: activa o archivada.
--
-- Espejo exacto de `plan_status`, y no por gusto de simetria: el patron de
-- planes ya resolvio este problema —archivar en vez de borrar, y RECHAZAR EN
-- EL SERVICIO dar de alta con uno archivado— y funciona.
--
-- Hasta ahora la unica forma de retirar una rutina era el `DELETE`, que
-- cascadea `routine_assignments`: borrarla eliminaba el registro de que un
-- socio la siguio. Eso contradice como el resto del producto trata el
-- historico —los documentos de consentimiento usan RESTRICT, los accesos y la
-- auditoria se conservan, los pagos se anulan sin borrarse—.
--
-- `DEFAULT 'active'` deja todas las rutinas existentes activas, que es lo que
-- eran: nadie ha archivado ninguna todavia.
CREATE TYPE "routine_status" AS ENUM('active', 'archived');--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "status" "routine_status" DEFAULT 'active' NOT NULL;
