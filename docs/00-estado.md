# Estado del proyecto

> Última actualización: **2026-07-28** · **Fase 0 COMPLETADA** · Siguiente: Fase 1

Documento de continuidad: qué está hecho, qué está a medias y cuál es el
siguiente paso. Se actualiza al final de cada sesión de trabajo.

---

## Fase 0 — cerrada

| | Estado |
|---|---|
| Definición de producto y alcance del MVP | ✅ |
| Arquitectura y nueve ADR | ✅ [`adr/`](adr/) |
| Monorepo, toolchain y catálogo de versiones | ✅ |
| Aislamiento multi-tenant (RLS) | ✅ verificado por falsificación |
| Autenticación, sesiones e invitaciones | ✅ 38 tests de abuso |
| Trabajos en segundo plano y outbox transaccional | ✅ verificado por falsificación |
| CI en GitHub Actions con protección de rama | ✅ en verde sobre `main` |
| Revisión arquitectónica y corrección de hallazgos | ✅ |

**54 tests** (16 de aislamiento + 38 de auth). `build`, `typecheck`, `lint` y
`test` en verde en los 6 workspaces, en local y en CI.

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

## Deuda conocida, con su motivo

| Qué | Por qué sigue ahí | Cuándo se resuelve |
|---|---|---|
| **No hay proveedor de correo** | Nunca se integró Resend. El consumidor **falla a propósito en producción** para que los correos queden en la cola y se reintenten solos | Primer paso de la Fase 1 |
| **`consents` sin usar** | La tabla existe con RLS y justificación legal, pero nadie escribe en ella. Requiere decisiones de producto sobre textos y versionado | Con el módulo de socios |
| **`slug` es el UUID del gimnasio** | La columna existe para URLs legibles y hoy no aporta nada | Cuando haya URLs públicas |
| **Sesión: solo el máximo absoluto** | ADR-0007 mencionaba además 8 h de inactividad. Better Auth modela el refresco de forma global, no por rol. El máximo es el que acota el riesgo real | Si aparece la necesidad |
| **`trust proxy` sin configurar** | Detrás del proxy del hosting, `x-forwarded-for` no será fiable y el límite de intentos perderá precisión | Antes de producción |
| **`ignoreDeprecations: "6.0"`** | `tsup` inyecta un `baseUrl` propio al generar los `.d.ts` | Al actualizar `tsup` |

### Consecuencia que conviene tener presente

**Hoy, en producción, un socio no podría recuperar su contraseña**: el flujo está
completo y probado salvo el envío. El correo queda encolado en lugar de perderse,
pero nadie lo recibe hasta que exista el proveedor.

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

### Orden recomendado

**0. Proveedor de correo (Resend).** No es un módulo, pero va primero: el alta de
un socio es una invitación por email, y hoy eso no llega a nadie. El worker y las
colas ya existen, así que es pequeño y desbloquea todo lo demás.

| # | Módulo | Depende de | Por qué en esa posición |
|---|---|---|---|
| 1 | Socios | 0 | Todo cuelga de un socio. Aquí entra `consents` |
| 2 | Entrenadores y asignaciones | 1 | Quien asigna una rutina es un entrenador con socios asignados |
| 3 | Planes y suscripciones | 1 | Determina si un socio está *activo*, dato que el QR necesita |
| 4 | Acceso por QR | 1, 3 | La funcionalidad más visible; ya diseñada en detalle |
| 5 | Rutinas | 1, 2 | |
| 6 | Progreso y peso | 1 | Datos de salud (art. 9): exige que `consents` funcione |
| 7 | Dashboard | todos | Lee de los anteriores; por definición va al final |

### Dos decisiones pendientes

**Asunción A1 — ¿mueve GYMLAB el dinero de las cuotas?** Hay que cerrarla **antes
del punto 3**. Si la respuesta es sí, entran Stripe Connect y KYC por gimnasio, y
eso cambia el módulo entero.

**El `slug`**, cuando aparezcan URLs públicas: generarlo a partir del nombre o
eliminar la columna.
