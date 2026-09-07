import { rutaDeEntrada } from '../src/enlaces/entrada';

/**
 * La puerta de los enlaces que vienen de fuera.
 *
 * expo-router llama aqui con la URL TAL CUAL se la da el sistema operativo,
 * tanto si abre la app desde cero como si ya estaba abierta, y navega a lo que
 * se devuelva. Es el unico sitio donde se puede traducir la ruta del panel web
 * —`/reset-password`— a la de la app —`/restablecer`— sin renombrar pantallas
 * ni partir los enlaces de los correos en dos versiones.
 *
 * No lleva logica: esta toda en `src/enlaces/entrada.ts`, que se comprueba sin
 * telefono. Este fichero solo existe porque expo-router busca ESTE nombre.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return rutaDeEntrada(path);
}
