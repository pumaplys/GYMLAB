#!/usr/bin/env bash
# =============================================================================
# Copia de seguridad de GYMLAB: volcar, cifrar y subir fuera del VPS.
#
# Se ejecuta desde systemd (gymlab-backup.timer), no a mano. Ver
# docs/09-copias-de-seguridad.md.
#
# ┌──────────────────────────────────────────────────────────────────────────┐
# │ `pipefail` NO ES DECORACION: SIN EL, UN VOLCADO FALLIDO SE SUBE IGUAL.   │
# │                                                                          │
# │ En `pg_dump | gzip | age`, el codigo de salida de una tuberia es el del  │
# │ ULTIMO comando. Si `pg_dump` muere a mitad, `age` cifra lo poco que      │
# │ llego y termina con exito: se subiria un fichero valido, cifrado y       │
# │ CASI VACIO, y el interruptor de hombre muerto avisaria de que todo fue   │
# │ bien.                                                                    │
# │                                                                          │
# │ Es el peor fallo posible en una copia de seguridad: no se nota hasta que │
# │ hay que restaurarla. Con `pipefail` el fallo se propaga, y ademas se     │
# │ comprueba el tamano por si acaso.                                        │
# └──────────────────────────────────────────────────────────────────────────┘
# =============================================================================
set -euo pipefail

RAIZ="${GYMLAB_RAIZ:-/opt/gymlab}"
COMPOSE="docker compose -f ${RAIZ}/docker/compose.produccion.yml --env-file ${RAIZ}/.env"
B2="${B2_BIN:-/opt/b2-cli/bin/b2}"

# Los secretos los inyecta systemd con EnvironmentFile, asi que no aparecen en
# la linea de ordenes —donde los veria cualquiera con un `ps`— ni en el
# historial del interprete.
: "${B2_BUCKET:?falta B2_BUCKET en .env.backup}"
: "${AGE_PUBLIC_KEY:?falta AGE_PUBLIC_KEY en .env.backup}"

FECHA="$(date +%F)"
SEMANA="$(date +%G-W%V)"
DIA_SEMANA="$(date +%u)"   # 7 = domingo

TMP="$(mktemp -d)"
# `trap` y no un `rm` al final: si el script muere por cualquier motivo, el
# fichero cifrado no se queda tirado en /tmp.
trap 'rm -rf "$TMP"' EXIT
CIFRADO="${TMP}/gymlab-${FECHA}.sql.gz.age"

registrar() { echo "[copia] $*"; }

# --- 1. Volcar, comprimir y cifrar, sin pasar por disco en claro ------------
#
# El volcado nunca se escribe sin cifrar: sale de Postgres y entra directamente
# en gzip y en age. `age` cifra con la clave PUBLICA, asi que este servidor
# puede crear copias que el mismo no puede leer.
registrar "volcando ${FECHA}"
$COMPOSE exec -T postgres pg_dump -U gymlab --no-owner --no-privileges gymlab \
  | gzip -9 \
  | age -r "$AGE_PUBLIC_KEY" -o "$CIFRADO"

# --- 2. Comprobar que hay algo de verdad ------------------------------------
#
# Cinturon ademas de tirantes: `pipefail` ya deberia haber cortado un volcado
# fallido, pero un fichero cifrado de 200 bytes es sospechoso aunque todos los
# codigos de salida digan que si.
BYTES="$(stat -c %s "$CIFRADO")"
MINIMO=1024
if [ "$BYTES" -lt "$MINIMO" ]; then
  registrar "ERROR: la copia son solo ${BYTES} bytes, por debajo del minimo de ${MINIMO}"
  exit 1
fi
registrar "cifrado ${BYTES} bytes"

# --- 3. Subir ---------------------------------------------------------------
#
# El nombre del subcomando cambio entre la version 3 y la 4 del CLI de B2. Se
# prueba el nuevo y se cae al viejo, en lugar de fijar uno y romperse el dia de
# la actualizacion.
subir() {
  local destino="$1"
  if "$B2" file upload --help >/dev/null 2>&1; then
    "$B2" file upload --no-progress "$B2_BUCKET" "$CIFRADO" "$destino" >/dev/null
  else
    "$B2" upload-file --noProgress "$B2_BUCKET" "$CIFRADO" "$destino" >/dev/null
  fi
  registrar "subido ${destino}"
}

subir "diario/gymlab-${FECHA}.sql.gz.age"

# Los domingos, una copia mas al prefijo semanal. Son dos objetos distintos, no
# un movimiento: la credencial no puede borrar ni renombrar, y la retencion la
# aplica el bucket con una regla por prefijo.
if [ "$DIA_SEMANA" = "7" ]; then
  subir "semanal/gymlab-${SEMANA}.sql.gz.age"
fi

# --- 4. Avisar de que SI se hizo --------------------------------------------
#
# El interruptor de hombre muerto. Detecta lo que `OnFailure` no puede: que la
# copia no llegara a ejecutarse. Un temporizador desactivado o un servidor
# apagado no fallan — sencillamente no pasa nada, y sin este aviso el silencio
# se confunde con normalidad.
if [ -n "${HEALTHCHECK_URL:-}" ]; then
  curl -fsS -m 10 --retry 3 "$HEALTHCHECK_URL" >/dev/null && registrar "aviso enviado"
else
  registrar "AVISO: sin HEALTHCHECK_URL; nadie se enterara si esto deja de ejecutarse"
fi

registrar "terminado"
