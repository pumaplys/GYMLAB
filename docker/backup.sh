#!/usr/bin/env bash
# =============================================================================
# Copia de seguridad de GYMLAB: volcar, cifrar y subir fuera del VPS.
#
# Tres modos:
#
#   backup.sh              diario/gymlab-YYYY-MM-DD.sql.gz.age  (+ semanal domingos)
#   backup.sh predeploy    predeploy/gymlab-<sello>-<sha>.sql.gz.age
#   backup.sh postdeploy   postdeploy/gymlab-<sello>-<sha>.sql.gz.age
#
# El modo automatico lo lanza systemd (gymlab-backup.timer) SIN argumentos y su
# comportamiento no ha cambiado. Ver docs/09-copias-de-seguridad.md.
#
# ┌──────────────────────────────────────────────────────────────────────────┐
# │ POR QUE LOS MODOS DE DEPLOY LLEVAN SELLO DE TIEMPO Y COMMIT.             │
# │                                                                          │
# │ El nombre diario solo lleva la FECHA. Cuando en un mismo dia se hacen    │
# │ varias copias —una antes del deploy y otra despues— todas escriben el    │
# │ MISMO objeto, y distinguirlas depende de que B2 conserve versiones. Eso  │
# │ es una propiedad del bucket, no una decision de este sistema, y es       │
# │ demasiado fragil para ser el unico camino de vuelta de la base de datos. │
# │                                                                          │
# │ Paso en el deploy de #76: tres copias el mismo dia con el mismo nombre,  │
# │ y hubo que listar versiones para saber cual era cual.                    │
# │                                                                          │
# │ Con sello UTC al segundo y el SHA desplegado, el nombre ya dice que es y │
# │ de que version, sin depender de nada externo.                            │
# └──────────────────────────────────────────────────────────────────────────┘
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

registrar() { echo "[copia] $*"; }

# --- 0. Modo, ANTES de tocar nada -------------------------------------------
#
# Se valida lo primero de todo: un modo mal escrito tiene que fallar aqui, no
# despues de haber volcado la base de datos o de haber subido un objeto con un
# prefijo inventado que luego nadie sabria interpretar.
MODO="${1:-diario}"
case "$MODO" in
  diario | predeploy | postdeploy) ;;
  *)
    registrar "ERROR: modo desconocido '${MODO}'. Usa: diario | predeploy | postdeploy"
    exit 2
    ;;
esac

RAIZ="${GYMLAB_RAIZ:-/opt/gymlab}"
COMPOSE="docker compose -f ${RAIZ}/docker/compose.produccion.yml --env-file ${RAIZ}/.env"
B2="${B2_BIN:-/opt/b2-cli/bin/b2}"

# --- 1. Como se va a llamar --------------------------------------------------
#
# El modo diario conserva la hora LOCAL a proposito: es como se ha venido
# nombrando y cambiarlo partiria la serie historica en dos. El sello de los
# modos de deploy si va en UTC, que es lo unico que no se mueve al cambiar la
# hora ni al mover el servidor de zona.
FECHA="$(date +%F)"
SEMANA="$(date +%G-W%V)"
DIA_SEMANA="$(date +%u)" # 7 = domingo
SELLO="$(date -u +%Y-%m-%dT%H%M%SZ)"

# El commit desplegado. Si `git` no esta o el directorio no es un repositorio,
# la copia NO se aborta: vale mas una copia con el commit sin identificar que
# ninguna copia.
SHA="$(git -C "$RAIZ" rev-parse --short HEAD 2>/dev/null || echo desconocido)"

DESTINOS=()
if [ "$MODO" = "diario" ]; then
  BASE="gymlab-${FECHA}.sql.gz.age"
  DESTINOS+=("diario/${BASE}")
  # Los domingos, una copia mas al prefijo semanal. Son dos objetos distintos,
  # no un movimiento: la retencion la aplica el bucket con una regla por
  # prefijo.
  if [ "$DIA_SEMANA" = "7" ]; then
    DESTINOS+=("semanal/gymlab-${SEMANA}.sql.gz.age")
  fi
else
  BASE="gymlab-${SELLO}-${SHA}.sql.gz.age"
  DESTINOS+=("${MODO}/${BASE}")
fi

# --- 1b. Salida para pruebas -------------------------------------------------
#
# Imprime los nombres y termina SIN tocar Postgres ni B2 ni pedir un solo
# secreto. Es lo que permite comprobar la logica de nombres en CI: si hiciera
# falta el bucket para saber como se va a llamar un fichero, esa logica solo
# podria comprobarse en produccion.
if [ "${BACKUP_SOLO_NOMBRES:-0}" = "1" ]; then
  for destino in "${DESTINOS[@]}"; do echo "$destino"; done
  exit 0
fi

