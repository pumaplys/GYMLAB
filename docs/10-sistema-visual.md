# Sistema visual de GYMLAB (propuesta)

> **Nada implementado.** Auditoría de lo que hay y propuesta para aprobar antes
> de tocar una línea.
>
> Parte de la skill de diseño del proyecto —minimalismo tipo Linear, Stripe y
> GitHub; colores neutros; sin degradados llamativos— y de los tokens que ya
> existen en `globals.css`, que son buenos y **no se tiran**.

---

# A · Lo que existe

## Pantallas reales

**Diez**, y conviene decir cuáles de las que preguntas **no existen**:

| Pantalla | Estado |
|---|---|
| `/login` | ✅ |
| `/forgot-password`, `/reset-password` | ✅ |
| `/accept-invitation` | ✅ |
| `/socios` (listado + búsqueda + paginación) | ✅ |
| `/socios/nuevo` | ✅ |
| `/socios/ficha?id=` (datos + cuota + pagos) | ✅ |
| `/personal` (personal activo + invitaciones) | ✅ |
| `/planes` | ✅ |
| `/` | Redirige a `/socios`. **No es un inicio** |
| **Dashboard** | ❌ **no existe pantalla**. La API sí tiene `/dashboard` |
| **Entrenadores** | ❌ no existe. La API sí |
| **Rutinas** | ❌ no existe. La API sí |
| **Pagos** | No es pantalla: vive dentro de la ficha |
| **Configuración** | ❌ no existe. La API sí (`/gyms/:id/settings`) |
| **Invitaciones** | No es pantalla propia: es una sección de `/personal` |

Es la misma foto de la auditoría funcional: **82 endpoints, 10 pantallas.**

## Layout y navegación

`Marco` da cabecera y navegación horizontal. Dentro: marca, separador,
selector de gimnasio (o su nombre si solo hay uno), nombre y rol, botón de
salir. Debajo, una fila de enlaces de sección con `aria-current`.

Las pantallas sin sesión usan `PantallaCentrada`: tarjeta centrada, sin
navegación, a propósito — en ellas no hay adónde ir.

## Componentes reutilizables

Siete, y solo tres son de interfaz de uso general:

| | Qué es |
|---|---|
| `Boton` | Variantes primario / sutil, estado de carga, modo bloque |
| `Campo` | Etiqueta + ayuda + error, atados por `id` y `aria-describedby` |
| `Aviso` | Error / éxito / información, con `role="alert"` solo en error |
| `Marco`, `PantallaCentrada`, `RutaPrivada`, `Paginacion` | Estructura, no piezas visuales |

## Tokens actuales

`globals.css` ya define superficies (4), bordes (2), texto (3 niveles), acento,
peligro, éxito, escala de espacio en múltiplos de 4 (`--e1`…`--e7`), dos radios,
una sombra y un ancho máximo. **La base es sólida.**

---

# B · Problemas detectados

Todo medido, no impresiones.

## 1 · Duplicación masiva de CSS entre pantallas

| Clase | En cuántos ficheros |
|---|---|
| `.tabla` | **3 pantallas**, 13 bloques de reglas |
| `.formulario` | 9 |
| `.acciones` | 7 |
| `.etiqueta` | 5 |
| `.encabezado`, `.vacio`, `.pareja` | 5 |
| `.tarjeta`, `.pie`, `.cargando` | 4 |
| `.panel`, `.selector`, `.campoSelector`, `.confirmar` | 3 |

Y lo peor no es repetir: **`.etiqueta`, `.activo` e `.inactivo` están byte a
byte idénticos** en `socios.module.css` y `ficha/ficha.module.css`. Es copiar y
pegar, con dos sitios que hay que acordarse de cambiar a la vez.

## 2 · Seis anchos de contenido distintos

`34rem`, `40rem`, `42rem`, `44rem`, `48rem`, `52rem`. Y `--ancho-maximo: 72rem`
existe como token y casi no se usa.

El efecto se ve al cambiar de pantalla: el contenido «salta» de ancho.

## 3 · Tres puntos de ruptura distintos

`34rem` en el alta de socio, `40rem` en casi todo, **`48rem` en planes** — este
último lo introduje yo. La interfaz reflows a anchos distintos según en qué
pantalla estés.

