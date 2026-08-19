import { Global, Module } from '@nestjs/common';
import { ACCESS_REVOKED_HOOK, type AccessRevokedHooks } from './common/access-revoked-hooks';
import { TrainerAccessRevoked } from './trainers/trainer-access-revoked';

/**
 * Conecta «retirar acceso» con quien tiene que reaccionar.
 *
 * VIVE EN LA RAIZ por el mismo motivo que `MemberErasedHooksModule`: es el
 * unico sitio que conoce a todos los modulos sin que ninguno conozca a los
 * demas. `auth` anuncia la revocacion sin saber quien escucha, y `trainers`
 * cierra el perfil sin que `auth` toque una tabla ajena.
 *
 *   auth                  -> common                (la interfaz, sin dependencias)
 *   access-revoked-hooks  -> trainers              (registra la implementacion)
 *
 * `@Global()` para que `AuthService` resuelva el token sin importar este
 * modulo, que es por donde volveria a aparecer el ciclo.
 *
 * `TrainerAccessRevoked` se declara aqui como proveedor —y no se importa de
 * `TrainersModule`— a proposito: es una clase dedicada y sin dependencias, y
 * arrastrar ese modulo entero al grafo de `AuthService` es justo lo que deja a
 * Nest colgado en el arranque sin ningun error (ADR-0010).
 */
@Global()
@Module({
  providers: [
    TrainerAccessRevoked,
    {
      provide: ACCESS_REVOKED_HOOK,
      useFactory: (...hooks: AccessRevokedHooks) => hooks,
      inject: [TrainerAccessRevoked],
    },
  ],
  exports: [ACCESS_REVOKED_HOOK],
})
export class AccessRevokedHooksModule {}
