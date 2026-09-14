/**
 * La palabra que hay que escribir para confirmar el borrado.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN BOTON NO BASTA, Y UN «¿ESTAS SEGURO?» TAMPOCO.                       │
 * │                                                                          │
 * │ El borrado es inmediato e irreversible. Un dialogo de confirmacion se    │
 * │ acepta por reflejo —es el mismo gesto que cerrar cualquier otro aviso—,  │
 * │ mientras que escribir una palabra obliga a leer y a decidir.             │
 * │                                                                          │
 * │ En castellano y en mayusculas porque es lo que se le pide literalmente,  │
 * │ y la comparacion no distingue mayusculas ni espacios sobrantes: el       │
 * │ objetivo es que la persona se pare a pensar, no que pelee con el         │
 * │ teclado del telefono.                                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const CONFIRMACION = 'ELIMINAR';

export function seConfirmo(escrito: string): boolean {
  return escrito.trim().toUpperCase() === CONFIRMACION;
}
