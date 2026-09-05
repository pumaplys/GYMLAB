/**
 * La configuracion nativa que NO puede ser la misma en todos los perfiles.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `app.json` SIGUE SIENDO LA BASE. AQUI SOLO SE AÑADE LO QUE DEPENDE DEL   │
 * │ PERFIL DE BUILD.                                                         │
 * │                                                                          │
 * │ Expo lee este fichero DESPUES de `app.json` y recibe lo de alli en       │
 * │ `config`. Todo lo estable —nombre, identificadores, version— se queda en │
 * │ el JSON, que es donde se lee de un vistazo y donde lo busca cualquiera.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA EXCEPCION DE RED ES SOLO DE DESARROLLO, Y NO POR COMODIDAD.           │
 * │                                                                          │
 * │ Para probar contra la API del PC, el iPhone tiene que hablar por HTTP    │
 * │ con una IP de la red local. App Transport Security, de Apple, exige      │
 * │ HTTPS y puede cortar esa conexion. La forma MAS LIMITADA de permitirla   │
 * │ es `NSAllowsLocalNetworking`: habilita nombres sin punto, dominios       │
 * │ `.local` y direcciones de red privada, y NO toca el resto de internet.   │
 * │                                                                          │
 * │ NO se usa `NSAllowsArbitraryLoads`, que apagaria ATS entera.             │
 * │                                                                          │
 * │ Y solo entra cuando EAS compila con el perfil `development`, que es      │
 * │ quien define `EAS_BUILD_PROFILE`. En `preview` y en `production` este    │
 * │ bloque NO EXISTE: alli la API es `https://gymlabfit.tech` y una          │
 * │ excepcion de red no tiene ningun motivo.                                 │
 * │                                                                          │
 * │ Puede que ni siquiera haga falta —hay indicios de que iOS no aplica ATS  │
 * │ a una IPv4 desnuda— pero eso se sabra en el ensayo con el telefono, y    │
 * │ una excepcion que no se usa en produccion no cuesta nada.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const ES_DESARROLLO = process.env.EAS_BUILD_PROFILE === 'development';

module.exports = ({ config }) => {
  if (!ES_DESARROLLO) return config;

  return {
    ...config,
    ios: {
      ...config.ios,
      infoPlist: {
        ...config.ios?.infoPlist,
        NSAppTransportSecurity: {
          ...config.ios?.infoPlist?.NSAppTransportSecurity,
          NSAllowsLocalNetworking: true,
        },
      },
    },
  };
};
