# Auditoría funcional de GYMLAB por roles

> Auditoría, no propuesta de diseño. Todo lo que sigue está **confirmado leyendo
> el código**: controladores, servicios, esquema, guards, políticas RLS y el
> cliente de API. Ninguna capacidad se deduce de un nombre de fichero.
>
> **Nada implementado.** Este documento define qué falta para GYMLAB v1.

---

# A · Inventario de API

**82 endpoints** en 12 dominios. De ellos, el frontend consume **13 familias de
ruta** — todas del panel de gimnasio.

Cómo se leyó: los `@Roles` se extrajeron del método y, si no lo llevaba, de la
clase. `PÚBLICO` es `@Public()`. **«Cualquier rol»** significa que el controlador
no declara `@Roles`, y eso importa: `RolesGuard` devuelve `true` cuando no hay
roles requeridos, así que basta con estar autenticado.

Todo endpoint no público pasa por las cuatro barreras de ADR-0007
(AuthGuard → RolesGuard → TenantInterceptor → RLS) y toda ruta bajo `/gyms/:gymId`
exige gimnasio activo en la sesión — el `:gymId` de la URL **no** elige el tenant;
lo hace `activeGymId` de la fila de sesión.

## auth (10)

| Método | Ruta                      | Propósito                  | Roles      | Frontend                |
| ------ | ------------------------- | -------------------------- | ---------- | ----------------------- |
| POST   | `/auth/register-gym`      | Alta de gimnasio + dueño   | PÚBLICO    | ❌ no hay pantalla      |
| POST   | `/auth/login`             | Abrir sesión               | PÚBLICO    | ✅ `/login`             |
| POST   | `/auth/logout`            | Cerrar sesión              | cualquiera | ✅ `Marco`              |
| GET    | `/auth/me`                | Sesión, pertenencias y rol | cualquiera | ✅ `ProveedorSesion`    |
| POST   | `/auth/switch-gym`        | Cambiar gimnasio activo    | cualquiera | ✅ `Marco`              |
| POST   | `/auth/forgot-password`   | Pedir enlace               | PÚBLICO    | ✅ `/forgot-password`   |
| POST   | `/auth/reset-password`    | Fijar contraseña nueva     | PÚBLICO    | ✅ `/reset-password`    |
| POST   | `/auth/verify-email`      | Verificar correo           | PÚBLICO    | ❌                      |
| POST   | `/auth/accept-invitation` | Aceptar sin cuenta previa  | PÚBLICO    | ✅ `/accept-invitation` |
| POST   | `/auth/link-invitation`   | Aceptar con sesión abierta | cualquiera | ✅ `/accept-invitation` |

## socios (11)

| Método | Ruta                                  | Roles               | Frontend                           |
| ------ | ------------------------------------- | ------------------- | ---------------------------------- |
| POST   | `/gyms/:gymId/members`                | owner, receptionist | ✅ `/socios/nuevo`                 |
| GET    | `/gyms/:gymId/members`                | owner, receptionist | ✅ `/socios`                       |
| GET    | `/gyms/:gymId/members/:id`            | owner, receptionist | ✅ ficha                           |
| PATCH  | `/gyms/:gymId/members/:id`            | owner, receptionist | ✅ ficha                           |
| POST   | `/gyms/:gymId/members/:id/deactivate` | owner, receptionist | ✅ ficha                           |
| POST   | `/gyms/:gymId/members/:id/reactivate` | owner, receptionist | ✅ ficha                           |
| POST   | `/gyms/:gymId/members/:id/invite`     | owner, receptionist | ✅ ficha                           |
| POST   | `/gyms/:gymId/members/:id/notes`      | owner, receptionist | ❌ **sin pantalla**                |
| GET    | `/gyms/:gymId/members/:id/notes`      | owner, receptionist | ❌ **sin pantalla**                |
| GET    | `/gyms/:gymId/members/:id/export`     | owner               | ❌ **sin pantalla** (RGPD art. 20) |
| DELETE | `/gyms/:gymId/members/:id`            | owner               | ❌ **sin pantalla** (RGPD art. 17) |

## cuotas y pagos (10)

