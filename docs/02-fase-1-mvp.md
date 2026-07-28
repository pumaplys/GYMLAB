# Fase 1 — El MVP

> Estado: **plan aprobado, sin empezar**. Fecha: 2026-07-28.
> Punto de partida: Fase 0 cerrada en `3fd8ced`.

---

## 0. El objetivo, en una frase

> **Tres gimnasios piloto usando GYMLAB a diario para gestionar sus socios.**

No "el MVP terminado". Terminado no significa nada; usado a diario, sí. Un
módulo que nadie abre en dos semanas estaba mal priorizado, y conviene
enterarse pronto.

---

## 1. Qué entra, y qué no

**Entra:** clientes, entrenadores, suscripciones, rutinas, seguimiento del peso,
QR de acceso y dashboard del dueño.

**No entra** — y esta lista es un contrato con uno mismo:

dietas inteligentes · comunidad · gamificación · wearables · marca blanca ·
IA avanzada · tablet de recepción · reserva online pública · multi-sede real ·
2FA · onboarding self-service

Si algo de aquí aparece en un PR, ha fallado el alcance, no el código.

---

## 2. Orden de implementación

### Paso 0 — Proveedor de correo (Resend)

**No es un módulo, y aun así va primero.**

El alta de un socio *es* una invitación por email. Hoy el consumidor de la cola
**falla a propósito en producción** para que los correos queden pendientes en
lugar de perderse, así que el flujo está completo y probado salvo el envío. Sin
esto, el módulo de socios no se puede usar de verdad — ni un socio recuperar su
contraseña.

El worker y las colas ya existen: es sustituir el registro simulado por una
llamada real.

| | |
|---|---|
| Tamaño | Pequeño |
| Desbloquea | Todo lo demás |
| Riesgo | Bajo. La cola ya absorbe los fallos y reintenta |

### Los siete módulos

| # | Módulo | Depende de | Por qué en esa posición |
|---|---|---|---|
| 1 | **Socios** | 0 | Todo cuelga de un socio. Aquí entra `consents` |
| 2 | **Entrenadores y asignaciones** | 1 | Quien asigna una rutina es un entrenador con socios asignados |
| 3 | **Planes y suscripciones** | 1 | Define si un socio está *activo*, dato que el QR necesita para decidir |
| 4 | **Acceso por QR** | 1, 3 | Lo más visible para el gimnasio; ya diseñado en detalle |
| 5 | **Rutinas** | 1, 2 | |
| 6 | **Progreso y peso** | 1 | Datos de salud (art. 9): exige que `consents` funcione |
| 7 | **Dashboard** | todos | Lee de los anteriores; por definición va al final |

El orden sigue **dependencias reales**, no valor percibido. El QR es lo que más
ilusión hace y va cuarto porque antes necesita saber quién es socio y si está al
corriente de pago.

---

## 3. Detalle por módulo

### 1. Socios

Ficha del socio, alta por invitación, baja, búsqueda y listado.

**Aquí se salda la deuda de `consents`**, aplazada desde la Fase 0 porque exige
decisiones que no son técnicas:

- Qué textos se aceptan y con qué versión.
- Si el consentimiento para datos de salud se pide en el alta o al registrar el
  primer peso.
- Qué pasa cuando alguien lo revoca teniendo ya datos guardados.

**Son preguntas para ti, no para mí.** Las plantearé antes de escribir el módulo.

Recordatorio de diseño: `users` es identidad global; `members` es la ficha dentro
de un gimnasio. Una persona puede ser socia de dos gimnasios con una sola cuenta.

### 2. Entrenadores y asignaciones

Perfil del entrenador y relación entrenador ↔ socio. La pertenencia ya existe
desde la Fase 0; esto añade el perfil y la asignación.

**Punto de atención:** el rol `trainer` debe ver **solo sus socios asignados**,
no todos los del gimnasio. RLS aísla entre gimnasios, no dentro de uno. Ese
filtro es autorización de aplicación y hay que probarlo con tests de abuso.

### 3. Planes y suscripciones

Planes del gimnasio, suscripción de cada socio y sus estados: activa, vencida,
pausada, cancelada.

**Bloqueante:** confirmar la asunción A1 (ver sección 5).

Detalle que los gimnasios piden siempre y conviene modelar desde el principio:
**congelar la cuota** por vacaciones o lesión. Añadirlo después obliga a
recalcular fechas de vencimiento ya emitidas.

