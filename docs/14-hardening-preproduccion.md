# Hardening pre-producción — conexiones

**BLOCKER DE CONEXIONES: CERRADO.**

El resto de #74 (trust proxy, single-origin, CORS, cookies, Docker, shutdown,
logs) **queda pendiente**: no se ha empezado.

---

## A. El "tercer emisor" no existía

La conclusión anterior —que faltaba una tercera fuente de `'error'` sin
listener— **era incorrecta, y el error era de medición, no del código**.

El script de comprobación usaba `Invoke-WebRequest` sobre `/health` y trataba
cualquier excepción como "proceso muerto". Pero con PostgreSQL caído la API
responde **503**, y un 5xx también lanza excepción en PowerShell. Estaba
confundiendo *"degrada correctamente"* con *"se ha muerto"*.

Medido bien —comprobando si el puerto 3001 sigue escuchando— el resultado es el
contrario.

## B. Inventario de conexiones en producción

| consumidor | quién la crea | tipo | listener `error` | quién la cierra |
|---|---|---|---|---|
| aplicación | `createDatabase` (`packages/db`) | `pg.Pool` | **sí** (añadido) | `closeDatabase` en shutdown |
| colas | `new PgBoss(...)` | `PgBoss` + pool propio | **sí** (añadido) | `BossLifecycle` en shutdown |
| **Better Auth** | **ninguna** | — | — | — |

Better Auth **no abre conexión propia**: recibe `drizzleAdapter(db, …)` con el
`db` de la aplicación, así que hereda su pool y su listener. Era la sospecha
principal y quedó descartada leyendo el código.

En producción sólo existen esas dos. El resto de `createDatabase` del repositorio
están en ficheros de test.

## C. Causa de la caída original

`PgBoss` y `pg.Pool` son `EventEmitter`. Un emisor que emite `'error'` **sin
listener** convierte el evento en excepción no capturada y termina el proceso.
Estas conexiones se caen **estando ociosas**, así que ningún `try/catch` del
código puede recogerlas.

Reproducido: con `/health` en 200, `docker compose stop postgres` mató la API en
**2 segundos** con `Unhandled 'error' event` y código `57P01` —lo que Postgres
envía en cualquier reinicio o failover—.

## D. Cambios aplicados

1. **`apps/api/src/jobs/jobs.module.ts`** — listener de `error` en pg-boss, con
   un serializador propio: lo que emite pg-boss no siempre es un `Error`, y
   `String(...)` producía `[object Object]` en la mitad de los casos. Nunca se
   serializa el objeto completo, que puede arrastrar la cadena de conexión.
2. **`packages/db/src/client.ts`** — listener de `error` en el pool de la
   aplicación.

Ningún `process.on('uncaughtException')`. Ningún listener silencioso.

## E. Con PostgreSQL caído

- proceso **vivo**, puerto 3001 escuchando;
- `/health` → **503**;
- errores **registrados**, no tragados: `[PgBoss] pg-boss: terminating
  connection due to administrator command`;
- **cero** `Unhandled 'error' event`;
- pg-boss reintenta cada ~2 s con `ECONNREFUSED` — insiste, no abandona;
- el ritmo de log es el de sus reintentos, sin bucle desbocado.

## F–H. Al volver PostgreSQL, sin reiniciar Node

- `/health` → **200**;
- `POST /v1/auth/login` → **401** (credenciales inválidas: la base contestó, así
  que Better Auth y el pool se recuperaron);
- **la cola procesa de verdad**: se dio de alta un gimnasio y se envió una
  invitación por la vía normal, y el job quedó en estado `completed`.

Esto último es lo que distingue *"el objeto PgBoss existe"* de *"la cola
funciona"*.

## I. Regresión

`packages/db/src/__tests__/resiliencia-conexion.test.ts` comprueba que el pool
tiene listener de `'error'` y que emitirlo **no lanza** y **sí se registra**.

**Falsificado**: comentando el listener, los 2 tests pasan a rojo con
`expected [Function] to not throw` — es decir, con el `throw` exacto que mata el
proceso. Restaurado, vuelven a verde.

Sin este test, la línea del listener es fácil de borrar por "limpieza": no rompe
ninguna prueba funcional y todo sigue verde hasta que la base de datos se
reinicia un martes por la noche.

## J. Apagado

El cableado está y es correcto:

- `app.enableShutdownHooks()` en `main.ts`;
- `DatabaseModule.onApplicationShutdown` → `closeDatabase`;
- `BossLifecycle.onApplicationShutdown` → `boss.stop({ graceful: true })`.

**No se ha probado con una señal real, y en este equipo no puede probarse
honestamente**: en Windows `process.kill(pid, 'SIGINT')` no entrega una señal,
aborta el proceso, así que la prueba diría lo que yo quisiera oír. El destino
real es Linux en contenedor — la comprobación pertenece a la fase de Docker de
este mismo PR, y queda ahí anotada.

## Pendiente

- **readiness de la cola**: `/health` distingue proceso y base de datos, pero no
  demuestra que los workers consuman. Queda por evaluar si merece una
  comprobación aparte.
- **SIGTERM real** en contenedor (arriba).

---

## BLOCKER DE CONEXIONES: CERRADO

```
Postgres ON   → API funciona
Postgres OFF  → API viva, /health 503, errores registrados, pg-boss reintentando
Postgres ON   → API + auth + DB + cola recuperan SIN reiniciar el proceso
```