## 4 · No hay escala tipográfica

`globals.css` fija `h1` y `h2` y nada más. El resto son valores sueltos
repetidos **73 veces**: `0.875rem` ×42, `0.8125rem` ×19, `0.75rem` ×12.

## 5 · Un color inventado dos veces, fuera del sistema

`#fff8eb` / `#a15c07` —un ámbar de aviso— escritos a mano en
`personal.module.css` y en `cuota.module.css`. **No hay token de aviso**: solo
acento, peligro y éxito. El estado «por vencer» de una cuota y el «caducada» de
una invitación son el mismo concepto y no lo saben.

## 6 · Los estados viven en cinco sitios

`pendiente`/`aceptada`/`caducada`/`revocada` en personal, `activo`/`inactivo` en
socios **y otra vez** en ficha, `alCorriente`/`vencida` en cuota, `archivado` en
planes. Mismo lenguaje visual, cinco implementaciones.

## 7 · Vacío, carga y error, reimplementados por pantalla

Cada listado tiene su `.vacio`, su `.cargando` y su bloque de aviso. Tres
pantallas, tres versiones que ya divergen en padding y en tono.

## 8 · No hay modales — y está bien

No existe ninguno. Las confirmaciones son **en línea** (`¿Retirar el acceso?
Sí / No`). Lo anoto como acierto, no como carencia: en un mostrador, un diálogo
que roba el foco y tapa la pantalla es peor que una confirmación al lado del
botón. **La propuesta no introduce modales.**

---

# C · Dirección visual

> **Una herramienta, no un escaparate.**

Recepción mira esto ocho horas al día. Lo que tiene que destacar es **el dato**
—quién es, si está al corriente, cuánto debe— y no la interfaz.

Tres decisiones que definen el carácter:

**El color no lleva la identidad; la tipografía y el ritmo sí.** Un solo acento
para lo interactivo, neutros para todo lo demás, y color **solo cuando significa
algo** (al corriente, vencida, archivada). Es lo que hace que un producto B2B
parezca serio a los diez segundos.

**Lo deportivo se transmite con densidad y precisión, no con estética de
gimnasio.** Nada de negro sobre neón, ni iconografía de pesas por todas partes,
ni tipografías condensadas agresivas. Un gimnasio no quiere que su software
parezca un videojuego: quiere que parezca que sabe lo que hace.

**Premium es contención.** Bordes de un píxel, una sola sombra, mucho aire y
alineación obsesiva. Lo caro no se ve, se nota.

---

# D · Paleta

Los neutros actuales **se conservan**: están bien elegidos y ya funcionan.

## Neutros (sin cambios)

| Token | Valor | Papel — uno solo cada uno |
|---|---|---|
| `--fondo` | `#ffffff` | Superficie de tarjetas, tablas y campos |
| `--fondo-sutil` | `#f7f8fa` | Lienzo de la aplicación, detrás de todo |
| `--fondo-hover` | `#f0f1f4` | Fila o botón bajo el cursor |
| `--fondo-activo` | `#e9ebef` | Pulsado, o estado neutro de una etiqueta |
| `--borde` | `#e4e6eb` | Separación entre bloques |
| `--borde-fuerte` | `#cfd3da` | Contorno de campos: tiene que verse |
| `--texto` | `#14161a` | El dato |
| `--texto-sutil` | `#5c6169` | Etiquetas, explicaciones |
| `--texto-tenue` | `#8c9198` | Metadatos, marcas de tiempo |

## Acento e identidad

| Token | Valor | Papel |
|---|---|---|
| `--acento` | `#2a5bd7` | **Solo lo interactivo**: acción primaria, enlaces, foco, pestaña activa |
| `--acento-hover` | `#2049b8` | Su estado sobre el cursor |
| `--acento-suave` | `#eef2fe` | Fondo de énfasis leve |
| `--tinta` *(nuevo)* | `#14161a` | **La marca.** El logotipo va en negro tinta, no en azul |

Que la marca sea tinta y no color es deliberado: el azul queda reservado para
«esto se puede pulsar». Cuando la marca también es azul, el ojo deja de
distinguir qué es accionable.

## Estados semánticos

