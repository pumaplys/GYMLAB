#!/bin/sh
# =============================================================================
# Arranque de GYMLAB: primero el esquema, despues el proceso.
#
# Las migraciones se ejecutan AQUI y no en un paso aparte del proveedor para
# que el despliegue sea el mismo en todas partes: un VPS con `docker compose`,
# una plataforma gestionada o el portatil de alguien. Si hicieran falta dos
# ordenes en un orden concreto, tarde o temprano alguien ejecutaria solo una.
#
# Los tres pasos que aplica son idempotentes, asi que reiniciar el contenedor
# no rompe nada. Ver packages/db/src/deploy.ts.
# =============================================================================
set -e

if [ "${SKIP_MIGRATIONS:-0}" = "1" ]; then
  echo "[deploy] SKIP_MIGRATIONS=1: no se toca el esquema."
else
  echo "[deploy] Poniendo el esquema al dia..."
  # Desde el directorio del paquete: el CLI resuelve `migrations/` y `sql/`
  # relativas al directorio de trabajo.
  cd /app/packages/db
  node dist/deploy-cli.cjs
  cd /app
fi

echo "[deploy] Arrancando la API..."
# `exec` para que Node herede el PID 1 y reciba las senales de parada.
exec node apps/api/dist/main.js
