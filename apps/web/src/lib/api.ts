import { createApiClient } from '@gymlab/api-client';

/**
 * De donde cuelga la API.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EN PRODUCCION ES UNA RUTA RELATIVA, Y NO ES UNA COMODIDAD.               │
 * │                                                                          │
 * │ El panel y la API se sirven bajo el mismo origen porque el modelo de     │
 * │ sesion se apoya en una cookie de primera parte. Con origenes separados,  │
 * │ Safari la bloquea. Por eso el valor por defecto es `/v1`: si alguien     │
 * │ despliega sin configurar nada, el panel llama al sitio correcto.         │
 * │                                                                          │
 * │ Un dominio absoluto por defecto seria lo contrario — funcionaria en el    │
 * │ entorno de quien lo escribio y fallaria callado en los demas.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * En desarrollo si son dos origenes (3000 y 3001), asi que ahi se apunta al
 * 3001 sin necesidad de configurar nada. `NEXT_PUBLIC_API_URL` queda para el
 * caso raro: una preview donde la API viva en otro sitio.
 *
 * Se incrusta al construir. La exportacion estatica no lee variables en
 * ejecucion, asi que cambiarla exige volver a construir.
 */
const origen =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : '');

/**
 * El cliente de la API. Uno solo para toda la aplicacion.
 *
 * No guarda nada: la sesion vive en una cookie `httpOnly` que este codigo no
 * puede leer, asi que compartir la instancia no comparte estado. Es una tabla
 * de funciones, no un objeto con memoria.
 */
export const api = createApiClient({ baseUrl: `${origen}/v1` });
