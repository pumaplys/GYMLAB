#!/usr/bin/env bash
# =============================================================================
# Avisa por correo de que la copia de seguridad ha fallado.
#
# Lo dispara systemd con `OnFailure=`, pasandole el nombre de la unidad. No se
# ejecuta a mano.
#
# Reutiliza Resend, que ya esta montado y verificado, con la clave de solo
# envio que usa la aplicacion: un aviso de copia no necesita mas permisos que
# un correo de invitacion.
# =============================================================================
set -euo pipefail

UNIDAD="${1:-gymlab-backup.service}"
RAIZ="${GYMLAB_RAIZ:-/opt/gymlab}"

# Las variables de la aplicacion, que es donde vive la clave de Resend.
set -a
# shellcheck disable=SC1091
. "${RAIZ}/.env"
set +a

: "${RESEND_API_KEY:?falta RESEND_API_KEY}"
: "${EMAIL_FROM:?falta EMAIL_FROM}"
DESTINO="${ALERTA_EMAIL:?falta ALERTA_EMAIL en .env.backup}"

# Las ultimas lineas del diario dicen POR QUE fallo. Sin ellas, el correo solo
# dice que algo fue mal y hay que entrar al servidor igualmente.
DETALLE="$(journalctl -u "$UNIDAD" -n 25 --no-pager 2>/dev/null || echo 'sin diario disponible')"

# `jq` para escapar: el diario trae comillas y saltos de linea que romperian el
# JSON si se pegaran a mano.
CUERPO="$(jq -n \
  --arg from "$EMAIL_FROM" \
  --arg to "$DESTINO" \
  --arg subject "GYMLAB: la copia de seguridad ha fallado" \
  --arg text "La copia de seguridad de GYMLAB no se ha completado.

Unidad: ${UNIDAD}
Servidor: $(hostname)
Fecha: $(date -Is)

Ultimas lineas del diario:

${DETALLE}

Mientras esto no se arregle, NO hay copia del dia." \
  '{from: $from, to: [$to], subject: $subject, text: $text}')"

curl -fsS -m 20 -X POST 'https://api.resend.com/emails' \
  -H "Authorization: Bearer ${RESEND_API_KEY}" \
  -H 'content-type: application/json' \
  -d "$CUERPO" >/dev/null

echo "[alerta] aviso de fallo enviado a ${DESTINO}"
