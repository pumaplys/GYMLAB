# Fase 2 — Del MVP a un producto usable

> Estado: **planificada**. Última actualización: 2026-08-03.
> Punto de partida: Fase 1 cerrada, siete módulos y 277 tests en verde.
>
> **El objetivo es uno solo:** que tres gimnasios usen el producto a diario y den
> feedback real, antes de plantear ninguna funcionalidad nueva.
>
> La primera decisión ya está cerrada:
> [ADR-0013](adr/0013-el-qr-se-genera-desde-la-web-del-socio.md) — el QR lo genera
> el socio desde la web, no desde una app. Eso convierte la fase en **frontend**,
> no en más backend.

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

> **El backend deja de crecer.** La Fase 1 entregó siete módulos completos y
> probados; lo que falta no es funcionalidad, es que alguien pueda usarla. A
> partir de aquí solo se toca el backend si el frontend descubre una necesidad
> real, y esa necesidad se argumenta antes de escribirla.

### 1. Panel web para el personal

Lo que hace falta para operar: alta y búsqueda de socios, cobrar y registrar
pagos, ver quién debe, y el escáner de QR en el mostrador. **No** hace falta que
cubra los siete módulos desde el primer día — recepción vive en tres pantallas.

Es lo más grande de la fase y lo primero que hay que empezar.

### 2. Portal web del socio

Ver su cuota, **generar su QR de acceso** y consultar su rutina.

Es lo que estrena el módulo 4, hoy funcionalidad muerta. Por
[ADR-0013](adr/0013-el-qr-se-genera-desde-la-web-del-socio.md) el QR se genera
aquí y no en una app nativa: **no requiere ni un cambio en el backend** y quita
del camino crítico la revisión de una tienda, que era la única fecha del proyecto
que no dependía de nosotros.

Mismo stack, misma sesión y mismos contratos que el panel, así que sale a la vez.

### 3. Textos legales y consentimiento

Consentimiento de datos de salud, política de privacidad y condiciones, con su
versión. **Bloquea el módulo 6 por completo**: hoy no acepta ni un peso, a
propósito. Y la política de privacidad hará falta en cuanto el panel trate datos
personales, así que no es solo cosa del módulo 6.

No es trabajo de desarrollo y depende de terceros: conviene empezarlo ya.

### 4. Agregados de asistencia ⏳

**Está aquí por irreversibilidad, no por importancia.**

`access_events` se purga según la retención de cada gimnasio, doce meses por
defecto. Todo lo demás de esta lista espera sin degradarse; esto no: pasada la
primera purga, el detalle no vuelve y ningún trabajo posterior lo recupera.

No es urgente en semanas —hace falta un gimnasio con doce meses de historia—,
pero sí antes de que eso ocurra.

### 5. Preparación para producción

Hosting, dominio, TLS, copias de seguridad **con restauración probada** —una copia
que nunca se ha restaurado no es una copia—, `trust proxy`, y Sentry para
enterarse de los fallos antes que el cliente.

### 6. App móvil — solo con evidencia

**No se construye por defecto.** Por ADR-0013 es una optimización de experiencia,
no un requisito para validar el producto.

Se construye si el piloto aporta el dato: fallos de escaneo atribuibles al brillo
de pantalla o al rendimiento del navegador, o socios que no adoptan la web. Sin
ese dato, es una preferencia.

---

## Necesario, pero no el primer día

### 7. Onboarding del gimnasio

Hoy el alta exige un código de plataforma y crear todo a mano. Para el tercer o
cuarto cliente, eso deja de escalar.

### 8. Informes exportables

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
