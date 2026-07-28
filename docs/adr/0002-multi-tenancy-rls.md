# ADR-0002 — Multi-tenancy: schema compartido, `gym_id` y Row Level Security

- **Fecha:** 2026-07-26
- **Estado:** Aceptado

> **Es la decisión más cara de revertir del proyecto.** Una fuga de datos entre
> gimnasios no es un bug: ningún cliente vuelve después de ver los socios de
> otro, y en la UE es además una brecha de datos de salud notificable.

## Contexto

Cada gimnasio es un tenant. Hay que aislar sus datos con un solo desarrollador
manteniendo la infraestructura.

## Decisión

Una sola base de datos, un solo schema. Toda tabla de negocio lleva `gym_id`.
**Postgres impone el aislamiento mediante RLS.**

## Alternativas consideradas

| Estrategia | Aislamiento | Coste operativo | Migraciones | Veredicto |
|---|---|---|---|---|
| BD por tenant | Máximo | Prohibitivo con 200 gimnasios | N migraciones | ❌ |
| Schema por tenant | Alto | Alto: Postgres sufre con miles de schemas | N migraciones | ❌ |
| **Schema compartido + RLS** | **Alto, a nivel de motor** | **Mínimo** | **Una** | ✅ |

Lo que hace segura la opción barata es RLS: el aislamiento **no depende de que
alguien recuerde poner `WHERE gym_id = ...`**. Lo impone el motor. Un olvido
devuelve cero filas, nunca las de otro gimnasio.

Eso pesa aún más desarrollando con IA, que multiplica el volumen de consultas
escritas y, con él, la probabilidad de ese olvido.

## Consecuencia no evidente: hacen falta dos roles de base de datos

En Postgres, **un superusuario y el propietario de una tabla ignoran las
políticas RLS**. Si la aplicación se conectara con el rol que ejecuta las
migraciones, RLS estaría habilitado, las políticas escritas, los tests en
verde... y el aislamiento sería inexistente, sin ningún error que lo delatara.

```
DATABASE_URL      -> gymlab      (propietario)      migraciones y políticas
DATABASE_URL_APP  -> gymlab_app  (sin privilegios)  API y tests
```

`assertRlsIsEnforced()` aborta el arranque si la conexión de la aplicación puede
saltarse las políticas.

## Consecuencias

**Positivas:** una migración para todos, coste operativo mínimo, aislamiento
impuesto por el motor.

**Negativas:** toda tabla nueva debe recordar su política — mitigado con un test
que consulta el catálogo y exige que *toda* tabla con `gym_id` tenga RLS y al
menos una política.

**Coste de revertir:** muy alto.

## Cómo se verifica

No basta con que los tests pasen: un test de RLS en verde pasaría igual si las
políticas no existieran y las tablas estuvieran vacías. Se comprueba **por
falsificación** — apuntando la conexión de la aplicación al rol propietario, la
batería debe ponerse en rojo. Se hizo: 8 de 13 casos fallaron, incluido un
`DELETE` sin filtro que sí borró filas del otro gimnasio.

## Señales para revisarla

- Un gimnasio supera el 20 % del volumen total: evaluar base dedicada para ese
  tenant, cosa que el modelo `gym_id` ya permite.
