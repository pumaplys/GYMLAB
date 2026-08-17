import { z } from 'zod';

/**
 * Datos legales del responsable del tratamiento.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO SON LOS DATOS OPERATIVOS DEL GIMNASIO, Y NO SE MEZCLAN.               │
 * │                                                                          │
 * │ El nombre comercial, el telefono de recepcion y el correo de contacto    │
 * │ sirven para que un socio llame y pregunte por un horario. La identidad   │
 * │ juridica sirve para que alguien sepa a QUIEN reclama y ante quien        │
 * │ ejerce sus derechos. Reutilizar unos como otros es el atajo que deja un  │
 * │ consentimiento sin responsable identificable.                            │
 * │                                                                          │
 * │ Por eso viven aparte y se configuran aparte.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Lo que el dueno puede editar. Todo opcional: se rellena a trozos. */
export const updateLegalDataSchema = z.object({
  legalName: z.string().trim().min(1).max(200).nullable().optional(),
  taxId: z.string().trim().min(1).max(40).nullable().optional(),
  address: z.string().trim().min(1).max(300).nullable().optional(),
  privacyEmail: z.string().trim().email('Correo no valido').max(200).nullable().optional(),
});
export type UpdateLegalDataInput = z.infer<typeof updateLegalDataSchema>;

/**
 * Que falta para poder publicar un documento de consentimiento.
 *
 * Se enumeran los campos concretos en lugar de un booleano: «configuracion
 * incompleta» sin decir que falta obliga a adivinar.
 */
export const LEGAL_REQUIRED_FIELDS = ['legalName', 'taxId', 'address', 'privacyEmail'] as const;
export type LegalRequiredField = (typeof LEGAL_REQUIRED_FIELDS)[number];

/**
 * En que punto esta el documento de privacidad del gimnasio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CINCO ESTADOS, NO UN BOOLEANO, PORQUE LAS CAUSAS SON DISTINTAS.         │
 * │                                                                          │
 * │ «No hay documento» puede significar que el dueno no ha rellenado sus     │
 * │ datos, que la plataforma no ha subido el texto revisado, o que la        │
 * │ version configurada es todavia un borrador. Cada una la arregla una      │
 * │ persona distinta, y decirle «pendiente» a las tres es no decir nada.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const PRIVACY_DOCUMENT_STATES = [
  /** Hay documento publicado y vigente. Los socios pueden leerlo y aceptarlo. */
  'publicado',
  /**
   * Todo listo, pero todavia sin documento.
   *
   * Es el estado normal de un gimnasio cuyo primer socio aun no ha abierto su
   * pantalla de privacidad: el documento se publica cuando hace falta. Se
   * distingue de `publicado` porque decir «documento publicado» junto a
   * «version publicada: ninguna» es contradecirse en la misma pantalla.
   */
  'listo',
  /** Faltan datos del responsable. Lo arregla el dueno, desde /configuracion. */
  'falta_configuracion',
  /** No hay ninguna version configurada en la plataforma. */
  'sin_version',
  /** La version configurada no tiene plantilla. Lo arregla la plataforma. */
  'falta_plantilla',
  /** La plantilla existe pero es un borrador, y en produccion no vale. */
  'plantilla_en_borrador',
] as const;
export type PrivacyDocumentState = (typeof PRIVACY_DOCUMENT_STATES)[number];

export const privacyDocumentStatusSchema = z.object({
  state: z.enum(PRIVACY_DOCUMENT_STATES),
  /** La version que la plataforma espera. Sale de HEALTH_CONSENT_VERSION. */
  expectedVersion: z.string().nullable(),
  /** La del documento realmente publicado, si lo hay. */
  publishedVersion: z.string().nullable(),
  publishedAt: z.string().nullable(),
});
export type PrivacyDocumentStatus = z.infer<typeof privacyDocumentStatusSchema>;

export const legalDataSchema = z.object({
  /** Nombre comercial, para que el dueno sepa que organizacion esta viendo. */
  name: z.string(),
  legalName: z.string().nullable(),
  taxId: z.string().nullable(),
  address: z.string().nullable(),
  privacyEmail: z.string().nullable(),
  /**
   * Campos que faltan para poder publicar.
   *
   * Deliberadamente NO se llama «cumpleRgpd» ni nada parecido: esto solo mide
   * si estan rellenos los datos que nuestro modelo necesita para construir el
   * documento. Que el texto sea juridicamente correcto es otra cosa, y no la
   * decide un programa.
   */
  missing: z.array(z.enum(LEGAL_REQUIRED_FIELDS)),
});
export type LegalData = z.infer<typeof legalDataSchema>;
