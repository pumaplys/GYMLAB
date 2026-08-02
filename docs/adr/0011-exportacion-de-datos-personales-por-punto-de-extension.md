# ADR-0011 — La exportación de datos personales se compone por punto de extensión

- **Fecha:** 2026-07-30
- **Estado:** Aceptado
- **Relacionado:** ADR-0006 (fronteras de módulo), ADR-0010 (punto de extensión de invitaciones)

## Contexto

Los artículos 15 y 20 del RGPD obligan a entregar **todo** lo que se guarda de una
persona cuando la reclama. Hoy `GET /v1/gyms/:gymId/members/:id/export` entrega la
ficha y las notas internas, que es todo lo que existía.

Deja de serlo con el módulo de suscripciones: a partir de ahora también hay cuotas
y pagos. Y el módulo 6 traerá peso y medidas, que además son categoría especial
(art. 9).

## El problema

La dirección de dependencia entre módulos ya está fijada y es la correcta:

```
billing  → members      (validar que el socio existe al crear una suscripción)
trainers → members      (devolver fichas de sus asignados)
progress → members      (lo mismo, cuando llegue)
```

Si `members` llamara a `billing` para exportar, se cerraría el círculo. Y ya
sabemos exactamente lo que cuesta: en el módulo de entrenadores, un ciclo de
proveedores dejó a Nest **colgado en el arranque sin emitir ningún error** hasta
que un test agotó su tiempo (ADR-0010). No es un riesgo teórico, es una factura ya
pagada una vez.

Hay además un problema que no es de arquitectura sino legal. El modo de fallo de
una exportación incompleta es **silencioso**: nadie recibe un error, simplemente
se entrega menos de lo debido ante una solicitud formal. Lo que falla no es el
código, es la respuesta a una obligación legal, y se descubre tarde y mal.

### Por qué el borrado no tiene este problema y la exportación sí

El derecho de supresión (art. 17) **ya está resuelto por la base de datos**: al
borrar la ficha, las suscripciones se van en cascada y los pagos quedan
desligados (`ON DELETE SET NULL`, porque el gimnasio tiene obligación fiscal de
conservar sus registros contables — art. 17.3.b).

PostgreSQL propaga un borrado solo. No sabe componer una lectura. Por eso la
exportación necesita un mecanismo explícito y el borrado no.

## Alternativas consideradas

**Componer en el controlador.** El endpoint llama a `MembersService` y a
`BillingService` y une los resultados. Simple y sin ciclo. Se descarta porque
cada módulo nuevo con datos personales obliga a acordarse de tocar ese
controlador, y olvidarlo no rompe nada visible: solo entrega una exportación
incompleta. Es el modo de fallo silencioso que este ADR quiere evitar.

**Un endpoint de exportación por módulo.** El más simple de escribir y el peor de
usar: quien atienda la solicitud tendría que llamar a tres sitios y unir a mano lo
que entrega. Una obligación legal no debería depender de que alguien recuerde la
lista completa de endpoints.

**Vista SQL o consulta única con JOINs.** Rompe la frontera de módulo que sostiene
todo lo demás: `members` pasaría a conocer las tablas de `billing`.

## Decisión

Una interfaz en `common`, como la de invitaciones:

```ts
export const PERSONAL_DATA_CONTRIBUTORS = Symbol('PERSONAL_DATA_CONTRIBUTORS');

export interface PersonalDataContributor {
  /** Etiqueta con la que aparece en la exportación. */
  readonly seccion: string;
  aportarDatos(gymId: string, memberId: string): Promise<unknown>;
}
```

`members` pide a la lista y compone. No sabe quién hay dentro ni cuántos son.

**Con la misma regla que ADR-0010, y no es negociable:** los implementadores son
**clases dedicadas y sin dependencias hacia quien las invoca**. Este token está en
el grafo de dependencias de `MembersService`, así que lo que se registre arrastra
consigo todo lo que necesite; registrar un servicio que dependa de `members`
cierra el ciclo y devuelve el arranque colgado.

El cableado vive en la raíz de la aplicación, junto al de invitaciones.

## Consecuencias

**Positivas**

Añadir un módulo con datos personales es registrar un contribuidor. La
exportación crece sola y nadie tiene que acordarse de un controlador.

`members` deja de ser el sitio donde se acumula el conocimiento de todos los
demás módulos, que era la dirección en la que iba.

**Negativas**

La exportación deja de ser legible de un vistazo: para saber qué contiene hay que
mirar el módulo de cableado, no un único método. Se compensa con el nombre de
sección de cada contribuidor, que aparece en el resultado.

Un módulo que **olvide registrarse** sigue produciendo una exportación incompleta.
El punto de extensión reduce la superficie del olvido —una línea en la raíz en
lugar de un método— pero no lo elimina. No conozco forma de detectarlo
automáticamente sin inventar un registro de «módulos con datos personales» que
también habría que mantener a mano.

**Coste de revertir:** bajo. Volver a componer en el controlador es mecánico.

## Cómo se verifica

- La exportación de un socio con cuota y pagos **los incluye**, cada uno bajo su
  sección.
- Falsificación: quitando el contribuidor de `billing` del cableado, ese test cae.
  Si no cae, no está probando lo que dice.
- La exportación de un socio sin suscripción devuelve la sección vacía, no un
  error: no tener cuota es normal.

## Señales para revisarla

- Aparece un tercer o cuarto contribuidor y el orden de las secciones empieza a
  importar. Hoy no importa; si importa, habrá que hacerlo explícito en lugar de
  heredarlo del orden del array de inyección.
- Alguien pide exportar en un formato concreto (PDF, CSV) o de forma asíncrona
  porque el volumen crece. Entonces esto pasa a ser un trabajo de pg-boss y el
  punto de extensión sigue sirviendo igual.
