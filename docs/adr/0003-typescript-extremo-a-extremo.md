# ADR-0003 — TypeScript de extremo a extremo

- **Fecha:** 2026-07-26
- **Estado:** Aceptado

## Contexto

Tres superficies —API, panel web y app móvil— y una sola persona
desarrollándolas.

## Decisión

Un único lenguaje en las tres, con un paquete `@gymlab/contracts` donde los
tipos y esquemas de validación se definen **una vez**.

## Alternativas consideradas

| Alternativa | Por qué se descarta |
|---|---|
| Backend en Go o Python | Con un solo desarrollador, el cambio de contexto entre lenguajes es el mayor impuesto oculto. Y obligaría a mantener los tipos del dominio por duplicado |

## Consecuencias

**Positivas:** cambiar un campo rompe la compilación en los tres sitios **antes**
de desplegar. Y desarrollando con IA es decisivo: el modelo tiene el dominio
entero tipado en contexto y genera código coherente en lugar de inventarse un
DTO distinto en cada archivo.

**Negativas:** se renuncia a lenguajes mejores para tareas concretas. Si algún
día hace falta cálculo intensivo, será un servicio aparte.

**Coste de revertir:** alto para el backend, bajo para añadir un servicio en
otro lenguaje.

## Regla que lo sostiene

`contracts` contiene **solo** lo que comparten los clientes. Lo que no ve ni el
panel ni la app no va ahí — los nombres de las colas de trabajos, por ejemplo,
viven en `@gymlab/db`, que es quien las provisiona.