| Método          | Ruta                                          | Roles               | Frontend                                             |
| --------------- | --------------------------------------------- | ------------------- | ---------------------------------------------------- |
| GET/POST/DELETE | `/gyms/:gymId/members/:memberId/subscription` | owner, receptionist | ✅ parcial: alta sí, pausar/reanudar/cancelar **no** |
| POST            | `…/subscription/pause` · `…/resume`           | owner, receptionist | ❌ **sin pantalla**                                  |
| GET             | `/gyms/:gymId/members/:memberId/dues`         | owner, receptionist | ✅ ficha                                             |
| POST/GET        | `/gyms/:gymId/members/:memberId/payments`     | owner, receptionist | ✅ ficha                                             |
| POST            | `/gyms/:gymId/payments/:id/void`              | owner               | ❌ **sin pantalla** (la ficha ya pinta «Anulado»)    |

## planes (4) — ✅ cubierto entero por `/planes`

## personal e invitaciones (6) — ✅ cubierto por `/personal`, salvo que el listado de staff no ofrece nada más

## entrenadores (9)

| Método    | Ruta                                    | Roles               | Frontend |
| --------- | --------------------------------------- | ------------------- | -------- |
| GET       | `/gyms/:gymId/trainers` · `/:id`        | owner, receptionist | ❌       |
| PATCH     | `/gyms/:gymId/trainers/:id`             | owner               | ❌       |
| POST      | `…/:id/deactivate` · `…/:id/reactivate` | owner               | ❌       |
| GET/POST  | `/gyms/:gymId/trainers/:id/members`     | owner, receptionist | ❌       |
| DELETE    | `…/:id/members/:memberId`               | owner, receptionist | ❌       |
| GET/PATCH | `/me/trainer`                           | **trainer**         | ❌       |
| GET       | `/me/trainer/members` · `/:memberId`    | **trainer**         | ❌       |

## entrenamiento (11)

| Método                | Ruta                                      | Roles          | Frontend |
| --------------------- | ----------------------------------------- | -------------- | -------- |
| GET/POST/PATCH/DELETE | `/gyms/:gymId/exercises`                  | owner, trainer | ❌       |
| GET/POST/PATCH/DELETE | `/gyms/:gymId/routines`                   | owner, trainer | ❌       |
| POST/DELETE           | `/gyms/:gymId/routines/:id/members`       | owner, trainer | ❌       |
| GET                   | `/gyms/:gymId/members/:memberId/routines` | owner, trainer | ❌       |
| GET                   | `/me/routines`                            | cualquiera     | ❌       |

## progreso y consentimiento (7)

| Método          | Ruta                                      | Roles          | Frontend |
| --------------- | ----------------------------------------- | -------------- | -------- |
| GET/POST/DELETE | `/gyms/:gymId/members/:memberId/progress` | owner, trainer | ❌       |
| GET/POST/DELETE | `…/health-consent`                        | owner, trainer | ❌       |
| GET/POST        | `/me/progress`                            | cualquiera     | ❌       |

## accesos (3)

| Método | Ruta                         | Roles                             | Frontend |
| ------ | ---------------------------- | --------------------------------- | -------- |
| POST   | `/me/access/token`           | cualquiera (exige ficha de socio) | ❌       |
| POST   | `/gyms/:gymId/access/verify` | owner, receptionist               | ❌       |
| GET    | `/gyms/:gymId/access/events` | owner, receptionist               | ❌       |

## panel y ajustes (3)

| Método    | Ruta                     | Roles | Frontend |
| --------- | ------------------------ | ----- | -------- |
| GET       | `/gyms/:gymId/dashboard` | owner | ❌       |
| GET/PATCH | `/gyms/:gymId/settings`  | owner | ❌       |

## socio, autoservicio (5)

| Método    | Ruta                 | Roles      | Frontend |
| --------- | -------------------- | ---------- | -------- |
| GET/PATCH | `/me/member-profile` | cualquiera | ❌       |
| GET       | `/me/dues`           | cualquiera | ❌       |
| GET       | `/me/routines`       | cualquiera | ❌       |
| GET/POST  | `/me/progress`       | cualquiera | ❌       |
| POST      | `/me/access/token`   | cualquiera | ❌       |

---

# B · Matriz de capacidades por rol

Solo capacidades **demostradas en código**. `BE` = backend; `FE` = frontend.

