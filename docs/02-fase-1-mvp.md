# Fase 1 — El MVP

> Estado: **en curso**. Última actualización: 2026-07-30.
> Punto de partida: Fase 0 cerrada en `3fd8ced`.
>
> **Hecho:** paso 0 (Resend), módulo 1 (socios), módulo 2 (entrenadores).
> **Siguiente:** módulo 3, planes y suscripciones — **bloqueado por A1**
> (sección 5). El avance vivo está en [`00-estado.md`](00-estado.md).

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

### Paso 0 — Proveedor de correo (Resend) ✅

**No era un módulo, y aun así fue primero**, porque el alta de un socio *es* una
invitación por email y sin envío el módulo 1 no se podía usar de verdad.

Dos transportes intercambiables —Resend en producción, consola en desarrollo— y
clasificación de errores en transitorio / permanente / desconocido, que es lo que
decide si pg-boss reintenta o se rinde. En producción la aplicación **no arranca**
sin `RESEND_API_KEY`: mejor no desplegar que desplegar mudo.

### Los siete módulos

| # | Módulo | Estado | Depende de | Por qué en esa posición |
|---|---|---|---|---|
| 1 | **Socios** | ✅ | 0 | Todo cuelga de un socio. `consents` sigue pendiente |
| 2 | **Entrenadores y asignaciones** | ✅ | 1 | Quien asigna una rutina es un entrenador con socios asignados |
| 3 | **Planes y suscripciones** | ⛔ A1 | 1 | Define si un socio está *activo*, dato que el QR necesita para decidir |
| 4 | **Acceso por QR** | | 1, 3 | Lo más visible para el gimnasio; ya diseñado en detalle |
| 5 | **Rutinas** | | 1, 2 | |
| 6 | **Progreso y peso** | | 1 | Datos de salud (art. 9): exige que `consents` funcione |
| 7 | **Dashboard** | | todos | Lee de los anteriores; por definición va al final |

El orden sigue **dependencias reales**, no valor percibido. El QR es lo que más
ilusión hace y va cuarto porque antes necesita saber quién es socio y si está al
corriente de pago.

---

## 3. Detalle por módulo

### 1. Socios ✅

Ficha del socio, alta por invitación, baja, búsqueda y listado. La invitación
quedó en dos endpoints separados por seguridad: ver
[ADR-0010](adr/0010-dos-endpoints-para-aceptar-invitaciones.md).

**`consents` NO se saldó**, y fue una decisión consciente: se prefirió dejar el
dato pendiente antes que inventar una versión de documento. Sigue exigiendo
decisiones que no son técnicas, y ahora bloquea el módulo 6:

- Qué textos se aceptan y con qué versión.
- Si el consentimiento para datos de salud se pide en el alta o al registrar el
  primer peso.
- Qué pasa cuando alguien lo revoca teniendo ya datos guardados.

**Son preguntas para ti, no para mí.** Las plantearé antes de escribir el módulo.

Recordatorio de diseño: `users` es identidad global; `members` es la ficha dentro
de un gimnasio. Una persona puede ser socia de dos gimnasios con una sola cuenta.

### 2. Entrenadores y asignaciones ✅

Perfil del entrenador y relación entrenador ↔ socio. La pertenencia ya existía
desde la Fase 0; esto añadió el perfil y la asignación.

**El punto de atención se cumplió como estaba previsto:** el rol `trainer` ve
solo sus socios asignados. RLS no puede imponerlo —dentro de un gimnasio, el
entrenador y el dueño son el mismo rol de PostgreSQL—, así que se resolvió por
construcción: `trainer` **no aparece en ninguna ruta del personal**, y sus
endpoints parten del `userId` de la sesión. Falsificado: sin el filtro, vería los
11 socios del gimnasio en lugar de 1.

Tres decisiones de producto que se tomaron aquí:

- **Un socio puede tener varios entrenadores a la vez.** En un gimnasio real
  alguien hace fuerza con uno y rehabilitación con otro. Consecuencia para el
  módulo 7: «socios atendidos» necesita `COUNT(DISTINCT member_id)`, no la suma
  de los contadores por entrenador.
- **Dar de baja a un entrenador termina sus asignaciones.** Bloquear la baja
  hasta reasignar deja al dueño sin poder dar de baja a quien se fue ayer.
- **Un socio de baja desaparece de la lista pero conserva la asignación**, así
  que al reactivarlo recupera a su entrenador sin reasignar nada.

**Deuda que dejó:** la clave ajena de `trainer_assignments` no es compuesta, de
modo que una asignación puede apuntar a un socio de otro gimnasio. No hay fuga
—RLS filtra la lectura— pero se arregla en un PR de integridad propio antes del
módulo 5.

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

| Riesgo | Severidad | Estado |
|---|---|---|
| **Alcance que se dispara** | Alta | Vivo. La lista de "no entra" de la sección 1. El QR y la IA son los dos imanes de distracción |
| **`trainer` viendo socios que no le corresponden** | Alta | ✅ **Mitigado en el módulo 2** por construcción, y falsificado |
| **Datos de salud sin consentimiento** | Alta | Vivo. `consents` sigue sin usarse y debe funcionar **antes** del módulo 6 |
| **A1 sin cerrar al llegar al punto 3** | Alta | **Se cumplió el riesgo.** El punto 3 es el siguiente y A1 sigue abierta |
| **Congelar cuotas añadido tarde** | Media | Vivo. Modelarlo en el módulo 3 desde el principio |
| **Los pilotos no usan lo construido** | Media | Vivo. Ponerlo en sus manos módulo a módulo, no al final |

---

## 5. Lo que necesito de ti antes de empezar

**1. Asunción A1 — ¿mueve GYMLAB el dinero de las cuotas de los socios?**
⛔ **Bloquea el siguiente módulo.**

La asumí que **no** desde el primer día y nunca se confirmó. Si la respuesta es
sí, entran Stripe Connect, verificación de identidad de cada gimnasio y
liquidaciones: eso no es un detalle del módulo 3, es un producto dentro de él.

Ya no hay margen: el módulo 3 es el siguiente que toca.

**2. Consentimientos** — textos, versionado y momento en que se piden. Bloquea el
módulo 6. En el módulo 1 se decidió **dejar el dato pendiente antes que inventar
una versión ficticia**, y esa decisión sigue en pie.

**3. Biblioteca de ejercicios** — global de la plataforma o propia de cada
gimnasio (módulo 5).

Se puede avanzar por el módulo 4 o el 5 sin cerrar A1, pero el 4 depende del 3
para saber si un socio está al corriente de pago, así que reordenar sale caro.

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
| ~~Sin proveedor de correo~~ | ✅ resuelto en el paso 0 |
| `consents` sin usar | **Antes del módulo 6** |
| `slug` es el UUID del gimnasio | Cuando haya URLs públicas, probablemente con el dashboard |
| `trust proxy` sin configurar | Antes de producción: sin él, `x-forwarded-for` no es fiable y el límite de intentos pierde precisión |
