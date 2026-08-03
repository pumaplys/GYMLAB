import { Global, Module } from '@nestjs/common';
import { GYM_CREATED_HOOK, type GymCreatedHooks } from './common/gym-hooks';
import { GymExerciseSeeder } from './training/gym-exercise-seeder';
import { TrainingModule } from './training/training.module';

/**
 * Quien reacciona al alta de un gimnasio.
 *
 * Tercer punto de extension del proyecto, con el mismo patron que los de
 * invitaciones (ADR-0010) y exportacion RGPD (ADR-0011): la interfaz en
 * `common`, implementadores dedicados y sin dependencias, y el cableado aqui, en
 * la raiz, que es el unico sitio que conoce a todos.
 *
 * ESTE EXISTE PARA QUITAR UNA FLECHA DEL GRAFO. Antes `AuthModule` importaba
 * `TrainingModule` para sembrar la biblioteca, de modo que el modulo mas global
 * del sistema dependia de uno de dominio y quedaba un ciclo latente
 * `auth -> training -> members -> invitations -> (token de auth)`. No estaba
 * cerrado porque nadie inyecta `AuthService`, pero era cuestion de tiempo.
 *
 * CUANDO OTRO MODULO NECESITE REACCIONAR al alta —crear ajustes por defecto,
 * precargar algo— se anade aqui, no en `auth`.
 */
@Global()
@Module({
  imports: [TrainingModule],
  providers: [
    {
      provide: GYM_CREATED_HOOK,
      useFactory: (...hooks: GymCreatedHooks) => hooks,
      inject: [GymExerciseSeeder],
    },
  ],
  exports: [GYM_CREATED_HOOK],
})
export class GymHooksModule {}
