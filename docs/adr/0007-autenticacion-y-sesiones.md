# ADR-0007 — Autenticación, sesiones y contexto de tenant

- **Fecha:** 2026-07-26
- **Estado:** Aceptado

> Numeración: los ADR 0001–0006 están reservados para las decisiones de
> `01-arquitectura.md`, pendientes de extraer. Este es el primero que nace ya
> como documento propio.

## Contexto

Auth es el módulo del que depende todo lo demás, porque es quien decide el
`gym_id` que alimenta `withTenant()` y, por tanto, quien activa el aislamiento
verificado en la Fase 0.

Hay que separar dos cosas que en un SaaS de un solo tenant se confunden sin
consecuencias:

- **Autenticación** — quién eres. Global, sin gimnasio.
- **Autorización** — qué puedes hacer *aquí*. Por gimnasio.

La separación no es teórica: una misma persona puede ser `trainer` en un
gimnasio y `member` en otro. Su identidad es una; sus permisos, tantos como
gimnasios.

## Decisiones

### 1. El `gym_id` nunca lo aporta el cliente

Viaja en la **fila de sesión**, del lado del servidor. El cliente solo posee un
token opaco.

Si el gimnasio se indicara con una cabecera, un socio del gimnasio A podría
enviar el identificador del B. Se podría validar contra `memberships` en cada
petición, pero eso es *una comprobación más que alguien puede olvidar* — el
mismo razonamiento que nos llevó a RLS en ADR-002.

### 2. Sesión en base de datos, no JWT

| | JWT con claim `gym_id` | Sesión en BD con `active_gym_id` |
|---|---|---|
| ¿El cliente puede manipular el tenant? | No (firma) | No (el valor vive en el servidor) |
| Revocar al despedir a un empleado | Imposible hasta caducar | Inmediata |
| Cambiar de gimnasio | Reemitir token | `UPDATE` de una columna |
| Coste | Cero lecturas | Una lectura indexada |

Se elige **sesión en BD**. La revocación inmediata no es un lujo: cuando un
dueño despide a un recepcionista, quiere que pierda el acceso en ese momento.
Una lectura indexada por petición es irrelevante a la escala prevista (A3).

### 3. Better Auth solo para autenticación

Better Auth gestiona credenciales, sesiones y tokens de verificación. **La
autorización y la pertenencia a gimnasios son nuestras.**

Su plugin de organizaciones trae tablas `organization`, `member` e `invitation`
que se solapan con nuestras `organizations`, `gyms` y `memberships`. Se descarta:
nuestro tenant es el **gimnasio**, no la organización, y RLS está atado a
`gym_id`. Doblar su modelo a una jerarquía de dos niveles cuesta más que
mantener nosotros la lógica de pertenencia.

Le dejamos lo que es peligroso hacer a mano —hashing, rotación de sesiones,
tokens de un solo uso— y nos quedamos lo específico del dominio.

**Verificado en `@better-auth/core` 1.6.25:** los nombres de tabla (`modelName`)
y de columna (`fields.*.fieldName`) son configurables, así que su esquema se
mapea a nuestra convención `snake_case` sin adoptar su `camelCase`. `session` y
`user` admiten `additionalFields`, que es donde viven `active_gym_id` e
`is_platform_admin`.

### 4. Contraseña para todos en v1

Un solo flujo de autenticación. Magic links y Google/Apple quedan para más
adelante; la tabla `accounts` de Better Auth ya trae `provider_id`, así que
añadirlos será **aditivo, no una migración**.

Consecuencia asumida: la recuperación de contraseña es un flujo obligatorio de
v1, y previsiblemente el motivo de soporte más frecuente entre socios.

### 5. Los socios entran por invitación

No hay auto-registro. Si cualquiera puede crear una cuenta declarándose socio
del Gimnasio X, hay suplantación desde el primer día. El flujo real de un
gimnasio ya es así: te dan de alta en recepción.

El token de invitación se guarda **hasheado**, como una contraseña: si la base
de datos se filtra, las invitaciones pendientes no son canjeables.

### 6. Alta de gimnasio protegida por código de plataforma

