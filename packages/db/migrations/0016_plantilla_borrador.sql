-- Marca explicita de BORRADOR en las plantillas de consentimiento.
--
-- Sin esto, lo unico que distinguia el texto pendiente de redaccion juridica
-- del definitivo era que su version se llamara '2026-09-01-borrador'. Una
-- condicion de seguridad que depende de como alguien escriba un nombre no es
-- una condicion de seguridad.
--
-- Por defecto TRUE: sembrar una plantilla y olvidarse de marcarla la deja
-- inutilizable, que es el fallo barato. Al reves, un borrador acabaria
-- amparando consentimientos de datos de salud sin que nadie se enterase.
ALTER TABLE "consent_document_templates"
  ADD COLUMN "is_draft" boolean NOT NULL DEFAULT true;--> statement-breakpoint

-- La unica que existe hoy lo es, y su propio texto empieza diciendolo.
UPDATE "consent_document_templates"
  SET "is_draft" = true
  WHERE "version" = '2026-09-01-borrador';
