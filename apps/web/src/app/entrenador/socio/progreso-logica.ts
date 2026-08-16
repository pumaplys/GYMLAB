import { recordBodyMetricSchema, type HealthConsentStatus } from '@gymlab/contracts';
import { MEDIDAS, type CampoDeMedida } from '@/lib/medidas';

/**
 * La logica de la seccion de progreso, sin React.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SON DATOS DE SALUD (RGPD art. 9), Y ESO ORDENA TODO LO DE AQUI.          │
 * │                                                                          │
 * │ El servidor rechaza TODA ESCRITURA sin consentimiento vigente, y la      │
 * │ comprobacion vive en su servicio —no en un guard— para que se cumpla     │
 * │ venga de donde venga la llamada.                                         │
 * │                                                                          │
 * │ LEER NO LO EXIGE, y es deliberado: si alguien revoca, el gimnasio debe   │
 * │ poder seguir consultando lo que ya recogio legitimamente para atender    │
 * │ una peticion de acceso o de borrado. Por eso el historial se pinta       │
 * │ siempre y lo que desaparece es el formulario.                            │
 * │                                                                          │
 * │ Y NADA DE ESTO LO DECIDE LA PANTALLA: esconder el formulario es cortesia │
 * │ con quien lo usa, no la barrera. La barrera es el 403 del servidor.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * En cual de los tres estados esta el consentimiento de este socio.
 *
 * Se distinguen porque piden cosas distintas a personas distintas: `sin-texto`
 * lo resuelve quien gestiona el gimnasio redactando la politica, y `sin-aceptar`
 * lo resuelve el socio autorizando. Meterlos en un solo "no se puede" mandaria
 * al entrenador a buscar al socio para algo que el socio no puede arreglar.
 */
export type EstadoDeConsentimiento = 'sin-texto' | 'sin-aceptar' | 'vigente';

export function estadoDe(consentimiento: HealthConsentStatus): EstadoDeConsentimiento {
  if (consentimiento.currentVersion === null) return 'sin-texto';
  return consentimiento.accepted ? 'vigente' : 'sin-aceptar';
}

/*
 * La lista de medidas vive en `lib`: la comparten esta pantalla —donde se
 * escriben— y la del socio, donde se leen. Se reexporta para no tocar a quien
 * ya la importaba de aqui.
 */
export { MEDIDAS, type CampoDeMedida } from '@/lib/medidas';

/** Lo que hay escrito en el formulario. Todo texto: son `<input>`, no numeros aun. */
export interface Borrador {
  fecha: string;
  notas: string;
  medidas: Record<CampoDeMedida, string>;
}

export function borradorVacio(): Borrador {
  return {
    fecha: '',
    notas: '',
    medidas: Object.fromEntries(MEDIDAS.map((m) => [m.campo, ''])) as Record<
      CampoDeMedida,
      string
    >,
  };
}

/**
 * Convierte lo tecleado en numero, aceptando la coma decimal.
 *
 * En Espana se escribe 72,4. `Number('72,4')` es `NaN`, asi que sin esto el
 * formulario rechazaria el peso escrito de la forma natural — y el `numeric` de
 * la base guarda decimales exactos justamente para no perderlos.
 *
 * Devuelve `undefined` si esta vacio —el contrato trata las medidas como
 * opcionales— y `NaN` si no es un numero, para que la validacion lo senale en
 * lugar de mandarlo como si nada.
 */
export function aNumero(texto: string): number | undefined {
  const limpio = texto.trim().replace(',', '.');
  if (limpio === '') return undefined;
  return Number(limpio);
}

/**
 * Monta lo que se manda al servidor.
 *
 * La fecha viaja como ISO completo porque el contrato pide `datetime()`, y un
 * `<input type="date">` da solo el dia. Se le pone el mediodia y no medianoche:
 * a las 00:00 locales, un huso por delante de UTC convierte la fecha en el dia
 * anterior, y una medicion de hoy apareceria fechada ayer.
 */
export function aEnvio(borrador: Borrador): Record<string, unknown> {
  const medidas: Record<string, number> = {};
  for (const { campo } of MEDIDAS) {
    const valor = aNumero(borrador.medidas[campo]);
    if (valor !== undefined) medidas[campo] = valor;
  }

  return {
    ...medidas,
    ...(borrador.fecha ? { measuredAt: new Date(`${borrador.fecha}T12:00:00`).toISOString() } : {}),
    ...(borrador.notas.trim() ? { notes: borrador.notas.trim() } : {}),
  };
}

/** Traduce la ruta del esquema a algo que se pueda leer al lado del campo. */
export function erroresDe(borrador: Borrador): Partial<Record<CampoDeMedida | 'fecha' | 'notas' | 'general', string>> {
  const resultado = recordBodyMetricSchema.safeParse(aEnvio(borrador));
  if (resultado.success) return {};

  const errores: Record<string, string> = {};
  for (const problema of resultado.error.issues) {
    const campo = problema.path[0];

    if (campo === undefined) {
      // El `refine` de "al menos una medida" no apunta a ningun campo.
      errores.general = 'Hay que registrar al menos una medida.';
      continue;
    }
    if (campo === 'measuredAt') {
      errores.fecha = 'La fecha no puede estar en el futuro.';
      continue;
    }
    if (campo === 'notes') {
      errores.notas = 'Las notas no pueden pasar de 500 caracteres.';
      continue;
    }

    const medida = MEDIDAS.find((m) => m.campo === campo);
    if (medida) {
      errores[String(campo)] = Number.isNaN(aNumero(borrador.medidas[medida.campo]))
        ? 'Escribe un numero.'
        : `${medida.etiqueta} fuera de rango.`;
    }
  }
  return errores;
}
