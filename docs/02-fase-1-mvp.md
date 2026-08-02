# Fase 1 — El MVP

> Estado: **COMPLETADA**. Última actualización: 2026-08-02.
> Punto de partida: Fase 0 cerrada en `3fd8ced`.
>
> Los siete módulos y el paso 0, entregados y verificados. Este documento se
> conserva como **registro de lo que se planificó y de en qué se cumplió o no**;
> el estado vivo está en [`00-estado.md`](00-estado.md) y lo que viene, en
> [`03-fase-2.md`](03-fase-2.md).
>
> **El objetivo declarado no se ha cumplido todavía.** Era «tres gimnasios piloto
> usándolo a diario», y el alcance funcional está completo pero no hay interfaz:
> nadie puede abrirlo. Eso ordena la Fase 2.

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
| 3 | **Planes y suscripciones** | ✅ | 1 | Define si un socio está *activo*, dato que el QR necesita para decidir |
| 4 | **Acceso por QR** | ✅ | 1, 3 | Lo más visible para el gimnasio; ya diseñado en detalle |
| 5 | **Rutinas** | ✅ | 1, 2 | |
| 6 | **Progreso y peso** | ✅ *(bloqueado por los textos)* | 1 | Datos de salud (art. 9): exige que `consents` funcione |
| 7 | **Dashboard** | ✅ | todos | Lee de los anteriores; por definición va al final |

**El orden aguantó.** Se siguió tal cual, con una sola inserción no prevista: un
PR de integridad referencial entre el 4 y el 5, para que el QR y las rutinas
nacieran sobre claves ajenas compuestas.

El orden seguía **dependencias reales**, no valor percibido: el QR es lo que más
ilusión hacía y fue cuarto porque antes necesitaba saber quién es socio y si está
al corriente. Visto en retrospectiva, fue el acierto que evitó rehacer cosas.

---

## 3. Detalle por módulo

### 1. Socios ✅

Ficha del socio, alta por invitación, baja, búsqueda y listado. La invitación
quedó en dos endpoints separados por seguridad: ver
[ADR-0010](adr/0010-dos-endpoints-para-aceptar-invitaciones.md).

**`consents` NO se saldó**, y fue una decisión consciente: se prefirió dejar el
dato pendiente antes que inventar una versión de documento. Esa decisión aguantó
toda la fase y hoy es lo único que bloquea funcionalidad ya entregada — el módulo
6 no acepta ni un dato de salud sin los textos.

Las dos preguntas que quedaron respondidas por el camino: el consentimiento se
recoge **en el mostrador** (un socio sin cuenta no puede aceptarlo desde ninguna
app), y **revocarlo bloquea nuevos registros pero conserva los anteriores**, para
poder atender un acceso o un borrado después.

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

**La deuda que dejó, ya saldada:** la clave ajena de `trainer_assignments` no era
compuesta, de modo que una asignación podía apuntar a un socio de otro gimnasio
—se comprobó que la fila incoherente era insertable—. No había fuga, porque RLS
filtraba la lectura, pero lo que nos salvaba era la política de **otra** tabla. Se
arregló en un PR de integridad propio antes del módulo 5, extendido a las ocho
relaciones del producto.

### 3. Planes y suscripciones ✅

Planes, cuota de cada socio y sus estados. **A1 se cerró aquí: GYMLAB no mueve
dinero**, solo registra.

**«Vencida» no llegó a ser un estado guardado.** Es consecuencia de comparar
`current_period_end` con hoy —en la zona del gimnasio— y se calcula al leer.
Guardarlo habría exigido un trabajo nocturno, y el día que fallara el gimnasio
dejaría entrar a quien no paga sin enterarse.

Una sola regla, decidida por ti frente a mi propuesta: **cada pago cubre
exactamente un periodo**, encadenado, sin mirar la antigüedad de la deuda. De ahí
sale un invariante que los tests comprueban, y una consecuencia buscada: quien
lleva meses sin pagar no se pone al corriente con un pago; el camino de vuelta es
cancelar y dar de alta de nuevo.

**Congelar la cuota** entró desde el primer día, como estaba previsto.

### 4. Acceso por QR ✅

Como se diseñó: token de 60 s, un solo uso, semáforo `ALLOW` / `DENY` / `WARN`.

Dos decisiones que se consultaron antes de escribir código: la firma usa una
**clave derivada por gimnasio** (HKDF), de modo que un token del gimnasio A no
valida en el B por construcción; y el uso único se resuelve con
`INSERT ... ON CONFLICT DO NOTHING RETURNING`, dejando la exclusión a PostgreSQL.

Se añadió algo que no estaba en el diseño y hacía falta en la puerta: **tolerancia
a reintentos de red**, resuelta en el servidor por sesión del escáner, sin pedirle
nada al cliente.

### 5. Rutinas ✅

Biblioteca, rutinas y asignación. La decisión pendiente se cerró en
[ADR-0012](adr/0012-biblioteca-de-ejercicios-por-copia.md): **la biblioteca se
copia**, no se comparte.

