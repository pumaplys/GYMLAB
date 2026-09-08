import { Redirect, Stack } from 'expo-router';
import { useSesion } from '../../src/auth/sesion';
import { puedeEntrarEnEntrenamiento } from '../../src/navegacion/destinos';
import { tema } from '../../src/tema';

/**
 * Ejercicios y rutinas: lo que comparten el DUEÑO y el ENTRENADOR.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL PRIMER GRUPO QUE NO ES UN AREA. Y TENIA QUE SERLO.                   │
 * │                                                                          │
 * │ Los otros tres grupos son las tres experiencias de la app y cada uno se  │
 * │ corresponde con un area. Este no: entrenamiento lo comparten dos roles   │
 * │ que viven en AREAS DISTINTAS —el dueño en `panel`, el entrenador en      │
 * │ `entrenador`— y ademas hay que dejar fuera a RECEPCION, que vive en la   │
 * │ misma area que el dueño.                                                 │
 * │                                                                          │
 * │ Por eso el gate mira el ROL y no el area. Es el mismo reparto que hace   │
 * │ la API: `@Roles('owner', 'trainer')` en las cuatro clases del modulo de  │
 * │ entrenamiento.                                                           │
 * │                                                                          │
 * │ Y sigue siendo un layout de grupo: un enlace directo a `/rutinas` pasa   │
 * │ por aqui igual que si se hubiera pulsado desde dentro.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function DisposicionDeEntrenamiento() {
  const { estado } = useSesion();
  if (!puedeEntrarEnEntrenamiento(estado)) return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: tema.color.fondo },
      }}
    />
  );
}
