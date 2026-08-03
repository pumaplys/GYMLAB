# ADR-0013 — El QR lo genera el socio desde una web, no desde una app

- **Fecha:** 2026-08-03
- **Estado:** Aceptado
- **Relacionado:** ADR-0004 (stack), asunción A6 (validación online del QR), módulo 4

## Contexto

El módulo de acceso está construido, probado y **es funcionalidad muerta**: el
token solo se puede pedir desde una sesión de socio, y el socio no tiene con qué
pedirlo. El diseño original asumía una app móvil.

Esa app es la única pieza del proyecto cuya fecha **no depende de nosotros**:
cuentas de desarrollador, firma, y revisión de tienda que puede tardar días o
semanas. Con el objetivo de la Fase 2 siendo *«tres gimnasios usándolo a diario»*,
poner el arranque del piloto detrás de una cola de revisión ajena era el mayor
riesgo de calendario del proyecto.

## El detalle que decide el análisis

**El token es opaco para el cliente**, y el contrato lo dice explícitamente: una
cadena que se pinta como QR y se devuelve. Al servidor le da igual quién la pidió
mientras sea una sesión de socio válida.

Es decir: el tipo de cliente **nunca formó parte del diseño de seguridad**. Esa
propiedad, que se escribió por otro motivo, es la que hace barata esta decisión.

## Alternativas consideradas

**Solo app nativa.** Lo diseñado. Mejor experiencia y la única que controla el
brillo de pantalla, pero deja el piloto esperando a una tienda.

**Que recepción genere el QR del socio en el mostrador.** Se descarta porque no se
sostiene: si recepción ya ha identificado a la persona para buscarla en el panel,
escanear su propia pantalla no aporta nada. La versión honesta de esa idea es
«recepción registra la entrada a mano», que es otra cosa —no evita la cola que el
QR venía a evitar— y además mezclaría en `access_events` entradas presentadas por
el socio con entradas tecleadas por el personal, dejando la métrica de asistencia
sin significado claro.

## Decisión

**El socio genera su QR desde una aplicación web**, con su misma cuenta y su misma
sesión.

- **Cambios en el backend: ninguno.** El endpoint `POST /v1/me/access/token` ya
  sirve. Lo único que se toca es añadir el origen a `CORS_ORIGINS`, que es
  configuración.
- **Modelo de seguridad: sin cambios.** Mismo HMAC con clave derivada por
  gimnasio, mismo TTL de 60 segundos, mismo `jti` de un solo uso, misma ventana de
  tolerancia a reintentos.
- **La app móvil pasa a ser una optimización de experiencia**, no un requisito
  para validar el producto.

## Consecuencias

**Positivas**

El piloto deja de depender de terceros. Se puede validar el flujo de acceso con
usuarios reales semanas antes.

La web del socio no es trabajo desechable: son las mismas pantallas, la misma
autenticación y los mismos contratos que necesitaría la app.

Deja de haber una razón para ampliar el backend: el módulo 4 se estrena tal cual
está.

**Negativas**

**El navegador no puede forzar el brillo de la pantalla, y una app sí.** Un móvil
en ahorro de batería, tras el cristal de un lector y con la luz del gimnasio
encima, puede fallar al escanear. Se mitiga —no se resuelve— pintando el QR
grande, con margen y sobre blanco puro.

Es la contrapartida real de esta decisión, y conviene no minimizarla: es el punto
donde una app gana de verdad.

**Coste de revertir:** bajo. Construir la app después no invalida nada de lo
hecho; reutiliza los mismos endpoints.

## Cómo se verifica

No con tests: **con el piloto**. Es una decisión de producto y su comprobación es
de campo.

- ¿Escanea bien en la puerta, con móviles reales y luz real?
- ¿Los socios entran a la web, o piden una app?

## Señales para revisarla

- **Fallos de escaneo atribuibles al brillo o al rendimiento del navegador.** Ese
  es el dato objetivo que justifica desarrollar la app nativa; sin él, la app es
  una preferencia.
- Los socios no adoptan la web y la asistencia registrada no refleja la real.
  Entonces toca decidir entre la app o el registro manual en el mostrador — que
  existe como plan de contingencia y, si se implementa, **debe marcar el evento
  como manual** para no contaminar la métrica.
- Aparece un torno físico. Eso cambia otra cosa distinta: la validación pasaría a
  ser offline con Ed25519, como ya prevé `01-arquitectura.md`.
