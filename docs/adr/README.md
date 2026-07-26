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

Los ADR de la propuesta inicial están consolidados en
[`../01-arquitectura.md`](../01-arquitectura.md) y deben extraerse a documentos
individuales:

| ADR | Título | Estado |
|---|---|---|
| 0001 | Monolito modular en lugar de microservicios | Pendiente de extraer |
| 0002 | Multi-tenancy: schema compartido + `gym_id` + RLS | Pendiente de extraer |
| 0003 | TypeScript de extremo a extremo | Pendiente de extraer |
| 0004 | Stack concreto (NestJS, Drizzle, Next.js, Expo) | Pendiente de extraer |
| 0005 | Monorepo con pnpm + Turborepo | Pendiente de extraer |
| 0006 | REST versionado en lugar de tRPC | Pendiente de extraer |