`/v1/auth/register-gym` es el único registro público, y exige un código de
invitación de plataforma. Sin Stripe hasta la Fase 2, es lo que evita que el
sistema se llene de gimnasios de prueba. Cuando entre el cobro, el código se
sustituye por el flujo de pago.

### 7. Matriz de invitaciones

Es el control de escalada de privilegios. Sin ella, un recepcionista puede
crearse un dueño y quedarse con el gimnasio.

| Invita → | `owner` | `receptionist` | `trainer` | `member` |
|---|:---:|:---:|:---:|:---:|
| **owner** | ✅ | ✅ | ✅ | ✅ |
| **receptionist** | ❌ | ❌ | ✅ | ✅ |
| **trainer** | ❌ | ❌ | ❌ | ❌ |

Un recepcionista gestiona personal cuando el dueño no está, de ahí que pueda
invitar entrenadores. **Nunca un dueño.** Que pueda invitar a otro recepcionista
queda cerrado por defecto (sería lateral, no escalada, pero no se ha pedido).

### 8. Duración de sesión por rol

| Rol | Inactividad | Máximo |
|---|---|---|
| `owner`, `receptionist`, `trainer` | 8 h | 12 h |
| `member` | — | 90 días, renovable |

Recepción trabaja en un ordenador compartido de mostrador; el socio, en su móvil
personal.

### 9. Dos registros distintos de actividad

| Tabla | `gym_id` | RLS | Motivo |
|---|---|---|---|
| `auth_events` | no | ❌ | Un login fallido aún no tiene gimnasio: no sabemos quién es. Con RLS, esos registros serían invisibles justo para el dueño que quiere ver si le están atacando. Retención 90 días |
| `audit_log` | sí | ✅ | Acciones dentro de un gimnasio, ya autenticadas. Append-only |

## Qué queda fuera de RLS, y por qué

Las tablas de autenticación se consultan **antes** de que exista contexto de
tenant, así que no pueden llevar política:

| Tabla | Motivo |
|---|---|
| `users` | El login busca por email sin saber el gimnasio |
| `accounts` | Se consulta durante la autenticación |
| `sessions` | Debe poder revocarse sin contexto |
| `verifications` | El usuario aún no está autenticado |

Lo que compensa la excepción es la misma disciplina que se aplicó a `users` en
la Fase 0: **no contienen ningún dato de negocio ni de salud**. Solo identidad,
credenciales y metadatos de sesión.

`consents` **sí** lleva `gym_id`, y el motivo es legal, no técnico: GYMLAB es
*encargado* del tratamiento y el gimnasio es *responsable*. El socio no consiente
que GYMLAB trate sus datos de salud: consiente que **su gimnasio** lo haga. Si
cambia de gimnasio, ese consentimiento no le acompaña.

## Las cuatro barreras de una petición

```
[1] AuthGuard          ¿sesión válida y no caducada?        -> 401
[2] RolesGuard         ¿el rol alcanza este endpoint?       -> 403
[3] TenantInterceptor  withTenant(gymId) -> SET LOCAL app.gym_id
[4] PostgreSQL + RLS   última barrera, ajena al código de arriba
```

Las capas 1–3 son código nuestro y pueden tener bugs. La 4 no depende de
nosotros. **RLS es la red, no el trapecio.**

## Consecuencias

**Positivas:** revocación inmediata; el tenant es inmanipulable desde el
cliente; una sola versión de la verdad sobre roles; añadir proveedores de login
será aditivo.

**Negativas:** una lectura de sesión por petición; dependemos de la forma del
esquema de Better Auth para cuatro tablas; la migración `0001` altera la `users`
creada en la `0000`, porque Better Auth espera `email_verified` booleano y
nosotros teníamos `email_verified_at`.

**Coste de revertir:** medio. Cambiar a JWT más adelante afectaría al guard y al
cliente, pero no al modelo de datos ni a RLS.

## Señales para revisarla

- La lectura de sesión aparece en el perfil de latencia como coste dominante
  (improbable por debajo de miles de peticiones por segundo).
- Hace falta autenticar servicio a servicio o dar acceso a terceros: entonces
  sí tocaría emitir tokens firmados, en paralelo y sin sustituir las sesiones.
