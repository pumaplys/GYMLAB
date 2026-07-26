# GYMLAB

SaaS de gestión para gimnasios. Panel web para el gimnasio y app móvil para el socio.

Arquitectura: [`docs/01-arquitectura.md`](docs/01-arquitectura.md) · Decisiones: [`docs/adr/`](docs/adr/)

---

## Estructura

```
gymlab/
├── apps/
│   ├── api/          API — monolito modular (NestJS)      :3001
│   ├── web/          Panel de gestión (Next.js)           :3000
│   └── mobile/       App del socio (Expo / React Native)
├── packages/
│   ├── contracts/    Esquemas Zod y tipos compartidos
│   ├── db/           Esquema Drizzle, migraciones y RLS
│   └── config/       tsconfig y eslint compartidos
└── docs/
    ├── 01-arquitectura.md
    └── adr/          Architecture Decision Records
```

Grafo de dependencias:

```
config  ←  contracts  ←  api · web · mobile
config  ←  db         ←  api
```

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
| `pnpm format` | Prettier |
| `pnpm db:generate` | Genera migración a partir del esquema Drizzle |
| `pnpm db:migrate` | Aplica migraciones pendientes |
| `pnpm db:studio` | Abre Drizzle Studio |

Para trabajar en una sola app:

```bash
pnpm --filter @gymlab/api dev
```

---

## Estado

**Fase 0 — estructura.** Sin funcionalidad de producto todavía.
