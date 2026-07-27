# ADR-0009 — No montar el router HTTP de Better Auth

- **Fecha:** 2026-07-26
- **Estado:** Aceptado
- **Refina:** ADR-0007, decisión 3

## Contexto

ADR-0007 estableció que Better Auth gestiona autenticación y nosotros la
autorización, y que los socios entran **solo por invitación** — no hay
auto-registro público.

La forma evidente de aplicar eso era montar el router HTTP de Better Auth bajo
`/v1/auth/*` con `emailAndPassword.disableSignUp: true`.

**No funciona.** En `better-auth@1.6.25`, `dist/api/routes/sign-up.mjs`:

```js
if (!ctx.context.options.emailAndPassword?.enabled ||
     ctx.context.options.emailAndPassword?.disableSignUp)
  throw APIError.from("BAD_REQUEST", { code: "EMAIL_PASSWORD_SIGN_UP_DISABLED" });
```

La comprobación vive **dentro del handler de la ruta**, que es el mismo código
que ejecuta `auth.api.signUpEmail()` cuando lo llamamos desde el servidor. Con
`disableSignUp: true` no podríamos crear usuarios ni desde nuestros propios
endpoints de confianza: la aceptación de invitaciones dejaría de funcionar.

## Decisión

**No se monta el router HTTP de Better Auth.** Se consume únicamente su API de
servidor (`auth.api.*`) desde nuestros propios controladores NestJS.

`emailAndPassword.disableSignUp` queda en `false`, porque ninguna ruta suya es
accesible desde fuera.

## Por qué, más allá del bug de configuración

| | Montar el router y bloquear rutas | **Solo API de servidor** |
|---|---|---|
| Modelo de seguridad | Lista negra: hay que acertar a bloquear | **Lista blanca: solo existe lo que exponemos** |
| Al actualizar la librería | Rutas nuevas quedan expuestas por omisión | Nada cambia |
| Contrato de la API | El suyo | El nuestro, versionado en `/v1` |

Better Auth expone bastantes más rutas de las que queremos: `list-sessions`,
`change-email`, `delete-user`, `revoke-sessions`… Bloquearlas una a una es el
mismo tipo de seguridad frágil que rechazamos en ADR-002: **una comprobación
que alguien puede olvidar**. Y el olvido más probable no es hoy, sino dentro de
seis meses al subir una versión menor que añade endpoints.

Además encaja con ADR-004: la app móvil tendrá versiones antiguas en las tiendas
durante meses, así que necesitamos un contrato REST versionado y estable, no el
que decida la librería.

## Consecuencias

**Positivas:** superficie de ataque exactamente igual a lo que hemos escrito;
las actualizaciones de Better Auth no pueden exponer nada; el contrato de la API
es nuestro y vive en `@gymlab/contracts`.

**Negativas:** renunciamos a su SDK de cliente, que espera sus rutas. No es
pérdida real: el cliente tipado se genera desde `@gymlab/contracts`. También
asumimos nosotros el manejo de cookies a partir del token que devuelve su API —
lo que a cambio nos deja controlar las banderas de la cookie.

**Coste de revertir:** bajo. Montar el router más adelante sería aditivo.

## Señales para revisarla

- Necesitamos un flujo de OAuth con redirecciones (Google, Apple), donde su
  router resuelve bastante trabajo. Incluso entonces, se montaría **solo** la
  ruta de callback, no el router completo.