| Capacidad                                   | Dueño | Recep.  | Entren. | Socio | BE  | FE  |
| ------------------------------------------- | :---: | :-----: | :-----: | :---: | :-: | :-: |
| Entrar, cerrar sesión, recuperar contraseña |  ✅   |   ✅    |   ✅    |  ✅   | ✅  | ✅  |
| Cambiar de gimnasio activo                  |  ✅   |   ✅    |   ✅    |  ✅   | ✅  | ✅  |
| Ver y buscar socios                         |  ✅   |   ✅    |    —    |   —   | ✅  | ✅  |
| Crear y editar socio                        |  ✅   |   ✅    |    —    |   —   | ✅  | ✅  |
| Dar de baja / reactivar socio               |  ✅   |   ✅    |    —    |   —   | ✅  | ✅  |
| Invitar a un socio a crear cuenta           |  ✅   |   ✅    |    —    |   —   | ✅  | ✅  |
| Notas internas del socio                    |  ✅   |   ✅    |    —    |   —   | ✅  | ❌  |
| Exportar datos personales (RGPD)            |  ✅   |    —    |    —    |   —   | ✅  | ❌  |
| Borrar socio (derecho al olvido)            |  ✅   |    —    |    —    |   —   | ✅  | ❌  |
| Gestionar planes                            |  ✅   |   ver   |    —    |   —   | ✅  | ✅  |
| Alta de cuota y registrar pago              |  ✅   |   ✅    |    —    |   —   | ✅  | ✅  |
| Pausar / reanudar / cancelar cuota          |  ✅   |   ✅    |    —    |   —   | ✅  | ❌  |
| Anular un pago                              |  ✅   |    —    |    —    |   —   | ✅  | ❌  |
| Invitar y retirar personal                  |  ✅   | parcial |    —    |   —   | ✅  | ✅  |
| Ver entrenadores y asignarles socios        |  ✅   |   ✅    |    —    |   —   | ✅  | ❌  |
| Activar / desactivar entrenador             |  ✅   |    —    |    —    |   —   | ✅  | ❌  |
| Ver **mis** socios asignados                |   —   |    —    |   ✅    |   —   | ✅  | ❌  |
| Biblioteca de ejercicios                    |  ✅   |    —    |   ✅    |   —   | ✅  | ❌  |
| Crear y editar rutinas                      |  ✅   |    —    |   ✅    |   —   | ✅  | ❌  |
| Asignar rutina a un socio                   |  ✅   |    —    |   ✅    |   —   | ✅  | ❌  |
| Registrar progreso corporal de un socio     |  ✅   |    —    |   ✅¹   |   —   | ✅  | ❌  |
| Gestionar consentimiento de salud           |  ✅   |    —    |   ✅¹   |   —   | ✅  | ❌  |
| Ver **mi** rutina                           |   —   |    —    |    —    |  ✅   | ✅  | ❌  |
| Ver **mi** estado de cuota                  |   —   |    —    |    —    |  ✅   | ✅  | ❌  |
| Ver y editar **mi** perfil                  |   —   |    —    |    —    |  ✅   | ✅  | ❌  |
| Registrar y ver **mi** progreso             |   —   |    —    |    —    |  ✅   | ✅  | ❌  |
| Generar **mi** QR de acceso                 |   —   |    —    |    —    |  ✅   | ✅  | ❌  |
| Verificar QR en la puerta                   |  ✅   |   ✅    |    —    |   —   | ✅  | ❌  |
| Ver histórico de accesos del gimnasio       |  ✅   |   ✅    |    —    |   —   | ✅  | ❌  |
| Panel de métricas                           |  ✅   |    —    |    —    |   —   | ✅  | ❌  |
| Ajustes del gimnasio                        |  ✅   |    —    |    —    |   —   | ✅  | ❌  |
| Ver **mis** pagos                           |   —   |    —    |    —    |  ❌   | ❌  | ❌  |
| Ver **mis** accesos                         |   —   |    —    |    —    |  ❌   | ❌  | ❌  |

¹ Solo sobre socios asignados. Recepción **no** accede a datos de salud.

---

# C · Auditoría del entrenador

