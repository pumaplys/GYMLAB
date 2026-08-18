#!/usr/bin/env python3
"""El fileId de un objeto de B2, a partir del listado JSON del CLI.

Existe como fichero aparte y no incrustado en `backup.sh` porque un script
dentro de otro script no se puede leer ni comprobar: queda como una cadena
entre comillas que nadie revisa.

Lee por la entrada estandar la salida de `b2 ls --json --versions` y escribe
por la salida estandar el fileId de la version MAS RECIENTE cuyo nombre
coincida EXACTAMENTE con el argumento.

Coincidencia exacta y no por prefijo: `diario/gymlab-2026-08-18.sql.gz.age` no
debe confundirse con ningun otro objeto que empiece igual.

Si no hay coincidencia, no imprime nada y termina con exito. Quien llama lo
interpreta como «no resuelto»: la copia ya esta subida y no tiene sentido
descartarla por no saber su identificador.
"""

import json
import sys


def main() -> int:
    if len(sys.argv) < 2:
        return 0

    nombre = sys.argv[1]

    try:
        datos = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        # El CLI no devolvio JSON. No es motivo para fallar: se registra como
        # no resuelto y se ve en el log.
        return 0

    # Segun la version del CLI, un objeto suelto puede venir sin envolver.
    if isinstance(datos, dict):
        datos = [datos]
    if not isinstance(datos, list):
        return 0

    iguales = [
        f
        for f in datos
        if isinstance(f, dict)
        and f.get("fileName") == nombre
        # `hide` marca una version oculta, no un fichero: no es lo que se busca.
        and f.get("action") == "upload"
    ]
    if not iguales:
        return 0

    iguales.sort(key=lambda f: f.get("uploadTimestamp", 0), reverse=True)
    file_id = iguales[0].get("fileId", "")
    if file_id:
        print(file_id)
    return 0


if __name__ == "__main__":
    sys.exit(main())
