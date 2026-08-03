# Decisión pendiente — Arquitectura del frontend

> Documento de decisión. Cuando se cierre se convierte en ADR-0014 y este fichero
> desaparece.
>
> Bloquea la primera pantalla de la Fase 2. Fecha: 2026-08-03.

Cuatro decisiones que se condicionan entre sí. La tercera —cómo viaja la sesión—
resulta ser la que manda sobre las demás, y no es la que parecía.

---

## 1. El stack

### Opciones

**Next.js.** Lo estándar. Aporta SSR, rutas de servidor y optimización de
imágenes. **Y aporta un runtime de Node que hay que operar**: otro proceso, otro
despliegue, otra cosa que se cae de madrugada. Aquí no compra nada — los datos
vienen de una API propia, no hay SEO que ganar en un panel privado, y no hay
imágenes.

**Vite + React, aplicación de una sola página.** Compila a ficheros estáticos: se
sirven desde cualquier sitio, sin proceso. Menos que operar, menos que pagar
(asunción A5, infraestructura por debajo de 100 €/mes) y menos que romperse.

**Svelte, Vue.** Buenos, y descartados por una razón que no es técnica: si algún
día hay app nativa será React Native, y tener React en los dos sitios permite
compartir criterio y personas. No compartirá código —React Native no comparte
componentes con la web— pero sí forma de pensar.

### Recomendación: **Vite + React + TypeScript**

Ninguna necesidad actual justifica un servidor de frontend. El día que haga falta
SSR —una página pública de un gimnasio, por ejemplo— será para otra aplicación
distinta de estas dos, y se decide entonces.

---

## 2. Cómo se consumen los contratos

Aquí hay un hueco real que conviene ver antes de elegir nada.

**ADR-0003 promete que «un cambio de campo rompe la compilación en los tres sitios
a la vez, antes de desplegar».** Hoy eso es verdad a medias: `@gymlab/contracts`
define los tipos, pero **nada ata una URL con su tipo de respuesta**. El frontend
podría llamar a `/v1/gyms/x/members` y declarar que devuelve lo que le apetezca;
TypeScript no tendría con qué desmentirlo.

Es decir: la garantía existe para las *formas*, no para las *llamadas*.

### Opciones

**Importar los contratos y escribir cada `fetch` a mano.** Cero maquinaria, y deja
el hueco abierto: el tipo de la respuesta lo afirma quien escribe la llamada.

**Generar OpenAPI desde NestJS y de ahí un cliente.** Cierra el hueco, y trae
decoradores de Swagger en todos los controladores, un generador y un artefacto
intermedio que se desincroniza en silencio si alguien olvida regenerarlo.

**Un cliente tipado a mano en `packages/api-client`.** Un módulo por dominio,
donde cada función declara su ruta, su entrada y su esquema de salida, todos
importados de `@gymlab/contracts`. Unas pocas líneas por endpoint.

### Recomendación: **cliente tipado a mano**, y que valide la respuesta

Es explícito, se lee, y no hay nada que regenerar. Y sobre todo: al declarar el
esquema de salida, **puede validarla en tiempo de ejecución**.

Esto último importa más de lo que parece. Sin ello, el modo de fallo cuando la API
cambia un campo es que la pantalla muestra `undefined` en un rincón y nadie se
entera. Con `parse()`, es un error inmediato y localizado. Es el mismo criterio de
fallar en cerrado que se aplicó a RLS y al consentimiento.

**Y la parte que de verdad cierra la promesa de ADR-0003:** los dos frontends
entran en el `typecheck` de CI. Un campo que cambie en los contratos rompe la
compilación del panel antes de desplegar, que es exactamente lo que el ADR decía.

---

## 3. Cómo viaja la sesión — la decisión que manda

La API ya soporta las dos vías: cookie `httpOnly` y token `Bearer`. Parecía una
elección de comodidad. **No lo es: es una decisión de despliegue disfrazada.**

### El problema que no se ve hasta que se despliega

Si el panel vive en `panel.gymlab.app` y la API en `api.gymlab.app`, la cookie de
sesión es **de terceros** para el navegador. Y ahí:

- **Safari la bloquea.** No es una preferencia del usuario ni una advertencia
  futura: la bloquea hoy.
- El portal del socio se abre **en el móvil, dentro del gimnasio, mayoritariamente
  en Safari**. Es el peor sitio posible para descubrirlo.

Las salidas son dos, y la diferencia no es de estilo.

### Opción A — Orígenes separados y token `Bearer`

El token se guarda en el navegador y viaja en la cabecera. Funciona en todas
partes y es lo que usará la app nativa si llega.

**El coste es concreto:** un token accesible desde JavaScript es robable por
cualquier XSS. Y las sesiones de socio duran **90 días**. Un solo fallo de
inyección en cualquier dependencia entrega sesiones de tres meses.

### Opción B — Un solo origen y cookie `httpOnly`

Todo detrás del mismo dominio, repartido por rutas:

```
gymlab.app/          panel del personal
gymlab.app/socio     portal del socio
gymlab.app/api       la API
```

- La cookie es **de primera parte**: ningún navegador la bloquea.
- Es `httpOnly`: **un XSS no puede leerla**. Es la diferencia entre «robaron la
  sesión» y «no pudieron».