**Cómo se crea.** No hay alta directa. Se le invita con rol `trainer`
(`CAN_INVITE`: dueño y recepción pueden). Al aceptar, el punto de extensión
`TrainerProfileLink` crea el perfil. _«Un perfil sin cuenta no serviría de nada.»_

**Cómo entra.** Mismo `/auth/login` que todos. Sesión idéntica.

**Varios gimnasios.** Sí: `memberships` es por gimnasio, y `switch-gym` cambia el
activo. Puede ser entrenador en uno y otra cosa en otro.

**Qué socios ve.** Solo los asignados, y el aislamiento **no lo da RLS**. El
propio código lo dice: _«RLS aísla entre gimnasios. Dentro de uno no distingue
roles: el entrenador y el dueño son el mismo `gymlab_app` para PostgreSQL.»_ Lo
impone `TrainersService`, y todos sus métodos parten del `userId` de la sesión,
nunca de un id de la petición.

**Qué puede hacer**

|                                 | Endpoint                                        |
| ------------------------------- | ----------------------------------------------- |
| Ver su perfil y editarlo        | `GET/PATCH /me/trainer`                         |
| Listar sus socios               | `GET /me/trainer/members`                       |
| Abrir la ficha de un socio suyo | `GET /me/trainer/members/:memberId`             |
| Biblioteca de ejercicios        | CRUD en `/gyms/:gymId/exercises`                |
| Rutinas                         | CRUD en `/gyms/:gymId/routines`                 |
| Asignar y desasignar rutina     | `POST/DELETE /gyms/:gymId/routines/:id/members` |
| Rutinas de un socio             | `GET /gyms/:gymId/members/:memberId/routines`   |
| Progreso de un socio            | `GET/POST/DELETE …/progress`                    |
| Consentimiento de salud         | `GET/POST/DELETE …/health-consent`              |

**Qué NO puede.** Listado general de socios, cuotas, pagos, planes, personal,
invitaciones, panel, ajustes y accesos: todos exigen `owner`/`receptionist`.
Tampoco puede invitar a nadie (`CAN_INVITE.trainer` es `[]`).

**Aislamiento, verificado en tres capas**

1. `@Roles` deja fuera los dominios de gestión.
2. En los endpoints con `:memberId` que sí acepta —progreso y rutinas—, el
   servicio llama a `trainers.myMember(...)`, que lanza **404** si el socio no es
   suyo. Es 404 y no 403 a propósito: _«confirmar que la ficha existe ya sería
   filtrar información sobre socios ajenos.»_
3. RLS impide cualquier cruce entre gimnasios.

**Backend para entrenador v1: completo. No falta nada.**

## Pantallas mínimas — Entrenador v1

1. **Mis socios** — listado de asignados.
2. **Ficha del socio** — datos, su rutina activa y su progreso.
3. **Rutinas** — listado, alta y edición con ejercicios.
4. **Asignar rutina** — desde la rutina o desde el socio.
5. **Progreso** — registrar medición, con la puerta del consentimiento.
6. **Mi perfil** — especialidad y biografía.

Cinco de las seis se sostienen con `/me/trainer/*`, sin exponer ids ajenos.

---

# D · Auditoría del socio

**¿Tiene cuenta propia?** **Sí, opcionalmente.** Y conviene ser preciso, porque
el esquema lo es: _«UN SOCIO NO ES UN USUARIO.»_

```
users          identidad con credenciales.  OPCIONAL para un socio.
memberships    vínculo cuenta ↔ gimnasio con rol. Solo si tiene cuenta.
members        LA FICHA. Existe siempre, con o sin cuenta detrás.
```

Un gimnasio real tiene socios que nunca tendrán cuenta. Por eso `members.userId`
es _nullable_ y por eso dar de alta e invitar son dos acciones distintas.

**Cómo obtiene cuenta.** Recepción pulsa «Invitar a crear cuenta» en su ficha →
`POST /gyms/:gymId/members/:id/invite` → invitación con rol `member` **ligada a
`socio.id`** → al aceptarla se crean `users` + `memberships(role='member')` y se
rellena `members.user_id`. Un índice único parcial impide que una cuenta tenga
dos fichas en el mismo gimnasio.

**Cómo se autentica.** El mismo `/auth/login`. No hay nada específico de socio.

**Qué puede consultar hoy**

