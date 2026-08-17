# Hardening pre-producción — #74

Todo lo que sigue está medido contra **la imagen de producción**, en contenedor
Linux, con un **Caddy real** terminando TLS delante. No contra `pnpm dev`.

**PRE-PRODUCCIÓN TÉCNICA: APTA.**

---

## A. El blocker de conexiones, y la corrección del diagnóstico

Parar PostgreSQL mataba la API entera en dos segundos.

`pg.Pool` y `PgBoss` son `EventEmitter`. Un `'error'` emitido **sin listener**
registrado se convierte en excepción no capturada que termina el proceso, y
estas conexiones se caen **estando ociosas**: ningún `try/catch` puede
recogerlo. Reproducido con `docker compose stop postgres`: muerte en 2 s con
`Unhandled 'error' event` y código `57P01`, que es lo que Postgres envía en
cualquier reinicio o failover.

Se añadieron los dos listeners que faltaban. Ningún
`process.on('uncaughtException')`, ningún listener silencioso.

**Antes de eso llegué a declarar "NO APTA", y estaba equivocado.** El script de
comprobación usaba `Invoke-WebRequest` y trataba cualquier excepción como
"proceso muerto", pero un 503 también lanza en PowerShell. Estaba confundiendo
*degrada correctamente* con *se ha muerto*. También busqué un tercer pool que no
existe.

**El inventario son dos**, y sólo dos:

| consumidor | quién lo crea | listener `error` | quién lo cierra |
|---|---|---|---|
| aplicación | `createDatabase` (`packages/db`) | sí | `closeDatabase` en shutdown |
| colas | `new PgBoss(...)` | sí | `BossLifecycle` en shutdown |
| Better Auth | **ninguno** — usa `drizzleAdapter(db, …)` | hereda | — |

## B. `TRUST_PROXY` — el valor correcto, y qué pasa si se pone mal

Topología real, leída del compose y de la guía de despliegue:

```
Internet ──https──> Caddy :443 (en el host, termina TLS)
                      └──http──> 127.0.0.1:3001 (contenedor)
                                   ├── /v1/*   → API
                                   ├── /health → sonda
                                   └── /*      → panel exportado
```

Un solo salto de confianza ⇒ **`TRUST_PROXY: 1`**. No asumido: medido.

Enviando `X-Forwarded-For: 1.2.3.4`, `X-Forwarded-Proto: https` y
`X-Forwarded-Host: malicioso.test`, esto es lo que Caddy entrega literalmente al
backend:

```
X-Forwarded-For:   172.19.0.1        ← el par real; el inventado DESAPARECE
X-Forwarded-Host:  127.0.0.1:8081    ← el Host real
X-Forwarded-Proto: http              ← el esquema real, no el reclamado
Via:               1.1 Caddy
```

**Caddy reemplaza estas cabeceras, no las añade.** Eso contradecía un comentario
del propio código —que decía que un proxy «no la reemplaza, le añade su valor
por la derecha»—; cierto para nginx, falso para Caddy. Corregido en `env.ts`.

`request.ip` medido, con el cliente en otro contenedor (IP `172.19.0.6`) y Caddy
en `172.19.0.4`:

| `TRUST_PROXY` | entrada | XFF del cliente | `request.ip` |
|---|---|---|---|
| 1 | vía Caddy | ninguno | `172.19.0.6` ✅ el cliente real |
| 1 | vía Caddy | `9.9.9.9` | `172.19.0.6` ✅ la mentira se ignora |
| 0 | vía Caddy | ninguno | `172.19.0.4` ❌ **la de Caddy, para todo el mundo** |

A 0 no se cuela nadie, pero el gimnasio entero comparte cubo de intentos y la IP
de auditoría no identifica a nadie.

## C. Suplantación de IP contra el límite de intentos

El límite es 5 por pareja (email, IP). Si el cliente pudiera elegir su IP,
rotando la cabecera tendría un cubo nuevo cada vez y **nunca** vería un 429. Ocho
intentos fallidos seguidos, código de respuesta de cada uno:

```
TRUST_PROXY=1, vía Caddy, sin XFF          401 401 401 401 401 429 429 429
TRUST_PROXY=1, vía Caddy, XFF fijo         401 401 401 401 401 429 429 429
TRUST_PROXY=1, vía Caddy, XFF ROTANDO      401 401 401 401 401 429 429 429  ← no evade
TRUST_PROXY=5, vía Caddy, XFF ROTANDO      401 401 401 401 401 429 429 429  ← tampoco
TRUST_PROXY=1, DIRECTO al puerto, ROTANDO  401 401 401 401 401 401 401 401  ← EVADE
```

Dos conclusiones, y la segunda es la importante:

