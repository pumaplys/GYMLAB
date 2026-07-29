# Architecture Decision Records (ADR)

Un ADR es un documento corto que registra **una decisión de arquitectura, el
contexto en el que se tomó y las alternativas que se descartaron**.

## Por qué existen

Con un solo desarrollador el riesgo no es olvidar *qué* se decidió: es olvidar
**por qué**. Dentro de seis meses, al mirar una decisión sin su contexto, la
tentación siempre es reescribirla. Un ADR responde "esto ya lo pensaste, y estos
eran los motivos" — o deja claro que el contexto ha cambiado y ahora sí toca
cambiarla.

Es también lo que hace que este proyecto sobreviva a que te incorpores a alguien
o a que lo dejes aparcado tres meses.

## Cómo se usan

1. Copia `0000-plantilla.md` a `NNNN-titulo-en-kebab-case.md`.
2. Numeración correlativa, sin reutilizar números.
3. **Un ADR nunca se borra ni se reescribe.** Si una decisión se revierte, se
   crea un ADR nuevo que la sustituye y se marca el antiguo como `Sustituido por ADR-XXXX`.
4. Se escribe *antes* de implementar, no después.

## Cuándo escribir uno

Solo para decisiones caras de revertir: elección de base de datos, estrategia de
multi-tenancy, modelo de autenticación, proveedor de pagos, formato de la API.
No para nombrar variables ni elegir una librería de fechas.

## Índice

| ADR | Título | Estado |
|---|---|---|
| [0001](0001-monolito-modular.md) | Monolito modular, no microservicios | Aceptado |
| [0002](0002-multi-tenancy-rls.md) | Multi-tenancy: schema compartido, `gym_id` y RLS | Aceptado |
| [0003](0003-typescript-extremo-a-extremo.md) | TypeScript de extremo a extremo | Aceptado |
| [0004](0004-stack-tecnologico.md) | Stack tecnológico (incluye REST frente a tRPC) | Aceptado |
| [0005](0005-monorepo.md) | Monorepo con pnpm y Turborepo | Aceptado |
| [0006](0006-modulos-del-dominio.md) | Módulos del dominio y su frontera | Aceptado |
| [0007](0007-autenticacion-y-sesiones.md) | Autenticación, sesiones y contexto de tenant | Aceptado |
| [0008](0008-alcance-de-la-transaccion.md) | Una transacción por petición, sin I/O externo dentro | Aceptado |
| [0009](0009-no-montar-el-router-de-better-auth.md) | No montar el router HTTP de Better Auth | Aceptado |
| [0010](0010-dos-endpoints-para-aceptar-invitaciones.md) | Dos endpoints para aceptar invitaciones | Aceptado |

[`../01-arquitectura.md`](../01-arquitectura.md) sigue siendo la vista de
conjunto; los ADR 0001–0006 desarrollan sus decisiones una por una.
