import { beforeEach, afterAll } from 'vitest';
import { closeDatabase, createDatabase, sql, type Database } from '@gymlab/db';
// Por el efecto: es quien busca y carga el `.env` de la raiz. Este fichero se
// evalua ANTES que los tests, cuando `DATABASE_URL` todavia no existe, y sin
// esto la conexion se abria sin contrasena.
import '../config/env';

/**
 * Limpia el contador POR IP entre tests.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POR QUE HIZO FALTA ESTO, QUE ES LO INTERESANTE                           │
 * │                                                                          │
 * │ El limite de intentos tiene dos umbrales: uno estrecho por pareja        │
 * │ (email, IP) y otro mas alto por IP suelta, 20 en 15 minutos. El segundo  │
 * │ **no se aplicaba nunca** cuando no habia IP, y hasta ahora no la habia:  │
 * │ `ipDe` leia `x-forwarded-for`, que en los tests no existe, asi que       │
 * │ `if (ip)` era falso y el contador global no se incrementaba.             │
 * │                                                                          │
 * │ Al pasar a `request.ip` siempre hay direccion —la del socket— y el       │
 * │ umbral global entra en juego. La suite hace muchos mas de 20 inicios de  │
 * │ sesion desde la misma direccion, asi que a partir del vigesimo primero    │
 * │ todo respondia 429.                                                       │
 * │                                                                          │
 * │ No es un fallo del cambio: es una proteccion que estaba dormida. Lo que  │
 * │ toca es que cada test parta de cero, no rebajar el umbral.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Solo se borran las claves POR IP. Las de `email + IP` llevan el correo
 * dentro, y hay tests que dependen de que se acumulen dentro de un mismo test.
 */
let db: Database | null = null;

beforeEach(async () => {
  db ??= createDatabase({ connectionString: process.env.DATABASE_URL!, max: 1 });
  // Las claves por IP son las que NO llevan correo; un correo siempre tiene '@'.
  await db.execute(sql`DELETE FROM auth_throttle WHERE key NOT LIKE '%@%'`);
});

afterAll(async () => {
  if (db) await closeDatabase(db);
});