1. Sobredeclarar saltos **no es explotable detrás de Caddy**, porque Caddy
   reemplaza la cadena y nunca hay más de una entrada que descartar. Detrás de
   nginx con `proxy_add_x_forwarded_for` sí lo sería. Sigue siendo mala idea.

2. **Lo que abre el agujero es poder alcanzar el puerto sin pasar por el
   proxy.** Ocho de ocho evadieron el límite atacando el 3001 directamente. Por
   eso `127.0.0.1:3001:3001` en el compose no es una comodidad: es el control
   que sostiene la integridad de la IP, y con ella el límite de intentos, la
   auditoría y la IP que se guarda en los consentimientos.

## D. Origen único

Un solo contenedor sirve API y panel, así que **el mismo origen no depende de
acertar con una configuración: es el mismo proceso**. Caddy sólo termina TLS y
no reparte por ruta. `NEXT_PUBLIC_API_URL` se construye vacía a propósito, que
significa "llama a `/v1` en tu propio origen". No hay dependencia de un dominio
de API separado.

## E. CORS

Medido contra el contenedor, con `CORS_ORIGINS=https://gymlabfit.tech`:

| caso | respuesta | `Access-Control-Allow-Origin` |
|---|---|---|
| origen permitido | 200 | `https://gymlabfit.tech` |
| origen **no** permitido | 200 | **ninguno** → el navegador lo bloquea |
| sin `Origin` | 200 | ninguno (no afecta a servidor-a-servidor) |
| preflight permitido | 204 | `https://gymlabfit.tech` |
| preflight rechazado | 204 | **ninguno** |

Nunca aparece `*`. En producción, siendo estrictamente same-origin, esta lista
no llega a usarse: se declara para que no entre el valor por defecto.

## F. Cookie de sesión

Emitida por el contenedor detrás de Caddy con TLS real:

```
__Secure-better-auth.session_token=…; Max-Age=7776000; Path=/; HttpOnly; Secure; SameSite=Lax
```

`HttpOnly` ✅ · `Secure` ✅ · `SameSite=Lax` ✅ · prefijo `__Secure-` ✅ · **sin
`Domain`** ✅ (host-only, no se filtra a subdominios) · no depende de cookies de
terceros ✅.

Ciclo completo medido: `/v1/auth/me` → **200**, logout → 201, **la misma cookie
después del logout → 401**. Se invalida en servidor, no sólo en el navegador.

Búsqueda de `localStorage`, `sessionStorage` y `document.cookie` en todo el
repositorio: **una sola aparición**, y es un comentario documentando que el token
del QR *no* se guarda ahí.

## G. HTTPS y `X-Forwarded-Proto`

Probando primero **sin** TLS, la sesión daba 401: la cookie se emite como
`__Secure-` pero la petición llegaba por HTTP plano. Con `tls internal` en Caddy
—TLS real, igual que en producción con Let's Encrypt— el ciclo entero funciona.

Verificado además que **el prefijo no depende de `TRUST_PROXY`**: con 0 la sesión
sigue funcionando igual. Better Auth lo deduce de `baseURL` (`API_URL`), no del
protocolo de la petición. Lo había supuesto al revés.

De ahí que `API_URL` sea crítica, y de ahí el control de la sección I.

## H. Puertos

- **PostgreSQL**: sin `ports`. No se expone fuera del host.
- **API**: `127.0.0.1:3001:3001`. No hay segundo puerto público por el que
  saltarse TLS, el proxy o el cálculo de IP. Es lo que impide el ataque de la
  sección C.
- Cortafuegos según la guía: sólo SSH, 80 y 443.

## I. Variables de entorno

| variable | clasificación |
|---|---|
| `DATABASE_URL_APP`, `AUTH_SECRET`, `ACCESS_TOKEN_SECRET`, `PLATFORM_INVITE_CODE` | obligatorias — sin ellas no arranca |
| `RESEND_API_KEY`, `EMAIL_FROM` | **ya fallaban en cerrado** en producción, confirmado en vivo |
| `API_URL`, `WEB_APP_URL`, `CORS_ORIGINS` | **eran default peligroso — corregido** |
| `NODE_ENV`, `TRUST_PROXY`, `API_PORT` | fijadas por el compose |
| `HEALTH_CONSENT_VERSION` | opcional; sin ella no se acepta ningún dato de salud, deliberado |

El agujero concreto: el compose pasa `API_URL: ${DOMINIO}`, y si `DOMINIO` no
está en el `.env`, **Compose la sustituye por cadena vacía**, que cuenta como
ausente, y entra el default `http://localhost:3001`. De ahí deduce Better Auth
si la cookie lleva `Secure`. Un olvido de una línea degradaba la sesión de todo
el mundo, en silencio, con `/health` respondiendo 200.

Ahora producción **se niega a arrancar** si `API_URL`/`WEB_APP_URL` no son HTTPS
públicas o si `CORS_ORIGINS` trae orígenes locales. Desarrollo no cambia.

