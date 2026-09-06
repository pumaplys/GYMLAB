import { Redirect, Stack } from 'expo-router';
import { useSesion } from '../../src/auth/sesion';
import { puedeEntrarEnArea } from '../../src/navegacion/destinos';
import { tema } from '../../src/tema';

/**
 * El area del PANEL: quien lleva el gimnasio. Dueña y recepcion.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL GATE ES EL MISMO QUE EL DEL SOCIO, CON OTRA AREA.                    │
 * │                                                                          │
 * │ Una sola condicion, en positivo, en el LAYOUT del grupo — no en cada     │
 * │ pantalla. Es lo que hace que un enlace directo a `rinda://panel` no      │
 * │ pueda saltarselo.                                                        │
 * │                                                                          │
 * │ Y esto NO sustituye al servidor: la API rechaza por rol cada endpoint    │
 * │ igualmente (`@Roles` en los controladores). Lo que evita este gate es    │
 * │ pintar pantallas que la API va a rechazar enteras.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `Stack` y no `Tabs`: todavia no hay destinos que repartir. Cuando los haya,
 * lo que cambia es este fichero, no el gate.
 */
export default function DisposicionDePanel() {
  const { estado } = useSesion();
  if (!puedeEntrarEnArea(estado, 'panel')) return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: tema.color.fondo },
      }}
    />
  );
}
