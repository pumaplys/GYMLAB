CREATE TABLE "consent_document_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" "consent_purpose" NOT NULL,
	"version" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"purpose" "consent_purpose" NOT NULL,
	"version" text NOT NULL,
	"template_version" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"controller" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consent_documents_gym_id_key" UNIQUE("gym_id","id")
);
--> statement-breakpoint
ALTER TABLE "consents" ADD COLUMN "document_id" uuid;--> statement-breakpoint
ALTER TABLE "consent_documents" ADD CONSTRAINT "consent_documents_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consent_document_templates_key" ON "consent_document_templates" USING btree ("purpose","version");--> statement-breakpoint
CREATE UNIQUE INDEX "consent_documents_version_key" ON "consent_documents" USING btree ("gym_id","purpose","version");--> statement-breakpoint
CREATE UNIQUE INDEX "consent_documents_vigente_key" ON "consent_documents" USING btree ("gym_id","purpose") WHERE superseded_at IS NULL;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_gym_document_fk" FOREIGN KEY ("gym_id","document_id") REFERENCES "public"."consent_documents"("gym_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- La plantilla de plataforma, EN BORRADOR.
-- -----------------------------------------------------------------------------
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ ESTO NO ES EL TEXTO LEGAL DEFINITIVO, Y LO DICE EN SU PROPIA VERSION.    │
-- │                                                                          │
-- │ La version se llama '-borrador' a proposito: sirve para construir y      │
-- │ probar el circuito completo —publicar, leer, aceptar, revocar— sin       │
-- │ fingir que hay un texto revisado por nadie.                              │
-- │                                                                          │
-- │ Antes de tratar datos reales hay que publicar una version redactada de   │
-- │ verdad. Como los documentos son inmutables, eso NO es editar esta fila:  │
-- │ es sembrar otra plantilla y que cada gimnasio publique desde ella.       │
-- │                                                                          │
-- │ `{{responsable}}` es la unica sustitucion que existe, y la rellena la    │
-- │ identidad del gimnasio al publicar.                                      │
-- └──────────────────────────────────────────────────────────────────────────┘
INSERT INTO "consent_document_templates" ("purpose", "version", "title", "body") VALUES
  (
    'health_data',
    '2026-09-01-borrador',
    'Tratamiento de datos de salud',
    E'BORRADOR — texto pendiente de redaccion juridica definitiva.\n\n'
    'Responsable del tratamiento: {{responsable}}.\n\n'
    'Que datos se tratan: peso, porcentaje de grasa corporal y perimetros '
    'corporales, junto con la fecha de cada medicion y las notas que anote tu '
    'entrenador.\n\n'
    'Para que: hacer seguimiento de tu entrenamiento y adaptarlo.\n\n'
    'Base legal: tu consentimiento explicito (art. 9.2.a del RGPD). Son datos '
    'de categoria especial, asi que sin este consentimiento no se registra '
    'ninguna medicion.\n\n'
    'Quien accede: tu entrenador asignado y la direccion del gimnasio. El '
    'personal de recepcion no accede a estos datos.\n\n'
    'Cuanto tiempo: mientras seas socio y no retires el consentimiento.\n\n'
    'Tus derechos: puedes retirar este consentimiento cuando quieras desde tu '
    'area privada. Retirarlo impide registrar nuevas mediciones; las anteriores '
    'se conservan hasta que solicites su supresion. Tambien puedes solicitar '
    'acceso, rectificacion, supresion, limitacion, oposicion y portabilidad, y '
    'reclamar ante la autoridad de control.'
  );