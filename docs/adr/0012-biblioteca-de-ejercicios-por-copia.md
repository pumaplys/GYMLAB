# ADR-0012 — La biblioteca de ejercicios se copia, no se comparte

- **Fecha:** 2026-08-02
- **Estado:** Aceptado
- **Relacionado:** ADR-0002 (RLS), ADR-0006 (fronteras de módulo), PR #11 (claves ajenas compuestas)

## Contexto

Cuando un entrenador arma una rutina elige ejercicios de una lista. Había que
decidir de quién es esa lista, y el problema tiene tres caras y ninguna es
técnica:

1. **El arranque en vacío.** Un gimnasio nuevo con la lista a cero no puede usar
   el módulo hasta que alguien teclee doscientos ejercicios. Para un piloto, eso
   decide si lo prueban o no.
2. **Lo propio.** Todo gimnasio tiene una máquina que los demás no tienen, y un
   box de CrossFit o una clínica de rehabilitación no encajan en un catálogo
   general.
3. **El vocabulario común.** Si dos gimnasios llaman distinto al press de banca,
   ninguna estadística comparada —ni la IA de la fase 2— podrá relacionarlos.

## Alternativas consideradas

**Solo catálogo de plataforma.** Arranque inmediato y vocabulario perfecto, pero
ningún gimnasio puede representar su propia sala. Es un «no» a la primera
petición que va a llegar.

**Solo lista por gimnasio.** Libertad total con el patrón de tenencia de siempre,
pero deja el arranque en vacío sin resolver, que es el problema serio.

**Catálogo global más ejercicios propios** (una tabla con `gym_id` anulable: las
filas nulas son de la plataforma). Es la respuesta de manual, y aquí sale más cara
de lo que parece:

- Sería **la única tabla del producto con `gym_id` anulable**.
- Obliga a políticas RLS **asimétricas**: se lee `gym_id IS NULL OR gym_id =
  app_current_gym_id()` pero se escribe solo `gym_id = app_current_gym_id()`,
  porque si la aplicación pudiera insertar con `gym_id` nulo, cualquier gimnasio
  crearía ejercicios visibles para todos los demás. Es el tipo de detalle que se
  olvida en la siguiente tabla parecida.
- Y una consecuencia directa de las claves ajenas compuestas que se acababan de
  imponer en todo el producto: una rutina **no podría** apuntar al ejercicio con
  `(gym_id, exercise_id)`, porque los globales no tienen `gym_id`. Sería la única
  relación fuera de esa regla.

## Decisión

**La plantilla se copia al crear el gimnasio.** Dos tablas:

- **`exercise_templates`** — datos de referencia de la plataforma, **sin
  `gym_id`**, como una lista de países. No los edita nadie desde la aplicación; se
  siembran en una migración con el rol propietario.
- **`exercises`** — los del gimnasio, con **`gym_id` obligatorio**. Al dar de alta
  un gimnasio se copian ahí los de la plantilla.

Cada copia guarda un `template_id` anulable que apunta a su origen.

El gimnasio **edita, renombra y borra libremente** lo suyo. No se construye nada
para «ocultar» un ejercicio que no se tiene: se borra, que es lo mismo con menos
código.

## Consecuencias

**Positivas**

El modelo de tenencia **no cambia en nada**: `gym_id` obligatorio, la política de
siempre, claves ajenas compuestas como en el resto. Cero excepciones que recordar.

El arranque queda resuelto y la libertad del gimnasio es total, sin copia sobre
escritura ni ningún mecanismo intermedio.

El `template_id` conserva el vocabulario común: dos gimnasios que no han tocado el
press de banca siguen apuntando al mismo origen, así que comparar entre gimnasios
sigue siendo posible más adelante.

**Negativas**

**Añadir un ejercicio a la plantilla no llega a los gimnasios existentes.** Con
tres pilotos es irrelevante; cuando importe, se resuelve con un relleno puntual
que use `template_id` para no duplicar lo ya copiado.

Unas ochenta filas duplicadas por gimnasio. A esta escala, nada.

**Coste de revertir:** medio. Pasar a catálogo compartido obligaría a deduplicar
lo que cada gimnasio haya editado, y para entonces habrá ediciones reales.

## Cómo se verifica

- Un gimnasio recién creado tiene su lista de ejercicios **sin que nadie la
  escriba**, y con el mismo número que la plantilla.
- Editar o borrar un ejercicio en un gimnasio **no afecta** a otro, aunque los dos
  vinieran de la misma plantilla. Falsificable: si alguna vez se compartieran
  filas, ese test se pone en rojo.
- `exercise_templates` no es escribible desde la aplicación.

## Señales para revisarla

- Aparece la primera petición de «quiero el ejercicio nuevo que habéis añadido».
  Entonces toca el relleno por `template_id`, no cambiar el modelo.
- Entra contenido pesado —vídeos, imágenes—: duplicar filas es barato, duplicar
  ficheros no. Ahí conviene que el medio cuelgue de la plantilla y la copia solo lo
  referencie. Hoy queda fuera del MVP por almacenamiento, URLs firmadas y política
  de retención propia.
