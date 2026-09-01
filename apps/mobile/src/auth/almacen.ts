import * as SecureStore from 'expo-secure-store';

/**
 * Donde vive el token de sesion.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SECURE STORE, NO ASYNCSTORAGE.                                           │
 * │                                                                          │
 * │ `AsyncStorage` es un fichero sin cifrar dentro del sandbox de la app:    │
 * │ vale para una preferencia, no para una credencial. `expo-secure-store`   │
 * │ usa el Keychain en iOS y el KeyStore en Android.                         │
 * │                                                                          │
 * │ Y SOLO el token. Ni correo, ni contrasena, ni el usuario entero, ni      │
 * │ respuestas de la API: todo eso se vuelve a pedir al servidor, que es     │
 * │ quien sabe si siguen siendo ciertas. Guardar una copia local de "quien   │
 * │ soy" es como acaba una app mostrando el nombre de alguien que ya no      │
 * │ tiene acceso.                                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Sin biometria todavia: `requireAuthentication` obliga a pedir huella o cara
 * en CADA lectura, y eso es una decision de producto —no de cimientos— que
 * ademas se comporta distinto en cada plataforma.
 */
const CLAVE = 'gymlab.sesion.token';

/**
 * Lee el token. `null` si no hay ninguno.
 *
 * No lanza: en un arranque, "no se pudo leer el almacen" y "no hay sesion"
 * llevan al mismo sitio —a la pantalla de entrar— y distinguirlos aqui solo
 * serviria para que la app se cayera antes de poder pedir credenciales.
 */
export async function leerToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(CLAVE);
  } catch {
    return null;
  }
}

/** Guarda el token tras un login correcto. */
export async function guardarToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(CLAVE, token);
}

/**
 * Borra el token.
 *
 * Se llama al cerrar sesion y cuando el servidor responde 401. NO se llama
 * ante un error de red: ver `sesion.tsx`.
 */
export async function borrarToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(CLAVE);
  } catch {
    // Borrar algo que no esta no es un fallo.
  }
}
