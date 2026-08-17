# Auditoría final — SOCIO GYMLAB V1

Recorrido del área completa como un solo producto, no como siete entregas
sueltas. Con una cuenta real, datos ad hoc y sesión de navegador.

**Veredicto: SOCIO GYMLAB V1 — APTO.**

---

## Cómo se probó

Un escenario montado por API con dos gimnasios:

- **Lucía**: socia en A con cuota al corriente, dos rutinas (una con un ejercicio
  borrado de la biblioteca), consentimiento aceptado, dos mediciones, cuatro
  pagos —uno anulado—, un acceso permitido y otro denegado por cuota vencida. Y
  además **entrenadora en B**.
- **Nueva**: socia recién apuntada en A, sin absolutamente nada.

Todo borrado al terminar.

## Las siete pantallas

Recorrido navegando por los enlaces reales, no escribiendo URLs — así se detectan
enlaces muertos:

| pantalla | encabezado | estado |
|---|---|---|
| `/socio` | Hola, Lucía | cuota, plan, vencimiento y datos |
| `/socio/rutina` | Tus rutinas | dos, sin marcar ninguna como principal |
| `/socio/progreso` | Tu progreso | dos mediciones |
| `/socio/carne` | Tu carné | credencial y generación de QR |
| `/socio/pagos` | Tus pagos | cuatro, uno anulado con motivo |
| `/socio/accesos` | Tus entradas | permitida y denegada, en castellano |
| `/socio/privacidad` | Datos de salud | documento y estado |

`aria-current` correcto en las siete, **un solo destino marcado cada vez**, `H1`
en todas, sin placeholders ni acciones que no funcionen.

## Estados vacíos

Los seis se comprobaron con la socia sin actividad. Ninguno promete lo que el
socio no puede hacer: no hay "paga aquí", ni "crea tu rutina", ni formulario de
progreso. Todos dicen **quién** lo hará: *"Cuando tu entrenador te asigne una…"*.

## Sesión caducada — punto que estaba pendiente

Se invalidó la sesión en el servidor con la pantalla abierta y datos a la vista.

- **Carné**: con un QR generado y visible, al intentar regenerar la aplicación
  fue a `/login` y **el QR desapareció de la pantalla**. Sin código fantasma.
- **Privacidad**: al intentar retirar el consentimiento, fue a `/login` y en la
  base **`revoked_at` seguía a `null`** — ningún falso éxito.
- **Ruta directa sin sesión**: `/socio/pagos` lleva a `/login`.

Sin bucles, sin errores técnicos en pantalla, sin seguir generando tokens.

## Multi-rol — punto que estaba pendiente

Con `/socio/carne` abierto y **un QR generado**, cambio de A (socia) a B
(entrenadora):

- el QR **desaparece**;
- sale del área socio y entra en `/entrenador`;
- la navegación pasa a ser la del entrenador;
- no queda ningún dato de member visible.

La vuelta B → A restaura el área socio con sus datos correctos.

## Seguridad — mapa por recurso

| recurso | resolución `user_id` | servicio | RLS | otra | barrera **crítica** |
|---|---|---|---|---|---|
| perfil | ✅ | `getOwnProfile` | ✅ | — | **resolución** |
| cuota | ✅ | `estadoDeUsuario` | ✅ | — | **resolución** |
| rutinas | ✅ | `myRoutines` | ✅ | — | **resolución** |
| progreso | ✅ | `asegurarAcceso` | ✅ | consentimiento (escritura) | **resolución** + **consentimiento** |
| pagos | ✅ | `listMyPayments` | ✅ | `member_id` filtra los anonimizados | **resolución** |
| accesos | ✅ | `misEventos` | ✅ | ídem | **resolución** |
| consentimiento | ✅ | `myHealthConsent` | ✅ | FK `RESTRICT` al documento | **resolución** |
| token de acceso | ✅ | `generarToken` | ✅ | firma derivada del gimnasio, `jti` único | **firma + `jti`** |

**Conclusión repetida en tres falsificaciones (#67, #68, #70)**: entre gimnasios
manda **RLS** —quitar el filtro de la aplicación no abre nada—; entre personas
del mismo gimnasio manda la **resolución por `user_id`**, y romperla sí pone
pruebas en rojo.

Ninguna llamada de autoservicio envía `memberId`: el parámetro no existe en
ningún esquema de consulta.

## Información expuesta

Revisión del contrato, no sólo visual: se pidieron las siete respuestas `/me` y
se buscaron en crudo `recordedByUserId`, notas internas, `jti`, sesión del
escáner, `tokenHash` y firmas. **Cero coincidencias.**

Campos por respuesta: accesos exactamente cuatro; pagos ocho, sin nota ni quien
cobró; progreso los del contrato.

## Errores de red

Verificados durante las entregas y confirmados aquí: mensaje comprensible,
`Reintentar` en las paginadas, no se pierde lo ya cargado, y no hay falsos éxitos
—ni QR fantasma ni consentimiento que parezca aceptado si falló—.

## Responsive

320 / 375 / 430 / 768 / 1024 / 1440 sin scroll horizontal **del documento**. Con
siete destinos, la barra de navegación se desplaza sola: comprobado que los
únicos elementos fuera del viewport están dentro de `<nav>` y que
`document.scrollWidth === clientWidth`.

---

## Bugs encontrados y arreglados

1. **Privacidad tenía un "← Volver a tu cuenta" que ninguna otra pantalla
   tenía.** Nació cuando era la única subpantalla y el área no tenía barra de
   destinos; con siete secciones, hacía que pareciera una subpantalla de algo.
   Quitado.

## Encontrado y **no** arreglado

2. **`/me/routines` devuelve `activeAssignments`** — cuántos socios siguen esa
   rutina. Es un contador agregado del gimnasio, no un dato del socio, y **no se
   pinta en pantalla**; pero viaja en la respuesta. No es fuga de datos
   personales —no identifica a nadie— así que **no bloquea V1**. Corregirlo
   requiere un DTO propio para el autoservicio, que es alcance nuevo.

## Fuera del alcance de esta auditoría (pre-producción)

Anotados en `00-estado.md`, por decisión explícita:

- texto legal definitivo del consentimiento y datos del responsable;
- la caída de `pg-boss` por timeout de conexión;
- `trust proxy` y el requisito de un solo origen.

---

## SOCIO GYMLAB V1: APTO

Las siete pantallas funcionan como un producto único. El aislamiento está
sostenido por capas identificadas y probadas, los dos puntos que quedaban
pendientes —sesión caducada y multi-rol— se han cerrado sin encontrar defectos, y
el único bug del área era de consistencia visual y está corregido.

Lo que queda es de producción, no de funcionalidad.
