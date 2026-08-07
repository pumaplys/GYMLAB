# Estado del proyecto

> Última actualización: **2026-08-07** · **Fase final en marcha** · B1, B3 y B5
> cerrados; el siguiente es el correo real

Documento de continuidad: qué está hecho, qué está a medias y cuál es el
siguiente paso. Se actualiza al final de cada sesión de trabajo.

---

## Dónde estamos

| Fase | Estado |
|---|---|
| Fase 0 — cimientos | ✅ cerrada |
| Fase 1 — MVP, 7 módulos | ✅ **cerrada** |
| Fase 2 — panel web | 🔵 **en marcha**: cliente de la API, autenticación y socios en `main` |
| Fase final — cerrar para un piloto | 🔵 **en marcha**: B1, B3 y B5 cerrados |

**328 tests** (40 de aislamiento e integridad + 252 de la API + 36 del cliente de
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

> **El valor de negocio de cada vertical vive en [`02-producto.md`](02-producto.md)**,
> que es la referencia comercial. Este documento es el estado técnico.

Seis verticales completas: **entrar —y volver a entrar si se olvida la
contraseña—, aceptar una invitación, el ciclo entero de un socio** —listar,
abrir su ficha, editar, invitarle a crear cuenta, darle de baja y reactivarlo—,
**su cuota** —estado, alta, cobro e historial— y **el personal**: invitar, ver
quién trabaja aquí, revocar invitaciones pendientes y **retirarle el acceso a
alguien que ya está dentro**.

| Pieza | Qué resolvió |
|---|---|
| `packages/api-client` | Ata cada URL con el tipo de su respuesta y **la valida en ejecución**. Era el hueco de ADR-0003: los tipos existían para las *formas*, no para las *llamadas* |
| Sesión por cookie | `httpOnly`, así que el panel no puede leerla — un XSS tampoco. La consecuencia es que **no hay forma de saber si hay sesión sin preguntar al servidor** |
| `RutaPrivada` | No protege nada, y está escrito así en el fichero: el panel son ficheros estáticos y cualquiera puede saltárselo. Lo que hace es no pintar pantallas que la API va a rechazar |
| `/accept-invitation` | Los dos caminos de ADR-0010 **sin salir de la pantalla**: mandar a `/login` y volver obligaría a arrastrar el token de invitación por una URL de vuelta, y ese token es el que da acceso al gimnasio |
| Ficha de socio | Las acciones que ya existían en la API y no tenían con qué llamarse. Solo se envían **los campos que cambian**, y vaciar uno se bloquea con una explicación en lugar de fingir que se guardó |
| Cuota en la ficha | El estado **se pregunta, no se deduce**: «al corriente» o «vencida» los calcula el servidor en la zona del gimnasio. Y el dinero no pasa por coma flotante — `Number('19.99') * 100` da `1998.9999999999998` |
| Personal | El desplegable de roles se pinta con `CAN_INVITE`, **la misma matriz que aplica el servidor**. Comprobado por los dos lados: recepción solo ve «entrenador», y la misma petición por fuera del panel responde 403 |
| Retirar el acceso | La pertenencia **se termina, no se borra**, y el índice único es **parcial** —solo entre las vigentes— para que volver a contratar cree una etapa nueva sin perder la anterior. Surte efecto en la siguiente petición: `AuthGuard` comprueba la pertenencia vigente en cada una |
| Recuperar la contraseña | La confirmación **no puede decir que se ha enviado un correo**: el servidor responde igual exista la cuenta o no, así que afirmarlo convertiría el formulario en un comprobador de quién está dado de alta. Dice «si ese correo tiene cuenta…», que es todo lo que consta |

### Personal activo e invitaciones son dos listas, no una

Es la distinción que costó entender, y explica por qué el panel estuvo un PR
entero sin poder retirar a nadie:

| | |
|---|---|
| **Invitación** | Una **promesa**. Puede caducar, revocarse o no aceptarse nunca. Va dirigida a un correo |
| **Personal activo** | Un **hecho**. Quién tiene acceso ahora mismo. Va referido a una persona con cuenta |

`invitationSchema` ni siquiera lleva `userId` — no puede, porque cuando se crea
la invitación esa cuenta puede no existir. Deducir el presente a partir del
historial de invitaciones era el error de modelo que dejaba al panel sin saber a
quién retirar.

Se ve en pantalla: al retirarle el acceso a alguien, **desaparece de «Personal
activo» y su invitación sigue figurando como «Aceptada»**. Las dos cosas son
ciertas a la vez.

### Por qué el detalle vive en `?id=` y no en `/socios/[id]`

Es consecuencia de la exportación estática, y se comprobó construyendo en vez de
suponiendo. Los tres intentos y lo que respondió `next build`:

| Intento | Resultado |
|---|---|
| `/socios/[id]` a secas | `is missing "generateStaticParams()" so it cannot be used with "output: export"` |
| `dynamicParams = true` | `cannot be used with "output: export"` |
| `generateStaticParams()` devolviendo `[]` | El mismo error del primero: una lista vacía cuenta como no tenerlo |

El motivo de fondo no es ninguno de esos mensajes, y conviene decirlo con
precisión: **la única estrategia que la exportación estática ofrece para una
ruta dinámica es generar sus páginas durante la construcción**, y esa estrategia
no encaja con un sistema multi-tenant.

No encaja por dos razones distintas, y basta cualquiera de las dos:

- **El dato no existe cuando se construye.** Las fichas se crean, se dan de baja
  y cambian a diario, y son de cada gimnasio. Un paquete construido el lunes no
  puede contener las rutas de los socios dados de alta el martes.
- **Y si se generaran, el paquete dejaría de ser neutral.** Pasaría a contener
  la lista de identificadores de socios de todos los gimnasios, en un artefacto
  que se sirve igual a cualquiera. La separación entre gimnasios es del servidor
  —RLS y sesión—, y el frontend no debe cargar con material que la contradiga.

La otra salida sería una reescritura en el hosting, lo que añadiría un **segundo
requisito de despliegue** al que ya existe —un solo origen— a cambio de una URL
más bonita. La dirección con `?id=` sigue siendo compartible y marcable, que es
lo que se quería de verdad.

### Cuando el frontend descubre algo del backend

La vertical de cuotas destapó dos cosas que llevaban desde la Fase 1 sin verse,
y de ahí sale la regla de trabajo para lo que queda de proyecto.

**Un contrato que no describía la realidad.** `POST payments` devuelve
`{payment, dues}` y no un pago suelto — deliberado, porque con una deuda de
varios meses cobrar uno *no* pone al corriente y el mostrador tiene que verlo en
ese momento. Pero `contracts` no lo decía. Nadie se había dado cuenta porque el
único consumidor eran los tests, **que leen el cuerpo sin validarlo**. Lo delató
el cliente del panel, con los diez campos a `undefined` y la ruta exacta.

**Un flujo imposible por permisos.** Recepción podía dar de alta una cuota pero
no leer el catálogo de planes del que sale el `planId`: podía ejecutar la acción
y no elegir. El catálogo estaba cerrado a `owner` junto con crear y editar.

> **La regla, y se mantiene:**
>
> 1. Si el frontend encuentra un **contrato incompleto**, primero se demuestra
>    el problema y después se propone la modificación mínima. Se corrige
>    `contracts` para que describa lo que el backend ya hace; **nunca** se
>    adapta el cliente a un comportamiento implícito.
> 2. Si necesita un **permiso** que no existe, primero se demuestra que el flujo
>    queda bloqueado —con la petición real y su 403—, se propone el cambio
>    mínimo y **se consulta antes de tocar la autorización**.
> 3. **Nada de ampliar el backend por anticipación.**

Esto es lo que `packages/api-client` vino a comprar. Si el frontend tapara estos
casos adaptándose, el paquete dejaría de servir para lo único que justifica su
existencia.

**Dos fallos que solo aparecieron al ejecutarlo**, y que conviene recordar
porque ninguno lo habría visto una lectura del código:

- Entre iniciar sesión y vincular hay una ventana en la que la sesión ya existe
  pero el vinculado sigue en vuelo. La pantalla, que decidía mirando solo «¿hay
  sesión?», ofrecía un botón que lanzaba un segundo intento con el mismo token.
  Medido con un observador en el navegador: **241 ms**. Un primer arreglo lo
  dejó en 98, que es la prueba de que acertar con el instante no era la
  solución; la cura fue que la pantalla **sepa** en qué paso está.
- Al sustituirse una pantalla por otra tras un envío, **el foco se quedaba en un
  botón que ya no existe**. Con teclado se vuelve al principio del documento;
  con lector de pantalla, nadie anuncia el cambio.

**El origen de la API es una ruta relativa (`/v1`) por defecto.** No es
comodidad: es el requisito de un solo origen convertido en código. Un dominio
absoluto por defecto funcionaría en el entorno de quien lo escribiera y fallaría
callado en los demás.

Comprobado contra la API real, no solo compilado: credenciales malas y buenas,
30 socios sembrados, paginación, búsqueda, alta con validación local y de
servidor, salir, y la vuelta a `/socios` sin sesión. Un entrenador ve una
pantalla que se lo explica, y **la misma petición hecha por fuera del panel
responde 403**, que es donde de verdad vive la autorización.

Y la garantía de ADR-0010, comprobada de extremo a extremo y no solo en los
tests: se intentó fijar una contraseña nueva sobre una cuenta existente usando
su invitación, y después se entró con **la contraseña original**. Intacta.

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
| **El panel cubre socios y sus cuotas, no el producto** | Rutinas, progreso, accesos y panel del dueño existen en la API y no tienen pantalla | Según vayan haciendo falta |
| **Planes: se leen, no se gestionan** | Recepción y dueño ven el catálogo para cobrar, pero **crear, editar y archivar planes sigue siendo solo por API**. Un gimnasio nuevo no puede montar sus precios desde el panel | Pantalla de planes, del dueño |
| **Congelar, cancelar y anular** | Congelar una cuota por lesión, cancelarla y anular un pago mal apuntado tienen endpoint y no tienen pantalla. Anular es del dueño y es corrección contable | Cada uno con su vertical |
| **Retirar a un entrenador deja a sus socios sin él** | La asignación sobrevive, así que esos socios apuntan a alguien que ya no entra. Fue una decisión consciente: es preferible a que un gimnasio no pueda cortar un acceso por no haber reasignado antes. Hoy **no hay pantalla que lo muestre** | Con la vertical de entrenadores |
| **Notas, exportación RGPD y borrado sin pantalla** | Tienen endpoint desde la Fase 1. El borrado es irreversible y la exportación es un flujo legal: cada uno merece su propia vertical, no un botón de más en la ficha | Cuando toque, y por separado |
| **No se puede vaciar un campo de la ficha** | `updateMemberSchema` hace los campos opcionales, **no anulables**: omitir uno significa «no lo toques» y no hay forma de decir «bórralo». El panel lo bloquea con una explicación en vez de fingir que se guardó | Es una decisión del backend, y el frontend ya la ha topado |
| **El socio aterriza en una pantalla que no es suya** | Al aceptar, un `member` acaba en `/socios` y lee «esta sección no es para tu rol». Es correcto —la autorización manda— pero su portal no existe todavía | Cuando llegue `apps/socio` |
| **ADR-0014 sin escribir** | `docs/05-decision-arquitectura-frontend.md` sigue siendo un documento de decisión. Sus cuatro decisiones ya están aplicadas en el código, así que el documento se ha quedado por detrás de la realidad | Ya, y el fichero desaparece al convertirse |
| **`typecheck` de `apps/web` no puede correr a la vez que su `build`** | Su `tsconfig` incluye `.next/types/**`, que genera `next build`. En un `turbo run build typecheck` **en la misma invocación**, `tsc` lee ese directorio a medias y falla con `Cannot find module './routes.js'`. CI no lo sufre porque son pasos separados, y por eso llevaba ahí sin verse | Cuando alguien encadene las dos tareas en un solo comando |
| **`ignoreDeprecations: "6.0"`** | `tsup` inyecta un `baseUrl` propio al generar los `.d.ts` | Al actualizar `tsup` |

### Lo que hay que tener presente

**Un gimnasio se puede poner en marcha entero desde el producto**, y eso es lo
nuevo. El dueño se da de alta, invita a su gente, y esa gente entra por su
cuenta: si no tenía cuenta la crea, y si ya la tenía —porque trabaja en otro
gimnasio— añade el nuevo sin tocar su contraseña.

Y **recepción ya tiene su jornada cubierta de punta a punta**: dar de alta a
alguien, buscarlo, corregir un dato, invitarle a crear cuenta, ponerle su cuota,
cobrarle y darle de baja. Sin salir del panel y sin llamar al dueño.

Lo que falta para un piloto ya no es poder usarlo, es **cuánto** se puede hacer:
las rutinas, el progreso, los accesos y el panel del dueño siguen siendo API sin
pantalla, y los precios todavía se montan a mano.

**La deuda de entregabilidad que quedaba está cerrada:** un gimnasio ya puede
incorporar a su gente **y echarla**. Quien pierde el acceso lo pierde en la
siguiente pantalla que toque, sin esperar a que caduque su sesión.

Y desde la auditoría, **quien pierde su contraseña puede volver.** Era el único
bloqueo del que no se salía: sin pantalla de recuperación, un cliente legítimo
se quedaba fuera de su gimnasio de forma definitiva.

Y queda un detalle que conviene no perder de vista: **el socio todavía no tiene
sitio propio.** Acepta su invitación, entra, y se encuentra con que el panel no
es para él. Es correcto y es honesto, pero es media experiencia hasta que exista
su portal.

---

## Fase final: terminar, no añadir

> Desde el 5 de agosto de 2026 el criterio cambia. **Solo entran cambios que
> hagan falta para poder entregar GYMLAB a un gimnasio piloto**: fallos, deudas
> de entregabilidad, UX crítica y funcionalidades imprescindibles.
>
> Todo lo demás va al backlog, por bueno que parezca.

### La auditoría (6 de agosto de 2026)

Hecha leyendo el código, no esta lista. La foto que la resume: **82 endpoints en
la API, 9 pantallas en el panel.** La mayor parte de lo pendiente es eso.

**Bloqueantes para un piloto**

| # | Qué | Estado |
|---|---|---|
| B1 | **Recuperar la contraseña no tenía pantalla** | ✅ **cerrado** |
| B2 | **El envío de correo nunca se ha ejecutado.** Sin `RESEND_API_KEY` el proceso **no arranca** en producción, y sin dominio verificado lo que salga acaba en spam | abierto, **el siguiente** |
| B3 | **Nada sirve el panel bajo el mismo origen** | ✅ **cerrado** — estrategia A |
| B4 | **Los precios se montan a mano.** Crear, editar y archivar planes sigue siendo solo por API | abierto |
| B5 | **`trust proxy` sin configurar** | ✅ **cerrado** con B3 |

**Importantes, no bloqueantes** — pantalla de `/verify-email`, textos de
consentimiento, congelar/cancelar/anular, notas y exportación RGPD, el
entrenador retirado que deja socios apuntándole, campos que no se pueden vaciar,
el socio que aterriza donde no le toca, ADR-0014, y el choque entre `typecheck`
y `build`. Todos están arriba con su motivo.

**Visión futura** — `apps/socio`, las pantallas de rutinas, progreso, accesos y
panel del dueño, la app móvil, Stripe, varios roles por persona.

### Lo que viene después de los bloqueantes: la fase de diseño

> **Cerrado B2 y verificada la aplicación en producción, empieza oficialmente la
> fase de diseño visual de GYMLAB.** A partir de ahí se deja de priorizar
> backend.
>
> Y el primer paso **no** es una pantalla: es un **sistema visual general** —
> identidad, tipografía, color, retícula, componentes, navegación y
> comportamiento responsive. Sin él, cada pantalla improvisa su propio estilo y
> lo que queda no parece un producto, sino varias pantallas seguidas.
>
> Después, pantalla por pantalla: layout, navegación, dashboard, tarjetas.

Se anota aquí para que no se pierda mientras se cierra el backend. **No es
decoración:** un gimnasio decide en los primeros diez segundos si el producto
que le enseñan parece serio.

### B3, cerrado: el mismo origen deja de ser configuración

Estrategia **A** de [`06-despliegue.md`](06-despliegue.md): la API sirve el panel
exportado y todo viaja en un contenedor. La guía está en
[`07-despliegue-vps.md`](07-despliegue-vps.md).

El argumento de fondo es el de siempre aquí: **una garantía estructural no se
olvida.** No hay forma de desplegar mal el origen, porque es el mismo proceso —
igual que RLS impide la fuga entre gimnasios sin depender de acordarse, y que
`link-invitation` no puede tocar una contraseña porque no la lleva en su
contrato.

Verificado levantando la pila entera desde cero, no solo construyendo la imagen:
Postgres propio, migraciones aplicadas al arrancar, RLS comprobado, panel
servido, alta de gimnasio, y `GET /v1/auth/me` respondiendo 200 con su cookie.

### Los tres fallos que solo aparecieron al desplegar

Ninguno se ve leyendo el código, y el primero da miedo:

| Qué | Por qué importa |
|---|---|
| **`extensions: ['html']` no hace nada en Express 5** | `serve-static` 2.x dejó de reenviar esa opción —la palabra no aparece en su código— y la acepta sin quejarse. Como la exportación genera `socios.html` y no `socios/index.html`, **todas** las pantallas caían en el `index.html` de respaldo. `/socios` respondía 200 con la portada, que redirige a `/socios`, y parecía correcto. **`/reset-password?token=…` habría perdido el token**: B1 no habría funcionado en producción. Se descubrió comparando contenidos, no códigos de estado |
| **El límite de intentos se esquivaba con una cabecera** | `ipDe` leía el primer valor de `x-forwarded-for`, que lo escribe quien llama. Medido: rotándola, **12 de 12 intentos fallidos pasaron**; con la cabecera fija, 429 al sexto. No se arreglaba solo en producción, porque los proxies **añaden** a esa cabecera en vez de reemplazarla |
| **Una variable vacía no es una variable ausente** | Las opcionales son `.min(1).optional()`, y una cadena vacía sí está. `docker compose` sustituye `${VAR:-}` por vacío, así que `HEALTH_CONSENT_VERSION=` impedía arrancar. A `RESEND_API_KEY` le habría pasado igual — justo antes de B2 |

**Y un efecto secundario que conviene tener presente:** el umbral por IP —20
intentos en 15 minutos, sumando todas las cuentas— **nunca se aplicaba sin proxy
delante**, porque sin `x-forwarded-for` no había IP. Ahora siempre la hay. Era
una protección dormida, y al despertarla los tests se pusieron rojos porque
hacen muchos más de 20 inicios de sesión desde la misma dirección.

> ⚠️ **Queda sin decidir si 20 es el número correcto.** Un gimnasio entero sale a
> internet por una sola IP, y ese contador **no se limpia al acertar la
> contraseña**: 21 inicios de sesión legítimos del mostrador en 15 minutos
> dejarían al gimnasio fuera. No se ha tocado el umbral porque es política de
> seguridad y toca consultarlo.

**Las tres alternativas están comparadas en
[`06-despliegue.md`](06-despliegue.md)**, sin decidir ninguna. De ahí sale un
matiz que corrige lo escrito antes en la tabla de deuda: con la configuración
por defecto de Better Auth la cookie es `SameSite=Lax`, así que con orígenes
separados **no la manda ningún navegador**, no solo Safari. Safari entra en
escena si se fuerza `SameSite=None`, que es el remedio que convierte la sesión
en una cookie de terceros.

### B1, cerrado: quien olvidaba su contraseña se quedaba fuera para siempre

Lo encontró la auditoría, y no estaba en esta lista. La API construye
`${WEB_APP_URL}/reset-password?token=...` desde la Fase 1 y **esa ruta no
existía**: comprobado en ejecución, el enlace del correo respondía `404`.

No era cosmético. `forgot-password` es la **única** vía de vuelta —nadie repone
una contraseña desde el panel, ni el dueño del gimnasio—, así que un cliente
legítimo que la olvidara perdía el acceso a su propio gimnasio de forma
definitiva. Llevaba ahí sin verse porque los correos nunca se enviaron; el
comentario de `env.ts` ya avisaba de que el enlace llevaba «a un sitio sin
interfaz», se corrigió el enlace y la pantalla nunca se escribió.

**Lo que la pantalla no puede decir.** El servidor responde `ok` exista la
cuenta o no, y es deliberado: si respondiera distinto, el formulario sería un
comprobador de quién está dado de alta en la plataforma. Como la respuesta no lo
sabe, la pantalla tampoco puede afirmarlo — dice «si **ese correo** tiene cuenta
en GYMLAB…», nunca «te hemos enviado un correo». Verificado por los dos lados:
con una dirección inexistente sale la misma pantalla y **no se encola ningún
envío**.

Restablecer **no abre sesión**, porque quien abre el enlace puede no ser quien
lo pidió. Y entrar después es la comprobación de que la contraseña quedó como se
quería.

**Los dos fallos que salieron al recorrerla**, y que no se ven leyendo el
código:

| Qué pasaba | Por qué |
|---|---|
| Con `?token=%20` el botón **no hacía nada** — ni aviso, ni petición | `useFormulario` descarta los campos vacíos antes de validar, así que el esquema se quejaba de `token`, un campo que esa pantalla no pinta. El mensaje iba a parar donde nadie lo ve |
| Restablecer estando dentro pasaba por `/socios`, que respondía 401 | Cambiar la contraseña cierra **todas** las sesiones, y el panel solo pregunta `me()` al abrirse: seguía creyéndose identificado. Ahora la pantalla lo dice en vez de dejar que se descubra por un rechazo |

Es el mismo patrón que la carrera de 241 ms de `/accept-invitation`: **una
pantalla que deduce el estado en lugar de saberlo.**

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

En desarrollo son **dos orígenes** —`next dev` en el 3000 y la API en el 3001—,
y por eso sigue haciendo falta CORS. En producción es uno solo: la API sirve el
panel exportado y CORS no interviene.

## Cómo desplegarlo

```bash
docker compose -f docker/compose.produccion.yml --env-file .env up -d --build
```

Un contenedor con la API y el panel, más su Postgres. Las migraciones, las
políticas RLS y las colas se aplican al arrancar, y los tres pasos son
idempotentes. La guía completa —VPS, dominio, TLS con Caddy y las
comprobaciones— está en [`07-despliegue-vps.md`](07-despliegue-vps.md).

> `--env-file .env` no sobra: Compose busca ese fichero junto al de compose, que
> vive en `docker/`. Sin la opción sustituye todos los secretos por cadenas
> vacías.

Para entrar al panel hace falta una cuenta, y todavía no hay pantalla que la
cree. El primer gimnasio se da de alta contra la API:

```bash
curl -X POST http://localhost:3001/v1/auth/register-gym -H "content-type: application/json" -d '{"organizationName":"Mi cadena","gymName":"Mi gimnasio","ownerName":"Nombre Apellido","email":"tu@correo.test","password":"una-contrasena-larga","platformCode":"gymlab-piloto-2026"}'
```

El `platformCode` es el de `.env`. Después ya se entra por `/login` con ese
correo y esa contraseña.
