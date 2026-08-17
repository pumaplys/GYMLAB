import { Injectable } from '@nestjs/common';
import { eq, gyms, organizations } from '@gymlab/db';
import {
  LEGAL_REQUIRED_FIELDS,
  type LegalData,
  type LegalRequiredField,
  type UpdateLegalDataInput,
} from '@gymlab/contracts';
import { requireTransaction } from '../common/request-context';

/**
 * Identidad juridica del responsable del tratamiento.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTE MODULO EXISTE PARA QUE OTRO NO TENGA QUE SALTARSE UNA FRONTERA.     │
 * │                                                                          │
 * │ Los datos viven en `organizations`, que pertenece a `auth`. Quien los    │
 * │ necesita de verdad es el modulo de consentimientos, al publicar un       │
 * │ documento — y ADR-0006 le prohibe leer la tabla de otro.                 │
 * │                                                                          │
 * │ Ya paso una vez: `ConsentDocumentsService` leia `organizations` y lo     │
 * │ caso la prueba de fronteras. La salida entonces fue conformarse con el   │
 * │ nombre comercial. Esta es la salida buena: un servicio de aplicacion al  │
 * │ que se le pide, que es literalmente lo que dice el ADR.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
@Injectable()
export class LegalService {
  /** Los datos del responsable del gimnasio activo, con lo que falte. */
  async porGimnasio(gymId: string): Promise<LegalData | null> {
    const tx = requireTransaction();

    const [fila] = await tx
      .select({
        name: organizations.name,
        legalName: organizations.legalName,
        taxId: organizations.taxId,
        address: organizations.address,
        privacyEmail: organizations.privacyEmail,
      })
      .from(organizations)
      .innerJoin(gyms, eq(gyms.organizationId, organizations.id))
      .where(eq(gyms.id, gymId))
      .limit(1);

    if (!fila) return null;
    return { ...fila, missing: this.queFalta(fila) };
  }

  async actualizar(gymId: string, cambios: UpdateLegalDataInput): Promise<LegalData | null> {
    const tx = requireTransaction();

    const [gimnasio] = await tx
      .select({ organizationId: gyms.organizationId })
      .from(gyms)
      .where(eq(gyms.id, gymId))
      .limit(1);

    if (!gimnasio) return null;

    /*
     * Se escriben solo las claves PRESENTES en la peticion.
     *
     * `undefined` significa "no lo toques" y `null` significa "borralo": sin
     * esta distincion, guardar solo el NIF borraria la razon social por no
     * venir en el cuerpo.
     */
    const parche = Object.fromEntries(
      Object.entries(cambios).filter(([, valor]) => valor !== undefined),
    );

    if (Object.keys(parche).length > 0) {
      await tx
        .update(organizations)
        .set({ ...parche, updatedAt: new Date() })
        .where(eq(organizations.id, gimnasio.organizationId));
    }

    return this.porGimnasio(gymId);
  }

  /**
   * La identidad congelable, o los campos que faltan para poder construirla.
   *
   * Lo llama el modulo de consentimientos antes de publicar. Devuelve un
   * resultado explicito en lugar de lanzar porque «falta configurar» no es un
   * error del socio: su pantalla tiene que poder explicarlo.
   */
  async datosDelResponsable(
    gymId: string,
  ): Promise<{ texto: string } | { falta: LegalRequiredField[] }> {
    const datos = await this.porGimnasio(gymId);
    if (!datos) return { falta: [...LEGAL_REQUIRED_FIELDS] };
    if (datos.missing.length > 0) return { falta: datos.missing };

    /*
     * Una sola linea, y con esto se sustituye `{{responsable}}` en la plantilla.
     * No se construye un parrafo con formato: el texto que rodea a esto lo
     * redacta quien revisa el documento, no este servicio.
     */
    return {
      texto:
        `${datos.legalName}, NIF ${datos.taxId}, con domicilio en ${datos.address}. ` +
        `Contacto para privacidad y ejercicio de derechos: ${datos.privacyEmail}`,
    };
  }

  private queFalta(datos: Omit<LegalData, 'missing' | 'name'>): LegalRequiredField[] {
    return LEGAL_REQUIRED_FIELDS.filter((campo) => !datos[campo]?.trim());
  }
}
