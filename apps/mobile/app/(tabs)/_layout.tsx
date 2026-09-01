
import { Redirect, Tabs } from 'expo-router';
import { BarraDePestanas } from '../../src/componentes/barra-de-pestanas';
import { useSesion } from '../../src/auth/sesion';
import { DESTINOS_DE_TABS, puedeEntrarEnTabs } from '../../src/navegacion/destinos';
import { tema } from '../../src/tema';

/**
 * La app del socio: cinco destinos y nada mas.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTO NO ES UN SEGUNDO GATE.                                             │
 * │                                                                          │
 * │ Quien decide a donde va cada estado de sesion sigue siendo `app/index`.  │
 * │ Aqui solo se comprueba UNA cosa —¿esta autenticado?— y, si no, se        │
 * │ devuelve a la puerta para que decida ella. No se mira el rol, ni las      │
 * │ membresias, ni si hay gimnasio activo: eso ya lo resuelve `resolverAcceso`│
 * │ y repetirlo aqui seria tener dos politicas que se pueden desincronizar.  │
 * │                                                                          │
 * │ Y va en el LAYOUT del grupo, no en cada pantalla: es lo que hace que un   │
 * │ enlace directo a /rutina no pueda saltarse la comprobacion.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `headerShown: false` porque cada pantalla dibuja su propio encabezado: la
 * cabecera de React Navigation trae su fondo, su tipografia y su altura, y
 * eso es justo lo que decide el tema.
 */
export default function DisposicionDeTabs() {
  const { estado } = useSesion();
  if (!puedeEntrarEnTabs(estado)) return <Redirect href="/" />;

  return (
    <Tabs
      tabBar={(props) => <BarraDePestanas {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: tema.color.fondo },
      }}
    >
      {DESTINOS_DE_TABS.map(({ nombre, etiqueta }) => (
        <Tabs.Screen key={nombre} name={nombre} options={{ title: etiqueta }} />
      ))}
    </Tabs>
  );
}