| Capacidad                                         | Endpoint                       | Estado           |
| ------------------------------------------------- | ------------------------------ | ---------------- |
| Su ficha, y editar teléfono y fecha de nacimiento | `GET/PATCH /me/member-profile` | ✅               |
| Su estado de cuota                                | `GET /me/dues`                 | ✅               |
| Sus rutinas asignadas                             | `GET /me/routines`             | ✅               |
| Su progreso corporal, leer y registrar            | `GET/POST /me/progress`        | ✅               |
| Su QR de acceso                                   | `POST /me/access/token`        | ✅               |
| **Su historial de pagos**                         | —                              | ❌ **no existe** |
| **Su historial de accesos**                       | —                              | ❌ **no existe** |

Del perfil solo puede cambiar teléfono y fecha de nacimiento: **no** el nombre
—dato de contrato, lo corrige recepción— ni el email, que es el vínculo con su
cuenta.

**Sin IDOR por construcción.** El controlador lo dice: _«Ruta aparte y SIN
`:gymId` a propósito: el socio nunca pasa por una URL con identificador de
gimnasio ni de ficha, así que no hay nada con lo que pueda probar suerte.»_ Todo
se resuelve por el `user_id` de la sesión.

**El QR, ya decidido en ADR-0013.** El token es opaco y solo dice _quién eres_,
no si puedes pasar — para que no se pueda generar estando al corriente y usarlo
después de vencer. Y la decisión de que se genere **desde web y no desde una app
nativa** ya está tomada y aceptada.

## Pantallas mínimas — Socio v1

1. **Mi carné** — QR con su caducidad. Es la pantalla de portada.
2. **Mi cuota** — estado, hasta cuándo cubre, si puede entrar hoy.
3. **Mi rutina** — rutinas asignadas con sus ejercicios.
4. **Mi progreso** — histórico y registrar una medición.
5. **Mi perfil** — ver, y editar lo editable.

Con lo que hay se pueden construir las cinco. «Mis pagos» y «Mis accesos»
necesitan backend nuevo.

---

# E · Capacidades sin frontend

**A · Imprescindibles para v1**

| Capacidad                                | Motivo                                   |
| ---------------------------------------- | ---------------------------------------- |
| Exportar datos personales (RGPD art. 20) | Obligación legal con datos reales        |
| Borrar socio (RGPD art. 17)              | Obligación legal                         |
| Asignar socios a entrenadores            | Sin esto, el entrenador no tiene a nadie |
| Todo el bloque de entrenador y de socio  | Son las dos experiencias que faltan      |

**B · Útiles, pueden esperar**

Pausar/reanudar/cancelar cuota · anular un pago · notas internas · panel de
métricas · ajustes del gimnasio · listado y baja de entrenadores.

**C · Backend interno, no necesita pantalla**

`/auth/verify-email` (se abre desde el correo) · `/auth/link-invitation` (ya lo
usa `/accept-invitation`) · `/health`.

**D · Requiere decisión de producto**

- **`/auth/register-gym` no tiene pantalla.** Hoy un gimnasio nuevo se da de alta
  con una llamada a la API. Para vender sin intervención hace falta pantalla; con
  alta manual, no.
- **Verificar QR en la puerta.** ¿Pantalla del panel en una tablet, o un lector
  dedicado? Cambia mucho el diseño.

---

# F · Backend que falta

Solo dos cosas, ambas para socio. **El entrenador no necesita nada.**

### 1 · `GET /me/payments` — su historial de pagos

- **Por qué:** «¿pagué en enero?» es la pregunta que más se hace en un mostrador,
  y hoy solo la puede responder recepción.
- **Impacto:** medio. Sin ella, «Mi cuota» dice el estado pero no cómo se llegó.
- **Complejidad:** baja. `listPayments` ya existe; solo hay que resolver el
  `memberId` desde la sesión, igual que hace `me/dues`.
- **Dependencias:** ninguna.

### 2 · `GET /me/access/events` — sus entradas

- **Por qué:** cierra el ciclo del QR: el socio ve que su entrada quedó registrada.
- **Impacto:** bajo. Es confianza, no operación.
- **Complejidad:** baja. `access_events` ya guarda `member_id`.
- **Dependencias:** que haya escáner funcionando; si no, la lista sale vacía.

### Y una decisión de seguridad, no una carencia

