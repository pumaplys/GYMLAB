import type { CreateMemberInput, Member, UpdateMemberInput } from '@gymlab/contracts';

/**
 * Dar de alta y editar a un socio, sin React.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LOS CAMPOS OPCIONALES VACIOS NO VIAJAN. Y ESO IMPORTA AL EDITAR.        │
 * │                                                                          │
 * │ `createMemberSchema` declara correo, telefono y nacimiento opcionales:   │
 * │ mandar `''` no es «no hay dato», es una cadena vacia que el esquema       │
 * │ rechaza por formato. Se omiten.                                          │
 * │                                                                          │
 * │ Al EDITAR ademas hay una limitacion real del contrato, y esta escrita en │
 * │ el propio panel web: `updateMemberSchema` no admite `null`, asi que      │
 * │ TODAVIA NO SE PUEDE DEJAR EN BLANCO un campo que ya tenia valor. Vaciar  │
 * │ la casilla simplemente no manda ese campo, y el valor anterior se queda. │
 * │ Es una limitacion del servidor, no una decision del movil: se avisa en   │
 * │ pantalla igual que hace el panel, en vez de fingir que se ha borrado.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface DatosDeSocio {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthDate: string;
}

/** Lo que hay en la ficha, listo para editar. */
export function datosDesde(socio: Member): DatosDeSocio {
  return {
    firstName: socio.firstName,
    lastName: socio.lastName,
    email: socio.email ?? '',
    phone: socio.phone ?? '',
    birthDate: socio.birthDate ?? '',
  };
}

const soloConValor = (datos: DatosDeSocio) => ({
  ...(datos.email.trim() ? { email: datos.email.trim() } : {}),
  ...(datos.phone.trim() ? { phone: datos.phone.trim() } : {}),
  ...(datos.birthDate.trim() ? { birthDate: datos.birthDate.trim() } : {}),
});

export function altaAEnvio(datos: DatosDeSocio): CreateMemberInput {
  return {
    firstName: datos.firstName.trim(),
    lastName: datos.lastName.trim(),
    ...soloConValor(datos),
  } as CreateMemberInput;
}

export function edicionAEnvio(datos: DatosDeSocio): UpdateMemberInput {
  return {
    firstName: datos.firstName.trim(),
    lastName: datos.lastName.trim(),
    ...soloConValor(datos),
  } as UpdateMemberInput;
}

/**
 * Si al editar se ha vaciado una casilla que TENIA valor.
 *
 * No se puede cumplir —el contrato no acepta `null`— y callarlo seria peor:
 * quien lo intenta guarda, ve que sigue ahi y no entiende nada.
 */
export function seIntentoBorrarUnCampo(antes: Member, ahora: DatosDeSocio): boolean {
  const pares: [string | null, string][] = [
    [antes.email, ahora.email],
    [antes.phone, ahora.phone],
    [antes.birthDate, ahora.birthDate],
  ];
  return pares.some(([tenia, tiene]) => (tenia ?? '') !== '' && tiene.trim() === '');
}

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TRES COSAS DISTINTAS QUE LA GENTE LLAMA «DAR DE BAJA».                   │
 * │                                                                          │
 * │   baja del SOCIO      `POST /members/:id/deactivate` — deja de poder     │
 * │                       entrar; se conserva todo y se puede reactivar.      │
 * │   baja de la CUOTA    `DELETE /members/:id/subscription` — cancela la     │
 * │                       suscripcion; el socio sigue siendo socio.           │
 * │   ELIMINAR            `DELETE /members/:id` — borra a la persona y sus    │
 * │                       datos para siempre. Solo el dueño.                  │
 * │                                                                          │
 * │ El panel web tuvo que alargar una etiqueta a «Dar de baja la cuota»      │
 * │ porque en la misma pantalla habia dos botones iguales que hacian cosas   │
 * │ distintas. Aqui se nombran igual por el mismo motivo.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const ETIQUETA_BAJA_DE_SOCIO = 'Dar de baja al socio';
export const ETIQUETA_BAJA_DE_CUOTA = 'Dar de baja la cuota';
export const ETIQUETA_ELIMINAR = 'Eliminar para siempre';

/** Si esta de baja, lo primero que hay que saber. */
export function estaDeBaja(socio: Member): boolean {
  return socio.status !== 'active';
}

/**
 * Invitar solo se ofrece cuando puede funcionar.
 *
 * El servidor rechaza invitar a quien ya tiene cuenta, y a quien no tiene
 * correo no hay a donde mandarle nada. Es la misma condicion que pone el panel.
 */
export function sePuedeInvitar(socio: Member): boolean {
  return !socio.hasAccount && (socio.email ?? '').trim() !== '';
}

/** Por que no se puede invitar, para decirlo en vez de esconder el boton. */
export function porQueNoSePuedeInvitar(socio: Member): string | null {
  if (socio.hasAccount) return 'Ya tiene cuenta en RINDA.';
  if ((socio.email ?? '').trim() === '') return 'No tiene correo al que enviar la invitación.';
  return null;
}