| Token | Valor | Significado |
|---|---|---|
| `--exito` / `--exito-suave` | `#067647` / `#ecfdf3` | Al corriente, activo, aceptada |
| `--peligro` / `--peligro-suave` | `#b42318` / `#fef3f2` | Vencida, acción destructiva |
| **`--aviso` / `--aviso-suave`** *(nuevo)* | `#a15c07` / `#fff8eb` | **Por vencer, caduca pronto** |
| `--neutro-suave` *(nuevo, alias)* | `#e9ebef` | Inactivo, archivado, revocado |

El ámbar **ya está en el código**, escrito a mano dos veces. Esto solo lo
convierte en ciudadano de primera.

Todos los pares texto/fondo cumplen 4.5:1 sobre su superficie.

---

# E · Tipografía

## La fuente

Hoy: pila del sistema. Funciona, pero **`system-ui` es Segoe UI en Windows y
SF en Mac**, y recepción usa Windows mientras las capturas comerciales salen de
un Mac. El producto no se ve igual en los dos sitios.

**Propuesta: Inter, autoalojada con `next/font`.** Se descarga en el momento de
construir —sigue siendo exportación estática, sin petición a Google— con
subconjunto latino y `display: swap`. Coste: unos 15 kB. A cambio, el producto
se ve idéntico en todas partes.

## Escala (nueva, hoy no existe)

| Token | Tamaño | Uso |
|---|---|---|
| `--t-xs` | `0.75rem` | Cabeceras de tabla, etiquetas de estado |
| `--t-sm` | `0.8125rem` | Ayudas, metadatos |
| `--t-base` | `0.875rem` | **Texto de trabajo**: tablas, formularios |
| `--t-md` | `0.9375rem` | Cuerpo de lectura |
| `--t-lg` | `1.0625rem` | Título de sección (h2) |
| `--t-xl` | `1.375rem` | Título de pantalla (h1) |

Son **los valores que ya se usan**, con nombre. Cero cambio visual al adoptarla.

## Números tabulares, y no es un detalle

```css
--numeros: tabular-nums;
```

Importes, fechas y números de socio en columnas se alinean por dígito. En una
tabla de pagos, sin esto, las cifras bailan y comparar de un vistazo es
imposible. Ya está puesto en planes; pasa a ser regla.

---

# F · Espacio, radios y sombras

**El espacio no cambia.** `--e1`…`--e7` en múltiplos de 4 ya está bien y se
respeta en casi todo el código.

| | Hoy | Propuesta |
|---|---|---|
| Radios | `--radio` 8px, `--radio-s` 6px | Añadir `--radio-l` 12px (tarjetas grandes) y `--radio-pastilla` 999px, que hoy se escribe a mano en cada etiqueta |
| Sombras | `--sombra` (una) | Añadir `--sombra-elevada` para menús desplegables. **Dos niveles y ni uno más** |
| Anchos | 6 valores sueltos | `--ancho-lectura: 44rem` (formularios, texto) y `--ancho-maximo: 72rem` (listados) |

---

# G · Componentes

## A extraer (existen, duplicados)

| Componente | Sustituye a | Dónde está hoy |
|---|---|---|
| `Etiqueta` | badges de estado | 5 ficheros, 2 idénticos |
| `Tabla` | `.tabla` + cabeceras | 3 pantallas |
| `Tarjeta` | `.tarjeta` / `.panel` | 4 ficheros |
| `EncabezadoDePagina` | título + entradilla + acción | 5 ficheros |
| `EstadoVacio` | `.vacio` + título + texto | 3 pantallas |
| `Cargando` | `.cargando` | 4 ficheros |
| `ConfirmacionEnLinea` | `.confirmar` + Sí/No | 3 pantallas |
| `Selector` | `.selector` + `.campoSelector` | 3 pantallas, y `Campo` no cubre `select` |

## A mejorar

`Boton` — añadir variante `peligro` (hoy retirar y archivar usan `sutil`, que no
avisa de nada) y tamaño `sm` para acciones de fila.

`Campo` — soportar `textarea`, que hará falta para notas.

## Lo que NO se añade

**Ni modales, ni menús contextuales, ni animaciones de entrada.** Las
confirmaciones seguirán siendo en línea. Es una decisión de producto: en un
mostrador con gente esperando, cada diálogo es una interrupción.

---

# H · Navegación

