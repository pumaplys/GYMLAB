# QA de Android contra el entorno local

Todo lo de esta carpeta corre contra **desarrollo**. Ninguno de estos guiones
habla con producción: cada uno comprueba antes de nada que la API es
`http://localhost:3001/v1` y que existe el puente `adb reverse tcp:3001`.

## Lo que hace falta encendido

| Pieza | Cómo |
| --- | --- |
| Postgres | `docker start gymlab-postgres` |
| API | `pnpm --filter @gymlab/api dev` |
| Emulador | `emulator -avd rinda -camera-back virtualscene` |
| Puentes | `adb reverse tcp:3001 tcp:3001` y `adb reverse tcp:8081 tcp:8081` |
| Metro | `pnpm --filter @gymlab/mobile qa-metro` |
| APK | la build del perfil `qa-emulador`, instalada con `adb install -r` |

> **Cuidado con `pnpm build` mientras la API está en marcha.** Sobrescribe el
> `dist` que `nest start --watch` está usando y la API se cae con
> `MODULE_NOT_FOUND`. Si eso pasa, basta relanzarla.

## Los guiones

| Orden | Qué comprueba |
| --- | --- |
| `qa-recorridos [rol…]` | Los cuatro roles entran y ven exactamente lo suyo, con las ausencias incluidas: recepción sin «Planes», el dueño sin «Mis socios», el entrenador sin el Panel. |
| `qa-medicion` | La cadena de PARITY-4 entera: la dueña rellena al responsable, la socia da su permiso, el entrenador registra una medición y la socia lo retira. |
| `qa-escaner` | El escáner leyendo píxeles de verdad por la cámara del emulador: permiso, carné bueno, doble lectura, QR que no es carné, firma falsa y caducado. |
| `qa-enlaces` | `assetlinks.json`, la huella de la APK, el estado del verificador de Android y los tres enlaces que abren la app. |

Las capturas de cada paso quedan en `~/.maestro/tests/<fecha>/`.

## Lo que costó averiguar

**Metro servía desde la raíz del monorepo y no resolvía nada.** El cliente de
desarrollo pedía `/apps/mobile/node_modules/expo-router/entry.bundle` y Metro,
resolviendo desde la raíz, no veía lo que pnpm enlaza dentro de
`apps/mobile/node_modules`. `expo export` sí funcionaba, y esa era la pista.
Lo arregla `EXPO_NO_METRO_WORKSPACE_ROOT=1`, que ya lleva puesto `qa-metro`.

**El carné vive 60 s y el emulador tarda más en arrancar.** El póster de la
escena virtual se lee al arrancar, así que por ese camino el token siempre
llegaba caducado. La consola del emulador tiene `virtualscene-image`, que lo
cambia en caliente: firmar y colgar tarda unos dos segundos. El TTL no se ha
tocado — es una regla del producto, no un estorbo de pruebas.

**`cmd package resolve-activity` miente sobre los App Links.** Devuelve el
selector de «abrir con» aunque el dominio esté verificado, porque ignora la
verificación de dominio. Hay que disparar el intent y mirar dónde acaba.

**Las claves del fixture no se imprimen.** Salen de
`apps/web/auditoria/credenciales.local.json` (gitignored) y van a Maestro por
`-e`; toda la salida pasa por un filtro que las sustituye antes de llegar a la
consola. Los tokens de carné tampoco: van directos al PNG.
