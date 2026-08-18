# Desplegar GYMLAB en un VPS

> Guía operativa para un VPS de Hostinger. Sirve igual en cualquier proveedor
> que ejecute contenedores: nada de lo que hay aquí es propio de Hostinger salvo
> el panel donde se contrata la máquina y se apunta el dominio.
>
> La decisión que hay detrás está en [`06-despliegue.md`](06-despliegue.md).

---

## Lo que se despliega

**Un solo artefacto.** La API y el panel viajan en la misma imagen y se sirven
desde el mismo proceso:

```
[ navegador ] ──https──> [ Caddy :443 ] ──http──> [ contenedor :3001 ]
                                                     ├── /v1/*  → API
                                                     ├── /health → sonda
                                                     └── /*     → panel
```

Caddy solo termina TLS. **No reparte por ruta**, y eso es justo lo que se
buscaba: el mismo origen no depende de acertar con una configuración, sino de
que sea el mismo proceso. Ver `apps/api/src/panel.ts`.

---

## 1. La máquina

Un VPS con Ubuntu 24.04. Con 2 vCPU y 4 GB va sobrado para un piloto — Postgres
y la aplicación caben de largo.

```bash
ssh root@TU_IP
```

Actualizar, crear un usuario sin privilegios y dejarle usar Docker:

```bash
apt update && apt upgrade -y
adduser --disabled-password --gecos "" gymlab
usermod -aG sudo gymlab
```

Instalar Docker:

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker gymlab
```

Cortafuegos: solo SSH, HTTP y HTTPS. **El 3001 no se abre** — el contenedor solo
escucha en el bucle local y quien atiende desde fuera es Caddy.

```bash
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

## 2. El dominio

En el panel de Hostinger, un registro **A** apuntando a la IP del VPS. Sin `www`
duplicado: **un solo nombre**, porque dos son dos orígenes y la cookie de sesión
es de uno.

Comprobar que resuelve antes de seguir, o Let's Encrypt fallará:

```bash
dig +short gimnasio.tudominio.com
```

## 3. El código y sus secretos

```bash
su - gymlab
git clone https://github.com/pumaplys/GYMLAB.git && cd GYMLAB
```

Los secretos van en un `.env` **junto al compose**, nunca en la imagen:

```bash
cat > .env <<'EOF'
DOMINIO=https://gimnasio.tudominio.com
POSTGRES_PASSWORD=
APP_DB_PASSWORD=
AUTH_SECRET=
ACCESS_TOKEN_SECRET=
PLATFORM_INVITE_CODE=
RESEND_API_KEY=
EMAIL_FROM=GYMLAB <no-reply@tudominio.com>
EOF
chmod 600 .env
```

> **`--env-file .env` en todos los comandos de abajo, y no sobra.** Compose busca
> el `.env` junto al fichero de compose —que vive en `docker/`—, no en el
> directorio desde el que se ejecuta. Sin esa opción sustituye **todos** los
> secretos por cadenas vacías, con un aviso por variable que es fácil pasar por
> alto. La aplicación no llegaría a arrancar, pero Postgres sí se levantaría con
> una contraseña vacía.

Generarlos de verdad, uno por variable — **no reutilizar el mismo valor**:

```bash
openssl rand -base64 48
```

> `AUTH_SECRET` y `ACCESS_TOKEN_SECRET` exigen 32 caracteres como mínimo y el
> proceso **no arranca** sin ellos. Es deliberado: un secreto por defecto en
> producción es peor que un fallo al arrancar.

## 4. Levantarlo

```bash
docker compose -f docker/compose.produccion.yml --env-file .env up -d --build
```

El arranque aplica las migraciones, los roles, las políticas RLS y las colas
**antes** de servir la primera petición, y los tres pasos son idempotentes:
reiniciar no rompe nada. Ver `docker/entrypoint.sh`.

```bash
docker compose -f docker/compose.produccion.yml --env-file .env logs -f app
```

Hay que leer estas dos líneas:

```
[db] Esquema al dia: migraciones, RLS y colas.
[api] sirviendo el panel desde /app/web — mismo origen
```

Y la comprobación de aislamiento, que es la que confirma que la API **no** corre
con el rol propietario:

```
[RlsStartupCheck] Aislamiento verificado: la conexion esta sujeta a RLS.
```

## 5. Caddy delante

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

### La configuración vive en el repositorio

La fuente es **`docker/Caddyfile`**, no el fichero del servidor. Hasta #77 la
configuración del proxy solo existía en `/etc/caddy/Caddyfile` y como un
fragmento suelto en este documento: cualquier cambio era una edición a mano, sin
revisión ni historial, y nadie podía decir con certeza qué había en producción.

Caddy pide y renueva el certificado solo. **No hay que repartir rutas**: dentro
del contenedor ya está decidido qué es API y qué es panel. Las cabeceras de
seguridad sí se ponen aquí, porque Caddy no sirve ninguna por su cuenta.

### Desplegar un cambio del proxy

