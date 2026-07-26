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
| Esquema base, RLS, `withTenant()` y test de aislamiento | ✅ Escrito — ⚠️ **sin ejecutar** |
| Instalación de dependencias | ⬜ Siguiente paso |
| Conexión de `@gymlab/db` con la API | ⬜ Pendiente |
| Auth y roles (Better Auth) | ⬜ Pendiente |
| CI (GitHub Actions) | ⬜ Pendiente |
| Funcionalidad de producto | ⬜ Fase 1 |

---

## Trabajo realizado hoy

### Estructura del monorepo

pnpm + Turborepo con `apps/api|web|mobile`, `packages/contracts|db|config` y
`docs/adr`. Configuración de Docker Compose para PostgreSQL local, plantilla de
entorno y documentación base.

Tres detalles no obvios que ya están resueltos: `node-linker=hoisted` (Metro no
resuelve los symlinks de pnpm), `tsup` emitiendo ESM y CJS a la vez (NestJS
consume CommonJS; Next y Expo, ESM) y `metro.config.js` de monorepo con
`disableHierarchicalLookup` para evitar dos copias de React.

### Esquema inicial

`packages/db/src/schema/` — `organizations`, `gyms`, `users`, `memberships` y el
enum `membership_role`. La jerarquía organización → sede existe desde el día uno
aunque en el MVP sea 1:1, para que la primera cadena con dos sedes no obligue a
migrar nada.

### Aislamiento multi-tenant

Tres piezas que se refuerzan entre sí; ninguna basta por separado:

| Pieza | Qué garantiza |
|---|---|
| `sql/01-rls.sql` | Políticas por tabla y `app_current_gym_id()`. Sin contexto, cero filas: **falla en cerrado** |
| `src/tenant.ts` | `withTenant()` fija `app.gym_id` **local a la transacción** (`set_config(..., true)`), imprescindible detrás de un pooler |
| `src/client.ts` | `assertRlsIsEnforced()` aborta el arranque si la conexión puede ignorar las políticas |

### Hallazgo relevante: hacen falta dos roles de base de datos

En Postgres, **un superusuario y el propietario de una tabla ignoran las
políticas RLS**. El `docker-compose` crea `gymlab` como superusuario. Si la API
se conectara con ese rol, RLS estaría habilitado, las políticas escritas, los
tests en verde... y el aislamiento sería inexistente, sin ningún error que lo
delatara.

De ahí las dos conexiones:

```
DATABASE_URL      → gymlab      (propietario)      migraciones y seed
DATABASE_URL_APP  → gymlab_app  (sin privilegios)  API y tests
```

No modifica ninguna decisión de arquitectura: es lo que hace que **ADR-002**
funcione de verdad en lugar de sobre el papel.

### Test de aislamiento

`src/__tests__/tenant-isolation.test.ts` — 12 casos contra PostgreSQL real
(nunca un mock: un mock de RLS solo probaría que el mock funciona). Cubre
lectura cruzada, `SELECT` sin filtro, `INSERT`/`UPDATE`/`DELETE` dirigidos a
otro tenant, ausencia de contexto y fuga de contexto entre transacciones.

El primer caso verifica que la conexión de la aplicación no es superusuario ni
tiene `BYPASSRLS`. Sin esa comprobación, los otros once serían falsos positivos.

---

## Siguiente paso

Nada de lo escrito se ha ejecutado todavía: no hay `node_modules`, `.git`,
`.env` ni lockfile. **Hasta que el test de aislamiento pase, todo lo anterior es
una hipótesis.**

### 1. Mover el proyecto fuera de OneDrive — decidido

`node_modules` en un monorepo son decenas de miles de archivos pequeños.
OneDrive intentará sincronizarlos: instalaciones lentas, bloqueos de archivo en
pleno `pnpm install` y builds que fallan de forma intermitente. Git ya versiona
el código; OneDrive no aporta nada aquí.

```bash
mkdir -p /c/dev && mv "/c/Users/pumaplys/OneDrive/Escritorio/GYMLAB" /c/dev/gymlab && cd /c/dev/gymlab
```

### 2. Instalar dependencias

Secuencia completa en el [`README.md`](../README.md):

1. `corepack enable pnpm` y `corepack use pnpm@latest`
2. `git init` y primer commit
3. Bloques de `pnpm add` por workspace, en orden: raíz → `config` → `contracts`
   → `db` → `api` → `web` → `mobile`
4. En `apps/mobile`, usar `expo install` en lugar de `pnpm add` para que las
   versiones nativas sean las compatibles con el SDK

Añadido respecto a la lista original — `packages/db` necesita también:

```bash
pnpm --filter @gymlab/db add -D tsx vitest
```

### 3. Ejecutar los tests de la Fase 0

```bash
cp .env.example .env && docker compose up -d && pnpm db:generate && pnpm db:migrate && pnpm --filter @gymlab/db test
```

`db:migrate` encadena `drizzle-kit migrate` y la aplicación de roles y
políticas; el orden importa, porque las tablas deben existir antes de
habilitarles RLS.

**El test de aislamiento en verde es la señal de que la Fase 0 va bien.** Si
falla el primer caso, revisar que `DATABASE_URL_APP` apunta a `gymlab_app` y no
al rol propietario.

### Riesgo conocido

Node 24 instalado; Expo suele ir por detrás en soporte de las versiones más
recientes. Si el bundler falla, instalar Node 22 LTS y fijarlo con `.nvmrc`. Se
sabrá en el primer `pnpm dev`.

---

## Después, para cerrar la Fase 0

1. Conectar `@gymlab/db` con la API: `assertRlsIsEnforced()` en el arranque y un
   interceptor de NestJS que resuelva el `gym_id` de la petición y abra
   `withTenant`.
2. Auth y roles con Better Auth + guard de NestJS (RBAC con ámbito).
3. GitHub Actions: lint, typecheck, migraciones y **el test de aislamiento
   bloqueando el merge**.
4. Extraer los seis ADR de `01-arquitectura.md` a `docs/adr/`.

---

## Puntos abiertos

**Asunción A1 sin confirmar:** que GYMLAB *no* mueve el dinero de las cuotas de
los socios en el MVP, solo lo registra. Si tuviera que moverlo, entran Stripe
Connect, KYC por gimnasio y liquidaciones — un producto entero por sí solo. No
bloquea el trabajo actual, pero hay que cerrarlo antes del módulo `billing`.

**Acceso del rol `superadmin`.** La arquitectura preveía un rol de BD separado
con `BYPASSRLS`, pero no siempre se puede conceder en Postgres gestionado
(Neon, Supabase). Se decide al construir el módulo `platform`. No hace falta
para el MVP y no conviene improvisarlo.