## J. Apagado con SIGTERM real, en Linux

`docker stop` sobre el contenedor de producción:

- termina en **0,41 s**;
- código de salida **143** = 128+15, lo normal cuando Nest reemite la señal tras
  ejecutar sus hooks;
- conexiones de `gymlab_app` en `pg_stat_activity`: **4 antes → 0
  inmediatamente después**. Los pools los cerró la aplicación; no se cortaron.
- vuelve a arrancar y `/health` responde 200.

`dumb-init` como PID 1 es lo que hace que la señal llegue a Node.

## K. Corte de PostgreSQL en el contenedor de producción

```
Postgres ABAJO   → /health 503 · login 500 · errores registrados
                   Docker lo marca unhealthy (~90 s) · reinicios = 0
Postgres ARRIBA  → /health 200 · healthy otra vez
                   el proceso NUNCA se reinició
```

`restart: unless-stopped` no reinicia por *unhealthy*, sólo por salida del
proceso: no hay bucle de reinicios mientras la base tarda en volver. Es la
distinción entre *liveness* y *dependencia* que se buscaba.

## L. Logs

Buscados en el log completo del contenedor: contraseñas, cadenas de conexión,
clave de Resend, `session_token`, `Authorization`. **Cero apariciones de todas.**

Lo que sí aparece, con subsistema identificado:

```
ERROR [PgBoss] pg-boss: terminating connection due to administrator command
```

Corregido de paso un defecto propio: el listener imprimía `[object Object]`
porque no todo lo que emite pg-boss es un `Error`.

## M. Tests, y sus falsificaciones

| test | qué protege | falsificación |
|---|---|---|
| `packages/db/src/__tests__/resiliencia-conexion.test.ts` | el listener del pool | comentando la línea → 2 rojos con el `throw` exacto que mata el proceso |
| `apps/api/src/config/env.test.ts` | el cierre en producción | quitando la comprobación → 3 rojos de 6; los 3 que deben seguir verdes (config completa, defaults de desarrollo) siguen verdes |

`typecheck` y `lint` limpios. **352 tests** de la API en verde.

---

## Deuda técnica, no bloqueante

- **Readiness de la cola.** `/health` distingue proceso y base de datos, pero no
  demuestra que los workers consuman. No es blocker: pg-boss recupera solo y se
  comprobó que procesa un job hasta `completed` tras la caída. Haría falta si
  apareciera un caso con API y base sanas y pg-boss muerto sin detectarlo.
- **`login` devuelve 500 durante el corte**, no 503. Es un 5xx, así que cumple
  —nada responde 200 mintiendo—, pero 503 sería más honesto.
- **`Max-Age` de la sesión: 90 días.** Correcto para un gimnasio; conviene
  revisarlo si algún día entra un rol con más privilegios.
- Contar **cuentas distintas por IP** en lugar de intentos, ya anotado en
  `auth.throttle.ts`.

## Checklist para el despliegue en el VPS

Sin secretos. Marcar durante el deploy, no antes:

- [ ] `DOMINIO` definido en el `.env` **junto al compose** — si falta, la API ya
      se niega a arrancar en vez de degradar la sesión en silencio
- [ ] `--env-file .env` en el comando de compose (vive en `docker/`)
- [ ] `TRUST_PROXY` = **1**; bajar a 0 sólo si se quita Caddy
- [ ] `docker port` del contenedor: **sólo `127.0.0.1:3001`**, ningún `0.0.0.0`
- [ ] PostgreSQL sin `ports` publicados
- [ ] `ufw`: sólo SSH, 80 y 443 — el 3001 **no** se abre
- [ ] Caddy sirviendo el dominio con certificado válido y renovación automática
- [ ] cookie de sesión con `Secure`, `HttpOnly`, `SameSite=Lax` y sin `Domain`
- [ ] `CORS_ORIGINS` = el dominio público, sin `localhost`, sin `*`
- [ ] `/health` 200 desde fuera por HTTPS
- [ ] `docker stop` → salida limpia; conexiones a 0; vuelve a arrancar
- [ ] parar y arrancar PostgreSQL: la API sobrevive, `/health` 503 → 200, **sin
      reiniciar el proceso**
- [ ] un job de correo real llega a `completed`
- [ ] logs sin secretos
- [ ] `restart: unless-stopped` activo

---

## PRE-PRODUCCIÓN TÉCNICA: APTA

Los catorce criterios de salida están demostrados contra la imagen de
producción. Los dos defectos reales encontrados —los `EventEmitter` sin listener
y los valores por defecto que degradaban la sesión en silencio— están corregidos
y protegidos con tests falsificados.

Queda pendiente el despliegue, que no forma parte de este PR.
