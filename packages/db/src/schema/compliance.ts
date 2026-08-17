import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { primaryId, tenantId, timestamps } from './_helpers';
import { users } from './identity';
import { members } from './members';
import { gyms } from './organization';

/**
 * Consentimientos RGPD.
 *
 * Esta tabla lleva `gym_id`, y el motivo es legal antes que tecnico.
 *
 * En la arquitectura se establecio que GYMLAB es **encargado** del tratamiento
 * y el gimnasio es **responsable**. El socio no consiente que GYMLAB trate sus
 * datos de salud: consiente que **su gimnasio** lo haga. Si se cambia de
 * gimnasio, ese consentimiento no le acompana — hay que pedirlo de nuevo.
 *
 * `version` es imprescindible: cuando cambie la politica de privacidad hay que
 * poder demostrar que version acepto cada persona y cuando. Un booleano
 * "acepto: si" no sirve como prueba ante una autoridad de control.
 */

export const consentPurpose = pgEnum('consent_purpose', [
  /** Terminos del servicio y politica de privacidad. */
  'terms',
  /** Datos de salud: peso, medidas, entrenamiento. Art. 9 RGPD. */
  'health_data',
  /**
   * Derechos de imagen: fotos en la sala, redes sociales.
   *
   * Proposito independiente y no agrupado con los terminos, porque se revoca por
   * separado: alguien puede seguir siendo socio y retirar el permiso para
   * aparecer en fotos. Si fuera la misma casilla, revocarlo obligaria a
   * revocar tambien el contrato.
   */
  'image_rights',
]);

/**
 * La PLANTILLA legal que mantiene la plataforma. **No es una tabla de tenant.**
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO LLEVA `gym_id` A PROPOSITO, igual que `exercise_templates`.           │
 * │                                                                          │
 * │ Son datos de referencia: el texto base que GYMLAB redacta una vez y del  │
 * │ que sale el documento de cada gimnasio. Ningun socio acepta esto — se    │
 * │ acepta el documento PUBLICADO del gimnasio, que es el que nombra al      │
 * │ responsable del tratamiento.                                            │
 * │                                                                          │
 * │ Existe para que ningun gimnasio tenga que redactar un consentimiento del │
 * │ art. 9 desde cero, que es como se acaba con textos que no amparan nada.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Se siembra en una migracion con el rol propietario. La aplicacion solo lee.
 */
export const consentDocumentTemplates = pgTable(
  'consent_document_templates',
  {
    id: primaryId(),
    purpose: consentPurpose('purpose').notNull(),
    /** Identificador de la version, p. ej. '2026-09-01-borrador'. */
    version: text('version').notNull(),
    title: text('title').notNull(),
    /**
     * El cuerpo del texto.
     *
     * Puede contener `{{responsable}}`, que se sustituye al publicar por la
     * identidad del gimnasio. Es la unica sustitucion que hay: una plantilla con
     * logica es un motor de plantillas, y aqui hace falta un texto.
     */
    body: text('body').notNull(),
    /**
     * Si este texto es un BORRADOR.
     *
     * ┌──────────────────────────────────────────────────────────────────────┐
     * │ ES UNA COLUMNA Y NO UN SUFIJO EN LA VERSION, A PROPOSITO.            │
     * │                                                                      │
     * │ Deducirlo de que la cadena contenga «borrador» funciona hasta que    │
     * │ alguien publica '2027-01-01' creyendo que es definitiva, o hasta que │
     * │ el texto revisado llega con un nombre que nadie penso en filtrar.    │
     * │ Una condicion de seguridad que depende de como se escriba un nombre  │
     * │ no es una condicion de seguridad.                                    │
     * │                                                                      │
     * │ En produccion, una plantilla marcada aqui NO puede amparar ningun    │
     * │ consentimiento de datos de salud. Ver `ConsentDocumentsService`.     │
     * └──────────────────────────────────────────────────────────────────────┘
     *
     * Por defecto `true`: sembrar una plantilla nueva y olvidarse de marcarla
     * deja el texto sin poder usarse, que es el fallo barato. Al reves, un
     * borrador se publicaria como definitivo sin que nadie se enterase.
     */
    isDraft: boolean('is_draft').notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex('consent_document_templates_key').on(t.purpose, t.version)],
);

/**
 * El documento que un gimnasio concreto PUBLICA y sus socios aceptan.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ES INMUTABLE, Y ESO NO ES UNA CONVENCION: LO IMPIDE LA BASE DE DATOS.    │
 * │                                                                          │
 * │ Un consentimiento del art. 9 tiene que ser demostrable: ante una         │
 * │ autoridad hay que poder ensenar EL TEXTO EXACTO que esa persona acepto,  │
 * │ no el que hay hoy en pantalla. Si el cuerpo se pudiera editar, la fila   │
 * │ de `consents` seguiria apuntando aqui y la prueba se habria evaporado    │
 * │ sin que nadie lo notara.                                                  │
 * │                                                                          │
 * │ Por eso cambiar el texto no es editar: es PUBLICAR OTRA VERSION. La      │
 * │ anterior se marca con `superseded_at` y se queda para siempre, porque    │
 * │ hay socios cuya aceptacion la senala.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `controller` guarda la identidad del RESPONSABLE del tratamiento congelada en
 * el momento de publicar. GYMLAB es encargado y el gimnasio es responsable, asi
 * que quien responde ante el socio es el gimnasio — y si manana cambia de
 * nombre, lo que acepto esa persona sigue diciendo lo que decia.
 */
