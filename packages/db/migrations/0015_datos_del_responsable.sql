-- Identidad juridica del responsable del tratamiento.
--
-- Va en `organizations` y no en `gyms` porque el responsable es la SOCIEDAD,
-- no la sede: una sede no tiene NIF. Con una cadena, tres gimnasios de la misma
-- empresa comparten un unico responsable.
--
-- Todo anulable: una organizacion existente no los tiene, y el alta no va a
-- convertirse en un formulario fiscal. Lo que no se podra es publicar un
-- consentimiento sin ellos.
ALTER TABLE "organizations" ADD COLUMN "legal_name" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "tax_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "privacy_email" text;
