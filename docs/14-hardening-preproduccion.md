# Hardening pre-producción — estado

**PRE-PRODUCCIÓN TÉCNICA: NO APTA.** Un blocker abierto, documentado abajo.

Este documento recoge únicamente lo investigado hasta ahora. El alcance completo
de #74 (trust proxy, single-origin, CORS, cookies, Docker, shutdown, logs) **no
se ha cubierto**: la investigación de pg-boss resultó más profunda de lo previsto
y consumió la sesión.

---

## A. Causa de la incidencia de #69 — identificada y reproducida

La hipótesis inicial ("pg-boss tumba el proceso") era **correcta en el mecanismo
pero incompleta en el alcance**.

### El mecanismo

`PgBoss` y el pool de `pg` son ambos `EventEmitter`. En Node, un emisor que emite
`'error'` **sin ningún listener registrado** convierte ese evento en una
excepción no capturada, y el proceso termina.

Estas conexiones se caen **estando ociosas**, no en respuesta a una consulta: no
hay `try/catch` en ninguna parte del código que pueda recogerlas.

### La reproducción

Con la API en marcha y `/health` respondiendo 200, se paró PostgreSQL:

```
docker compose stop postgres
```

**La API murió en 2 segundos.** El log:

```
node:events:487  throw er; // Unhandled 'error' event
error: terminating connection due to administrator command   (57P01)
Emitted 'error' event on PgBoss instance at: …
```

No es un fallo exótico: `57P01` es lo que Postgres envía en **cualquier reinicio
de la base de datos**, un failover o un corte de red.

## B–C. Correcciones aplicadas

**1. `apps/api/src/jobs/jobs.module.ts`** — listener de `error` en pg-boss.

**Demostrada funcionando**: al repetir el corte, el log muestra cuatro errores
registrados limpiamente como `[PgBoss] pg-boss: terminating connection…` **sin
matar el proceso**. Antes, el primero lo mataba.

**2. `packages/db/src/client.ts`** — listener de `error` en el pool de la
aplicación.

Se añadió porque la segunda reproducción reveló que el proceso ya no moría por
pg-boss sino por **otro emisor**: `Emitted 'error' event on BoundPool instance`,
con `application_name: undefined` (el de pg-boss llevaba `'pgboss'`).

## D. BLOCKER ABIERTO

**Con las dos correcciones aplicadas, la API sigue muriendo al parar PostgreSQL.**

Verificado que el listener del pool está presente en el artefacto construido
(`packages/db/dist`) y que la API se reinició después de reconstruirlo. Sólo hay
un `createDatabase` en toda la API.

Es decir: **existe al menos una tercera fuente de `'error'` sin listener** que no
he identificado. Candidatos no descartados:

- el pool interno de Better Auth, que gestiona su propia conexión;
- algún pool creado por una dependencia;
- que en desarrollo la API resuelva `@gymlab/db` por otra vía y mi listener no
  esté realmente activo en ese proceso.

**Método de reproducción, para quien lo retome:**

1. `pnpm --filter @gymlab/api dev` y esperar a `/health` → 200;
2. `docker compose stop postgres`;
3. observar el log: la línea `Emitted 'error' event on <X> instance` **dice qué
   emisor** no tiene listener;
4. registrar un listener en ese emisor y repetir.

El patrón es siempre el mismo; lo que falta es enumerar todos los emisores.

## Lo que NO se ha revisado todavía

Trust proxy · single-origin · CORS · cookies · headers del proxy · exposición de
puertos · variables de producción · Docker/compose · shutdown · logs · health de
cola.

---

## PRE-PRODUCCIÓN TÉCNICA: NO APTA

**Blocker único:** la API termina el proceso cuando PostgreSQL se reinicia o la
conexión se pierde. En producción eso significa que un mantenimiento rutinario de
la base de datos deja el gimnasio sin sistema —incluido el QR de la puerta— hasta
que alguien reinicie la API a mano.

Las dos correcciones aplicadas son necesarias y una está demostrada, pero **no
suficientes**: el fallo persiste.
