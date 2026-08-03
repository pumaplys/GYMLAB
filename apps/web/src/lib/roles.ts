import type { Role } from '@gymlab/contracts';

/**
 * Como se llama cada rol en pantalla.
 *
 * Los identificadores del contrato estan en ingles porque son el contrato;
 * quien trabaja en el mostrador lee esto. `Record<Role, string>` obliga a que
 * un rol nuevo pase por aqui: si se anade uno al contrato, esto deja de
 * compilar en lugar de mostrar 'assistant' en la cabecera.
 */
export const NOMBRE_DEL_ROL: Record<Role, string> = {
  owner: 'Propietario',
  receptionist: 'Recepcion',
  trainer: 'Entrenador',
  member: 'Socio',
};

/**
 * Quien puede usar el panel de gestion.
 *
 * Entrenadores y socios tienen cuenta y sesion validas, pero ninguna seccion de
 * este panel: sus pantallas viven en el portal del socio. Aqui solo se usa para
 * no pintarles una tabla que la API va a rechazar — la autorizacion la impone
 * el servidor, sin excepcion.
 */
export const ROLES_DEL_PANEL = ['owner', 'receptionist'] as const satisfies readonly Role[];
