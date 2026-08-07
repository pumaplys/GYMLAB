# Alternativas de despliegue (B3)

> **Documento de comparación. No decide nada.** Escrito el 6 de agosto de 2026
> para poder elegir con criterio, no para justificar una elección ya tomada.
>
> Estado: **B3 cerrado el 7 de agosto de 2026 con la opción A.** Lo implementado
> está en `Dockerfile`, `docker/` y `apps/api/src/panel.ts`; la guía operativa,
> en [`07-despliegue-vps.md`](07-despliegue-vps.md). Este documento se conserva
> porque explica **por qué** se eligió, que es lo que hará falta el día que
> alguien proponga cambiarlo.

---

## El problema, otra vez y con precisión

La deuda decía «no hay hosting». Es incompleto: **la pieza que sirve el panel no
existe en el proyecto.**

| | |
|---|---|
| `next build` deja 106 ficheros y 1,3 MB en `apps/web/out/` | **nadie los sirve** |
| La API | **no sirve estáticos**: ni `ServeStaticModule`, ni `useStaticAssets` |
| Empaquetado | no hay `Dockerfile`; el único `docker-compose.yml` levanta el Postgres de desarrollo |
| Migraciones | no hay paso que las aplique al desplegar |

Contratar un servidor no resuelve nada de esto por sí solo.

### Por qué «un solo origen» no es una preferencia

Es el requisito duro, y conviene entender de dónde sale exactamente.

La sesión del panel viaja en una cookie `httpOnly` que emite Better Auth
([auth.instance.ts:52](../apps/api/src/auth/auth.instance.ts)). Con su
configuración por defecto esa cookie es **`SameSite=Lax`**, y `Lax` solo se
envía en navegaciones de primer nivel: **una petición `fetch` a otro origen no
la lleva**. En ningún navegador, no solo en Safari.

Es decir: si el panel vive en `panel.gymlab.test` y la API en
`api.gymlab.test`, el panel no tiene sesión. No es que funcione peor — no
funciona.

Se podría forzar `SameSite=None; Secure`, y entonces sí viajaría… convirtiéndose
en una cookie de terceros: Safari (ITP) la bloquea o le recorta la vida, y
Chrome va en la misma dirección. Justo el escenario que hay que evitar cuando el
socio abre su QR en la puerta del gimnasio con el móvil.

> **Lo que hay que buscar en cada opción no es quién aloja, sino cuántos
> orígenes quedan.** Ese es el eje. Todo lo demás es secundario.

### Un detalle pequeño que descarta configuraciones

La exportación estática genera **`socios.html`, no `socios/index.html`**:

```
out/login.html   out/socios.html   out/socios/ficha.html
out/reset-password.html   out/404.html
```

Así que quien sirva esos ficheros tiene que resolver `/socios` → `socios.html`.
No es difícil en ninguna de las tres opciones, pero es una línea de
configuración que, si falta, da 404 en todo el panel menos en la portada. Se
comprueba el primer día o se descubre el día del piloto.

---

## Opción A — servir el `out/` desde la propia API

### 1. Arquitectura resultante

Un solo proceso y un solo puerto. NestJS atiende `/v1/*` con sus controladores y
**todo lo demás** lo resuelve contra `out/`. Un artefacto, un contenedor.

```
[ navegador ] ── https ──> [ Node: NestJS ]
                              ├── /v1/*  → controladores
                              └── /*     → apps/web/out/
```

### 2. Cambios necesarios en el proyecto

- `@nestjs/serve-static` con `exclude: ['/v1/{*path}', '/health']` y
  `serveStaticOptions: { extensions: ['html'] }` — eso es lo que resuelve
  `/socios` → `socios.html`.
- Fallback de rutas desconocidas a `404.html`.
- `Dockerfile` multietapa: construye el monorepo, se queda con `apps/api/dist`,
  `node_modules` de producción y `apps/web/out`.
