import type { LegalRequiredField, PrivacyDocumentState } from '@gymlab/contracts';

/**
 * Como se nombra en pantalla lo que el backend devuelve en clave.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL FRONTEND NO DECIDE QUE ES OBLIGATORIO. SOLO LO TRADUCE.               │
 * │                                                                          │
 * │ La lista de campos que faltan viene del servidor, que es quien impide    │
 * │ publicar sin ellos. Repetir aqui esa regla crearia dos fuentes de verdad │
 * │ y, el dia que cambie una, una pantalla que dice «completa» sobre una     │
 * │ configuracion que el servidor rechaza.                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const NOMBRE_DEL_CAMPO: Record<LegalRequiredField, string> = {
  legalName: 'Razón social',
  taxId: 'Identificador fiscal',
  address: 'Domicilio',
  privacyEmail: 'Email de privacidad',
};

export function faltantesLegibles(faltan: readonly LegalRequiredField[]): string[] {
  return faltan.map((campo) => NOMBRE_DEL_CAMPO[campo]);
}

/**
 * Que se le cuenta al dueno sobre su documento de privacidad.
 *
 * Deliberadamente factual. Nada de «cumple RGPD» ni «legalmente válido»: esto
 * mide si hay un texto publicado y, si no, por que — no si ese texto ampara
 * juridicamente nada, que no lo decide un programa.
 *
 * `arreglaOtro` distingue lo que puede resolver el dueno de lo que depende de
 * la plataforma. Decirle «pendiente» sin decirle a quien llamar no le sirve.
 */
export interface Explicacion {
  titulo: string;
  detalle: string;
  tono: 'exito' | 'informacion' | 'error';
  arreglaOtro: boolean;
}

export function explicarDocumento(estado: PrivacyDocumentState): Explicacion {
  switch (estado) {
    case 'publicado':
      return {
        titulo: 'Documento publicado',
        detalle:
          'Tus socios pueden leerlo y autorizar el tratamiento de sus datos de salud. ' +
          'El texto que acepten queda guardado tal cual, con tus datos de responsable dentro.',
        tono: 'exito',
        arreglaOtro: false,
      };

    case 'listo':
      return {
        titulo: 'Listo para publicar',
        detalle:
          'Tus datos están completos. El documento se publicará automáticamente en cuanto ' +
          'el primer socio abra su pantalla de privacidad; no tienes que hacer nada más.',
        tono: 'exito',
        arreglaOtro: false,
      };

    case 'falta_configuracion':
      return {
        titulo: 'Documento pendiente',
        detalle:
          'Falta completar los datos del responsable. Hasta entonces no se publica ningún ' +
          'documento y no se pueden registrar mediciones de tus socios.',
        tono: 'informacion',
        arreglaOtro: false,
      };

    case 'sin_version':
      return {
        titulo: 'Documento pendiente',
        detalle:
          'GYMLAB todavía no ha activado ninguna versión del texto de privacidad. ' +
          'No es algo que puedas resolver desde aquí.',
        tono: 'informacion',
        arreglaOtro: true,
      };

    case 'falta_plantilla':
      return {
        titulo: 'Documento no disponible',
        detalle:
          'La versión configurada no tiene texto asociado. Es un problema de configuración ' +
          'de la plataforma; ponte en contacto con GYMLAB.',
        tono: 'error',
        arreglaOtro: true,
      };

    case 'plantilla_en_borrador':
      return {
        titulo: 'Documento no disponible',
        detalle:
          'El texto activo es un borrador pendiente de revisión jurídica, y no puede usarse ' +
          'para recoger consentimientos. GYMLAB lo sustituirá por la versión definitiva.',
        tono: 'error',
        arreglaOtro: true,
      };
  }
}

/**
 * Los cambios que hay que enviar: solo lo que el dueno ha tocado.
 *
 * Un campo vaciado viaja como `null` —«borralo»— y uno sin cambios no viaja.
 * Mandarlo todo siempre haria que abrir y guardar sin tocar nada reescribiera
 * las cuatro columnas, y con ellas su `updated_at`, sin que nadie cambiara nada.
 */
export function cambiosDe(
  actual: Record<string, string>,
  original: Record<string, string | null>,
): Record<string, string | null> {
  const cambios: Record<string, string | null> = {};

  for (const [campo, valor] of Object.entries(actual)) {
    const limpio = valor.trim();
    const antes = original[campo] ?? '';
    if (limpio === antes) continue;
    cambios[campo] = limpio === '' ? null : limpio;
  }

  return cambios;
}
