# 17 · Enlaces de correo que abren RINDA

Los correos de recuperación de contraseña e invitación llevan una URL del panel
web. En un teléfono, esa URL abría el navegador. Las pantallas de la app ya
existían desde PARITY-0 y **no se llegaba a ellas por el camino real**.

Este documento recoge qué hace falta para que el mismo enlace abra la app si
está instalada y la web si no lo está, qué queda cerrado y qué no puede
cerrarse todavía.

## Un solo enlace, dos destinos

No hay una segunda lógica de correos para móvil, y es deliberado: la API sigue
construyendo `${WEB_APP_URL}/reset-password?token=…` y
`${WEB_APP_URL}/accept-invitation?token=…`. Quien no lleve RINDA instalada
aterriza en el panel exactamente igual que antes.

Lo único que cambia es quién atiende ese enlace en un teléfono con la app.

| lo que envía la API | pantalla del móvil |
| --- | --- |
| `/reset-password` | `/restablecer` |
| `/accept-invitation` | `/invitacion` (aceptar y vincular) |

La traducción vive en `apps/mobile/src/enlaces/entrada.ts`, y
`app/+native-intent.ts` no hace más que llamarla. No se renombraron las
pantallas porque esas URLs las tiene que seguir entendiendo el navegador.

`/verify-email` **no** entra: la verificación de correo está desactivada
(`requireEmailVerification: false`), no hay pantalla en el móvil y tampoco
existe esa ruta en el panel web.

## iOS — cerrado

- `ios.associatedDomains: ["applinks:gymlabfit.tech"]`. La configuración
  resuelta produce el entitlement `com.apple.developer.associated-domains`.
- `apps/web/public/.well-known/apple-app-site-association`, con el `appID`
  `956JGXGTKZ.tech.gymlabfit.rinda` y **solo** las dos rutas de arriba.

### El detalle que lo rompía en silencio

`apple-app-site-association` no tiene extensión —lo exige Apple— y vive en un
directorio que empieza por punto. Dos consecuencias, las dos medidas:

1. **Express 5 devuelve 404 para cualquier fichero bajo un directorio con
   punto.** La documentación de Express 4 decía lo contrario. Por eso
   `panel.ts` monta `/.well-known` aparte, en lugar de abrir `dotfiles` en el
   montaje general, que dejaría salir también `.env` o `.git`.
2. **Sin extensión, `serve-static` no pone `Content-Type`.** Apple pide
   `application/json`, y Caddy manda `X-Content-Type-Options: nosniff`, así que
   no hay adivinanza del cliente que lo salve. La cabecera se pone en el código
   que sirve el fichero, no en la configuración del hosting.

Los dos casos tienen test, y los dos sabotajes se detectan.

### Lo que falta para que funcione de verdad

**Un despliegue.** iOS pide el fichero al instalar la app, y hoy
`https://gymlabfit.tech/.well-known/apple-app-site-association` responde 404
porque lo que corre en el VPS es anterior a este cambio. Después del despliegue:

```bash
curl -i https://gymlabfit.tech/.well-known/apple-app-site-association
```

Debe dar `200`, `Content-Type: application/json` y ninguna redirección. Cuando
Apple lo haya rastreado, su copia aparece en:

```bash
curl -i https://app-site-association.cdn-apple.com/a/v1/gymlabfit.tech
```

## Android — NO se puede cerrar todavía

Lo que sí está hecho:

- `android.intentFilters` con `autoVerify: true`, `scheme: https`,
  `host: gymlabfit.tech` y las dos rutas exactas.

Mientras no haya `assetlinks.json` válido, la verificación falla y los enlaces
se van al navegador. **Ese es el respaldo correcto**, no un fallo: la web sigue
atendiendo. Y como la verificación ocurre al instalar, no hará falta volver a
compilar cuando el fichero exista.

Lo que falta, y por qué no se puede inventar:

`/.well-known/assetlinks.json` necesita la **huella SHA-256 de la firma que
realmente use la app**. Hoy no existe ninguna: nunca se ha construido RINDA
para Android, así que EAS no tiene almacén de claves y no hay Play Console. Una
huella inventada deja un fichero que parece hecho y no verifica nada.

### Cuando exista la firma de producción

1. Obtener la huella de la clave de subida (`eas credentials`, plataforma
   Android) **y** la de Play App Signing (Play Console → Integridad de la app).
   Hacen falta **las dos**: Google vuelve a firmar lo que se publica, y sin la
   de subida no verificarían las pruebas internas ni los APK laterales.
2. Crear `apps/web/public/.well-known/assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "tech.gymlabfit.rinda",
      "sha256_cert_fingerprints": ["<huella de subida>", "<huella de Play>"]
    }
  }
]
```

3. Desplegar y comprobar con el servicio de Google:

```bash
curl "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://gymlabfit.tech&relation=delegate_permission/common.handle_all_urls"
```

El test de `apps/api/src/__tests__/enlaces-de-la-app.test.ts` no exige que el
fichero exista, pero **el día que aparezca** comprueba que el paquete es el
correcto y que las huellas tienen forma de SHA-256 de verdad. Un hueco sin
rellenar no pasa de ahí.

## Lo que no se puede comprobar sin un teléfono

El salto que da el sistema operativo —recibir el toque en el enlace y decidir
abrir la app en vez del navegador— sólo ocurre en un dispositivo real, con la
app instalada y el fichero servido en producción. No hay simulador de iOS
disponible desde Windows, y para Android no existe todavía una compilación.

Todo lo anterior a ese salto sí está comprobado de forma automática: el fichero
y su contenido, cómo lo sirve la API, la configuración nativa resuelta, la
traducción de rutas y las cinco entradas (reset válido, sin token, token en
blanco, invitación y vincular).
