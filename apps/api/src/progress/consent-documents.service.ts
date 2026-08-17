import { Injectable } from '@nestjs/common';
import {
  and,
  consentDocumentTemplates,
  consentDocuments,
  desc,
  eq,
  isNull,
  type ConsentDocument,
} from '@gymlab/db';
import { requireTransaction } from '../common/request-context';
import { env } from '../config/env';
import { LegalService } from '../legal/legal.service';

/**
 * El documento de consentimiento que publica cada gimnasio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POR QUE NO BASTA UNA VERSION EN UNA VARIABLE DE ENTORNO.                 │
 * │                                                                          │
 * │ Antes, el consentimiento valido se decidia comparando una cadena         │
 * │ —'2026-09-01'— con otra. Eso registra QUE etiqueta acepto alguien, no    │
 * │ QUE TEXTO. Ante una autoridad de control hay que poder ensenar el texto, │
 * │ y una etiqueta no lo es.                                                 │
 * │                                                                          │
 * │ Ademas GYMLAB es ENCARGADO y el gimnasio es RESPONSABLE: quien responde  │
 * │ ante el socio es su gimnasio, con nombre y apellidos. Un unico documento │
 * │ global no podria decir quien es el responsable, porque es distinto en    │
 * │ cada uno.                                                                │
 * │                                                                          │
 * │ De ahi las dos piezas: la PLANTILLA la mantiene la plataforma, para que  │
 * │ nadie tenga que redactar un consentimiento del art. 9 desde cero; el     │
 * │ DOCUMENTO lo publica el gimnasio a partir de ella, con su identidad      │
 * │ dentro, y es inmutable.                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
@Injectable()
export class ConsentDocumentsService {
  constructor(private readonly legal: LegalService) {}

  /**
   * Devuelve el documento vigente del gimnasio, publicandolo si hace falta.
   *
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ SI, ESCRIBE. Y SI, LO LLAMA TAMBIEN UNA LECTURA.                        │
   * │                                                                          │
   * │ Es idempotente y va dentro de la transaccion de la peticion, asi que dos │
   * │ llamadas a la vez no publican dos documentos: lo impide el indice unico  │
   * │ parcial de "uno vigente por gimnasio y finalidad".                       │
   * │                                                                          │
   * │ La alternativa era exigir un paso administrativo antes de que ningun     │
   * │ socio pudiera consentir nada — y una funcionalidad que depende de que    │
   * │ alguien se acuerde de pulsar un boton acaba apagada. La edicion          │
   * │ administrativa del texto llegara; publicarlo desde la plantilla no       │
   * │ deberia hacer falta pedirlo.                                             │
   * └──────────────────────────────────────────────────────────────────────────┘
   *
   * Devuelve `null` si no hay plantilla configurada: es el estado "todavia no
   * hay texto legal", y falla en cerrado igual que antes.
   */
  async vigente(gymId: string): Promise<ConsentDocument | null> {
    const tx = requireTransaction();
    const versionDePlantilla = env.HEALTH_CONSENT_VERSION;

    const [publicado] = await tx
      .select()
      .from(consentDocuments)
      .where(
        and(
          eq(consentDocuments.gymId, gymId),
          eq(consentDocuments.purpose, 'health_data'),
          isNull(consentDocuments.supersededAt),
        ),
      )
      .limit(1);

    if (!versionDePlantilla) {
      /*
       * Sin plantilla configurada no hay texto vigente, AUNQUE quede uno
       * publicado de antes. Es el mismo criterio de fallar en cerrado: si se
       * retira la version es porque ese texto ya no sirve, y seguir aceptando
       * datos de salud al amparo de un documento retirado es justo lo que no
       * puede pasar. El documento no se borra —hay aceptaciones que lo senalan—
       * pero deja de ser el vigente.
       */
      return null;
    }

    if (publicado && publicado.templateVersion === versionDePlantilla) return publicado;

    const plantilla = await this.plantilla(versionDePlantilla);
    if (!plantilla) return null;

    // El texto cambio: el anterior se retira, no se edita.
    if (publicado) {
      await tx
        .update(consentDocuments)
        .set({ supersededAt: new Date(), updatedAt: new Date() })
        .where(eq(consentDocuments.id, publicado.id));
    }

    /*
     * ┌──────────────────────────────────────────────────────────────────────────┐
     * │ SI ESA VERSION YA SE PUBLICO AQUI, SE REACTIVA. NO SE DUPLICA.          │
     * │                                                                          │
     * │ Pasa al volver a un texto anterior. Publicar otra fila con el mismo      │
     * │ contenido partiria en dos las aceptaciones del mismo documento: unas     │
     * │ apuntando a la vieja y otras a la nueva, y "quien acepto este texto"     │
     * │ dejaria de tener una respuesta.                                          │
     * │                                                                          │
     * │ Reactivar solo toca `superseded_at`, que es lo unico que el disparador   │
     * │ de inmutabilidad deja cambiar: el cuerpo sigue siendo exactamente el que │
     * │ esas personas leyeron.                                                    │
     * └──────────────────────────────────────────────────────────────────────────┘
     */
    const [yaPublicado] = await tx
      .select()
      .from(consentDocuments)
      .where(
        and(
          eq(consentDocuments.gymId, gymId),
          eq(consentDocuments.purpose, 'health_data'),
          eq(consentDocuments.version, versionDePlantilla),
        ),
      )
      .limit(1);

    if (yaPublicado) {
      const [reactivado] = await tx
        .update(consentDocuments)
        .set({ supersededAt: null, updatedAt: new Date() })
        .where(eq(consentDocuments.id, yaPublicado.id))
        .returning();
      return reactivado!;
    }

    /*
     * ┌──────────────────────────────────────────────────────────────────────────┐
     * │ `onConflictDoNothing` + RELEER. NO ES DEFENSA EXCESIVA.                  │
     * │                                                                          │
     * │ Dos peticiones que llegan a la vez —y llegan: la pantalla del socio pide │
     * │ su estado nada mas abrirse— ven las dos que no hay documento y las dos   │
     * │ intentan publicarlo. El indice unico impide el duplicado, pero sin esto  │
     * │ la segunda muere con un 23505 y el socio recibe un 500 al entrar en la   │
     * │ pantalla de su propia privacidad.                                        │
     * │                                                                          │
     * │ Se descubrio ejecutandolo, no razonandolo: el comentario de arriba decia │
     * │ que el indice bastaba, y bastaba para la integridad — no para la         │
     * │ experiencia.                                                             │
     * └──────────────────────────────────────────────────────────────────────────┘
     */
    const responsable = await this.legal.datosDelResponsable(gymId);
    /*
     * Sin identidad del responsable NO se publica, y esto es lo que impide que
     * un gimnasio recien dado de alta empiece a recoger consentimientos de
     * datos de salud amparados en un documento que dice «el gimnasio».
     *
     * Devuelve `null` en lugar de lanzar: «falta configurar» no es un error del
     * socio, y su pantalla de privacidad tiene que poder explicarlo en vez de
     * ensenarle un 500.
     */
    if ('falta' in responsable) return null;

    const [nuevo] = await tx
      .insert(consentDocuments)
      .values({
        gymId,
        purpose: 'health_data',
        version: versionDePlantilla,
        templateVersion: versionDePlantilla,
        title: plantilla.title,
        body: plantilla.body.replaceAll('{{responsable}}', responsable.texto),
        controller: responsable.texto,
      })
      .onConflictDoNothing()
      .returning();

    if (nuevo) return nuevo;

    // Lo publico la otra: se lee el suyo, que es el mismo texto.
    const [deLaOtra] = await tx
      .select()
      .from(consentDocuments)
      .where(
        and(
          eq(consentDocuments.gymId, gymId),
          eq(consentDocuments.purpose, 'health_data'),
          eq(consentDocuments.version, versionDePlantilla),
        ),
      )
      .limit(1);

    return deLaOtra ?? null;
  }

  /** Un documento concreto, para poder ensenar el que alguien acepto. */
  async porId(gymId: string, id: string): Promise<ConsentDocument | null> {
    const tx = requireTransaction();
    const [fila] = await tx
      .select()
      .from(consentDocuments)
      .where(and(eq(consentDocuments.gymId, gymId), eq(consentDocuments.id, id)))
      .limit(1);
    return fila ?? null;
  }

  private async plantilla(version: string) {
    const tx = requireTransaction();
    const [fila] = await tx
      .select()
      .from(consentDocumentTemplates)
      .where(
        and(
          eq(consentDocumentTemplates.purpose, 'health_data'),
          eq(consentDocumentTemplates.version, version),
        ),
      )
      .orderBy(desc(consentDocumentTemplates.createdAt))
      .limit(1);
    return fila ?? null;
  }

}
