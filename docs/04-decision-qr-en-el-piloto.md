# Decisión pendiente — Cómo llega el QR al socio en el piloto

> Documento de decisión, no de arquitectura. Cuando se cierre se convierte en
> ADR-0013 y este fichero desaparece.
>
> Condiciona el orden de la Fase 2. Fecha: 2026-08-03.

## El problema, en una frase

El módulo 4 está construido y probado, y **hoy es funcionalidad muerta**: el token
solo se puede pedir desde una sesión de socio, y el socio no tiene con qué.

## Lo que ya existe y no cambia

```
POST /v1/me/access/token        el socio pide su token   (60 s, un solo uso)
POST /v1/gyms/:id/access/verify recepción lo verifica    (semáforo)
```

Un detalle que decide buena parte del análisis: **el token es opaco para el
cliente**. El contrato lo dice explícitamente — una cadena que se pinta como QR y
se manda de vuelta. Al servidor le da igual quién la pidió, mientras sea una
sesión de socio válida.

---

## Opción 1 — Solo desde la app móvil

Lo diseñado. El socio abre la app, la app pide el token cada pocos segundos y lo
pinta.

**Cambios necesarios:** una app React Native/Expo con login, pantalla de QR y poco
más. Publicación en dos tiendas.

**Arquitectura:** ninguno. Ya está previsto.

**Seguridad:** la de referencia. Nada que analizar.

**Experiencia:** la mejor, y hay una razón concreta que no es estética: **una app
nativa puede forzar el brillo de la pantalla al máximo**. Un móvil en modo ahorro,
detrás del cristal de un lector y con la luz del gimnasio encima, falla al
escanear. El navegador no puede subir el brillo.

**Esfuerzo:** alto, y no todo es nuestro. Cuentas de desarrollador, firma,
provisioning, y **revisión de tienda: días o semanas fuera de nuestro control**.

**Calendario:** el piloto no puede empezar con control de acceso hasta que la app
esté aprobada. Es la única pieza del proyecto cuya fecha no depende de nosotros.

---

## Opción 2 — También desde el panel web

Aquí hay que separar dos cosas que suenan igual y no lo son. La diferencia importa
más que la opción en sí.

### 2a — Recepción genera el QR del socio en el mostrador

El socio llega, recepción lo busca, genera su QR y… lo escanea.

**Y ahí se cae sola.** Si recepción ya ha identificado a la persona para buscarla,
escanear su propia pantalla no aporta nada. La versión honesta de esta idea no es
«QR desde el panel», es **«recepción registra la entrada a mano»**, sin QR.

Eso sí tiene sentido como plan B, pero es otra cosa:

- **Cambios:** un endpoint para registrar una entrada sin token y una pantalla.
- **Seguridad:** no se rompe nada criptográfico —recepción ya puede abrir la
  puerta físicamente—, pero **contamina el dato**: `access_events` mezclaría
  entradas presentadas por el socio con entradas tecleadas por el personal. Si se
  hace, la fila debe distinguirlo, o la asistencia del dashboard deja de
  significar lo que dice.
- **Experiencia:** cola en el mostrador. Es exactamente lo que el QR venía a
  evitar.

### 2b — El socio genera su QR desde una página web

El socio entra desde el navegador de su móvil, con su misma cuenta, y ve su QR.

**Cambios necesarios en el backend: NINGUNO.** El endpoint ya existe y no le
importa el tipo de cliente. Lo único que hay que tocar es una lista de
configuración: añadir el origen del sitio a `CORS_ORIGINS`. Eso es un valor de
entorno, no arquitectura.

**Arquitectura:** sin impacto. Es el mismo cliente que ya está previsto, servido
por otro medio.

**Seguridad: idéntica.** Mismo HMAC con clave derivada por gimnasio, mismo TTL de
60 s, mismo `jti` de un solo uso, misma ventana de reintento. El tipo de cliente
no forma parte del modelo de amenazas, y por eso no lo mueve.

Dos matices reales, ninguno nuevo:

- Una captura de pantalla compartida sigue sin servir: el token vive 60 segundos.
- La sesión de socio dura 90 días, así que no tendrá que autenticarse cada vez —
  igual que en la app.

**Experiencia:** buena, con **una pega concreta y verificable en la puerta**: el
brillo. Es el único punto donde la app gana de verdad, y se mitiga —no se
resuelve— pintando el QR grande, con margen y sobre fondo blanco puro.

**Esfuerzo: bajo.** Dos pantallas —entrar y ver el código— sobre el mismo stack,
la misma autenticación y los mismos contratos que el panel web que hay que
construir igualmente. Sin tiendas, sin firma, sin revisión.

**Calendario: es lo que desbloquea el piloto.** Sale a la vez que el panel y no
depende de terceros.

---

## Comparación

| | 1 · App | 2a · Recepción teclea | 2b · Web del socio |
|---|---|---|---|
| Cambios en el backend | ninguno | endpoint + pantalla | **ninguno** |
| Impacto en arquitectura | ninguno | ensucia `access_events` | ninguno |
| Seguridad | referencia | sin cambio criptográfico | **idéntica** |
| Brillo de pantalla | ✅ controlable | n/a | ⚠️ no controlable |
| Cola en el mostrador | no | **sí** | no |
| Esfuerzo | alto | bajo | bajo |
| Depende de terceros | **sí (tiendas)** | no | no |

---

## Recomendación: **2b**, y explícitamente no 2a

**El piloto arranca con la web del socio.** Es la única opción que desbloquea el
módulo 4 sin tocar el backend, sin cambiar el modelo de seguridad y sin poner la
fecha del piloto en manos de la revisión de una tienda.

**Y la app no se cancela: se pospone con criterio.** La web del socio no es
trabajo desechable — son las mismas pantallas y los mismos contratos que la app
necesitará, probados antes con usuarios reales. Si el brillo resulta ser un
problema de verdad en la puerta, eso es precisamente el dato que justifica pagar
la app; si no lo es, habremos ahorrado semanas.

**2a se descarta como sustituto**, pero conviene tenerla escrita como plan de
contingencia: si un gimnasio piloto no consigue que sus socios usen la web, una
pantalla de «registrar entrada» permite seguir midiendo asistencia. Con una
condición: que el evento quede marcado como registro manual, o la métrica de
asistencia dejará de significar lo que dice.

## Consecuencia sobre el orden de la Fase 2

Con esta decisión, la app móvil **baja** de imprescindible a «según lo que pidan
los pilotos», y el orden queda:

1. Panel web del gimnasio **+ web del socio** *(mismo stack, misma sesión)*
2. Textos legales
3. Puesta en producción
4. Agregados de asistencia
5. App móvil — solo si el brillo o la retención lo justifican

## Lo que hace falta decidir

1. **La opción.** 2b, o alguna de las otras.
2. **Si se construye 2a como contingencia** desde el principio o solo si hace
   falta. Recomiendo lo segundo: aún no sabemos si hará falta.
3. **Una pregunta que no es técnica y conviene responder antes de construir:**
   ¿los socios de los gimnasios piloto usarían una web, o esperan una app? Si la
   respuesta es «esperan una app», este documento cambia.
