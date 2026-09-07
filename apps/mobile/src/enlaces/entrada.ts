/**
 * Los enlaces que llegan de fuera: de un correo, de otra app, de un mensaje.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POR QUE HACE FALTA TRADUCIR LA RUTA.                                     │
 * │                                                                          │
 * │ La API construye los enlaces de los correos contra `WEB_APP_URL`, y las  │
 * │ rutas son las del panel web: `/reset-password`, `/accept-invitation`.    │
 * │ Las pantallas de la app se llaman `/restablecer` y `/invitacion`.        │
 * │                                                                          │
 * │ Se traduce AQUI, y no se renombran las pantallas, por una razon: esas    │
 * │ URLs las tiene que seguir entendiendo el navegador para quien no lleve   │
 * │ RINDA instalada. Son el mismo enlace para los dos sitios; lo unico que   │
 * │ cambia es quien lo atiende.                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Esto es logica pura a proposito: es la parte que se puede comprobar sin
 * telefono. `app/+native-intent.ts` no hace mas que llamar aqui.
 */

/**
 * El dominio publico. Es el mismo que `DOMINIO` alimenta en produccion, y el
 * unico para el que se declaran `associatedDomains` e `intentFilters`.
 *
 * `www.gymlabfit.tech` NO entra: tiene registro A pero no responde por HTTPS
 * —no hay bloque para ese nombre en el Caddyfile, luego no hay certificado—,
 * asi que no puede haber un enlace universal apuntando ahi.
 */
export const DOMINIO = 'gymlabfit.tech';

/**
 * Ruta del panel web -> pantalla de la app.
 *
 * Esta tabla y la lista de `components` del `apple-app-site-association` tienen
 * que decir lo mismo. Un test lo comprueba: si alguien anade una ruta aqui y se
 * olvida del fichero, el enlace nunca llegaria a la app —el sistema operativo
 * ni siquiera se la ofreceria— y al reves quedaria una ruta que el sistema
 * entrega y la app no sabe atender.
 */
export const RUTAS_DEL_CORREO: Readonly<Record<string, string>> = {
  '/reset-password': '/restablecer',
  '/accept-invitation': '/invitacion',
};

/** La ruta a la que va a parar lo que llega de nuestro dominio y no reconocemos. */
export const RAIZ = '/';

type Partes = { ruta: string; consulta: string };

/**
 * Parte la URL SOLO si es del dominio de RINDA y viene por HTTPS.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTE FILTRO ES LO QUE IMPIDE ROMPER EL DESARROLLO.                       │
 * │                                                                          │
 * │ Por aqui pasan TODOS los enlaces que abre la app, no solo los de los     │
 * │ correos: `rinda://…`, y en desarrollo el cliente de Expo abre URLs       │
 * │ `http://192.168.x.x:8081/…`. Reescribir cualquier cosa que empiece por   │
 * │ `http` dejaria la app de desarrollo sin poder arrancar desde el QR.      │
 * │ Por eso se compara el HOST, y todo lo demas sale de aqui intacto.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function deNuestroDominio(entrante: string): Partes | null {
  let url: URL;
  try {
    url = new URL(entrante);
  } catch {
    // Una ruta suelta —`/restablecer?token=…`— no es una URL absoluta. No es
    // un enlace de fuera: es navegacion interna, y se deja pasar tal cual.
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.hostname.toLowerCase() !== DOMINIO) return null;

  // Una barra final de mas no deberia cambiar el destino. El propio
  // `apple-app-site-association` distingue `/reset-password` de
  // `/reset-password/`, asi que aqui se normaliza antes de buscar.
  const ruta = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
  // `search` da la consulta SIN descodificar, que es justo lo que hace falta:
  // el token viaja codificado y tiene que llegar a la pantalla como se envio.
  return { ruta, consulta: url.search };
}

/**
 * Lo que el sistema operativo entrega -> lo que Expo Router tiene que abrir.
 *
 * Devuelve la entrada TAL CUAL cuando el enlace no es de RINDA, porque en ese
 * caso no hay nada que traducir y quien sabe tratarlo es expo-router.
 */
export function rutaDeEntrada(entrante: string): string {
  const enlace = deNuestroDominio(entrante);
  if (enlace === null) return entrante;

  const destino = RUTAS_DEL_CORREO[enlace.ruta];
  /*
   * Del dominio, pero de una ruta que en el movil no existe —`/socios`, o una
   * pantalla del panel que se anada manana—. Abrir la app por su puerta es
   * mejor que un «no encontrado»: el enlace ya se ha abierto, y devolver nada
   * dejaria a quien lo pulso mirando la pantalla en la que ya estaba.
   *
   * Esto no deberia llegar a pasar: el sistema solo entrega las rutas que
   * declaran el `apple-app-site-association` y los `intentFilters`. Es la red
   * por si esas listas y esta dejan de coincidir.
   */
  if (destino === undefined) return RAIZ;

  return destino + enlace.consulta;
}
