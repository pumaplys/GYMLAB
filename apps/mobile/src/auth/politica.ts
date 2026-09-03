import { clasificarError } from './clasificar';

/**
 * ¿Alguno de estos fallos dice que la sesion ya no vale?
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EXISTE PARA LAS PANTALLAS QUE PIDEN VARIAS COSAS A LA VEZ.              │
 * │                                                                          │
 * │ Inicio lanza cuatro peticiones con `allSettled` y trata cada fallo por    │
 * │ separado, que es lo correcto: que el progreso de un 500 no tiene por que  │
 * │ borrar el saludo. Pero un 401 NO es un fallo de seccion. Es la sesion     │
 * │ entera diciendo que se acabo, y da igual cual de las cuatro peticiones lo │
 * │ traiga.                                                                   │
 * │                                                                          │
 * │ Esta funcion NO decide nada nuevo: pregunta a `clasificarError`, que es   │
 * │ la unica que sabe distinguir un 401 de un 403, de un 429 o de un fallo    │
 * │ de red. Aqui solo se recorre la lista.                                    │
 * │                                                                          │
 * │ Y NO borra el token. Quien lo borra es `revisar()` en el proveedor de     │
 * │ sesion, que vuelve a preguntar a `/auth/me` y deja que responda el        │
 * │ servidor. Una pantalla que borrase el token por su cuenta seria una       │
 * │ segunda politica de autenticacion, y dos politicas se desincronizan.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Acepta los motivos tal cual salen de `Promise.allSettled`, incluidos los
 * huecos de las promesas que si funcionaron.
 */
export function laSesionYaNoVale(problemas: readonly unknown[]): boolean {
  return problemas.some(
    (problema) =>
      problema !== undefined && clasificarError(problema).clase === 'sesionInvalida',
  );
}

/** Los motivos de las que fallaron, en el orden en que se pidieron. */
export function motivosDeFallo(
  resultados: readonly PromiseSettledResult<unknown>[],
): readonly unknown[] {
  return resultados.flatMap((r) => (r.status === 'rejected' ? [r.reason] : []));
}
