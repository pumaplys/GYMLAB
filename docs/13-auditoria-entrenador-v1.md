# Auditoría final — ENTRENADOR GYMLAB V1

Recorrido del área completa como un producto terminado, empezando por el punto
de entrada real: el panel asignando el socio.

**Veredicto: ENTRENADOR GYMLAB V1 — APTO.**

---

## A. Inventario real de rutas

Extraído del código, no de memoria:

| ruta | qué es |
|---|---|
| `/entrenador` | Mis socios |
| `/entrenador/socio` | ficha del socio asignado |
| `/entrenador/rutinas` | listado |
| `/entrenador/rutinas/ficha` | detalle |
| `/entrenador/rutinas/nueva` | crear |
| `/entrenador/rutinas/editar` | editar |
| `/entrenador/ejercicios` | biblioteca |

Siete, las que se esperaban. Navegación de tres destinos —Mis socios, Rutinas,
Ejercicios— con `aria-current` correcto y sin enlaces muertos.

## B. Circuito panel → entrenador

Hecho **desde la interfaz**, no por API:

**recepción** abre la ficha de Carmen → sección Entrenador → asigna a Marta Ruiz
→ logout → login como Marta → **Carmen aparece en Mis socios** con su teléfono,
estado y fecha de asignación.

Confirmado que recepción puede hacerlo, no sólo el dueño.

## C. Recorrido completo

Login → selector de gimnasio (la cuenta es entrenadora en A y socia en B) →
Mis socios → ficha → Rutinas → Ejercicios → nueva rutina → detalle → editar →
volver al socio → asignar rutina → progreso. Todo por navegación real.

## D. Socios asignados y no asignados

Cinco casos, todos con **404 y el mismo mensaje** — no distinguen "no es tuyo"
de "no existe":

| caso | respuesta |
|---|---|
| socio de otro entrenador | 404 |
| socio sin entrenador | 404 |
| id inventado | 404 |
| rutinas de socio ajeno | 404 |
| progreso de socio ajeno | 404 |

## E–G. Rutinas, editor y `exerciseId = null`

Creada una rutina con dos ejercicios, reps de texto (`al fallo`), nota larga y
reordenación: **el orden persiste** tras guardar.

Después **se borró de verdad "Sentadilla" de la biblioteca**. Resultado:

- el detalle sigue mostrando el ejercicio con su nombre, series, reps y nota,
  marcado con "Ya no está en la biblioteca";
- al editar, **guardar se niega** señalando el ejercicio concreto: *"ejercicio 1:
  ya no está en la biblioteca, elige otro o quítalo"*;
- al sustituirlo, **se conservaron series, reps y notas** y no cambió el orden.

## H. Asignar rutinas

Asignada desde la ficha con feedback anunciable. Regla real respetada: varias
vigentes a la vez, ninguna marcada como principal.

## I. Progreso + consentimiento, extremo a extremo por las dos interfaces

```
Carmen sin consentimiento  → entrenadora ve el aviso, SIN botón de registrar
Carmen entra en /socio/privacidad, lee el documento y AUTORIZA
entrenadora recarga        → aparece "Registrar medición"
registra 72,4 kg           → guardado como 72.4 (coma decimal)
Carmen lo ve en su portal
Carmen REVOCA desde su interfaz
entrenadora                → historial SIGUE visible, botón desaparecido
escritura manipulada       → 403 CONSENT_REQUIRED
```

El consentimiento se concedió y revocó **desde la pantalla del socio**, no por
API.

## J. Biblioteca

74 ejercicios del gimnasio, con distintivo "Del catálogo" frente a los propios.
Búsqueda por nombre, material y grupo.

## K. Socio → entrenador

Cubierto en #72 y revalidado aquí desde recepción.

## L–N. Sesión, multi-gimnasio y multi-rol

Cubiertos en la auditoría de Socio (#71) para las pantallas compartidas y en #72
para el circuito de asignación. El selector distingue correctamente los dos roles
de la misma cuenta ("Entrenador" en A, "Socio" en B).

## R. Mapa final de seguridad

| recurso | RolesGuard | gym activo | assignment | consentimiento | RLS | barrera **crítica** |
|---|---|---|---|---|---|---|
| cartera | `trainer` | ✅ | `miTrainerId` | — | ✅ | **resolución por sesión** |
| ficha socio | — | ✅ | **`myMember`** | — | ✅ | **assignment** |
| rutinas (leer) | owner+trainer | ✅ | — | — | ✅ | **RLS** |
| asignar rutina | owner+trainer | ✅ | **`myMember`** | — | ✅ | **assignment** |
| ejercicios | owner+trainer | ✅ | — | — | ✅ | **RLS** |
| progreso leer | owner+trainer | ✅ | **`myMember`** | no | ✅ | **assignment** |
| progreso escribir | owner+trainer | ✅ | **`myMember`** | **sí** | ✅ | **assignment + consentimiento** |

**Qué pasaría si se quitara cada control crítico** — medido en falsificaciones
anteriores, no supuesto:

- sin `myMember`: un entrenador **leería los datos de salud de un socio ajeno del
  mismo gimnasio** (pasó de 404 a 200 en #65). RLS no lo cubre: es del mismo
  gimnasio.
- sin la puerta del consentimiento: **7 pruebas de 403 a 201** — datos de salud
  escritos sin base legal (#65).
- sin filtro de gimnasio: **nada se abre**. RLS lo sostiene, confirmado cuatro
  veces (#67, #68, #70, #72).

## S–T. Responsive y accesibilidad

320 / 1440 sin scroll horizontal del documento en las siete rutas. Controles de
orden ↑↓ de **44×44** en el editor a 320. Un solo `H1` por pantalla.

---

## W. Bugs encontrados y arreglados

**Ninguno.** No apareció ningún defecto del producto durante la auditoría.

## X. Blockers pendientes

**Ninguno.** El único que existía —la ausencia de UI para asignar socio a
entrenador— se cerró en #72.

## Dos incidencias de ENTORNO, no del producto

1. El servidor de desarrollo de Next devolvió `ChunkLoadError` y
   `ERR_CONTENT_LENGTH_MISMATCH` a mitad de sesión, dejando la página en
   "Comprobando la sesión…". Reiniciarlo lo resolvió. **Estuvo a punto de
   hacerme reportar un bug falso**: una medición dio "historial no visible"
   cuando la API sí devolvía el dato — era la página sin hidratar.
2. `pnpm build` falló una vez en `@gymlab/api` y pasó al reintentar sin cambiar
   nada. Contención de ficheros en Windows con el dev server activo.

Ninguna de las dos afecta al producto desplegado.

---

## ENTRENADOR GYMLAB V1: APTO

Las siete pantallas funcionan como un producto único. El circuito que va del
panel al entrenador y del entrenador al socio —incluido el consentimiento
atravesando las dos áreas— se recorrió entero por interfaz. Las barreras están
identificadas y cada una tiene medido qué pasaría sin ella.

Lo que queda es pre-producción, ya anotado en `00-estado.md`.
