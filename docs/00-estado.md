# Estado del proyecto

> Última actualización: **2026-07-30** · **Fase 1 en curso** · Siguiente: módulo 3,
> planes y suscripciones — **bloqueado por la asunción A1**

Documento de continuidad: qué está hecho, qué está a medias y cuál es el
siguiente paso. Se actualiza al final de cada sesión de trabajo.

---

## Dónde estamos

| | |
|---|---|
| Fase 0 | ✅ cerrada |
| Fase 1 · paso 0 · Resend | ✅ |
| Fase 1 · módulo 1 · Socios | ✅ *(sin `consents`, ver deuda)* |
| Fase 1 · módulo 2 · Entrenadores y asignaciones | ✅ |
| Fase 1 · módulo 3 · Planes y suscripciones | ⛔ **bloqueado: hay que cerrar A1** |

**134 tests** (27 de aislamiento + 107 funcionales), `build`, `typecheck`, `lint`
y `test` en verde en local y en CI. **10 ADR** en [`adr/`](adr/).

---

## Fase 0 — cerrada

| | Estado |
|---|---|
| Definición de producto y alcance del MVP | ✅ |
| Arquitectura y ADR 0001–0009 | ✅ [`adr/`](adr/) |
| Monorepo, toolchain y catálogo de versiones | ✅ |
| Aislamiento multi-tenant (RLS) | ✅ verificado por falsificación |
| Autenticación, sesiones e invitaciones | ✅ 38 tests de abuso |
| Trabajos en segundo plano y outbox transaccional | ✅ verificado por falsificación |
| CI en GitHub Actions con protección de rama | ✅ en verde sobre `main` |
| Revisión arquitectónica y corrección de hallazgos | ✅ |

**54 tests al cerrar la fase** (16 de aislamiento + 38 de auth), en verde en los
6 workspaces. La cifra actual está arriba: es un registro histórico, no el estado
de hoy.

---

## Qué hay construido

### Aislamiento entre gimnasios

Tres capas que se refuerzan: políticas RLS por tabla, `withTenant()` fijando
`app.gym_id` local a la transacción, y `assertRlsIsEnforced()` abortando el
arranque si la conexión pudiera saltárselas.

**Dos roles de base de datos**, porque en Postgres un superusuario y el
propietario ignoran RLS: `gymlab` para migraciones, `gymlab_app` para la
aplicación.

**Verificado por falsificación**, no solo por tests en verde: apuntando la
aplicación al rol propietario, 8 de 13 casos fallan — incluido un `DELETE` sin
filtro que sí borra filas del otro gimnasio. Un test de RLS en verde pasaría
igual si las políticas no existieran; solo la prueba inversa demuestra algo.

**Guardarraíl para el futuro:** un test consulta el catálogo de Postgres y exige
que *toda* tabla con `gym_id` tenga RLS y al menos una política. Olvidarla en una
tabla nueva pone el PR en rojo.

### Autenticación

11 endpoints propios, sin montar el router de Better Auth (ADR-0009), de modo que
la superficie expuesta es exactamente la que hemos escrito.

Cuatro barreras por petición: sesión válida → rol suficiente → contexto de tenant
→ RLS. Las tres primeras son código nuestro y pueden fallar; la cuarta no depende
de nosotros.

Invitaciones con token hasheado y de un solo uso a prueba de carreras, matriz de
permisos contra escalada, sesiones de 12 h para el personal y 90 días para el
socio, y límite de intentos con contador atómico.

### Trabajos en segundo plano

pg-boss sobre Postgres. Encolar dentro de la transacción de la petición da el
patrón **transactional outbox** sin construir nada: el correo de invitación solo
existe si la invitación se guardó.

También verificado por falsificación: forzando a `enqueue` a ignorar la
transacción, el test de rollback y solo ese se pone en rojo.

---

## Qué se ha construido en la Fase 1

### Paso 0 — Resend

Envío real con dos transportes intercambiables (Resend en producción, consola en
desarrollo) y clasificación de errores en transitorio / permanente / desconocido,
que es lo que decide si pg-boss reintenta o se rinde. En producción la aplicación
**no arranca** sin `RESEND_API_KEY`: mejor no desplegar que desplegar mudo.

### Módulo 1 — Socios

La decisión que ordena el módulo: **un socio no es un usuario**. La ficha existe
con o sin cuenta, porque un gimnasio real tiene socios que nunca instalarán una
app. Dar de alta e invitar son dos acciones distintas.

Número de socio secuencial por gimnasio con un UPSERT atómico —no `max()+1`, que
es la trampa que ya nos mordió con el límite de intentos—, índices únicos
parciales para el email entre activos, y RGPD con exportación (art. 15 y 20) y
borrado (art. 17) separados de la baja.

**Invitación de socio en dos endpoints (ADR-0010).** Un token de invitación nunca
puede escribir credenciales de una cuenta que ya existe: `accept-invitation` es
solo para cuentas nuevas y responde `409` si el email ya tiene una;
`link-invitation` va autenticado y su contrato **solo admite el token**, así que
no hay dato con el que modificar credenciales ni por error de programación.

### Módulo 2 — Entrenadores y asignaciones

