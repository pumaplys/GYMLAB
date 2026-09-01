import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ProveedorRaiz } from '../src/vista-previa/proveedor';
import { tema } from '../src/tema';

/**
 * La raiz de la app.
 *
 * Debajo cuelgan dos cosas: las pantallas de sesion —entrar, elegir gimnasio,
 * no admitido, problema— que son pilas sueltas, y el grupo `(tabs)`, que es la
 * app del socio. La puerta que decide cual toca es `app/index.tsx`.
 *
 * `ProveedorRaiz` es `ProveedorDeSesion` —literalmente, sin condiciones— en
 * iOS y en Android. Solo en web, y solo con EXPO_PUBLIC_VISTA_PREVIA=1, puede
 * servir una sesion de muestra para poder MIRAR las pantallas sin telefono.
 * Ver `src/vista-previa/proveedor.tsx`.
 *
 * `headerShown: false` porque cada pantalla se dibuja entera: la cabecera de
 * navegacion por defecto trae su propio fondo claro y su propia tipografia, y
 * eso es justo lo que el tema decide.
 */
export default function Raiz() {
  return (
    <SafeAreaProvider>
      <ProveedorRaiz>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: tema.color.fondo },
            animation: 'fade',
          }}
        />
      </ProveedorRaiz>
    </SafeAreaProvider>
  );
}
