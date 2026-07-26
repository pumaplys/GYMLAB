# @gymlab/db

Esquema, migraciones y **aislamiento multi-tenant**. Lo consume únicamente `@gymlab/api`.

---

## Las tres piezas del aislamiento

Ninguna basta por sí sola:

| Pieza | Dónde | Qué garantiza |
|---|---|---|
| Políticas RLS | `sql/01-rls.sql` | Postgres filtra por `gym_id`, independientemente de la consulta |
| `withTenant()` | `src/tenant.ts` | Fija `app.gym_id` de forma local a la transacción |
| `assertRlsIsEnforced()` | `src/client.ts` | Impide arrancar con un rol que ignoraría las políticas |

Y encima, `src/__tests__/tenant-isolation.test.ts`, que verifica que las tres funcionan de verdad.

## El detalle que lo decide todo: dos roles

En Postgres, **un superusuario y el propietario de una tabla ignoran RLS**. Si la aplicación se conectara con el mismo rol que ejecuta las migraciones, todo estaría aparentemente bien configurado y no habría ningún aislamiento — sin ningún error que lo delatara.

```
DATABASE_URL      → gymlab      (propietario)  migraciones y seed
DATABASE_URL_APP  → gymlab_app  (sin privilegios)  API y tests
```

El primer test del archivo de aislamiento comprueba precisamente esto: si la conexión de la app fuera superusuario, todos los demás tests serían falsos positivos.

## Uso

```ts
// Dentro del tenant: no hace falta ningún WHERE gym_id.
const socios = await withTenant(db, gymId, (tx) => tx.select().from(members));

// Fuera del tenant: solo login y operaciones de plataforma.
const user = await withoutTenant(db, (tx) =>
  tx.select().from(users).where(eq(users.email, email)),
);
```

## Comandos

```bash
pnpm db:generate   # genera migración a partir del esquema Drizzle
pnpm db:migrate    # aplica migraciones + roles + políticas RLS
pnpm db:studio     # explorador de datos
pnpm --filter @gymlab/db test
```

`migrate` encadena `drizzle-kit migrate` y `pnpm rls`. El orden importa: las tablas deben existir antes de habilitarles RLS. `sql/*.sql` es idempotente y debe reaplicarse en cada despliegue.

---

## Checklist al añadir una tabla de negocio

Las cuatro, o la tabla no entra:

- [ ] Columna `gym_id` con el helper `tenantId()` y FK a `gyms`.
- [ ] Índice sobre `gym_id` (toda consulta lo va a filtrar).
- [ ] Bloque `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` en `sql/01-rls.sql`.
- [ ] Caso en `tenant-isolation.test.ts`.

## Excepciones documentadas

`organizations` y `gyms` **son** la jerarquía del tenant: sus políticas comparan contra `id`, no contra `gym_id`.

`users` no tiene RLS de tenant, y es deliberado: el login busca por email antes de que exista contexto de gimnasio. Se compensa restringiendo su contenido a identidad y credenciales — ningún dato de negocio ni de salud. Está documentado con un `COMMENT ON TABLE` en la propia base de datos.

## Pendiente (decisión abierta)

El acceso del rol `superadmin` de plataforma. La arquitectura preveía un rol de BD separado con `BYPASSRLS`, pero **`BYPASSRLS` no siempre se puede conceder en Postgres gestionado** (Neon, Supabase). Se decidirá al construir el módulo `platform`; no hace falta para el MVP y no conviene improvisarlo.