- Paso de migraciones antes de arrancar (`pnpm db:migrate`, que necesita
  `DATABASE_URL` con el rol propietario; la API sigue corriendo con
  `DATABASE_URL_APP`).
- `CORS_ORIGINS` **deja de hacer falta**: no hay petición entre orígenes.

### 3. Ventajas e inconvenientes

**A favor**

- El mismo origen queda **garantizado por construcción**, no por la
  configuración de un tercero que alguien puede tocar. Es el mismo criterio que
  llevó a RLS en ADR-0002 y a que `link-invitation` no acepte contraseña: la
  garantía estructural no se olvida.
- Un artefacto, un despliegue, un log, un `healthcheck`. Cuando algo falle, hay
  un solo sitio donde mirar.
- Servir 1,3 MB de ficheros estáticos desde Node es perfectamente razonable para
  un panel de gestión. La objeción de rendimiento es teórica a esta escala.

**En contra**

- Acopla los ciclos de vida: cambiar un texto del panel reinicia la API.
- **No termina TLS.** Delante hace falta algo que lo haga, y eso es la opción B
  o una plataforma gestionada. Esta opción no se sostiene sola en un VPS
  desnudo.

### 4. Complejidad operativa

**La más baja de las tres.** Un proceso que vigilar.

### 5. Coste aproximado

Contenedor pequeño + Postgres gestionado: **~15–30 €/mes**.

### 6. Compatibilidad con el modelo de autenticación

**Total, y estructural.** Mismo origen por definición: la cookie `SameSite=Lax`
funciona sin tocar nada, y `credentials: 'include'` del cliente sigue valiendo
igual.

---

## Opción B — servidor web delante (Caddy o Nginx)

### 1. Arquitectura resultante

Dos procesos detrás de un único dominio. El servidor web reparte por ruta.

```
[ navegador ] ── https ──> [ Caddy :443 ]
                              ├── /v1/*  → proxy a Node :3001
                              └── /*     → apps/web/out/
```

### 2. Cambios necesarios en el proyecto

- `Caddyfile` (o `nginx.conf`) con el reparto y `try_files` para la extensión
  `.html`.
- `docker-compose.yml` de producción con dos servicios.
- **`trust proxy` obligatorio** (B5): detrás del proxy, `x-forwarded-for` es lo
  único que identifica al cliente, y sin configurarlo el límite de intentos
  cuenta todas las peticiones como si vinieran del proxy.
- Mismo `Dockerfile` y mismo paso de migraciones que en A.

### 3. Ventajas e inconvenientes

**A favor**

- Ciclos de vida separados: se despliega el panel sin reiniciar la API.
- Caddy resuelve TLS con Let's Encrypt **solo**, sin cron ni renovaciones que
  se olviden.
- Cabeceras de seguridad, compresión y caché en un único sitio.

**En contra**

- Una pieza más que operar, actualizar y entender.
- **La configuración del proxy es donde se cuelan los fallos**: cabeceras
  `X-Forwarded-*` mal puestas, tamaños de cuerpo, tiempos de espera. Y son
  fallos que aparecen en producción, no en desarrollo, porque en desarrollo no
  hay proxy.

### 4. Complejidad operativa

**Media.** Dos piezas y un fichero de configuración que es código de producción
aunque no lo parezca.

### 5. Coste aproximado

El mismo VPS que A: **~10–25 €/mes** más Postgres.

### 6. Compatibilidad con el modelo de autenticación

**Total.** Un solo origen de cara al navegador. Exige `trust proxy` bien puesto,
que de todas formas hay que hacer.

---

## Opción C — plataformas gestionadas

### 1. Arquitectura resultante

Depende de cómo se monte, y **ahí está todo el asunto**:

