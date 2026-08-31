import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ProveedorDeSesion } from '../src/auth/sesion';
import { tema } from '../src/tema';

/**
 * La raiz de la app.
 *
 * En M1 hay UNA ruta: el gate de sesion decide que enseñar dentro de ella. Las
 * cinco pestañas —Inicio, Rutina, Carne, Progreso, Perfil— llegan cuando haya
 * pantallas que poner debajo; montar el esqueleto de navegacion antes solo
 * seria decidir dos veces.
 *
 * `headerShown: false` porque cada pantalla se dibuja entera: la cabecera de
 * navegacion por defecto trae su propio fondo claro y su propia tipografia, y
 * eso es justo lo que el tema decide.
 */
export default function Raiz() {
  return (
    <SafeAreaProvider>
      <ProveedorDeSesion>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: tema.color.fondo },
            animation: 'fade',
          }}
        />
      </ProveedorDeSesion>
    </SafeAreaProvider>
  );
}