Hoy: cabecera con navegación horizontal. Con **tres** secciones va bien. El
problema es que van a ser **siete** (socios, personal, planes, entrenadores,
rutinas, inicio, ajustes) y una fila horizontal a esa altura se rompe.

**Propuesta: barra lateral a partir de 64rem.**

```
┌──────────┬────────────────────────────────────┐
│ GYMLAB   │  [gimnasio ▾]        Ana · Dueña ▾ │
│          ├────────────────────────────────────┤
│ Inicio   │                                    │
│ Socios   │   contenido                        │
│ Personal │                                    │
│ Planes   │                                    │
│          │                                    │
│ Ajustes  │                                    │
└──────────┴────────────────────────────────────┘
```

- **Lateral**: solo secciones. Ancho fijo de 15rem, sin plegar — plegarla añade
  un estado que nadie usa cuando las secciones caben.
- **Cabecera**: selector de gimnasio y menú de persona. Lo que cambia el
  **contexto**, no el destino.
- **Ajustes abajo**, separado: se entra una vez y no compite con el trabajo
  diario.

Por debajo de 64rem, la lateral pasa a **cajón** con botón en la cabecera. Y por
debajo de 48rem, la cabecera se queda solo con marca, cajón y persona.

Es el cambio estructural más grande de la propuesta, y por eso va en su propio
paso.

## Lo que se hizo en el paso 4, y por qué no fue la barra lateral

La propuesta de arriba parte de una premisa: **«van a ser siete»**. Al llegar al
paso 4 seguían siendo **tres** — socios, personal y planes — y para recepción,
que no ve planes, **dos**. La barra lateral se midió en el navegador antes de
decidir, con estos resultados a 1024 px:

| | Con barra lateral de 240 px | Sin ella |
| --- | --- | --- |
| Alto que ocupan los destinos | 109 px de 800 (**14 %**) | — |
| Ancho para el contenido | 784 px | 1024 px |
| Tabla de socios | 734 px | 974 px |

Se pagaría **una cuarta parte del ancho de la tabla, todos los días**, a cambio
de una columna vacía en un 86 %; para recepción, ocupada al 9 %. Es exactamente
el aspecto de «panel genérico comprado» que la dirección aprobada descarta. Y
obligaría a un punto de ruptura nuevo para plegarla, más un cajón en móvil.

**Decisión: se mantiene la navegación superior, reordenada en dos bandas.**

```
┌──────────────────────────────────────────────────────────────────┐
│  GYMLAB │ Gimnasio Maqueta          Ana Dueña · Dueña    Salir   │  contexto
├──────────────────────────────────────────────────────────────────┤
│  Socios   Personal   Planes                                      │  destinos
└──────────────────────────────────────────────────────────────────┘
```

Lo que cambia respecto a lo que había:

- **El gimnasio deja de colgar de la marca.** Era `GYMLAB / Gimnasio Centro`, y
  esa barra se lee como una ruta: como si el gimnasio fuera un sitio al que se
  ha navegado, y no el dato que decide **qué datos se están viendo**. Ahora las
  separa un filete vertical, que no dice jerarquía sino «aquí empieza otra cosa».
- **Un filete de borde a borde** parte contexto de destinos. Antes las dos filas
  compartían superficie y la navegación parecía colgar de la marca.
- **El destino actual se marca en tinta, no en azul**, porque el azul está
  reservado a lo accionable y donde ya estás no es una acción. Y **sin cambiar
  el grosor de la letra**: en 600 el texto es más ancho que en 500, así que al
  navegar las pestañas de al lado se desplazarían unos píxeles cada vez.
- **En móvil no se oculta nada del contexto.** Antes el bloque de identidad
  desaparecía entero por debajo de 48rem y quedaba un «Salir» suelto: se podía
  cerrar la sesión sin ver de quién era. Medido a 375 px, nombre, rol, gimnasio
  y salir suman 320 px de los 343 útiles — cabe, y los nombres largos se
  recortan con puntos suspensivos.
- **Sin cajón ni hamburguesa.** Tres destinos caben en una fila a 375 px.
- **Sin iconos.** Con tres etiquetas de texto no añaden claridad, solo ruido.
- **Salto al contenido** al principio del foco, para no tabular por la
  navegación entera en cada pantalla.