export const consentDocuments = pgTable(
  'consent_documents',
  {
    id: primaryId(),
    gymId: tenantId().references(() => gyms.id, { onDelete: 'cascade' }),
    purpose: consentPurpose('purpose').notNull(),
    /** Version de ESTE documento. Es la que se guarda en `consents.version`. */
    version: text('version').notNull(),
    /** De que version de la plantilla salio. Nulo si el gimnasio lo escribio entero. */
    templateVersion: text('template_version'),
    title: text('title').notNull(),
    /** El texto final, ya resuelto. Lo que el socio lee y acepta. */
    body: text('body').notNull(),
    /** Identidad del responsable del tratamiento, congelada al publicar. */
    controller: text('controller').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
    /** Cuando dejo de ser el vigente. Nulo = es el que se acepta ahora. */
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('consent_documents_version_key').on(t.gymId, t.purpose, t.version),
    /**
     * UN SOLO documento vigente por gimnasio y finalidad.
     *
     * Con dos, "el consentimiento vigente" dejaria de tener respuesta y la
     * puerta del art. 9 tendria que elegir — que es justo lo que no puede pasar.
     */
    uniqueIndex('consent_documents_vigente_key')
      .on(t.gymId, t.purpose)
      .where(sql`superseded_at IS NULL`),
    // Para que `consents` apunte aqui con clave ajena compuesta.
    unique('consent_documents_gym_id_key').on(t.gymId, t.id),
  ],
);

export const consents = pgTable(
  'consents',
  {
    id: primaryId(),
    gymId: tenantId().references(() => gyms.id, { onDelete: 'cascade' }),
    /**
     * Cuenta que consintio, si la tiene.
     *
     * ANULABLE desde el modulo de progreso, y el motivo es el que ordena todo
     * `members`: un gimnasio real tiene socios que nunca tendran cuenta. Exigir
     * `user_id` significaba que a esas personas no se les podia registrar el peso
     * —no habia donde anotar su consentimiento—, y la senora que va a aquagym es
     * justo quien mas veces pasa por la bascula del entrenador.
     */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    /**
     * Ficha de socio que consintio.
     *
     * Es la clave natural y no un anadido: esta misma tabla ya explicaba que el
     * socio no consiente que GYMLAB trate sus datos, sino que **su gimnasio** lo
     * haga. La identidad dentro de un gimnasio es la ficha, no la cuenta global.
     * `user_id` era la aproximacion posible en la Fase 0, cuando `members` aun no
     * existia.
     *
     * Al menos uno de los dos debe estar relleno; lo impone una restriccion CHECK.
     */
    memberId: uuid('member_id'),
    purpose: consentPurpose('purpose').notNull(),
    /** Version del documento aceptado, p. ej. '2026-07-01'. */
    version: text('version').notNull(),
    /**
     * EL DOCUMENTO EXACTO que esta persona acepto.
     *
     * La `version` sola no basta como prueba: es una etiqueta, y ante una
     * reclamacion hay que poder ensenar el texto. Esta referencia lo garantiza
     * porque `consent_documents` no se puede editar — apunta a un cuerpo
     * congelado, no a "lo que hoy se llama asi".
     *
     * Anulable solo por las filas anteriores a que existiera el modelo de
     * documentos: no se inventa a que texto apuntaban.
     */
    documentId: uuid('document_id'),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    /** El consentimiento es revocable: es un derecho, no una casilla. */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ipAddress: text('ip_address'),
    ...timestamps,
  },
  (t) => [
    index('consents_gym_user_idx').on(t.gymId, t.userId),
    index('consents_gym_member_idx').on(t.gymId, t.memberId),
    index('consents_purpose_idx').on(t.purpose),
    /**
     * Una sola aceptacion VIGENTE por socio, finalidad y version.
     *
     * Sin esto, pulsar dos veces en el mostrador creaba dos filas identicas. No
     * rompia nada —la comprobacion mira la mas reciente— pero un registro de
     * consentimientos con duplicados es peor prueba, no mejor: ante una
     * autoridad hay que poder decir cuando acepto esta persona esta version, no
     * ofrecer tres fechas distintas para lo mismo.
     *
     * PARCIAL sobre las no revocadas, y eso es lo que permite el camino
     * legitimo: si alguien revoca y mas adelante vuelve a aceptar la MISMA
     * version, la fila revocada se queda como historial y la nueva no choca.
     */
    uniqueIndex('consents_vigente_key')
      .on(t.gymId, t.memberId, t.purpose, t.version)
      .where(sql`revoked_at IS NULL AND member_id IS NOT NULL`),
    foreignKey({
      columns: [t.gymId, t.memberId],
      foreignColumns: [members.gymId, members.id],
      name: 'consents_gym_member_fk',
    }).onDelete('cascade'),
    /**
     * `RESTRICT`: un documento aceptado por alguien NO se borra.
     *
     * Es la otra mitad de la inmutabilidad. Sin esto, borrar la fila del
     * documento dejaria aceptaciones apuntando al vacio, que ante una autoridad
     * es lo mismo que no tener nada.
     */
    foreignKey({
      columns: [t.gymId, t.documentId],
      foreignColumns: [consentDocuments.gymId, consentDocuments.id],
      name: 'consents_gym_document_fk',
    }).onDelete('restrict'),
    // Un consentimiento sin sujeto no prueba nada ante una autoridad de control.
    check('consents_sujeto_check', sql`user_id IS NOT NULL OR member_id IS NOT NULL`),
  ],
);

export type Consent = typeof consents.$inferSelect;
export type NewConsent = typeof consents.$inferInsert;
export type ConsentPurpose = (typeof consentPurpose.enumValues)[number];
export type ConsentDocumentTemplate = typeof consentDocumentTemplates.$inferSelect;
export type ConsentDocument = typeof consentDocuments.$inferSelect;
export type NewConsentDocument = typeof consentDocuments.$inferInsert;