| Montaje | Orígenes | ¿Sirve? |
|---|---|---|
| Panel en Vercel/Netlify/Pages + API en Railway/Render/Fly | **dos** | ❌ rompe la sesión |
| Un contenedor que sirve las dos cosas (opción A) sobre Fly/Render/Railway | **uno** | ✅ |
| Panel en el host estático + *rewrite* de `/v1/*` hacia la API | uno aparente | ⚠️ hay que demostrarlo |

La primera fila es la configuración «natural» de estas plataformas, y es
justamente la que no funciona.

### 2. Cambios necesarios en el proyecto

Los mismos de A (o de A + el *rewrite* del proveedor), más la configuración
propia de la plataforma. Ningún cambio adicional de código.

### 3. Ventajas e inconvenientes

**A favor**

- TLS, dominio, CDN y despliegue por `git push` sin operar nada.
- Postgres gestionado con copias de seguridad, que es lo que de verdad quita el
  sueño en un piloto.

**En contra**

- **`scale to zero` mataría el envío de correos.** El worker de pg-boss vive
  dentro del proceso de la API ([jobs.module.ts](../apps/api/src/jobs/jobs.module.ts));
  si la plataforma duerme el contenedor cuando no hay peticiones HTTP, las
  invitaciones y los enlaces de recuperación se quedan encolados sin que nadie
  los procese. Hay que exigir un proceso siempre vivo.
- La opción del *rewrite* añade un salto y depende de una función del proveedor
  sobre lo único que no puede fallar.

### 4. Complejidad operativa

**La más baja en el día a día, la más alta al elegir.** Casi todo el trabajo se
concentra en verificar el proveedor antes de comprometerse.

### 5. Coste aproximado

**~0–25 €/mes** el runtime, **~0–20 €/mes** Postgres. Hay planes gratuitos, pero
casi todos duermen el contenedor — ver arriba.

### 6. Compatibilidad con el modelo de autenticación

**Es la que hay que demostrar**, no suponer. Y la comprobación es barata: montar
el panel y la API, iniciar sesión y confirmar que `GET /v1/auth/me` responde
200 con la cookie. Media hora antes de contratar nada.

---

## 7. Qué recomendaría para un primer piloto

**La opción A empaquetada como un solo contenedor, desplegada sobre una
plataforma gestionada que termine TLS y no duerma el proceso.**

No son opciones excluyentes: A dice *cómo se sirve*, C dice *dónde vive*. El eje
que importa —cuántos orígenes— lo resuelve A, y lo resuelve por construcción.

Las razones, en orden:

1. **El requisito que no puede fallar deja de depender de configuración.** Con
   A no hay forma de desplegar mal el origen: es el mismo proceso. Con B o con
   un *rewrite*, el mismo origen es una línea de configuración que alguien
   puede tocar seis meses después sin saber qué sostiene.
2. **Una sola cosa que operar.** Para un piloto con un gimnasio, la variable
   crítica no es el rendimiento: es cuántos sitios hay que mirar cuando algo va
   mal un sábado.
3. **No cierra ninguna puerta.** Poner Caddy delante más adelante —opción B— no
   obliga a cambiar código: se apaga `ServeStaticModule` y se añade `trust
   proxy`, que hay que hacer igualmente.

**Lo que hay que verificar antes de contratar nada**, y es media hora:

- Que el proveedor **no duerme** el contenedor (pg-boss).
- Que se puede ejecutar el paso de migraciones al desplegar.
- Que `POST /v1/auth/login` deja cookie y que `GET /v1/auth/me` responde 200 con
  ella, **desde el dominio real**.

### Lo que esta decisión arrastra

| | |
|---|---|
| **B5 — `trust proxy`** | **Hace falta en las tres opciones**, porque las tres ponen algo delante que termina TLS. Deja de ser condicional |
| **B2 — correo real** | El dominio del despliegue es el que hay que verificar en Resend, así que **B3 va antes** |
| `WEB_APP_URL`, `API_URL` | Pasan a ser el mismo dominio |
| `CORS_ORIGINS` | Deja de hacer falta con un solo origen |
