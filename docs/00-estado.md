# Estado del proyecto

> Última actualización: **2026-08-02** · **Fase 1 (MVP) COMPLETADA** · Siguiente: Fase 2

Documento de continuidad: qué está hecho, qué está a medias y cuál es el
siguiente paso. Se actualiza al final de cada sesión de trabajo.

---

## Dónde estamos

| Fase | Estado |
|---|---|
| Fase 0 — cimientos | ✅ cerrada |
| Fase 1 — MVP, 7 módulos | ✅ **cerrada** |
| Fase 2 | por planificar — ver [`03-fase-2.md`](03-fase-2.md) |

**266 tests** (40 de aislamiento e integridad + 226 funcionales). `build`,
`typecheck`, `lint` y `test` en verde en local y en CI. **12 ADR**.

El objetivo declarado de la Fase 1 era *«tres gimnasios piloto usándolo a diario»*.
El alcance funcional está completo; **eso todavía no ha ocurrido**, y es la
siguiente prueba de fuego. Lo que falta para poder ponerlo en manos de alguien
está en la sección de deuda.

---

## Los siete módulos

| # | Módulo | Qué resolvió |
|---|---|---|
| 0 | **Resend** | Dos transportes intercambiables y clasificación de errores en transitorio / permanente / desconocido, que es lo que decide si pg-boss reintenta o se rinde |
| 1 | **Socios** | Un socio **no** es un usuario: la ficha existe con o sin cuenta. Invitación en dos endpoints por seguridad (ADR-0010) |
| 2 | **Entrenadores** | Un entrenador ve **solo sus asignados**. RLS no puede imponerlo, así que se resolvió por construcción |
| 3 | **Cuotas** | GYMLAB registra, no cobra. Un pago cubre exactamente un periodo; «vencida» no es un estado guardado |
| 4 | **QR de acceso** | Firma HMAC con clave derivada por gimnasio, uso único por `jti` y tolerancia a reintentos de red |
| 5 | **Rutinas** | La biblioteca se copia, no se comparte (ADR-0012); las rutinas guardan copia del nombre del ejercicio |
| 6 | **Progreso** | Datos de salud (art. 9). Ninguna escritura sin consentimiento vigente, comprobado en el servicio |
| 7 | **Dashboard** | El único sin tablas propias: cada módulo calcula sus métricas y el panel compone |

---

## Las tres barreras que sostienen el producto

**Aislamiento entre gimnasios.** Políticas RLS por tabla, `withTenant()` fijando
`app.gym_id` local a la transacción, y `assertRlsIsEnforced()` abortando el
arranque si la conexión pudiera saltárselas. Dos roles de base de datos, porque
en PostgreSQL el propietario ignora RLS.

**El tenant viaja en la clave ajena.** Desde el PR de integridad, las relaciones
son compuestas `(gym_id, id)`: una fila del gimnasio A no puede apuntar a una del
B ni aunque el código lo intente. Antes era representable — se comprobó.

**Lo que RLS no puede hacer.** Dentro de un gimnasio no distingue roles: que un
entrenador vea solo a sus socios, que recepción no acceda a datos de salud y que
solo el dueño vea el panel es **autorización de aplicación**, y por eso cada uno
tiene tests de abuso propios.

### Tres guardarraíles que vigilan lo anterior

Ninguno comprueba una funcionalidad: comprueban que nadie se salte un paso.

- **Toda tabla con `gym_id`** debe tener RLS y al menos una política.
- **Toda clave ajena hacia una tabla de tenant** debe incluir `gym_id`. La lista
  se **deriva del catálogo**; cuando era manual, dos tablas nuevas se quedaron
  fuera sin que nada se pusiera en rojo.
- **Toda variable de entorno** debe estar en `turbo.json`, en CI si es obligatoria
  y en `.env.example`. Se añadió tras fallar dos veces por lo mismo.

---

## Método: verificación por falsificación

Un test en verde no demuestra nada si no se puede hacer fallar. En cada límite de
seguridad se rompió la garantía a propósito para comprobar que el test lo
detecta. Lo que encontró, entre otras cosas:

- un test de concurrencia del QR que **pasaba igual** con la implementación
  ingenua: dos peticiones HTTP en paralelo casi nunca caen en una ventana de
  milisegundos. Reescrito con veinte transacciones simultáneas, la versión
  ingenua falla con clave duplicada;
