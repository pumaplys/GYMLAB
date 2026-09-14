import { Redirect, Stack } from 'expo-router';
import { useSesion } from '../../src/auth/sesion';
import { tema } from '../../src/tema';

/**
 * El gate de «Mi cuenta».
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AQUI SE COMPRUEBA LA SESION, NO EL AREA. ES EL UNICO SITIO ASI.         │
 * │                                                                          │
 * │ Todas las demas pilas usan `puedeEntrarEnArea`, porque todas pertenecen  │
 * │ a un area: `/perfil/` es del socio, `/(panel)/` del mostrador. Pero la   │
 * │ cuenta la tienen los CUATRO roles, y borrarla es un derecho de la        │
 * │ persona, no una capacidad de su puesto. Gatear por area dejaria al       │
 * │ entrenador o a recepcion sin poder ejercerlo — y Apple y Google lo       │
 * │ exigen para cualquiera que pueda crear cuenta.                            │
 * │                                                                          │
 * │ Sigue siendo un gate de verdad: sin sesion se va a la puerta, y un       │
 * │ enlace directo a `/cuenta/eliminar` no se lo salta.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function DisposicionDeCuenta() {
  const { estado } = useSesion();
  if (estado.tipo !== 'autenticado') return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: tema.color.fondo },
        animation: 'fade',
      }}
    />
  );
}