Sigue habiendo **un solo punto de ruptura, 48rem**. La barra lateral se ganará
el sitio cuando los destinos crezcan; ese día esta sección vuelve a estar
vigente.

---

# I · Responsive

**Dos puntos de ruptura, no tres.**

| | Ancho | Qué pasa |
|---|---|---|
| Móvil | `< 48rem` | Una columna. **Las tablas dejan de ser tablas**: cada fila es una tarjeta con sus datos apilados |
| Tableta | `48rem – 64rem` | Dos columnas donde haya pares. Navegación en cajón |
| Escritorio | `≥ 64rem` | Barra lateral, tablas completas |

Lo de las tablas importa: hoy una tabla de socios en un móvil obliga a
desplazar en horizontal, que es la peor forma de leer una lista. Convertir filas
en tarjetas es más trabajo que un `overflow-x`, y es la diferencia entre
utilizable y no.

Objetivos concretos: **44 px** de zona táctil mínima, ningún desplazamiento
horizontal del cuerpo, y `prefers-reduced-motion` ya respetado.

## Hallazgos del paso 4, y qué pasó con ellos

1. **El `h1` saltaba 4 px al cambiar de pantalla.** ✅ Resuelto en el paso 5.
2. **`--texto-tenue` no llegaba al contraste mínimo.** ✅ Resuelto en el paso 5.
3. **Las tablas siguen desplazándose en horizontal dentro de su tarjeta.** Es la
   contención del paso 3, no la solución: la buena es convertir cada fila en
   tarjeta por debajo de 48rem. Afecta a socios, personal (dos tablas), planes y
   pagos: **paso 6**.

---

# L · Paso 5 · Componentes interactivos y superficies

## Lo que se encontró: la duplicación no se había ido, se había escondido

El paso 2 extrajo ocho componentes, pero cuatro pantallas seguían pintándose las
suyas. Al medirlo aparecieron **tres tablas** escritas tres veces —con relleno
`--e4`, `--e5` y `--e6`, o sea que cada una empezaba en una vertical distinta—,
**cuatro copias de la superficie de tarjeta** (cuota, ficha, nuevo y la de
verdad) y **cuatro encabezados de página**, de los cuales solo uno era el
componente.

## Botones

| Variante | Para qué | Dónde |
| --- | --- | --- |
| `primario` | La acción de la pantalla. **Una** por contexto | Crear, guardar, dar de alta |
| `secundario` | Lo demás que se puede hacer | Editar, cancelar, invitar |
| `peligro` | **Confirmar** algo que quita acceso | El «Sí» de una confirmación |
| `sutil` | Acción de fila o de apoyo | Retirar, archivar, salir |

El rojo va **solo en la confirmación, nunca en el botón que la abre**: «Dar de
baja» es secundario y «¿Seguro? Sí» es peligro. Pintar de rojo el primero llena
la pantalla de alarma antes de que nadie haya decidido nada.

Antes, el «Sí» que retiraba un acceso y el «No» que lo cancelaba eran **el mismo
botón sutil**: había que leer la palabra para saber cuál era cuál.

Tamaños: `md` (2.25rem) por defecto y `sm` (1.75rem) para acciones dentro de una
fila de tabla — 28 px, por encima del mínimo de 24 que pide WCAG 2.2.

## Campos

`Campo` y `Selector` comparten ahora una sola envoltura —etiqueta, control,
ayuda, error, y los `aria-describedby` que los atan—. El desplegable no tenía
ayuda ni error, **y por eso cuota no lo usaba**: se había escrito tres `<select>`
a mano. La caja mide 2.25rem, igual que un botón, para que un campo y su botón
cuadren en una fila.

## Superficies

`Tarjeta` admite `titulo` y `acciones`, que dibujan una cabecera con filete. Se
añadió porque cuota ya la tenía escrita a mano y era la última superficie que
seguía siendo copia. El relleno vive en el **cuerpo** y no en la tarjeta: si
estuviera en la tarjeta, el filete no llegaría a los bordes.

## Tablas

Una sola tabla, con **una** opción: `filasPulsables`. Es la única diferencia que
significaba algo —en socios cada fila abre una ficha; en planes y personal las
filas no van a ninguna parte y el mismo resalte prometería algo que no pasa—.
Los modificadores de celda (`numerica`, `acciones`, `tenue`) se exportan como
clases.

