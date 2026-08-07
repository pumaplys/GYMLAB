# =============================================================================
# GYMLAB — un solo artefacto: la API y el panel, bajo el mismo origen.
#
# El requisito de un solo origen deja de depender de como se configure el
# hosting: es el mismo proceso, luego es el mismo origen. Ver docs/06-despliegue.md.
# =============================================================================

# --- 1. Dependencias ---------------------------------------------------------
# Capa aparte para que un cambio de codigo no obligue a reinstalar el mundo.
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json      apps/api/
COPY apps/web/package.json      apps/web/
COPY apps/mobile/package.json   apps/mobile/
COPY packages/api-client/package.json packages/api-client/
COPY packages/config/package.json     packages/config/
COPY packages/contracts/package.json  packages/contracts/
COPY packages/db/package.json         packages/db/

RUN pnpm install --frozen-lockfile

# --- 2. Construccion ---------------------------------------------------------
FROM deps AS build
WORKDIR /repo
COPY . .

# `turbo run build` construye contratos, db, cliente, API y el panel. El panel
# sale como ficheros estaticos en apps/web/out (output: 'export').
#
# NEXT_PUBLIC_API_URL se queda VACIA a proposito: se incrusta al construir, y
# vacia significa "llama a /v1 en tu propio origen", que es justo lo que hace
# esta imagen. Fijar aqui un dominio ataria la imagen a un despliegue concreto.
ENV NEXT_PUBLIC_API_URL=""
RUN pnpm turbo run build

# --- 2b. Dependencias de produccion ------------------------------------------
# Arbol aparte, instalado desde cero con `--prod`.
#
# ┌──────────────────────────────────────────────────────────────────────────┐
# │ NO SE PODA EL ARBOL DE CONSTRUCCION, Y HAY MOTIVO.                       │
# │                                                                          │
# │ `pnpm prune --prod` deja VACIOS los `node_modules` de los paquetes del   │
# │ workspace: comprobado, `packages/db/node_modules` se quedaba a 0         │
# │ entradas y la imagen arrancaba sin poder resolver `drizzle-orm`. Fallaba │
# │ al migrar, es decir, en el unico momento en que ya es tarde.             │
# │                                                                          │
# │ `--filter @gymlab/api...` arrastra sus dependencias del workspace        │
# │ —contracts, api-client y db—, asi que el movil y las herramientas de     │
# │ desarrollo se quedan fuera.                                              │
# └──────────────────────────────────────────────────────────────────────────┘
FROM deps AS prod-deps
WORKDIR /repo
COPY . .
RUN CI=true pnpm install --frozen-lockfile --prod --filter @gymlab/api...

# --- 3. Ejecucion ------------------------------------------------------------
# Sin corepack ni pnpm: aqui solo se ejecuta `node`.
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# `dumb-init` para que la senal de parada llegue a Node y `enableShutdownHooks`
# pueda cerrar pg-boss ordenadamente en vez de dejar trabajos colgados.
RUN apk add --no-cache dumb-init

# Las dependencias vienen del arbol de produccion; el codigo compilado, del de
# construccion. Los enlaces de pnpm son relativos, asi que la disposicion de
# carpetas se conserva igual que en el repositorio o dejarian de resolver.
COPY --from=prod-deps /repo/node_modules                  ./node_modules
COPY --from=prod-deps /repo/apps/api/node_modules         ./apps/api/node_modules
COPY --from=prod-deps /repo/packages/db/node_modules      ./packages/db/node_modules
COPY --from=prod-deps /repo/packages/contracts/node_modules  ./packages/contracts/node_modules
COPY --from=prod-deps /repo/packages/api-client/node_modules ./packages/api-client/node_modules

COPY --from=build /repo/packages/contracts/package.json   ./packages/contracts/
COPY --from=build /repo/packages/contracts/dist           ./packages/contracts/dist
COPY --from=build /repo/packages/api-client/package.json  ./packages/api-client/
COPY --from=build /repo/packages/api-client/dist          ./packages/api-client/dist
COPY --from=build /repo/packages/db/package.json          ./packages/db/
COPY --from=build /repo/packages/db/dist                  ./packages/db/dist
# El CLI de despliegue lee estas dos carpetas en tiempo de ejecucion.
COPY --from=build /repo/packages/db/migrations            ./packages/db/migrations
COPY --from=build /repo/packages/db/sql                   ./packages/db/sql
COPY --from=build /repo/apps/api/dist                     ./apps/api/dist
COPY --from=build /repo/apps/api/package.json             ./apps/api/

# El panel exportado. `PanelModule` lo busca aqui.
COPY --from=build /repo/apps/web/out              ./web

COPY docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Sin privilegios. La imagen de Node ya trae el usuario `node`.
USER node

ENV WEB_DIST_PATH=/app/web
ENV API_PORT=3001
EXPOSE 3001

# El healthcheck usa /health, que queda FUERA del prefijo /v1 y fuera del
# servidor de estaticos precisamente para esto.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--", "./entrypoint.sh"]