# Los secretos los inyecta systemd con EnvironmentFile, asi que no aparecen en
# la linea de ordenes —donde los veria cualquiera con un `ps`— ni en el
# historial del interprete.
: "${B2_BUCKET:?falta B2_BUCKET en .env.backup}"
: "${AGE_PUBLIC_KEY:?falta AGE_PUBLIC_KEY en .env.backup}"

TMP="$(mktemp -d)"
# `trap` y no un `rm` al final: si el script muere por cualquier motivo, el
# fichero cifrado no se queda tirado en /tmp.
trap 'rm -rf "$TMP"' EXIT
CIFRADO="${TMP}/${BASE}"

# --- 2. Volcar, comprimir y cifrar, sin pasar por disco en claro ------------
#
# El volcado nunca se escribe sin cifrar: sale de Postgres y entra directamente
# en gzip y en age. `age` cifra con la clave PUBLICA, asi que este servidor
# puede crear copias que el mismo no puede leer.
registrar "volcando ${MODO} ${FECHA}"
$COMPOSE exec -T postgres pg_dump -U gymlab --no-owner --no-privileges gymlab \
  | gzip -9 \
  | age -r "$AGE_PUBLIC_KEY" -o "$CIFRADO"

# --- 3. Comprobar que hay algo de verdad ------------------------------------
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

# --- 4. Subir ---------------------------------------------------------------
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

# ┌──────────────────────────────────────────────────────────────────────────┐
# │ EL fileId SE PREGUNTA, NO SE ADIVINA DE LA SALIDA DE LA SUBIDA.          │
# │                                                                          │
# │ Lo que imprime `b2 file upload` esta pensado para que lo lea una persona │
# │ y ya cambio una vez entre versiones del CLI. Un `sed` sobre ese texto    │
# │ funciona hasta la primera actualizacion, y entonces devuelve basura sin  │
# │ que nadie se entere — que en un registro de copias es peor que no tener  │
# │ el dato.                                                                 │
# │                                                                          │
# │ Se resuelve DESPUES, listando por el nombre exacto en JSON, que es una   │
# │ interfaz declarada. Si no se puede resolver, la copia NO falla: ya esta  │
# │ subida, y descartarla por no saber su identificador seria absurdo. Se    │
# │ registra `no-resuelto` y queda a la vista en el log.                     │
# └──────────────────────────────────────────────────────────────────────────┘
file_id_de() {
  local destino="$1" json=""
  json="$("$B2" ls --json --versions "b2://${B2_BUCKET}/${destino}" 2>/dev/null \
    || "$B2" ls --json --versions "$B2_BUCKET" "$destino" 2>/dev/null \
    || true)"
  [ -n "$json" ] || return 0

  # Dos lectores de JSON y ninguno obligatorio. No se da por hecho que el
  # servidor tenga `python3` —el CLI de B2 tambien se distribuye como binario
  # suelto— ni `jq`. Si no hay ninguno, se registra `no-resuelto`: preferimos
  # perder el identificador a perder la copia.
  if command -v python3 >/dev/null 2>&1; then
    printf '%s' "$json" | python3 "${RAIZ}/docker/b2-file-id.py" "$destino" 2>/dev/null || true
  elif command -v jq >/dev/null 2>&1; then
    printf '%s' "$json" | jq -r --arg n "$destino" \
      '[.[] | select(.fileName == $n and .action == "upload")]
       | sort_by(.uploadTimestamp) | last | .fileId // empty' 2>/dev/null || true
  fi
}

for destino in "${DESTINOS[@]}"; do
  subir "$destino"

  # Solo para las copias de deploy: son las que hay que poder senalar sin
  # ambiguedad meses despues. La diaria se localiza por su fecha.
  if [ "$MODO" != "diario" ]; then
    FILE_ID="$(file_id_de "$destino")"
    registrar "tipo=${MODO} file=${destino} sha=${SHA} fileId=${FILE_ID:-no-resuelto}"
  fi
done

# --- 5. Avisar de que SI se hizo --------------------------------------------
#
# El interruptor de hombre muerto. Detecta lo que `OnFailure` no puede: que la
# copia no llegara a ejecutarse. Un temporizador desactivado o un servidor
# apagado no fallan — sencillamente no pasa nada, y sin este aviso el silencio
# se confunde con normalidad.
#
# Solo en el modo automatico: una copia manual de deploy no debe hacerle creer
# al vigilante que el temporizador diario sigue vivo.
if [ "$MODO" = "diario" ]; then
  if [ -n "${HEALTHCHECK_URL:-}" ]; then
    curl -fsS -m 10 --retry 3 "$HEALTHCHECK_URL" >/dev/null && registrar "aviso enviado"
  else
    registrar "AVISO: sin HEALTHCHECK_URL; nadie se enterara si esto deja de ejecutarse"
  fi
fi

registrar "terminado ${MODO}"