- **Desaparece CORS**, y con él una clase entera de errores de configuración. La
  lista `CORS_ORIGINS` queda para la app nativa, si llega.
- A cambio entra CSRF, que se cubre con `SameSite=Lax` —que ya bloquea el envío
  cruzado— y con el hecho de que la API no acepta formularios, solo JSON.

### Recomendación: **B**

Es más segura y a la vez más simple de operar, que es una combinación rara y
conviene aprovecharla. El precio es un proxy inverso delante, que en cualquier
hosting moderno son cuatro líneas de configuración.

**Consecuencia que hay que aceptar con los ojos abiertos:** panel y portal
comparten origen, así que comparten cookie. Si un socio abre `/`, verá el panel
cargar y recibirá 403 de la API. Se resuelve redirigiendo por rol al entrar — es
una pantalla, no un problema de seguridad, porque la autorización siempre está en
el servidor.

### Requisito de despliegue

> **Producción debe servir el frontend y la API bajo el mismo origen.**
>
> No es una preferencia de configuración: es el supuesto sobre el que se apoya el
> modelo de sesión. Un despliegue que separe los orígenes rompe el portal del
> socio en Safari, y lo hará en la puerta del gimnasio, no en desarrollo.
>
> Va aquí y en `00-estado.md` porque es lo que hay que comprobar **antes** de
> contratar hosting, no después.

### Plan B — si el hosting no permite un solo origen

Puede ocurrir: no todos los proveedores dejan montar rutas de un dominio contra
dos destinos, y quizá el elegido no lo haga. La salida acordada, para que no haya
que improvisarla con el piloto encima:

**Token `Bearer` únicamente para el portal del socio, con sesiones cortas.**

- El **panel del personal** se queda con cookie: es el que maneja datos de todos
  los socios, se usa desde un ordenador del gimnasio y no depende de Safari móvil.
  Si el proxy no llega para dos rutas, casi siempre llega para una.
- El **portal del socio** pasa a token, que funciona en todos los navegadores sin
  depender de cookies de terceros.
- **Y la sesión de socio se acorta.** Hoy son 90 días porque vive en una cookie
  `httpOnly` que un XSS no puede leer; un token accesible desde JavaScript con esa
  duración es otra cosa. Con token, esa sesión baja a horas o pocos días, aunque
  eso signifique que el socio tenga que volver a entrar más a menudo.

Es peor que la opción B en las dos dimensiones que importan —seguridad y comodidad
del socio— y por eso es plan B y no alternativa equivalente. Queda escrito para
que la decisión, si toca tomarla, sea rápida y con las consecuencias delante.

---

## 4. Estructura de aplicaciones

### Opciones

**Una sola aplicación con dos zonas.** Menos que mantener. Pero envía al móvil del
socio, en la puerta del gimnasio, el mismo paquete que contiene el panel entero.
Se puede paliar con carga diferida por rutas; no se garantiza.

**Dos aplicaciones.** `apps/panel` y `apps/socio`. El portal del socio se mantiene
diminuto por construcción, no por disciplina. Y podrá declararse instalable
—manifiesto, icono, pantalla completa— sin arrastrar al panel a esa decisión.

### Recomendación: **dos aplicaciones**

El portal del socio son tres pantallas que se abren con prisa y mala cobertura.
Que su tamaño no dependa de que nadie se equivoque importando algo del panel es
una garantía estructural, y el monorepo ya hace que un segundo `app` cueste casi
nada.

### Qué se comparte, y qué no todavía

| | Dónde | Cuándo |
|---|---|---|
| Tipos y esquemas | `@gymlab/contracts` | ya existe |
| Cliente de la API | `packages/api-client` | **desde el primer día** |
| Sesión y sus hooks | `packages/api-client` | desde el primer día |
| Componentes visuales | `packages/ui` | **cuando haya un segundo consumidor real** |

Lo último es deliberado. Un paquete de componentes creado antes de tener dos
consumidores acaba siendo una carpeta con las cosas de la primera aplicación y una
dependencia que estorba. Cuando el portal necesite de verdad un botón que ya
existe en el panel, ese día se extrae — y no antes.

---

## Resumen

| Decisión | Recomendación |
|---|---|
| Stack | Vite + React + TypeScript, sin servidor de frontend |
| Contratos | Cliente tipado a mano en `packages/api-client`, que **valida** la respuesta |
| Sesión | **Un solo origen tras un proxy + cookie `httpOnly`** |
| Estructura | Dos aplicaciones; `packages/ui` solo cuando haya segundo consumidor |

**Si solo se aprueba una cosa de este documento, que sea la tercera.** Las otras
tres se pueden revertir en una tarde; la de la sesión condiciona el despliegue, y
descubrir en el piloto que Safari bloquea la cookie del portal sería caro y
vergonzoso.

## Lo que hace falta decidir

1. Las cuatro recomendaciones, o las que no convenzan.
2. **Si el hosting elegido permite el proxy inverso de un solo origen.** Es el
   único supuesto externo de todo el documento, y hay que comprobarlo **antes de
   contratar**, no al desplegar. Si no lo permitiera, se aplica el plan B ya
   escrito: token solo para el portal del socio, con sesión corta.
3. Si el portal del socio nace ya como instalable (PWA) o eso se decide con el
   piloto delante. Recomiendo lo segundo: es un manifiesto, se añade en una tarde.