Los controladores `me/*` **no declaran `@Roles`**, y `RolesGuard` deja pasar
cuando no hay roles requeridos. En la práctica no hay fuga —cada uno resuelve por
`user_id` y devuelve 404 si no hay ficha—, pero la protección descansa en la
lógica del servicio y no en la barrera. **Recomiendo `@Roles('member')` en los
cuatro de socio** como defensa en profundidad, coherente con `me/trainer`, que sí
lo lleva. No es un bug: es un cinturón que falta junto a unos tirantes que sí están.

---

# G · Seguridad y multitenancy

Auditado. **No hay bloqueos.**

| Comprobación                       | Resultado                                                    |
| ---------------------------------- | ------------------------------------------------------------ |
| Aislamiento entre gimnasios        | ✅ RLS en **21 tablas**, **31 políticas**                    |
| El tenant no viaja en la petición  | ✅ Sale de `activeGymId` de la sesión                        |
| Entrenador viendo socios ajenos    | ✅ Bloqueado: `myMember()` lanza 404                         |
| Socio viendo datos de otro         | ✅ Imposible: sus rutas no admiten ids                       |
| Revocar acceso surte efecto        | ✅ `ended_at IS NULL` en cada petición                       |
| Escalada de privilegios al invitar | ✅ `CAN_INVITE` en contrato y servidor                       |
| Datos de salud                     | ✅ Recepción excluida; consentimiento exigido en el servicio |

Dos apuntes, ninguno bloqueante:

1. **`me/*` sin `@Roles`** — comentado arriba.
2. **Clave ajena compuesta `(gym_id, id)`** — el esquema lo resolvió ya, y su
   comentario merece citarse: _«RLS impedía leer esa fila, así que no había fuga
   — pero la incoherencia era representable, y en este proyecto lo que no debe
   ocurrir se impide, no se vigila.»_

---

# H · Arquitectura de frontend recomendada

**Recomendación: B — áreas separadas dentro del mismo frontend.**

```
apps/web/src/app/
  (panel)/     socios, personal, planes       owner, receptionist
  (entrenador)/ mis-socios, rutinas, ejercicios   trainer
  (socio)/     carne, cuota, rutina, progreso     member
```

**Por qué B y no las otras**

- **A (rutas condicionadas por rol).** Cada pantalla acabaría con ramas por rol.
  Es lo que produce el código que nadie se atreve a tocar.
- **C (frontends separados).** Triplica despliegue y configuración, y rompe la
  única sesión: la cookie es `SameSite=Lax` y el panel se sirve desde la API
  justo por eso. Tres orígenes obligarían a rediseñar la autenticación, que
  funciona.
- **B.** Un despliegue, una sesión, un sistema visual. Los componentes del panel
  —`Marco`, `Tarjeta`, `Tabla`, `ListaApilada`, `Campo`, `Boton`— ya sirven tal
  cual; `ListaApilada` se diseñó explícitamente sin saber nada del panel.

**Encaja con lo que ya hay**

- **Exportación estática:** una carpeta más son ficheros más. `panel.ts` ya sirve
  el `out/` entero.
- **Auth:** `RutaPrivada` ya acepta `roles`; hoy `ROLES_DEL_PANEL` es
  `['owner','receptionist']` y el comentario ya remite a «el portal del socio».
- **Responsive:** el trabajo está hecho y validado de 320 a 1440. La experiencia
  de socio es móvil, y móvil es justo lo que se acaba de cerrar.
- **PWA futura:** un solo origen es el caso fácil para un _service worker_.

**Lo que hay que resolver al implementarlo:** hoy un socio que entra cae en
`/socios` y ve «Sin acceso». Hará falta que la pantalla de entrada envíe a cada
rol a su área. Es un cambio pequeño y localizado.

---

# I · GYMLAB v1

### Panel de gimnasio — ✅ terminado

Añadidos imprescindibles, solo por obligación legal:

- Exportar datos personales de un socio.
- Borrar un socio.
- Asignar socios a entrenadores (sin esto el entrenador no arranca).

### Entrenador v1 — backend listo, faltan 6 pantallas

Mis socios · ficha del socio · rutinas · editor de rutina · asignar · mi perfil.

### Socio v1 — 5 pantallas y 2 endpoints