### 4. Acceso por QR

Diseño cerrado en `01-arquitectura.md`: token firmado con 60 s de vida, un solo
uso, y respuesta semáforo `ALLOW` / `DENY` / `WARN`.

El QR estático está descartado: se fotografía y circula por WhatsApp la misma
tarde.

Todo intento se registra en `access_events`, que es además lo que alimenta el
dashboard de asistencia.

### 5. Rutinas

Biblioteca de ejercicios, plantillas y asignación a un socio.

**Decisión pendiente:** si la biblioteca de ejercicios es global de la plataforma
o propia de cada gimnasio. Global se comparte y ahorra trabajo; propia permite
personalizar. Probablemente global con posibilidad de añadir propios — pero es
una decisión de producto.

### 6. Progreso y peso

Peso y medidas. **Categoría especial del RGPD (art. 9).**

Consecuencias que ya están escritas y hay que respetar: recepción **no** accede a
estos datos, cada registro exige consentimiento vigente, y el borrado por derecho
al olvido tiene que alcanzarlos.

Las fotos de progreso quedan **fuera del MVP**: exigen almacenamiento cifrado,
URLs firmadas y política de retención propia.

### 7. Dashboard

Socios activos, altas y bajas del mes, asistencia, cuotas por vencer.

Se construye al final porque lee de todos los demás. Empezar por aquí llevaría a
inventar métricas sobre datos que aún no existen.

---

## 4. Riesgos

| Riesgo | Severidad | Mitigación |
|---|---|---|
| **Alcance que se dispara** | Alta | La lista de "no entra" de la sección 1. El QR y la IA son los dos imanes de distracción |
| **`trainer` viendo socios que no le corresponden** | Alta | RLS no cubre esto: es autorización de aplicación. Tests de abuso obligatorios en el módulo 2 |
| **Datos de salud sin consentimiento** | Alta | `consents` debe funcionar antes del módulo 6, no a la vez |
| **Congelar cuotas añadido tarde** | Media | Modelarlo en el módulo 3 desde el principio |
| **A1 sin cerrar al llegar al punto 3** | Media | Preguntarlo ya (sección 5) |
| **Los pilotos no usan lo construido** | Media | Ponerlo en sus manos módulo a módulo, no al final |

---

## 5. Lo que necesito de ti antes de empezar

**1. Asunción A1 — ¿mueve GYMLAB el dinero de las cuotas de los socios?**

La asumí que **no** desde el primer día y nunca se confirmó. Si la respuesta es
sí, entran Stripe Connect, verificación de identidad de cada gimnasio y
liquidaciones: eso no es un detalle del módulo 3, es un producto dentro de él.

Hay que cerrarla **antes del módulo 3**, y cuanto antes mejor.

**2. Consentimientos** — textos, versionado y momento en que se piden (módulo 1).

**3. Biblioteca de ejercicios** — global de la plataforma o propia de cada
gimnasio (módulo 5).

Ninguna bloquea el paso 0 ni el módulo 1: se puede empezar hoy.

---

## 6. Cómo se trabaja

Igual que en la Fase 0, porque ha funcionado:

- **Un PR por módulo**, con commits pequeños y coherentes dentro.
- **Tests de abuso, no solo del camino feliz.** Lo que ha encontrado los fallos
  reales han sido los tests que intentan romper las cosas.
- **Verificación por falsificación** en todo lo que sea un límite de seguridad:
  si un test no sabe fallar, no demuestra nada.
- **Toda tabla nueva con `gym_id`** lleva su política RLS y su caso en el test de
  aislamiento. El guardarraíl del catálogo lo vigila solo.
- **Ningún I/O externo síncrono** dentro de un handler (ADR-0008).
- **ADR** solo para decisiones caras de revertir, no para cada elección.

---

## 7. Deuda de la Fase 0 que sigue viva

Está detallada en [`00-estado.md`](00-estado.md). La que afecta a la Fase 1:

| Qué | Cuándo toca |
|---|---|
| Sin proveedor de correo | **Paso 0** |
| `consents` sin usar | Módulo 1 |
| `slug` es el UUID del gimnasio | Cuando haya URLs públicas, probablemente con el dashboard |
| `trust proxy` sin configurar | Antes de producción: sin él, `x-forwarded-for` no es fiable y el límite de intentos pierde precisión |