## Cómo se arregló el salto de 4 px

Desapareció el parámetro `alineacion`. Ahora el título y las acciones comparten
una **fila de alto fijo** (2.25rem, el alto de un botón) y la entradilla va
debajo de esa fila, no dentro. El `h1` cae en la misma coordenada haya o no haya
botón, haya o no haya entradilla — y nadie tiene que elegir nada.

En estrecho ese alto fijo **se quita**: apilado no alinea nada, y provocaba el
mismo salto en el otro sentido (sin acciones, el bloque del título se estiraba
hasta los 36 px y centraba el `h1` dentro).

## Contraste

`--texto-tenue` pasa de `#8c9198` a `#6b7280`. No fallaba en un sitio: fallaba
en los 21 donde se usa. Ahora da **4.83** sobre blanco y **4.55** sobre
`--fondo-sutil`, la otra superficie donde aparece; los valores intermedios que
se probaron pasaban sobre blanco y fallaban sobre el gris. Sigue siendo el más
claro de los tres, así que la jerarquía se conserva.

---

# J · Orden de implementación

Cada paso es verificable por separado y ninguno rompe el anterior.

**1 · Tokens** — `globals.css`: escala tipográfica, `--aviso`, radios, anchos,
`--tinta`. *Cambio visual: solo el ámbar, que pasa a ser token.* Base para todo
lo demás.

**2 · Extraer componentes** — `Etiqueta`, `Tarjeta`, `Tabla`, `EstadoVacio`,
`Cargando`, `EncabezadoDePagina`, `ConfirmacionEnLinea`, `Selector`. Pantalla a
pantalla. **Refactor puro: la interfaz no debe cambiar.** Aquí desaparece el
grueso del CSS duplicado.

**3 · Tipografía y ritmo** — Inter, escala aplicada, números tabulares,
unificar los seis anchos en dos. Primer cambio visible de verdad.

**4 · Navegación** — barra lateral, cabecera reorganizada, cajón en móvil. El
paso más arriesgado; va solo.

**5 · Pantalla a pantalla** — login, socios, ficha, personal, planes. Ya con
piezas consistentes, es pulir.

**6 · Responsive** — tablas a tarjetas, zonas táctiles, revisión en 375 px.

Los pasos 1 y 2 no cambian casi nada visualmente y **reducen a la mitad la
superficie** sobre la que trabajan los pasos 3 a 6. Hacerlos al revés significa
maquetar tres veces lo mismo.

---

# K · Ficheros

## Se crean

```
componentes/etiqueta.tsx + .module.css
componentes/tarjeta.tsx + .module.css
componentes/tabla.tsx + .module.css
componentes/estado-vacio.tsx + .module.css
componentes/cargando.tsx + .module.css
componentes/encabezado-de-pagina.tsx + .module.css
componentes/confirmacion-en-linea.tsx + .module.css
componentes/selector.tsx + .module.css
componentes/barra-lateral.tsx + .module.css      (paso 4 — NO se creó, ver H)
lib/tipografia.ts                                 (paso 3, next/font)
```

## Se modifican

```
app/globals.css                    tokens          paso 1
componentes/marco.tsx + css        estructura      paso 4
componentes/boton.*                variante peligro, tamaño sm
componentes/campo.*                textarea
app/socios/*, app/socios/ficha/*, app/socios/nuevo/*
app/personal/*, app/planes/*
app/login/*, app/forgot-password/*, app/reset-password/*, app/accept-invitation/*
```

De los `.module.css` de pantalla, **la mayoría encoge mucho**: lo que quede será
lo específico de esa pantalla, no la enésima copia de una tabla.

## No se toca

`lib/api.ts`, `lib/sesion.tsx`, `lib/formulario.ts`, `lib/errores.ts`,
`componentes/ruta-privada.tsx`, y **nada** de `apps/api`, `packages/*`, base de
datos, permisos, RLS ni autenticación.

---

## Lo que esta propuesta no hace

No inventa pantallas. Dashboard, entrenadores, rutinas y ajustes **siguen sin
existir** cuando esto termine: el sistema visual deja el terreno preparado para
cuando se decidan, pero diseñarlas es otra conversación.
