# Estado del proyecto

> Última actualización: **2026-08-04** · **Fase 2 en marcha** · La primera vertical
> del panel está en `main`

Documento de continuidad: qué está hecho, qué está a medias y cuál es el
siguiente paso. Se actualiza al final de cada sesión de trabajo.

---

## Dónde estamos

| Fase | Estado |
|---|---|
| Fase 0 — cimientos | ✅ cerrada |
| Fase 1 — MVP, 7 módulos | ✅ **cerrada** |
| Fase 2 — panel web | 🔵 **en marcha**: cliente de la API, autenticación y socios en `main` |

**294 tests** (40 de aislamiento e integridad + 238 de la API + 16 del cliente de
la API). `build`, `typecheck`, `lint` y `test` en verde en local y en CI.
**13 ADR**, y uno pendiente de escribir — ver la deuda.

El objetivo declarado de la Fase 1 era *«tres gimnasios piloto usándolo a diario»*.
El alcance funcional está completo; **eso todavía no ha ocurrido**, y es la
siguiente prueba de fuego. Lo que falta para poder ponerlo en manos de alguien
está en la sección de deuda.

**Lo que ha cambiado en esta sesión:** hasta ahora la API estaba completa y nadie
podía abrirla sin escribir peticiones a mano. Ya no: hay panel, se entra con
usuario y contraseña, y recepción puede ver y dar de alta socios.

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

## El panel web

Existe desde esta sesión, y con él la primera vertical completa: **entrar, ver a
los socios y dar de alta a uno.**

| Pieza | Qué resolvió |
|---|---|
| `packages/api-client` | Ata cada URL con el tipo de su respuesta y **la valida en ejecución**. Era el hueco de ADR-0003: los tipos existían para las *formas*, no para las *llamadas* |
| Sesión por cookie | `httpOnly`, así que el panel no puede leerla — un XSS tampoco. La consecuencia es que **no hay forma de saber si hay sesión sin preguntar al servidor** |
| `RutaPrivada` | No protege nada, y está escrito así en el fichero: el panel son ficheros estáticos y cualquiera puede saltárselo. Lo que hace es no pintar pantallas que la API va a rechazar |

**El origen de la API es una ruta relativa (`/v1`) por defecto.** No es
comodidad: es el requisito de un solo origen convertido en código. Un dominio
absoluto por defecto funcionaría en el entorno de quien lo escribiera y fallaría
callado en los demás.

Comprobado contra la API real, no solo compilado: credenciales malas y buenas,
30 socios sembrados, paginación, búsqueda, alta con validación local y de
servidor, salir, y la vuelta a `/socios` sin sesión. Un entrenador ve una
pantalla que se lo explica, y **la misma petición hecha por fuera del panel
responde 403**, que es donde de verdad vive la autorización.

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

### Y el que salió a la luz solo (2026-08-04)

El método vale para lo que uno decide comprobar. Esto lo encontró el reloj.

Seis pruebas de la Fase 1 escribían el vencimiento de una cuota con
`now()::date` —la fecha del **servidor**—, mientras el dominio calcula los días
que faltan en la zona del **gimnasio**, que es lo correcto. Con el servidor en
UTC y el gimnasio en `Europe/Madrid`, entre las 22:00 y las 24:00 UTC de verano
el gimnasio ya está en el día siguiente: la prueba escribía `+2` y el servicio
leía `1`.

Es decir: **una prueba llevaba en rojo dos horas al día desde que se escribió**,
y nadie lo vio porque CI casi nunca corre a esa hora. La delató una ejecución a
las 22:25 UTC.

Dos cosas que conviene recordar de ahí:

- De los seis sitios, **solo uno fallaba**. Los otros cinco tienen el mismo error
  y pasan por casualidad, porque sus aserciones no eran sensibles a un día de
  desplazamiento. Estaban bien por suerte, no por diseño.
- `billing.e2e.test.ts` **ya lo hacía bien**. Alguien aprendió la lección en su
  momento y no llegó a los demás ficheros — por eso el arreglo trae un
  guardarraíl (`zona-horaria.test.ts`) y no solo la corrección.

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
| [0013](adr/0013-el-qr-se-genera-desde-la-web-del-socio.md) | El QR lo genera el socio desde una web, no desde una app | Saca el piloto de la cola de revisión de las tiendas |

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
| **Un solo origen en producción** 🔒 | **Requisito de despliegue, no preferencia:** frontend y API deben servirse bajo el mismo dominio. El modelo de sesión se apoya en una cookie de primera parte; con orígenes separados, Safari la bloquea y el portal del socio deja de funcionar en la puerta del gimnasio. Comprobar que el hosting lo permite **antes de contratarlo** | **Al elegir hosting** |
| **Agregados de asistencia** ⏳ | `access_events` se purga según la retención de cada gimnasio (12 meses por defecto). **Es la única deuda irreversible de la lista:** pasada la purga, el detalle no vuelve, así que no es una optimización sino un requisito previo | **Antes de la primera purga real** |
| **`slug` es el UUID del gimnasio** | La columna existe para URLs legibles y hoy no aporta nada | Cuando haya URLs públicas |
| **Un rol por persona y gimnasio** | Un dueño que además entrene no puede tener socios asignados | Si un piloto lo pide |
| **`/accept-invitation` no existe** 🔒 | **El correo de invitación ya apunta ahí.** Hoy la única forma de aceptar una invitación es llamar a la API a mano, así que **nadie puede darse de alta como socio ni como personal por su cuenta** | Es la siguiente pantalla, antes que ninguna otra |
| **El panel cubre una vertical, no el producto** | Entrar, listar socios y dar de alta. Ficha, edición, baja, invitar, cuotas, rutinas, progreso y panel del dueño existen en la API y no tienen pantalla | Según vayan haciendo falta |
| **ADR-0014 sin escribir** | `docs/05-decision-arquitectura-frontend.md` sigue siendo un documento de decisión. Sus cuatro decisiones ya están aplicadas en el código, así que el documento se ha quedado por detrás de la realidad | Ya, y el fichero desaparece al convertirse |
| **`ignoreDeprecations: "6.0"`** | `tsup` inyecta un `baseUrl` propio al generar los `.d.ts` | Al actualizar `tsup` |

### Lo que hay que tener presente

**El producto ya se puede abrir**, que es lo que cambió esta sesión. Pero solo
por quien ya tenga cuenta: sin la pantalla de aceptar invitaciones, dar de alta a
la primera recepcionista de un gimnasio piloto exige llamar a la API a mano. Es
la deuda que hay entre esto y enseñárselo a alguien.

---

## Cómo levantar el entorno

```bash
docker compose up -d
cp .env.example .env      # solo la primera vez
pnpm install
pnpm db:migrate           # migraciones + roles + RLS + colas + catálogo
pnpm test
pnpm dev                  # API en :3001, panel en :3000
```

Para entrar al panel hace falta una cuenta, y todavía no hay pantalla que la
cree. El primer gimnasio se da de alta contra la API:

```bash
curl -X POST http://localhost:3001/v1/auth/register-gym -H "content-type: application/json" -d '{"organizationName":"Mi cadena","gymName":"Mi gimnasio","ownerName":"Nombre Apellido","email":"tu@correo.test","password":"una-contrasena-larga","platformCode":"gymlab-piloto-2026"}'
```

El `platformCode` es el de `.env`. Después ya se entra por `/login` con ese
correo y esa contraseña.
