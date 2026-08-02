# Decisión pendiente — La biblioteca de ejercicios

> Documento de decisión, no de arquitectura. Cuando se cierre, se convierte en
> ADR-0012 y este fichero desaparece.
>
> Bloquea el módulo 5 (rutinas). Fecha: 2026-08-02.

## La pregunta

Cuando un entrenador arma una rutina, elige ejercicios de una lista. Esa lista,
¿es **de la plataforma** (una sola, curada por nosotros) o **de cada gimnasio**?

## Lo que hay que resolver de verdad

Tres cosas, y ninguna es técnica:

1. **El arranque en vacío.** Un gimnasio nuevo con la lista a cero no puede usar
   el módulo hasta que alguien teclee doscientos ejercicios. Para un piloto, eso
   es la diferencia entre que lo prueben o no.
2. **Lo propio.** Todo gimnasio tiene una máquina que los demás no tienen, y un
   box de CrossFit o una clínica de rehabilitación no encajan en un catálogo
   general.
3. **El vocabulario común.** Si dos gimnasios llaman distinto al press de banca,
   ninguna estadística ni ninguna IA de la fase 2 podrá comparar nada jamás.

## Las cuatro opciones

### A — Solo catálogo de plataforma

Una lista única, nuestra. Los gimnasios eligen, no añaden.

**A favor:** arranque inmediato, vocabulario perfecto, un solo sitio donde poner
imágenes y vídeos el día que los haya.

**En contra:** ningún gimnasio puede representar su propia sala. Es un «no» a la
primera petición que va a llegar, y curar el catálogo es trabajo mío que no se
acaba nunca.

### B — Solo lista por gimnasio

Cada uno la suya, desde cero.

**A favor:** libertad total y el patrón de siempre — `gym_id`, su política RLS, y
ya está.

**En contra:** el arranque en vacío, que es el problema serio. Y adiós al
vocabulario común para siempre.

### C — Catálogo global **más** ejercicios propios

Una tabla con `gym_id` **anulable**: las filas con `NULL` son de la plataforma y
las ve todo el mundo; las demás son de su gimnasio.

**A favor:** resuelve el arranque en vacío y permite lo propio. Es la respuesta
que parece obvia.

**En contra, y no es menor:** rompe el modelo de tenencia que acabamos de
reforzar. Obliga a políticas **asimétricas** —se lee `gym_id IS NULL OR gym_id =
app_current_gym_id()`, pero se escribe solo `gym_id = app_current_gym_id()`—
porque si la aplicación pudiera insertar con `gym_id` nulo, cualquier gimnasio
crearía ejercicios visibles para todos los demás.

Y hay una consecuencia concreta del PR de integridad que acabamos de fusionar:
una rutina no podría apuntar al ejercicio con clave ajena compuesta
`(gym_id, exercise_id)`, porque para los globales no hay `gym_id`. Sería la única
tabla del producto fuera de esa regla.

### D — Catálogo de plataforma que se **copia** al crear el gimnasio ⭐

Dos tablas:

- `exercise_templates` — datos de referencia de la plataforma, sin `gym_id`, como
  una lista de países. Nadie los edita desde la aplicación.
- `exercises` — los del gimnasio, con `gym_id` **obligatorio**. Al dar de alta un
  gimnasio se copian ahí los de la plantilla.

**A favor:**

- Arranque resuelto: el gimnasio nace con su lista puesta.
- Libertad total: puede renombrar, ajustar y borrar lo suyo sin pedir permiso.
- **El modelo de tenencia no cambia en nada.** `gym_id` obligatorio, política de
  siempre, claves ajenas compuestas como en todo lo demás. Cero excepciones.
- Un `template_id` anulable en cada copia conserva el vocabulario común: dos
  gimnasios que no han tocado el press de banca siguen apuntando al mismo origen,
  y las estadísticas comparadas siguen siendo posibles.

**En contra:**

- Añadir un ejercicio a la plantilla **no llega** a los gimnasios existentes. Con
  tres pilotos es irrelevante; cuando importe, se resuelve con un relleno puntual.
- Ochenta filas duplicadas por gimnasio. A esta escala, nada.

## Recomendación: **D**

C es la respuesta de manual y aquí sale más cara de lo que parece: introduce la
única tabla con `gym_id` anulable, obliga a políticas asimétricas —el tipo de
detalle que se olvida en la siguiente tabla parecida— y deja las rutinas fuera de
la regla de claves ajenas compuestas que acabamos de imponer en todo el producto.

D consigue lo mismo de cara al usuario sin tocar ninguna de esas piezas. La
contrapartida real —que la plantilla no se propague sola— es un problema de dentro
de un año, y tiene arreglo conocido.

## Lo que hace falta decidir contigo

1. **La opción.** C o D, o A/B si prefieres uno de los extremos.
2. **El tamaño de la plantilla inicial.** Propongo entre 60 y 80 ejercicios con
   nombre, grupo muscular y material. Es una migración de datos de referencia, no
   trabajo de producto, y cubre lo que hace el 90 % de la gente en una sala.
3. **Si un gimnasio puede ocultar lo que no tiene.** Sin prensa de piernas, ese
   ejercicio estorba en la lista. Con la opción D basta con borrarlo, así que
   sugiero no construir nada específico.

Vídeos e imágenes quedan fuera del MVP en cualquiera de las opciones: exigen
almacenamiento, URLs firmadas y política de retención propia, igual que las fotos
de progreso.