El orden importa: **copia de seguridad → comparar → validar → recargar →
verificar**. `reload` y no `restart`: si la configuración nueva fuera inválida,
Caddy mantiene la anterior en pie en lugar de dejar el dominio sin servir.

```bash
cd /opt/gymlab

# 1. Guardar el vivo antes de tocarlo, con fecha. Es el camino de vuelta.
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.$(date -u +%Y%m%dT%H%M%SZ).bak

# 2. Ver EXACTAMENTE que va a cambiar. Si aparece algo que no esperabas,
#    alguien edito el servidor a mano: para y averigua que antes de seguir.
diff -u /etc/caddy/Caddyfile docker/Caddyfile

# 3. Instalar y validar. `validate` no aplica nada: solo comprueba sintaxis.
sudo cp docker/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

# 4. Recargar sin cortar el servicio
sudo systemctl reload caddy
systemctl is-active caddy

# 5. Comprobar desde FUERA que las cuatro cabeceras llegan
curl -sI https://gymlabfit.tech/login | grep -iE \
  'strict-transport|x-content-type|x-frame|referrer-policy'
```

El paso 5 no es un trámite: es la única comprobación que mira lo que recibe un
navegador de verdad, en lugar de lo que dice el fichero.

**Si algo falla**, la vuelta es la copia del paso 1:

```bash
sudo cp /etc/caddy/Caddyfile.<fecha>.bak /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

### Comprobar que el repositorio y el servidor coinciden

```bash
sha256sum /etc/caddy/Caddyfile /opt/gymlab/docker/Caddyfile
```

Dos huellas iguales significan que producción es exactamente lo revisado. Si
difieren, el servidor lleva cambios que nadie revisó.

> Con Caddy delante, `TRUST_PROXY: 1` en el compose es correcto y necesario. Si
> algún día se quita el proxy, hay que bajarlo a `0` — declarar más saltos de
> los que hay vuelve a hacer creíble lo que mande el cliente.

## 6. Comprobar que está de verdad en pie

```bash
curl -s https://gimnasio.tudominio.com/health
curl -o /dev/null -w "%{http_code}\n" https://gimnasio.tudominio.com/socios
curl -o /dev/null -w "%{http_code}\n" https://gimnasio.tudominio.com/no-existe
```

Lo que debe salir: `{"status":"ok",...}`, `200` y `404`.

**El 404 importa.** Si `/no-existe` devolviera `200`, el panel estaría cayendo en
la portada para cualquier ruta — y entonces `/reset-password?token=…` perdería
el token y nadie podría recuperar su contraseña.

Y la prueba que justifica toda esta arquitectura — que la sesión es de primera
parte:

```bash
curl -si -c /tmp/c.txt -X POST https://gimnasio.tudominio.com/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"...","password":"..."}' | grep -i set-cookie

curl -s -b /tmp/c.txt https://gimnasio.tudominio.com/v1/auth/me
```

La cookie debe salir con `HttpOnly`, `Secure` y `SameSite=Lax`, y `/v1/auth/me`
debe responder 200. Si respondiera 401, el panel y la API no están en el mismo
origen.

## 7. El primer gimnasio

No hay registro público: el alta la hacemos nosotros con el código de
plataforma.

```bash
curl -X POST https://gimnasio.tudominio.com/v1/auth/register-gym \
  -H 'content-type: application/json' \
  -d '{"organizationName":"...","gymName":"...","ownerName":"...",
       "email":"...","password":"...","platformCode":"EL_CODIGO"}'
```

A partir de ahí, el dueño entra en el panel e invita a su equipo.

---

## Actualizar

```bash
cd ~/GYMLAB && git pull
docker compose -f docker/compose.produccion.yml --env-file .env up -d --build
```

Las migraciones se aplican solas al arrancar. Hay un corte de unos segundos
mientras el contenedor se reemplaza: para un piloto es asumible, y quitarlo
exige dos instancias y migraciones compatibles hacia atrás.

## Copias de seguridad

**Esto no está resuelto y hay que resolverlo antes de meter datos reales.** Un
volumen de Docker no es una copia de seguridad.

Lo mínimo, un volcado diario fuera de la máquina:

```bash
docker compose -f docker/compose.produccion.yml --env-file .env exec -T postgres \
  pg_dump -U gymlab gymlab | gzip > gymlab-$(date +%F).sql.gz
```

Una copia que no se ha restaurado nunca no se sabe si sirve. Probar la
restauración forma parte de tenerla.

---

## Lo que esta guía todavía no cubre

Se dice aquí para que no se descubra el día del piloto:

| | |
|---|---|
| **Copias de seguridad automáticas** | El volcado de arriba es manual |
| **Vigilancia** | Nadie avisa si el contenedor se cae. El `HEALTHCHECK` de la imagen lo reinicia, pero no lo cuenta |
| **Registro centralizado** | Los logs viven en el contenedor y se pierden al reemplazarlo |
| **Despliegue sin corte** | Hay unos segundos de parada al actualizar |
