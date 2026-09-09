import { recordBodyMetricSchema, type HealthConsentStatus } from '@gymlab/contracts';
import { MEDIDAS, type CampoDeMedida } from './logica';

/**
 * Registrar una medición: la parte que se puede probar sin pantalla.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SON DATOS DE SALUD (RGPD art. 9), Y ESO ORDENA TODO LO DE AQUI.         │
 * │                                                                          │
 * │ El servidor rechaza TODA ESCRITURA sin consentimiento vigente, y la      │
 * │ comprobacion vive en su SERVICIO —no en un guard— para que se cumpla     │
 * │ venga de donde venga la llamada.                                         │
 * │                                                                          │
 * │ LEER NO LO EXIGE, y es deliberado: si alguien revoca, el gimnasio debe   │
 * │ poder seguir consultando lo que ya recogio legitimamente para atender    │
 * │ una peticion de acceso o de borrado. Por eso el historial se enseña      │
 * │ siempre y lo que desaparece es el FORMULARIO.                            │
 * │                                                                          │
 * │ Y NADA DE ESTO LO DECIDE LA PANTALLA: esconder el formulario es cortesia │
 * │ con quien lo usa, no la barrera. La barrera es el 403 del servidor.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Mismas reglas que `apps/web/src/app/entrenador/socio/progreso-logica.ts`.
 */

/**
 * En cuál de los tres estados está el consentimiento de este socio.
 *
 * Se distinguen porque piden cosas distintas a personas distintas: `sin-texto`
 * lo resuelve quien gestiona el gimnasio —rellenando sus datos legales— y
 * `sin-aceptar` lo resuelve el socio autorizando. Meterlos en un solo «no se
 * puede» mandaria al entrenador a buscar al socio para algo que el socio no
 * puede arreglar.
 */
export type EstadoDeConsentimiento = 'sin-texto' | 'sin-aceptar' | 'vigente';

export function estadoDelConsentimiento(
  consentimiento: HealthConsentStatus,
): EstadoDeConsentimiento {
  if (consentimiento.currentVersion === null) return 'sin-texto';
  return consentimiento.accepted ? 'vigente' : 'sin-aceptar';
}

/** Solo con consentimiento vigente tiene sentido ofrecer el formulario. */
export function sePuedeRegistrar(consentimiento: HealthConsentStatus | null): boolean {
  return consentimiento !== null && estadoDelConsentimiento(consentimiento) === 'vigente';
}

/** Lo que hay escrito en el formulario. Todo texto: son `TextInput`. */
export interface Borrador {
  fecha: string;
  notas: string;
  medidas: Record<CampoDeMedida, string>;
}

export function borradorVacio(): Borrador {
  return {
    fecha: '',
    notas: '',
    medidas: Object.fromEntries(MEDIDAS.map((m) => [m.campo, ''])) as Record<CampoDeMedida, string>,
  };
}

/**
 * Convierte lo tecleado en número, aceptando la coma decimal.
 *
 * En España se escribe 72,4. `Number('72,4')` es `NaN`, asi que sin esto el
 * formulario rechazaria el peso escrito de la forma natural — y el `numeric` de
 * la base guarda decimales exactos justamente para no perderlos.
 *
 * Devuelve `undefined` si esta vacio —el contrato trata las medidas como
 * opcionales— y `NaN` si no es un numero, para que la validacion lo señale en
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
 * La fecha viaja como ISO completo porque el contrato pide `datetime()`, y en
 * pantalla se escribe solo el dia. Se le pone el MEDIODIA y no medianoche: a
 * las 00:00 locales, un huso por delante de UTC convierte la fecha en el dia
 * anterior, y una medicion de hoy apareceria fechada ayer.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ Y AQUI NO VALE COPIAR LA WEB TAL CUAL.                                   │
 * │                                                                          │
 * │ Alli la fecha sale de un `<input type="date">`, que nunca entrega basura.│
 * │ En el movil es un campo de texto —es la convencion del resto de          │
 * │ formularios— asi que alguien puede escribir «ayer». `new Date('ayer')`   │
 * │ es Invalid Date y `.toISOString()` LANZA: el formulario se caeria entero │
 * │ en vez de señalar el campo. Por eso se comprueba antes.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function aEnvio(borrador: Borrador): Record<string, unknown> {
  const medidas: Record<string, number> = {};
  for (const { campo } of MEDIDAS) {
    const valor = aNumero(borrador.medidas[campo]);
    if (valor !== undefined) medidas[campo] = valor;
  }

  const fecha = borrador.fecha.trim();
  const conFecha = fecha !== '' && fechaValida(fecha);

  return {
    ...medidas,
    ...(conFecha ? { measuredAt: new Date(`${fecha}T12:00:00`).toISOString() } : {}),
    ...(borrador.notas.trim() ? { notes: borrador.notas.trim() } : {}),
  };
}

export type CampoConError = CampoDeMedida | 'fecha' | 'notas' | 'general';

/**
 * Traduce la ruta del esquema a algo que se pueda leer al lado del campo.
 *
 * Valida con `recordBodyMetricSchema`, el MISMO contrato que aplica el
 * servidor. No se reescriben aqui los rangos: hacerlo seria una segunda fuente
 * de verdad sobre cuanto puede pesar una persona.
 */
export function erroresDe(borrador: Borrador): Partial<Record<CampoConError, string>> {
  const errores: Partial<Record<CampoConError, string>> = {};

  /*
   * La fecha mal escrita se señala aqui y no en el esquema, porque `aEnvio` ya
   * la ha dejado fuera del envio: sin esto, escribir «ayer» se guardaria en
   * silencio con la fecha de hoy, que es peor que un error.
   */
  if (!fechaValida(borrador.fecha)) {
    errores.fecha = 'Escribe la fecha como 2026-09-08.';
  }

  const resultado = recordBodyMetricSchema.safeParse(aEnvio(borrador));
  if (resultado.success) return errores;

  for (const problema of resultado.error.issues) {
    const campo = problema.path[0];

    if (campo === undefined) {
      // El `refine` de «al menos una medida» no apunta a ningun campo.
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
      errores[medida.campo] = Number.isNaN(aNumero(borrador.medidas[medida.campo]))
        ? 'Escribe un número.'
        : `${medida.etiqueta} fuera de rango.`;
    }
  }
  return errores;
}

/** Una fecha `YYYY-MM-DD` bien escrita, o `null`. Lo demas lo dice el esquema. */
export function fechaValida(texto: string): boolean {
  if (texto.trim() === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto.trim())) return false;
  return !Number.isNaN(new Date(`${texto.trim()}T12:00:00`).getTime());
}
