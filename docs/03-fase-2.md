# Fase 2 — Del MVP a un producto usable

> Estado: **por planificar**. Fecha: 2026-08-02.
> Punto de partida: Fase 1 cerrada, siete módulos y 266 tests en verde.

---

## El punto de partida honesto

La API está completa y probada. **Y nadie puede usarla**, porque no hay interfaz.

Ese es el hecho que ordena esta fase entera: el objetivo de la Fase 1 era «tres
gimnasios piloto usándolo a diario» y no se ha cumplido — no por falta de
funcionalidad, sino porque un dueño de gimnasio no va a escribir peticiones HTTP
a mano.

Todo lo que sigue se ordena por esa vara: **¿acerca esto a que un gimnasio real
lo abra por la mañana?**

---

## Imprescindible

Sin esto no hay piloto.

### 1. Panel web para el gimnasio

Lo que hace falta para operar: alta y búsqueda de socios, cobrar y registrar
pagos, ver quién debe, y el escáner de QR en el mostrador. **No** hace falta que
cubra los siete módulos desde el primer día — recepción vive en tres pantallas.

Es lo más grande de la fase y lo primero que hay que empezar.

### 2. Los textos legales

Consentimiento de datos de salud, política de privacidad y condiciones del
servicio, con su versión. **Bloquea el módulo 6 por completo**: hoy no acepta ni
un peso, a propósito.

No es trabajo de desarrollo, y por eso conviene empezarlo ya: depende de terceros.

### 3. Puesta en producción

Hosting, dominio, TLS, copias de seguridad **con restauración probada** —una copia
que nunca se ha restaurado no es una copia—, `trust proxy`, y Sentry para
enterarse de los fallos antes que el cliente.

### 4. Agregados de asistencia ⏳

**Sube a imprescindible por irreversibilidad, no por importancia.**

`access_events` se purga según la retención de cada gimnasio, doce meses por
defecto. Todo lo demás de esta lista espera sin degradarse; esto no: pasada la
primera purga, el detalle no vuelve y ninguna cantidad de trabajo posterior lo
recupera. Deja de ser una optimización y pasa a ser un requisito previo.

No es urgente en semanas —hace falta un gimnasio con doce meses de historia—,
pero sí antes de que eso ocurra, y por eso no puede quedar en la lista de «ya se
verá».

### 5. App móvil del socio, mínima

Ver su cuota, generar el QR y consultar su rutina.

**Su posición depende de una decisión de producto que sigue abierta:** hoy el QR
solo se genera desde el móvil del socio, así que sin app el módulo 4 es
funcionalidad muerta. Si el QR resulta ser el gancho comercial, esto sube al
nivel del panel web; si el piloto puede arrancar sin control de acceso, baja.
Antes de decidirlo conviene saber si el código puede generarse desde el propio
panel o por otra vía temporal.

---

## Necesario, pero no el primer día

### 6. Onboarding del gimnasio

Hoy el alta exige un código de plataforma y crear todo a mano. Para el tercer o
cuarto cliente, eso deja de escalar.

### 7. Informes exportables

Un gestor va a pedir los pagos del trimestre en algo que abra Excel.

---

## Opcional, según lo que pidan los pilotos

Nada de esto se construye «por si acaso». Se construye cuando un gimnasio lo pida
dos veces.

| | Qué desbloquearía |
|---|---|
| **Pasarela de pago** (Stripe Connect) | Cambiaría la asunción A1 y con ella el módulo de cuotas entero. Decisión de producto, no técnica |
| **Bonos de sesiones** | Se descartó en el MVP: obliga a que el QR descuente al entrar, y la validación pasa a ser una escritura con concurrencia |
| **Apilar roles** | Que un dueño pueda además entrenar y tener socios asignados |
| **Fotos de progreso** | Almacenamiento cifrado, URLs firmadas y retención propia |
| **Vídeos en los ejercicios** | Mismo problema; además conviene que el medio cuelgue de la plantilla y no de cada copia (ADR-0012) |
| **QR sin conexión** (Ed25519) | Solo si aparece un torno físico. Ya previsto en `01-arquitectura.md` |
| **Multi-sede real** | La jerarquía `organizations → gyms` existe desde el día uno; nadie la ha usado todavía |
| **Reserva de clases** | La petición más previsible en cuanto haya salas con aforo |

---

## Lo que sigue fuera, y conviene recordarlo

Dietas inteligentes · comunidad · gamificación · wearables · marca blanca ·
IA avanzada · 2FA.

Esta lista era un contrato con uno mismo en la Fase 1 y se cumplió. Sigue
sirviendo: si algo de aquí aparece en un PR, ha fallado el alcance.

---

## Cómo se trabaja

Igual que hasta ahora, porque ha funcionado:

- **Un PR por módulo**, con commits pequeños y coherentes.
- **Tests de abuso**, no solo del camino feliz.
- **Verificación por falsificación** en todo límite de seguridad: si un test no
  sabe fallar, no demuestra nada.
- **Verificación desde entorno limpio** antes de cada PR: volumen destruido, sin
  artefactos, migración desde base vacía.
- **ADR** solo para decisiones caras de revertir.
- **Revisión antes de fusionar** cualquier cambio del modelo legal o de
  autorización.

Y una regla nueva, aprendida en esta fase: **quien implementa un punto de
extensión es una clase dedicada y sin dependencias hacia quien lo invoca.** Lo
contrario deja a Nest colgado en el arranque sin ningún error.
