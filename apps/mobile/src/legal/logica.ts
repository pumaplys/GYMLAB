import type { LegalData, LegalRequiredField, PrivacyDocumentState } from '@gymlab/contracts';

/**
 * Los datos del responsable del tratamiento, en pantalla.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL MOVIL NO DECIDE QUE ES OBLIGATORIO. SOLO LO TRADUCE.                 │
 * │                                                                          │
 * │ La lista de lo que falta viene del servidor —`missing`—, que es quien    │
 * │ impide publicar sin ello. Repetir aqui esa regla crearia dos fuentes de  │
 * │ verdad y, el dia que cambie una, una pantalla que dice «completa» sobre  │
 * │ una configuracion que el servidor rechaza.                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Mismos nombres y mismas explicaciones que `apps/web/src/app/configuracion`:
 * quien rellena esto en el panel y luego lo mira en el movil tiene que leer la
 * misma palabra. No se importa de alli —son aplicaciones distintas— y por eso
 * queda escrito aqui que son dos copias de la misma lista.
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

/** Los cuatro campos del formulario, con lo que hace falta para pintarlos. */
export const CAMPOS = [
  {
    clave: 'legalName' as const,
    etiqueta: 'Razón social',
    ayuda: 'La denominación con la que existe la sociedad, no el nombre comercial.',
    teclado: 'default' as const,
  },
  {
    clave: 'taxId' as const,
    etiqueta: 'Identificador fiscal',
    ayuda: 'NIF o CIF de la sociedad.',
    teclado: 'default' as const,
  },
  {
    clave: 'address' as const,
    etiqueta: 'Domicilio',
    ayuda: 'Dirección postal del responsable.',
    teclado: 'default' as const,
  },
  {
    clave: 'privacyEmail' as const,
    etiqueta: 'Email de privacidad',
    ayuda: 'Donde los socios ejercen sus derechos. Puede ser distinto del de recepción.',
    teclado: 'email-address' as const,
  },
];

export type CampoLegal = (typeof CAMPOS)[number]['clave'];

/** Lo que hay escrito en el formulario. Todo texto: son `TextInput`. */
export type Borrador = Record<CampoLegal, string>;

export function desdeDatos(datos: LegalData): Borrador {
  return {
    legalName: datos.legalName ?? '',
    taxId: datos.taxId ?? '',
    address: datos.address ?? '',
    privacyEmail: datos.privacyEmail ?? '',
  };
}

/**
 * Los cambios que hay que enviar: solo lo que el dueño ha tocado.
 *
 * Un campo vaciado viaja como `null` —«bórralo»— y uno sin cambios no viaja.
 * Mandarlo todo siempre haria que abrir y guardar sin tocar nada reescribiera
 * las cuatro columnas, y con ellas su `updated_at`, sin que nadie cambiara nada.
 */
export function cambiosDe(
  actual: Borrador,
  original: Borrador,
): Partial<Record<CampoLegal, string | null>> {
  const cambios: Partial<Record<CampoLegal, string | null>> = {};

  for (const { clave } of CAMPOS) {
    const limpio = actual[clave].trim();
    if (limpio === original[clave].trim()) continue;
    cambios[clave] = limpio === '' ? null : limpio;
  }

  return cambios;
}

export function hayCambios(actual: Borrador, original: Borrador): boolean {
  return Object.keys(cambiosDe(actual, original)).length > 0;
}

/**
 * Qué se le cuenta al dueño sobre su documento de privacidad.
 *
 * Deliberadamente factual. Nada de «cumple RGPD» ni «legalmente válido»: esto
 * mide si hay un texto publicado y, si no, por qué — no si ese texto ampara
 * juridicamente nada, que no lo decide un programa.
 *
 * `arreglaOtro` distingue lo que puede resolver el dueño de lo que depende de
 * la plataforma. Decirle «pendiente» sin decirle a quién llamar no le sirve.
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
          'RINDA todavía no ha activado ninguna versión del texto de privacidad. ' +
          'No es algo que puedas resolver desde aquí.',
        tono: 'informacion',
        arreglaOtro: true,
      };

    case 'falta_plantilla':
      return {
        titulo: 'Documento no disponible',
        detalle:
          'La versión configurada no tiene texto asociado. Es un problema de configuración ' +
          'de la plataforma; ponte en contacto con RINDA.',
        tono: 'error',
        arreglaOtro: true,
      };

    case 'plantilla_en_borrador':
      return {
        titulo: 'Documento no disponible',
        detalle:
          'El texto activo es un borrador pendiente de revisión jurídica, y no puede usarse ' +
          'para recoger consentimientos. RINDA lo sustituirá por la versión definitiva.',
        tono: 'error',
        arreglaOtro: true,
      };
  }
}
