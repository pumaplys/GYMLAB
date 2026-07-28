# ADR-0005 — Monorepo con pnpm y Turborepo

- **Fecha:** 2026-07-26
- **Estado:** Aceptado

## Decisión

Un solo repositorio con `apps/{api,web,mobile}` y `packages/{contracts,db,config}`.

## Alternativas consideradas

| Alternativa | Por qué se descarta |
|---|---|
| Repositorios separados | Un cambio de dominio serían tres PRs y una ventana en la que los tres extremos no coinciden. En monorepo es **un commit atómico** |

## El grafo de dependencias, y que no crezca

```
config ← contracts ← api · web · mobile
config ← db        ← api
```

**No hay arista `db → contracts`, y es deliberado.** Se introdujo una por
descuido al colocar ahí los nombres de las colas; rompió CI en el primer
checkout limpio, porque `pnpm db:migrate` habría necesitado un `dist`
construido. Una migración de base de datos no debe depender de haber compilado
nada.

`db` no lo consumen ni el panel ni la app: que pudieran importar el esquema
sería el agujero por el que se filtran datos entre tenants.

## Consecuencias

**Positivas:** un cambio atraviesa las tres superficies en un commit; una sola
versión de cada dependencia mediante el catálogo de pnpm.

**Negativas:** el orden de construcción importa, y Turborepo solo lo garantiza
en las tareas que pasan por él. Los scripts directos —como `db:migrate`— no
deben depender de artefactos construidos.

**Coste de revertir:** alto.