Las rutinas guardan **copia del nombre del ejercicio**, que es lo que permite al
gimnasio borrar lo que quiera sin dejar rutinas con huecos.

La revisión de este PR encontró cuatro cosas, incluida una real de autorización:
cualquier entrenador podía **borrar** la rutina de un compañero y llevarse por
cascada las asignaciones de socios ajenos. Ahora solo su creador o el dueño.

### 6. Progreso y peso ✅ *(entregado y bloqueado)*

Se respetó todo lo escrito: recepción **no** accede, el borrado del art. 17 los
alcanza, y las fotos quedaron fuera.

**Ninguna escritura sin consentimiento vigente**, comprobado en el servicio y no
en el controlador, para que la regla se cumpla venga de donde venga la llamada. Y
falla en cerrado: sin `HEALTH_CONSENT_VERSION` configurada no se registra nada.

Hubo que resolver algo antes de empezar: `consents` exigía `user_id`, así que un
**socio sin cuenta no podía consentir** —justo quien más pasa por la báscula—. Se
añadió `member_id`, que además es la clave natural.

### 7. Dashboard ✅

Socios activos, altas y bajas del mes, asistencia y cuotas por vencer, más la
métrica que más valor tiene y no estaba prevista: **socios activos sin cuota**,
dinero que el gimnasio cree cobrar y no cobra.

Único módulo sin tablas propias: cada módulo calcula sus métricas y el panel
compone. Las dos notas que se dejaron apuntadas en los módulos 2 y 4
—`COUNT(DISTINCT member_id)` y los agregados antes de la purga— se aplicaron.
---

## 4. Riesgos

Cómo terminó cada uno:

| Riesgo | Desenlace |
|---|---|
| **Alcance que se dispara** | ✅ **No ocurrió.** La lista de «no entra» aguantó entera: ni bonos de sesiones, ni fotos, ni pasarela |
| **`trainer` viendo socios que no le corresponden** | ✅ **Mitigado** por construcción y falsificado. La revisión del módulo 5 encontró la variante que faltaba: podía **borrar** rutinas ajenas |
| **Datos de salud sin consentimiento** | ✅ **Cerrado de la única forma honesta**: el módulo está entregado y **bloqueado** hasta que existan los textos |
| **A1 sin cerrar al llegar al punto 3** | ⚠️ **Se cumplió.** Llegamos al módulo 3 con la asunción abierta y hubo que pararse a cerrarla. Costó una sesión, no un rediseño |
| **Congelar cuotas añadido tarde** | ✅ **No ocurrió**: se modeló desde el primer día del módulo 3 |
| **Los pilotos no usan lo construido** | ❌ **Se cumplió, y es la deuda principal.** No por los módulos: porque no hay interfaz. Es lo primero de la Fase 2 |

**El riesgo que no estaba en esta tabla** y resultó el más caro: un ciclo de
proveedores que dejaba a Nest colgado en el arranque **sin emitir ningún error**.
Ni el `build` ni el `typecheck` lo detectan. De ahí salió la regla de los puntos
de extensión (ADR-0010) y, más tarde, ADR-0011.

---

## 5. Las tres decisiones que hacían falta, y cómo se cerraron

**1. Asunción A1 — ¿mueve GYMLAB el dinero de las cuotas?**
✅ **Cerrada: no.** El gimnasio cobra por sus medios y GYMLAB registra planes,
cuotas, pagos, vencimientos y estado. Ninguna pasarela, ni ahora ni escondida
para después. Si algún día se revierte, cambia el módulo 3 entero — por eso está
escrita en `01-arquitectura.md` como asunción y no como detalle.

**2. Consentimientos** — textos, versionado y momento en que se piden.
⛔ **Sigue abierta, y es la única que bloquea funcionalidad ya entregada.**
Se mantuvo la decisión del módulo 1: dejar el dato pendiente antes que inventar
una versión ficticia. La consecuencia es explícita — sin `HEALTH_CONSENT_VERSION`
configurada, el módulo 6 rechaza toda escritura con `CONSENT_NOT_CONFIGURED`.

**3. Biblioteca de ejercicios** — global o por gimnasio.
✅ **Cerrada: se copia** (ADR-0012). Se descartó el catálogo global compartido
porque introducía la única tabla del producto con `gym_id` anulable y dejaba las
rutinas fuera de la regla de claves ajenas compuestas.

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

## 7. Deuda de la Fase 0: en qué quedó

| Qué | Desenlace |
|---|---|
| ~~Sin proveedor de correo~~ | ✅ resuelto en el paso 0 |
| `consents` sin usar | ⚠️ **La tabla ya se usa**, pero siguen faltando los textos. Es lo único que bloquea funcionalidad entregada |
| `slug` es el UUID del gimnasio | Sigue viva. No estorbó: el dashboard no necesitó URLs públicas |
| `trust proxy` sin configurar | Sigue viva, y ahora es **bloqueante para producción** |

La deuda al día, con la que apareció durante esta fase, está en
[`00-estado.md`](00-estado.md). Lo que viene, en [`03-fase-2.md`](03-fase-2.md).
