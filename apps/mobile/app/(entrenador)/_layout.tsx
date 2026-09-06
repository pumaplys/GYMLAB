import { Redirect, Stack } from 'expo-router';
import { useSesion } from '../../src/auth/sesion';
import { puedeEntrarEnArea } from '../../src/navegacion/destinos';
import { tema } from '../../src/tema';

/**
 * El area del ENTRENADOR.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SEPARADA DEL PANEL A PROPOSITO.                                         │
 * │                                                                          │
 * │ No es una version reducida del panel: son permisos distintos. El         │
 * │ entrenador no aparece en NINGUNA ruta del personal de la API —ni socios, │
 * │ ni cobros, ni el escaner de la puerta— y en cambio es el unico con       │
 * │ `/me/trainer/members`. Meterlos en la misma area obligaria a esconder    │
 * │ media pantalla con condicionales, que es justo como se acaba enseñando   │
 * │ un boton que la API va a rechazar.                                       │
 * │                                                                          │
 * │ Es el mismo reparto que ya hace el panel web en `lib/areas.ts`.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function DisposicionDeEntrenador() {
  const { estado } = useSesion();
  if (!puedeEntrarEnArea(estado, 'entrenador')) return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: tema.color.fondo },
      }}
    />
  );
}
