/**
 * El arranque falla si nadie reacciona a las invitaciones.
 *
 * Test unitario y no funcional a proposito: lo que se comprueba es la guarda,
 * no el flujo. Levantar la aplicacion entera para esto solo la haria mas lenta.
 */
import { describe, expect, it } from 'vitest';
import type {
  InvitationAcceptedEvent,
  InvitationAcceptedHooks,
} from '../common/invitation-hooks';
import { InvitationsService } from '../invitations/invitations.service';

/**
 * El constructor no ejecuta nada, asi que las dependencias no hacen falta para
 * probar `onModuleInit`. Se pasan como `never`, que es asignable a cualquier
 * cosa, en lugar de fabricar dobles que no se van a usar.
 */
const crear = (hooks: InvitationAcceptedHooks) =>
  new InvitationsService(undefined as never, undefined as never, undefined as never, hooks);

const hookInerte = {
  onInvitationAccepted: async (_evento: InvitationAcceptedEvent) => {},
};

describe('guarda de arranque de InvitationsService', () => {
  it('sin ningun hook registrado, muere en el arranque', () => {
    // El modo de fallo que evita: las invitaciones se aceptarian sin vincular
    // la ficha del socio ni crear el perfil del entrenador, EN SILENCIO. Nadie
    // se entera hasta que alguien busca su ficha semanas despues.
    expect(() => crear([]).onModuleInit()).toThrow(/InvitationAcceptedHook/);
  });

  it('con implementadores registrados, arranca', () => {
    expect(() => crear([hookInerte]).onModuleInit()).not.toThrow();
    expect(() => crear([hookInerte, hookInerte]).onModuleInit()).not.toThrow();
  });
});