- que sin la derivación HKDF por gimnasio, un token del gimnasio A **valida** en
  el B y solo nos salvaba que la ficha no existiera allí;
- que el aislamiento de la biblioteca de ejercicios no dependía del `WHERE` del
  servicio sino de RLS — el test lo dice ahora explícitamente.

---

## Decisiones de arquitectura

| ADR | Decisión | Por qué importa hoy |
|---|---|---|
| [0001](adr/0001-monolito-modular.md) | Monolito modular, no microservicios | Un desarrollador no opera un sistema distribuido |
| [0002](adr/0002-multi-tenancy-rls.md) | Esquema compartido + `gym_id` + RLS | Es el límite que impide la fuga entre clientes |
| [0003](adr/0003-typescript-extremo-a-extremo.md) | TypeScript en todo | Un cambio de contrato rompe la compilación, no producción |
| [0004](adr/0004-stack-tecnologico.md) | NestJS, PostgreSQL, Drizzle, REST | |
| [0005](adr/0005-monorepo.md) | pnpm + Turborepo | |
| [0006](adr/0006-modulos-del-dominio.md) | Fronteras de módulo: se pide al servicio, nunca a su tabla | La regla que más veces ha condicionado el diseño |
| [0007](adr/0007-autenticacion-y-sesiones.md) | Cuatro barreras por petición | |
| [0008](adr/0008-alcance-de-la-transaccion.md) | Una transacción por petición; outbox con pg-boss | |
| [0009](adr/0009-no-montar-el-router-de-better-auth.md) | Endpoints propios de autenticación | La superficie expuesta es exactamente la que escribimos |
| [0010](adr/0010-dos-endpoints-para-aceptar-invitaciones.md) | `accept` y `link` separados | Un token de invitación **nunca** escribe credenciales de una cuenta existente |
| [0011](adr/0011-exportacion-de-datos-personales-por-punto-de-extension.md) | Exportación RGPD compuesta por punto de extensión | El borrado lo resuelven las claves ajenas; la lectura no |
| [0012](adr/0012-biblioteca-de-ejercicios-por-copia.md) | La biblioteca de ejercicios se copia | Evita la única tabla con `gym_id` anulable |

### La lección que más caro salió

Romper un ciclo de **módulos** no basta: el contenedor de dependencias mira los
**proveedores**. Con `MembersService` implementando el punto de extensión de
invitaciones, el grafo seguía siendo circular y **Nest se quedaba colgado en el
arranque sin emitir ningún error** — ni el `build` ni el `typecheck` lo detectan.

De ahí la regla que ya se aplica en tres sitios: **quien implementa un punto de
extensión es una clase dedicada y sin dependencias hacia quien lo invoca.**

---

## Deuda conocida, con su motivo

| Qué | Por qué sigue ahí | Cuándo se resuelve |
|---|---|---|
| **Textos de consentimiento sin redactar** | `HEALTH_CONSENT_VERSION` no tiene valor, así que el módulo 6 está **entregado y bloqueado**: no acepta ni un dato de salud. No es técnico | **Antes de cualquier piloto que use progreso** |
| **`trust proxy` sin configurar** | Detrás del proxy del hosting, `x-forwarded-for` no será fiable y el límite de intentos perderá precisión | **Antes de producción** |
| **Agregados de asistencia** | `access_events` se purga según la retención de cada gimnasio (12 meses por defecto). Comparar con el año anterior exige calcular agregados **antes** de que la purga se lleve el detalle | Antes de la primera purga real |
| **`slug` es el UUID del gimnasio** | La columna existe para URLs legibles y hoy no aporta nada | Cuando haya URLs públicas |
| **Un rol por persona y gimnasio** | Un dueño que además entrene no puede tener socios asignados | Si un piloto lo pide |
| **Sin panel web ni app** | Solo existe la API. Un piloto necesita interfaz | Fase 2, y es lo primero |
| **`ignoreDeprecations: "6.0"`** | `tsup` inyecta un `baseUrl` propio al generar los `.d.ts` | Al actualizar `tsup` |

### Lo que hay que tener presente

**El producto no se puede usar todavía**, y no por falta de funcionalidad: no hay
interfaz. La API está completa y probada; nadie puede abrirla sin escribir
peticiones a mano.

---

## Cómo levantar el entorno

```bash
docker compose up -d
cp .env.example .env      # solo la primera vez
pnpm install
pnpm db:migrate           # migraciones + roles + RLS + colas + catálogo
pnpm test
```
