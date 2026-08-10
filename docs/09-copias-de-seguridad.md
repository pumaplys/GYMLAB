# Copias de seguridad (propuesta)

> **Nada de esto está implementado.** Es la propuesta para revisar antes de
> escribir una línea.
>
> Estado actual: **no hay ninguna copia de seguridad, de ningún tipo.** Lo único
> que existe es un `pg_dump` de ejemplo en [`07-despliegue-vps.md`](07-despliegue-vps.md),
> para ejecutar a mano.

---

## Dos malentendidos que conviene descartar primero

| Lo que parece una copia | Por qué no lo es |
|---|---|
| El volumen `gymlab-pgdata` | Vive en el mismo disco que la base. Un `docker compose down -v` mal escrito lo borra en un segundo |
| Un snapshot del VPS | Complemento útil, **no sustituto**: es una imagen de toda la máquina, en el mismo proveedor, y restaurarla revierte el servidor entero — incluida la aplicación— en vez de solo los datos |

Y el que más caro sale: **una copia que nunca se ha restaurado no se sabe si
sirve.** Por eso el punto 7 no es opcional.

---

## 1. Volcado diario

Un servicio `backup` en el compose, con la **misma imagen** que la base —
`postgres:16-alpine`— para que la versión de `pg_dump` coincida exactamente con
la del servidor. Una versión más antigua se niega a volcar.

Se ejecuta con un **temporizador de systemd** en el anfitrión, no con un cron
dentro de un contenedor. El motivo es el punto 5: systemd sabe si la orden falló
y puede reaccionar; un `sleep` dentro de un contenedor no se lo cuenta a nadie.

```
gymlab-backup.timer     →  todos los días a las 03:30
gymlab-backup.service   →  docker compose run --rm backup
```

`pg_dump` es consistente aunque la aplicación esté escribiendo —usa la
instantánea de MVCC— así que **no hay que parar nada**.

> **`pg_dump` NO guarda los roles.** El rol `gymlab_app` y su contraseña los crea
> `db:migrate`, que corre en cada arranque y es idempotente. Es un detalle que
> muerde justo en mitad de una restauración: sin él, la base restaurada está
> completa y la aplicación no puede conectarse. Está contemplado en el punto 6.

## 2. Cifrado y fuera del VPS

Dos pasos encadenados, sin escribir el volcado en claro en disco:

```
pg_dump → gzip → age (cifra) → rclone (sube)
```

**El cifrado va con `age` y clave pública.** El servidor solo guarda la clave
**pública**, que no es un secreto. Consecuencia importante: **un atacante que
entre en el VPS no puede leer las copias**, ni las viejas ni la que acaba de
hacerse. La clave privada no vive en el servidor.

> ⚠️ **Si se pierde la clave privada, las copias son ilegibles.** No hay puerta
> trasera. Va a un gestor de contraseñas y, mejor, a un segundo sitio fuera de
> línea.

**El destino** es almacenamiento compatible con S3. Backblaze B2 encaja: con
este volumen entra en el nivel gratuito. Vale igualmente Cloudflare R2, Wasabi o
S3 de AWS — `rclone` habla con todos y cambiar de proveedor es cambiar una
sección de configuración.

### La clave de escritura no puede borrar

Es la decisión que más protege y no cuesta nada:

| Permiso | ¿Se concede? |
|---|---|
| `writeFiles` | ✅ |
| `listFiles` | ✅ |
| **`deleteFiles`** | ❌ **no** |

Así, **quien entre en el servidor puede añadir copias pero no destruir el
historial.** Es exactamente el escenario de un cifrado malicioso: el atacante
borra las copias antes de pedir rescate, y aquí no puede.

Como contrapartida, la retención **no la aplica el servidor**: la aplica el
propio bucket.

## 3. Retención: 7 diarias + 4 semanales

Dos prefijos y dos reglas de ciclo de vida en el bucket:

| Prefijo | Se escribe | El bucket borra a los |
|---|---|---|
| `diario/` | todos los días | 8 días |
| `semanal/` | los domingos | 29 días |

Ocho y veintinueve, no siete y veintiocho: un día de margen para que una copia
no desaparezca justo antes de que entre la siguiente.

Nombres con fecha ordenable, que es lo que hace legible un listado a las tres de
la mañana:

```
diario/gymlab-2026-08-11.sql.gz.age
semanal/gymlab-2026-W33.sql.gz.age
```

Borrar copias viejas no es solo espacio: el RGPD pide limitar el plazo de
conservación, y una copia guardada para siempre es un dato personal guardado
para siempre.

## 4. Las credenciales, fuera del repositorio

Nada de esto entra en git. `.dockerignore` ya excluye `.env`, y se añadiría
`.env.backup`.

| Secreto | Dónde vive |
|---|---|
| Clave de B2 (id y secreto) | `/opt/gymlab/.env.backup`, `chmod 600`, dueño `root` |
| Clave **pública** de `age` | Puede ir en el mismo fichero o en el repositorio: **no es un secreto** |
| Clave **privada** de `age` | **Fuera del servidor.** Gestor de contraseñas y copia fuera de línea |

El servicio de systemd lo lee con `EnvironmentFile=/opt/gymlab/.env.backup`, así
que los secretos nunca aparecen en la línea de órdenes —donde los vería
cualquiera con un `ps`— ni en el historial del intérprete.

