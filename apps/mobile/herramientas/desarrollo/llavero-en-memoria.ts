/**
 * El Keychain, sustituido por un objeto en memoria.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ES LA UNICA PIEZA DE LA APP QUE SE SUSTITUYE EN ESTA PRUEBA.             │
 * │                                                                          │
 * │ `expo-secure-store` es el Keychain de iOS y el KeyStore de Android: no   │
 * │ existe fuera de un telefono, y su version web es literalmente `{}`. Todo │
 * │ lo demas —`src/api/cliente.ts`, `crearFetchAutenticado`, la resolucion   │
 * │ de `API_URL`, `@gymlab/api-client` y las fuentes de `src/personal`— es   │
 * │ el codigo que viaja en el binario, sin dobles.                           │
 * │                                                                          │
 * │ Guardar el token en memoria no cambia ni una cabecera de la peticion:    │
 * │ `almacen.ts` sigue leyendolo con `getItemAsync` y el fetch autenticado   │
 * │ sigue poniendo el mismo `Authorization: Bearer …`.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const cajon = new Map<string, string>();

export async function getItemAsync(clave: string): Promise<string | null> {
  return cajon.get(clave) ?? null;
}

export async function setItemAsync(clave: string, valor: string): Promise<void> {
  cajon.set(clave, valor);
}

export async function deleteItemAsync(clave: string): Promise<void> {
  cajon.delete(clave);
}
