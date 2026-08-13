/**
 * El arranque falla si un punto de extension se queda sin implementadores.
 *
 * Son los dos casos en los que el sistema seguiria respondiendo 200 mientras
 * hace menos de lo debido: aceptar invitaciones sin vincular nada, y entregar una
 * exportacion del art. 15 incompleta. Los dos en silencio.
 *
 * Tests unitarios y no funcionales a proposito: lo que se comprueba es la guarda,
 * no el flujo. Levantar la aplicacion entera para esto solo la haria mas lenta.
 */
import { describe, expect, it } from 'vitest';
import type {
  InvitationAcceptedEvent,
  InvitationAcceptedHooks,
} from '../common/invitation-hooks';
import type { MemberErasedHooks } from '../common/member-erased-hooks';
import type { PersonalDataContributors } from '../common/personal-data';
import { InvitationsService } from '../invitations/invitations.service';
import { MembersService } from '../members/members.service';

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

const crearMembers = (
  contribuidores: PersonalDataContributors,
  hooks: MemberErasedHooks = [hookDeBorradoInerte],
) => new MembersService(undefined as never, contribuidores, hooks);

const contribuidorInerte = {
  seccion: 'nada',
  aportarDatos: async () => ({}),
};

const hookDeBorradoInerte = { onMemberErased: async () => {} };

describe('guarda de arranque de MembersService (ADR-0011)', () => {
  it('sin ningun contribuidor registrado, muere en el arranque', () => {
    // El modo de fallo que evita: la exportacion del art. 15 responderia 200 con
    // solo la ficha, omitiendo cuotas y pagos ante una solicitud legal.
    expect(() => crearMembers([]).onModuleInit()).toThrow(/PersonalDataContributor/);
  });

  it('con contribuidores registrados, arranca', () => {
    expect(() => crearMembers([contribuidorInerte]).onModuleInit()).not.toThrow();
  });

  it('sin ningun hook de borrado, muere en el arranque', () => {
    // El modo de fallo que evita: borrar una ficha responderia 200 dejando a esa
    // persona perteneciendo a un gimnasio del que ya no tiene ficha, y viendolo
    // en su selector con un 404 en todo lo que abriera.
    expect(() => crearMembers([contribuidorInerte], []).onModuleInit()).toThrow(
      /MemberErasedHook/,
    );
  });
});
