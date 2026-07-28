# ADR-0004 — Stack tecnológico

- **Fecha:** 2026-07-26
- **Estado:** Aceptado

## Decisión

| Capa | Elección | Por qué |
|---|---|---|
| API | **NestJS** | Estructura opinionada. Su rigidez es una ventaja desarrollando con IA: reduce la varianza del código generado |
| ORM | **Drizzle** | Control del SQL y de la transacción, necesario para RLS. Sin motor binario aparte |
| BD | **PostgreSQL** | Hace de base relacional, cola de trabajos, búsqueda y analítica. Una pieza en lugar de cuatro |
| Auth | **Better Auth** | Se aloja en nuestro Postgres: sin coste por usuario activo y sin exportar datos personales a un tercero |
| Panel | **Next.js** | Renderizado híbrido, ecosistema, despliegue trivial |
| Móvil | **Expo** | Un código para iOS y Android. EAS Update permite parchear sin pasar por revisión de las tiendas — crítico con una sola persona |
| Trabajos | **pg-boss** | Colas sobre Postgres. Evita añadir Redis, y habilita el outbox transaccional (ADR-0008) |

## La alternativa que más se consideró: tRPC

Máxima ergonomía de tipos, pero **acopla cliente y servidor a la misma versión**.
Con una app móvil en las tiendas habrá usuarios con versiones antiguas durante
meses: hace falta un contrato REST versionado (`/v1/...`) y estable.

REST permite además abrir integraciones y webhooks a terceros sin rediseñar.

## Consecuencias

**Positivas:** una sola base de datos que operar; ningún servicio de pago por
usuario; todo el stack en un lenguaje.

**Negativas:** Postgres haciendo de todo tiene techo. Se aceptará hasta que una
métrica diga lo contrario.

**Coste de revertir:** alto para NestJS y Postgres, medio para el resto.

## Señales para revisarla

- CPU de Postgres por encima del 70 % sostenido: réplica de lectura antes que
  cambiar de pieza.