Mi carné (QR) · mi cuota · mi rutina · mi progreso · mi perfil.

### Backend pendiente

`GET /me/payments` · `GET /me/access/events` · `@Roles('member')` en los `me/*`
de socio.

---

# J · Orden de implementación

Cada tarea es un PR verificable. Esfuerzo: **S** < 1 día · **M** 1–2 · **L** 3+.

**Bloque 0 · Cerrar obligaciones legales del panel** (esfuerzo total S–M)

| #   | Tarea                                                                                 | Esf. |
| --- | ------------------------------------------------------------------------------------- | ---- |
| 1   | Exportar datos del socio: botón en la ficha, descarga el JSON de `/export`            | S    |
| 2   | Borrar socio: confirmación en dos pasos, solo dueño, texto claro de que no se deshace | M    |

**Bloque 1 · Cimientos compartidos** (habilita todo lo demás)

| #   | Tarea                                                                        | Esf. |
| --- | ---------------------------------------------------------------------------- | ---- |
| 3   | Cliente de API para trainers, training, progress y access                    | M    |
| 4   | Áreas de ruta por rol y redirección al entrar según rol                      | M    |
| 5   | `@Roles('member')` en los `me/*` de socio + tests de que otro rol recibe 403 | S    |

**Bloque 2 · Socio v1** (lo más pequeño y lo que más se ve)

| #   | Tarea                                                                | Esf. |
| --- | -------------------------------------------------------------------- | ---- |
| 6   | Mi carné: QR desde `/me/access/token`, con cuenta atrás de caducidad | M    |
| 7   | Mi cuota: estado desde `/me/dues`                                    | S    |
| 8   | Mi perfil: ver y editar lo editable                                  | S    |
| 9   | Mi rutina: `/me/routines` con sus ejercicios                         | M    |
| 10  | Mi progreso: histórico y alta de medición                            | M    |
| 11  | **Backend** `GET /me/payments` + pantalla                            | S    |
| 12  | **Backend** `GET /me/access/events` + pantalla                       | S    |

**Bloque 3 · Asignación de entrenadores en el panel**

| #   | Tarea                                       | Esf. |
| --- | ------------------------------------------- | ---- |
| 13  | Listado de entrenadores con alta/baja       | M    |
| 14  | Asignar y desasignar socios a un entrenador | M    |

**Bloque 4 · Entrenador v1**

| #   | Tarea                                                  | Esf. |
| --- | ------------------------------------------------------ | ---- |
| 15  | Mis socios                                             | S    |
| 16  | Ficha del socio asignado                               | M    |
| 17  | Biblioteca de ejercicios                               | M    |
| 18  | Rutinas: listado y alta                                | M    |
| 19  | Editor de rutina con ejercicios, series y repeticiones | L    |
| 20  | Asignar rutina a un socio                              | S    |
| 21  | Registrar progreso, con la puerta del consentimiento   | M    |
| 22  | Mi perfil de entrenador                                | S    |

**Bloque 5 · Opcionales, ya fuera de v1**

Pausar/reanudar cuota · anular pago · notas internas · panel de métricas ·
ajustes · verificación de QR en puerta.

## K · Esfuerzo por bloque

| Bloque            | Tareas | Esfuerzo |
| ----------------- | :----: | -------- |
| 0 · Legal         |   2    | **S–M**  |
| 1 · Cimientos     |   3    | **M**    |
| 2 · Socio v1      |   7    | **M–L**  |
| 3 · Asignación    |   2    | **M**    |
| 4 · Entrenador v1 |   8    | **L**    |

El camino crítico es el bloque 1: sin cliente de API ni áreas de ruta, ni socio
ni entrenador pueden empezar.

## L · Qué se puede empezar ya, sin tocar backend

Todo salvo dos pantallas. **19 de las 22 tareas** no necesitan backend nuevo:

- Bloque 0 completo — los endpoints existen.
- Bloque 1 completo — es cliente y enrutado.
- Bloque 2 salvo las tareas 11 y 12.
- Bloques 3 y 4 completos — **el backend de entrenador está terminado**.

Lo más sensato es empezar por el **bloque 0** (obligación legal, y el panel ya
está listo para recibirlo) y seguir por el **bloque 1**, que desbloquea el resto.
