# Estado del proyecto

> Última actualización: **2026-07-26** · Fase actual: **0 — Cimientos**

Documento de continuidad: qué está hecho, qué está a medias y cuál es el
siguiente paso. Se actualiza al final de cada sesión de trabajo.

---

## Dónde estamos

| | Estado |
|---|---|
| Definición de producto y alcance del MVP | ✅ Cerrado |
| Arquitectura | ✅ Aprobada — [`01-arquitectura.md`](01-arquitectura.md) |
| Estructura del monorepo | ✅ Creada |
| Instalación y toolchain | ✅ `build`, `typecheck`, `lint`, `test` en verde |
| Esquema base, RLS, `withTenant()` | ✅ **Aplicado y verificado contra PostgreSQL real** |
| Test de aislamiento entre tenants | ✅ **13 casos, verde — y verificado que sabe fallar** |
| Conexión de `@gymlab/db` con la API | ⬜ Siguiente paso |
| Auth y roles (Better Auth) | ⬜ Pendiente |
| CI (GitHub Actions) | ⬜ Pendiente |
| Funcionalidad de producto | ⬜ Fase 1 |

---

## El aislamiento multi-tenant está verificado

Tres capas que se refuerzan, ya no sobre el papel:

| Pieza | Qué garantiza |
|---|---|
| `sql/01-rls.sql` | Políticas por tabla acotadas al rol `gymlab_app`. Sin contexto, cero filas: **falla en cerrado** |
| `src/tenant.ts` | `withTenant()` fija `app.gym_id` **local a la transacción**, requisito detrás de un pooler |
| `src/client.ts` | `assertRlsIsEnforced()` aborta el arranque si la conexión puede ignorar las políticas |

Estado real comprobado en la base de datos:

```
tabla         | rls_activo | politicas      rolname    | super | bypassrls
--------------+------------+-----------     -----------+-------+----------
gyms          | t          | 1              gymlab     | t     | t
memberships   | t          | 1              gymlab_app | f     | f
organizations | t          | 1
users         | f          | 0   <- excepción deliberada y documentada
```

### La prueba que de verdad cierra la Fase 0

Un test de RLS en verde es sospechoso por naturaleza: pasaría igual si las
políticas no existieran y las tablas estuvieran vacías. Por eso se hizo la
comprobación inversa — apuntar `DATABASE_URL_APP` al rol propietario, que ignora
RLS, y ejecutar la batería:

```
Tests  8 failed | 5 passed (13)
```

Ocho casos en rojo, incluido un `DELETE` sin filtro que **sí borró** filas del
otro gimnasio. Es la demostración de que lo que protege es RLS y no una
casualidad del montaje de datos.

---

## Trabajo realizado

### Cimientos

Monorepo pnpm + Turborepo, esquema inicial (`organizations`, `gyms`, `users`,
`memberships`), migración `0000` aplicada, rol `gymlab_app` creado y políticas
RLS en su sitio.

### Hallazgo: dos roles de base de datos

En Postgres, un superusuario y el propietario de una tabla **ignoran las
políticas RLS**. El `docker-compose` crea `gymlab` como superusuario: si la API
se conectara con ese rol, RLS estaría habilitado, las políticas escritas, los
tests en verde... y el aislamiento sería inexistente.

```
DATABASE_URL      → gymlab      (propietario)      migraciones y seed
DATABASE_URL_APP  → gymlab_app  (sin privilegios)  API y tests
```

### Guardarraíl para el futuro

El test **no enumera tablas a mano**. Consulta el catálogo de Postgres y exige
que *toda* tabla con columna `gym_id` tenga RLS activo y al menos una política.
Cuando lleguen `members`, `subscriptions`, `routines`, `body_metrics` o
`access_events`, olvidar su bloque en `sql/01-rls.sql` pone el PR en rojo en vez
de descubrirse en producción con datos de clientes reales.

### Toolchain

TypeScript 6 fijado con catálogo de pnpm; `incremental`, `baseUrl` y
`moduleResolution: node10` corregidos de forma compatible con TS 7; ESLint flat
config por workspace; `--passWithNoTests` en la API.

---

## Cómo levantar el entorno

```bash
docker compose up -d
cp .env.example .env      # solo la primera vez
pnpm install
pnpm db:migrate           # migraciones + roles + RLS + colas de pg-boss
pnpm test
```

`db:migrate` encadena tres pasos, todos con el rol propietario y en este orden:
`drizzle-kit migrate`, la aplicación de roles y políticas, y la instalación del
esquema y las colas de pg-boss. El orden importa: las tablas deben existir antes
de habilitarles RLS, y pg-boss hace DDL que `gymlab_app` no puede ejecutar.
Todo es idempotente y debe reaplicarse en cada despliegue.

## Módulos terminados

| Módulo | Estado |
|---|---|
| Aislamiento multi-tenant (RLS) | ✅ verificado, con prueba inversa |
| Auth: modelo, guards, 11 endpoints | ✅ 29 tests de abuso |
| Jobs: pg-boss y outbox transaccional | ✅ verificado, con prueba inversa |

Sin proveedor de correo todavía: el consumidor registra el contenido fuera de
producción y **falla en producción**, para que los correos queden en la cola y
se reintenten solos el día que se conecte Resend.

---

## Siguiente paso

1. **CI con GitHub Actions**: lint, typecheck, build, migraciones y los tests de
   aislamiento y de abuso **bloqueando el merge**. Es lo último que queda de la
   Fase 0 y la mitigación del riesgo nº 1 de la tabla de riesgos.
2. Extraer los seis ADR de `01-arquitectura.md` a `docs/adr/`.

Después, Fase 1: los módulos de negocio del MVP.

---

## Deuda técnica registrada

| Qué | Dónde | Cuándo se retira |
|---|---|---|
| `ignoreDeprecations: "6.0"` | `packages/config/tsconfig/library.json` | Al actualizar `tsup`, que inyecta un `baseUrl` propio al generar los `.d.ts` |
| Sin `.gitattributes` | raíz | Antes de que haya un segundo entorno (CI), o los finales de línea dependerán de la máquina |

## Puntos abiertos

**Asunción A1 sin confirmar:** que GYMLAB *no* mueve el dinero de las cuotas de
los socios en el MVP, solo lo registra. Si tuviera que moverlo, entran Stripe
Connect, KYC por gimnasio y liquidaciones — un producto entero por sí solo. No
bloquea, pero hay que cerrarlo antes del módulo `billing`.

**Acceso del rol `superadmin`.** La arquitectura preveía un rol de BD separado
con `BYPASSRLS`, pero no siempre se puede conceder en Postgres gestionado
(Neon, Supabase). Se decide al construir el módulo `platform`. No hace falta
para el MVP y no conviene improvisarlo.
