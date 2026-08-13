import { Global, Module } from '@nestjs/common';
import { IdentityErasure } from './auth/identity-erasure';
import { MEMBER_ERASED_HOOK, type MemberErasedHooks } from './common/member-erased-hooks';

/**
 * Conecta el borrado de una ficha con quien tiene que reaccionar.
 *
 * VIVE EN LA RAIZ por el mismo motivo que `InvitationHooksModule`: es el unico
 * sitio que conoce a todos los modulos sin que ninguno conozca a los demas.
 * `MembersService` anuncia el borrado sin saber quien escucha, e `identity`
 * retira la pertenencia sin que `members` toque una tabla ajena.
 *
 *   members            -> common               (la interfaz, sin dependencias)
 *   member-erased-hooks -> auth                (registra la implementacion)
 *
 * `@Global()` para que `MembersService` resuelva el token sin importar este
 * modulo, que es por donde volveria a aparecer el ciclo.
 *
 * `IdentityErasure` se declara aqui como proveedor —y no se importa de
 * `AuthModule`— a proposito: es una clase dedicada y sin dependencias, y
 * arrastrar `AuthModule` entero al grafo de `MembersService` es justo lo que
 * dejo a Nest colgado en el arranque la primera vez (ADR-0010).
 */
@Global()
@Module({
  providers: [
    IdentityErasure,
    {
      provide: MEMBER_ERASED_HOOK,
      // Una lista y no un implementador unico, igual que en invitaciones: hoy
      // solo reacciona `identity`, pero el dia que otro modulo guarde algo
      // fuera del alcance de las claves ajenas se registra aqui sin tocar nada.
      useFactory: (...hooks: MemberErasedHooks) => hooks,
      inject: [IdentityErasure],
    },
  ],
  exports: [MEMBER_ERASED_HOOK],
})
export class MemberErasedHooksModule {}
