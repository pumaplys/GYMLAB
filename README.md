# GYMLAB

SaaS de gestión para gimnasios. Panel web para el gimnasio y app móvil para el socio.

Arquitectura: [`docs/01-arquitectura.md`](docs/01-arquitectura.md) · Decisiones: [`docs/adr/`](docs/adr/) · Estado: [`docs/00-estado.md`](docs/00-estado.md) · Fase 1: [`docs/02-fase-1-mvp.md`](docs/02-fase-1-mvp.md)

---

## Estructura

```
gymlab/
├── apps/
│   ├── api/          API — monolito modular (NestJS)      :3001
│   ├── web/          Panel de gestión (Next.js)           :3000
│   └── mobile/       App del socio (Expo / React Native)
├── packages/
│   ├── contracts/    Esquemas Zod y tipos compartidos por los clientes
│   ├── db/           Esquema Drizzle, migraciones, RLS y colas
│   └── config/       tsconfig y eslint compartidos
└── docs/
    ├── 00-estado.md
    ├── 01-arquitectura.md
    └── adr/          Architecture Decision Records
```

Grafo de dependencias:

```
config  ←  contracts  ←  api · web · mobile
config  ←  db         ←  api
```

**No hay arista `db → contracts`, y es deliberado** (ADR-0005). `contracts` son los
tipos que comparten los clientes; lo que no ve ni el panel ni la app —los nombres
de las colas, por ejemplo— vive en `db`. Una migración no debe depender de haber
compilado nada.

## Módulos de la API

| Módulo | Qué hace |
|---|---|
| `auth` | Registro de gimnasio, login, sesiones, contraseñas, verificación |
| `invitations` | Alta de personal y socios por invitación, con matriz de permisos |
| `jobs` | Colas de pg-boss, envío de correo y retención de datos |
| `database` | Conexión y comprobación de que RLS está activo al arrancar |

---

## Requisitos

- Node.js >= 20.11 (probado con 24)
- pnpm (vía corepack)
- Docker Desktop (para PostgreSQL local)

## Puesta en marcha

```bash
corepack enable pnpm
corepack use pnpm@latest
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:migrate
pnpm dev
```

- API: http://localhost:3001/health
- Panel: http://localhost:3000
- Móvil: escanea el QR de Expo con la app Expo Go

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Arranca API, web y móvil en paralelo |
| `pnpm build` | Compila todo, respetando el orden de dependencias |
| `pnpm typecheck` | Comprueba tipos en todos los workspaces |
| `pnpm lint` | ESLint |
| `pnpm test` | Aislamiento entre gimnasios y abuso de autenticación |
| `pnpm format` | Prettier |
| `pnpm db:generate` | Genera migración a partir del esquema Drizzle |
| `pnpm db:migrate` | Migraciones **+ roles y políticas RLS + colas de pg-boss** |
| `pnpm db:studio` | Abre Drizzle Studio |

`db:migrate` encadena tres pasos con el **rol propietario**, y el orden importa:
las tablas antes que sus políticas, y pg-boss al final porque hace DDL que el rol
de la aplicación no puede ejecutar. Todo es idempotente y debe reaplicarse en
cada despliegue.

Para trabajar en una sola app:

```bash
pnpm --filter @gymlab/api dev
```

---

## Dos conexiones a la base de datos, y no son intercambiables

```
DATABASE_URL      → gymlab      (propietario)      migraciones, políticas, colas
DATABASE_URL_APP  → gymlab_app  (sin privilegios)  API y tests
```

En Postgres, un superusuario y el propietario de una tabla **ignoran las políticas
RLS**. Si la API se conectara con el primero, el aislamiento entre gimnasios sería
inexistente y ningún error lo delataría. `assertRlsIsEnforced()` aborta el arranque
si la conexión puede saltárselas. Ver [ADR-0002](docs/adr/0002-multi-tenancy-rls.md).

---

## Estado

**Fase 0 completada.** Cimientos verificados: aislamiento multi-tenant, autenticación,
outbox transaccional y CI. Sin módulos de negocio todavía — esos son la Fase 1.

Detalle en [`docs/00-estado.md`](docs/00-estado.md).