## 5. Cómo se detecta un fallo

**Dos mecanismos, porque fallan de formas distintas.**

**a) La copia falla.** `OnFailure=` en el servicio de systemd dispara un aviso.
El aviso puede salir por correo reutilizando Resend, que ya está montado y cuya
clave es de solo envío.

**b) La copia no se ejecuta.** Y este es el peligroso: un temporizador
desactivado, un disco lleno, un servidor apagado. `OnFailure` **no se entera**,
porque no ha fallado nada — sencillamente no ha pasado nada.

Para eso, un *interruptor de hombre muerto*: el script avisa a un servicio
externo (healthchecks.io, nivel gratuito) **cuando termina bien**. Si ese aviso
no llega a su hora, el servicio manda el correo.

> Una copia que lleva tres semanas sin hacerse y nadie lo sabe es peor que no
> tener copias, porque da confianza falsa.

## 6. Procedimiento de restauración

Los cinco pasos, en orden. Se descifra **fuera del servidor** siempre que se
pueda, porque la clave privada no debe subir ahí.

```bash
# 1. Traer la copia
rclone copy b2:gymlab-copias/diario/gymlab-2026-08-11.sql.gz.age .

# 2. Descifrar (donde esté la clave privada, NO en el VPS)
age -d -i clave-privada.txt gymlab-2026-08-11.sql.gz.age | gunzip > gymlab.sql

# 3. Base limpia
docker compose -f docker/compose.produccion.yml --env-file .env exec -T postgres \
  psql -U gymlab -d postgres -c "CREATE DATABASE gymlab_restaurada OWNER gymlab;"

# 4. Restaurar
cat gymlab.sql | docker compose -f docker/compose.produccion.yml --env-file .env exec -T postgres \
  psql -U gymlab -d gymlab_restaurada

# 5. Recrear el rol de la aplicación y las políticas
#    pg_dump NO trae los roles. Este paso es idempotente y es el que crea
#    gymlab_app con su contraseña.
DATABASE_URL=...gymlab_restaurada pnpm db:migrate
```

Para volver a producción de verdad, se apunta `DATABASE_URL` y `DATABASE_URL_APP`
a la base restaurada y se levanta. **Nunca se restaura encima de la base viva:**
se restaura al lado y se cambia el apuntador, que es reversible.

## 7. Prueba de restauración, sin tocar producción

Mensual, y sobre una base desechable con otro nombre. Es la única forma de saber
que la copia sirve.

Qué se comprueba, y por qué cada cosa:

| Comprobación | Qué detecta |
|---|---|
| Recuento de filas en `gyms`, `members`, `payments` frente a producción | Un volcado truncado o a medias |
| `SELECT count(*) FROM pg_policies` | Que las **políticas RLS viajaron**. Sin ellas la base restaurada no aísla nada |
| `pnpm db:migrate` termina bien | Que el rol de la aplicación se puede recrear |
| Arrancar la aplicación contra ella y hacer login | Que es una base **usable**, no solo un fichero que importa |

El último es el que de verdad cuenta. Los otros tres pueden pasar sobre una base
que la aplicación no puede usar.

Al terminar: `DROP DATABASE gymlab_restaurada`.

## 8. Coste

| Concepto | Al mes |
|---|---|
| Backblaze B2 | **0 €** — los primeros 10 GB son gratis y aquí hablamos de decenas de MB |
| Salida de datos | 0 € — gratis hasta 3× lo almacenado, y solo se descarga al restaurar |
| healthchecks.io | 0 € en el nivel gratuito |
| **Total** | **prácticamente 0 €** |

Un volcado comprimido de un gimnasio con cientos de socios son unos pocos MB.
Con 7 diarias y 4 semanales, el total ronda las decenas de MB. Aun creciendo dos
órdenes de magnitud seguiría dentro del nivel gratuito.

## 9. Qué habría que cambiar

**En el repositorio**

- `docker/backup.sh` — volcar, cifrar, subir, avisar. Nuevo.
- `docker/compose.produccion.yml` — servicio `backup` bajo un *profile*, para que
  `up -d` no lo levante como si fuera un servicio más.
- `docker/systemd/gymlab-backup.service` y `.timer` — nuevos, para copiar al
  servidor.
- `.dockerignore` — añadir `.env.backup`.
- Documentación: esta guía pasaría de propuesta a procedimiento.

**En `.env`**

Nada. Los secretos de la copia van en `/opt/gymlab/.env.backup`, aparte, para que
la aplicación no tenga acceso a las credenciales del almacén. La aplicación no
necesita poder tocar sus propias copias.

**En el servidor**

1. Instalar `age` y `rclone`.
2. Crear el bucket y una clave **sin permiso de borrado**.
3. Generar el par de claves de `age` — la privada **no se queda ahí**.
4. Escribir `/opt/gymlab/.env.backup` con `chmod 600`.
5. Instalar y activar el temporizador.
6. Ejecutar la primera copia a mano y **restaurarla** antes de darla por buena.

---

## Orden que propongo

1. Volcado diario en el propio servidor. Media hora, y ya protege del error
   humano, que es el fallo más frecuente.
2. Cifrado y subida fuera. Es el que protege de perder la máquina.
3. Retención y avisos.
4. **Restauración probada.** Hasta aquí no hay copias de seguridad: hay ficheros.
