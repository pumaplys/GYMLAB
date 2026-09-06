
import { Redirect, Tabs } from 'expo-router';
import { BarraDePestanas } from '../../src/componentes/barra-de-pestanas';
import { useSesion } from '../../src/auth/sesion';
import { DESTINOS_DE_TABS, puedeEntrarEnArea } from '../../src/navegacion/destinos';
import { tema } from '../../src/tema';

/**
 * El area del SOCIO: cinco destinos y nada mas.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTO NO ES UN SEGUNDO GATE: ES EL GATE DE ESTA AREA.                    │
 * │                                                                          │
 * │ Quien decide a donde va cada estado de sesion sigue siendo `app/index`.  │
 * │ Aqui se comprueba una sola cosa —¿esta autenticado Y es de esta area?— y │
 * │ si no, se devuelve a la puerta para que decida ella. El rol NO se        │
 * │ vuelve a leer: se compara el area que ya calculo `resolverAcceso`.       │
 * │                                                                          │
 * │ Y va en el LAYOUT del grupo, no en cada pantalla: es lo que hace que un  │
 * │ enlace directo a /rutina no pueda saltarse la comprobacion. Sin esto, un │
 * │ entrenador que abriera `rinda://rutina` veria la rutina de un socio que  │
 * │ no es el.                                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * El grupo se llama `(socio)` y no `(tabs)` desde STAFF-1: ahora hay tres
 * areas y "tabs" no dice de cual. Los parentesis significan que NO aparece en
 * la ruta, asi que `/inicio`, `/rutina` y las demas siguen exactamente igual.
 *
 * `headerShown: false` porque cada pantalla dibuja su propio encabezado: la
 * cabecera de React Navigation trae su fondo, su tipografia y su altura, y
 * eso es justo lo que decide el tema.
 */
export default function DisposicionDeSocio() {
  const { estado } = useSesion();
  if (!puedeEntrarEnArea(estado, 'socio')) return <Redirect href="/" />;

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