**El límite que RLS no puede imponer.** Dentro de un gimnasio, el entrenador y el
dueño son el mismo rol de PostgreSQL: ninguna política puede expresar «solo sus
asignados». Es autorización de aplicación, y está construida para que sea difícil
de saltarse: el rol `trainer` **no aparece en ninguna ruta del personal**, y sus
endpoints (`/v1/me/trainer/...`) parten del `userId` de la sesión, sin ningún
parámetro con el que nombrar a otro entrenador.

Falsificado: quitando el filtro de asignación, el entrenador vería los 11 socios
del gimnasio en lugar de 1.

Las asignaciones **se terminan, no se borran** (`ended_at`), y un socio dado de
baja desaparece de la lista sin perder la asignación: cuando vuelve, recupera a
su entrenador sin que nadie reasigne nada.

**Un descubrimiento que costó caro y conviene no repetir:** romper un ciclo de
*módulos* no basta. El contenedor de dependencias mira los **proveedores**, y con
`MembersService` implementando el punto de extensión de invitaciones el grafo
seguía siendo circular; Nest se quedaba colgado en el arranque **sin dar ningún
error**. De ahí que los implementadores de hooks sean clases dedicadas y sin
dependencias (`MemberAccountLink`, `TrainerProfileLink`). Está en ADR-0010.

---

## Deuda conocida, con su motivo

| Qué | Por qué sigue ahí | Cuándo se resuelve |
|---|---|---|
| **`consents` sin usar** | La tabla existe con RLS y justificación legal, pero nadie escribe en ella. Falta lo que no es técnico: los textos reales y su versión. Se decidió **dejar el dato pendiente antes que inventar una versión ficticia** | Antes del módulo 6, que guarda datos de salud |
| **Clave ajena no compuesta en `trainer_assignments`** | Una asignación puede apuntar a un socio de otro gimnasio: el `WITH CHECK` solo mira `gym_id` y la clave ajena solo mira que el socio exista. **Comprobado: la fila incoherente es insertable.** No hay fuga —el JOIN con `members` sí está filtrado por RLS— y la API lo valida antes de insertar, así que es integridad, no un agujero | PR propio de integridad de datos, antes del módulo 5 |
| **Un rol por persona y gimnasio** | Un dueño que además entrene no puede tener socios asignados. Resolverlo es apilar roles, que cambia el modelo de permisos | Si un piloto lo pide |
| **`slug` es el UUID del gimnasio** | La columna existe para URLs legibles y hoy no aporta nada | Cuando haya URLs públicas |
| **Sesión: solo el máximo absoluto** | ADR-0007 mencionaba además 8 h de inactividad. Better Auth modela el refresco de forma global, no por rol. El máximo es el que acota el riesgo real | Si aparece la necesidad |
| **`trust proxy` sin configurar** | Detrás del proxy del hosting, `x-forwarded-for` no será fiable y el límite de intentos perderá precisión | Antes de producción |
| **`ignoreDeprecations: "6.0"`** | `tsup` inyecta un `baseUrl` propio al generar los `.d.ts` | Al actualizar `tsup` |

### Consecuencia que conviene tener presente

**Todavía no se registra ningún consentimiento.** El módulo 6 guarda peso y
medidas, que son categoría especial del RGPD (art. 9) y exigen consentimiento
vigente. No se puede empezar sin los textos y su versión: es la decisión que
falta, y no es técnica.

---

## Cómo levantar el entorno

```bash
docker compose up -d
cp .env.example .env      # solo la primera vez
pnpm install
pnpm db:migrate           # migraciones + roles + RLS + colas
pnpm test
```

---

## Fase 1 — el MVP

**Plan detallado en [`02-fase-1-mvp.md`](02-fase-1-mvp.md)**: alcance, orden,
riesgos y las tres decisiones pendientes. Resumen a continuación.

Alcance cerrado: clientes, entrenadores, suscripciones, rutinas, peso, QR de
acceso y dashboard del dueño.

### Orden y avance

| # | Módulo | Estado | Por qué en esa posición |
|---|---|---|---|
| 0 | Proveedor de correo (Resend) | ✅ | El alta de un socio es una invitación por email |
| 1 | Socios | ✅ | Todo cuelga de un socio |
| 2 | Entrenadores y asignaciones | ✅ | Quien asigna una rutina es un entrenador con socios asignados |
| 3 | Planes y suscripciones | ⛔ **A1** | Determina si un socio está *activo*, dato que el QR necesita |
| 4 | Acceso por QR | | La funcionalidad más visible; ya diseñada en detalle |
| 5 | Rutinas | | |
| 6 | Progreso y peso | | Datos de salud (art. 9): exige que `consents` funcione |
| 7 | Dashboard | | Lee de los anteriores; por definición va al final |

### Decisiones pendientes

**Asunción A1 — ¿mueve GYMLAB el dinero de las cuotas?** Ya no es «antes del
punto 3»: **el punto 3 es el siguiente**. Si la respuesta es sí, entran Stripe
Connect, verificación de identidad por gimnasio y liquidaciones, y eso no es un
detalle del módulo sino un producto dentro de él.

**Consentimientos** — textos, versionado y momento en que se piden. Bloquea el
módulo 6.

**Biblioteca de ejercicios** — global de la plataforma o propia de cada gimnasio.
Afecta al módulo 5.

**El `slug`**, cuando aparezcan URLs públicas: generarlo a partir del nombre o
eliminar la columna.
