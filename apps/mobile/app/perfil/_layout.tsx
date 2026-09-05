import { Redirect, Stack } from 'expo-router';
import { useSesion } from '../../src/auth/sesion';
import { puedeEntrarEnTabs } from '../../src/navegacion/destinos';
import { tema } from '../../src/tema';

/**
 * El gate de las secciones de Perfil.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ FALTABA, Y SE VIO PROBANDOLO.                                            │
 * │                                                                          │
 * │ `app/perfil/` no tenia layout, asi que un enlace directo a               │
 * │ /perfil/pagos montaba la pantalla SIN pasar por ningun control. Medido    │
 * │ con los cinco estados de sesion: `sinSesion`, `requiereSeleccionGimnasio`,│
 * │ `rolNoAdmitido`, `errorAlComprobar` y `cargando` entraban las tres.      │
 * │                                                                          │
 * │ No se filtraban datos —el servidor responde 401 sin credencial— pero se   │
 * │ pintaba una pantalla del socio a quien no lo es, y quien no tenia sesion  │
 * │ se quedaba mirando un error en vez de ir al login. La seguridad de la     │
 * │ navegacion no puede descansar en que el endpoint acabe negandose.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTO NO ES UN SEGUNDO GATE, ES EL MISMO.                                 │
 * │                                                                          │
 * │ Palabra por palabra lo que hace `(tabs)/_layout.tsx`: se comprueba UNA    │
 * │ cosa —¿esta autenticado?— y si no, se devuelve a la puerta para que       │
 * │ decida ella. No se mira el rol, ni las membresias, ni si hay gimnasio     │
 * │ activo: eso ya lo resuelve `resolverAcceso`, y repetirlo aqui seria       │
 * │ tener dos politicas que se pueden desincronizar.                        │
 * │                                                                          │
 * │ Y va en el LAYOUT, una vez, no en cada una de las tres pantallas.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Sigue siendo una pila secundaria: NO monta las pestañas debajo y no crea
 * una sexta. Las tres se apilan sobre Perfil como hasta ahora.
 */
export default function DisposicionDePerfil() {
  const { estado } = useSesion();
  if (!puedeEntrarEnTabs(estado)) return <Redirect href="/" />;

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
