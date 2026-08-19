/**
 * El gimnasio contra el que se audita.
 *
 * Se monta ENTERO por la API publica, con los mismos flujos que usa una
 * persona. Ni una escritura directa a la base: si el alta de un socio se
 * rompiera, esto tiene que romperse tambien.
 *
 * Lo unico que se lee por SQL son los tokens de invitacion, que en la vida real
 * viajan por correo y aqui no hay buzon.
 *
 * En local se reutiliza el gimnasio ya sembrado si `credenciales.local.json`
 * existe; en CI la base nace vacia en cada job, asi que siembra siempre.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/*
 * `pg` se resuelve desde `packages/db`, no desde aqui.
 *
 * `apps/web` no depende de `pg` —ni debe—, y pnpm aisla los `node_modules`, asi
 * que un `require('pg')` normal desde este fichero no encuentra nada. Anclando
 * el resolvedor al `package.json` del paquete que si lo declara, se usa la
 * misma copia que las migraciones y los e2e.
 */
const require = createRequire(
  fileURLToPath(new URL('../../../packages/db/package.json', import.meta.url)),
);

const NOMBRES = [
  ['Lucia', 'Fernandez'],
  ['Javier', 'Ortega'],
  ['Carmen', 'Delgado'],
  ['Ruben', 'Iglesias'],
  ['Sofia', 'Navarro'],
];

/**
 * Rellena del `.env` de la raiz lo que falte en el entorno.
 *
 * En CI las variables vienen del job y esto no hace nada. En local no hay nadie
 * que las cargue —la API las lee ella sola al arrancar—, y el sembrador
 * necesita `DATABASE_URL` y `PLATFORM_INVITE_CODE`. Se leen a mano en lugar de
 * traer `dotenv`: son dos valores.
 */
function cargarEnvSiFalta() {
  const raiz = fileURLToPath(new URL('../../../.env', import.meta.url));
  if (!existsSync(raiz)) return;
  for (const linea of readFileSync(raiz, 'utf8').split(/\r?\n/)) {
    if (!linea || linea.startsWith('#') || !linea.includes('=')) continue;
    const corte = linea.indexOf('=');
    const nombre = linea.slice(0, corte).trim();
    if (process.env[nombre] !== undefined) continue;
    process.env[nombre] = linea.slice(corte + 1).trim().replace(/^["']|["']$/g, '');
  }
}

export async function obtenerFixture({ api, ficheroCredenciales, log = () => {} }) {
  if (ficheroCredenciales && existsSync(ficheroCredenciales)) {
    const guardado = JSON.parse(readFileSync(ficheroCredenciales, 'utf8'));
    log(`reutilizando el gimnasio "${guardado.gimnasio}" de ${ficheroCredenciales}`);
    return guardado;
  }

  log('sembrando un gimnasio nuevo por la API...');
  cargarEnvSiFalta();
  const fixture = await sembrar({ api, log });
  if (ficheroCredenciales) {
    writeFileSync(ficheroCredenciales, JSON.stringify(fixture, null, 2));
    log(`credenciales guardadas en ${ficheroCredenciales}`);
  }
  return fixture;
}

async function sembrar({ api, log }) {
  const pg = require('pg');
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const sql = async (q, p = []) => (await db.query(q, p)).rows;

  const suf = randomUUID().slice(0, 6);
  const correo = (quien) => `${quien}-${suf}@auditoria.local`;
  const clave = `Auditoria-${randomUUID()}`;

  const pedir = async (metodo, ruta, { token, body } = {}) => {
    const r = await fetch(`${api}${ruta}`, {
      method: metodo,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const texto = await r.text();
    let json = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      json = texto;
    }
    if (r.status >= 400) {
      throw new Error(`${metodo} ${ruta} -> ${r.status}: ${JSON.stringify(json).slice(0, 200)}`);
    }
    return json;
  };

  const alta = await pedir('POST', '/v1/auth/register-gym', {
    body: {
      organizationName: `Auditoria ${suf}`,
      gymName: 'Gimnasio Vista',
      ownerName: 'Marta Ruiz',
      email: correo('duena'),
      password: clave,
      platformCode: process.env.PLATFORM_INVITE_CODE,
    },
  });
  const gym = alta.activeGymId;
  const tokenOwner = alta.token;

  const invitar = async (rol, quien, nombre) => {
    await pedir('POST', `/v1/gyms/${gym}/invitations`, {
      token: tokenOwner,
      body: { email: correo(quien), role: rol },
    });
    const [job] = await sql(
      `SELECT data FROM pgboss.job WHERE name = 'email.invitation'
         AND data->>'to' = $1 ORDER BY created_on DESC LIMIT 1`,
      [correo(quien)],
    );
    const r = await pedir('POST', '/v1/auth/accept-invitation', {
      body: { token: job.data.token, name: nombre, password: clave },
    });
    return r.token;
  };

  const tokenTrainer = await invitar('trainer', 'entrenador', 'Alex Moreno');
  await invitar('receptionist', 'recepcion', 'Nuria Gil');

  const [{ id: trainerUserId }] = await sql('SELECT id FROM users WHERE email = $1', [
    correo('entrenador'),
  ]);
  const [{ id: trainerId }] = await sql(
    'SELECT id FROM trainers WHERE gym_id = $1 AND user_id = $2',
    [gym, trainerUserId],
  );

  // Una invitacion que se queda SIN aceptar. Un gimnasio real siempre tiene
  // alguna, y es la unica forma de que exista en pantalla la accion de
  // revocarla — que es una de las que D0 vigila.
  await pedir('POST', `/v1/gyms/${gym}/invitations`, {
    token: tokenOwner,
    body: { email: correo('pendiente'), role: 'receptionist' },
  });

  const planes = [];
  for (const p of [
    { name: 'Mensual', priceCents: 3500, period: 'monthly' },
    { name: 'Trimestral', priceCents: 9000, period: 'quarterly' },
  ]) {
    planes.push(await pedir('POST', `/v1/gyms/${gym}/plans`, { token: tokenOwner, body: p }));
  }

  const socios = [];
  for (const [nombre, apellido] of NOMBRES) {
    const m = await pedir('POST', `/v1/gyms/${gym}/members`, {
      token: tokenOwner,
      body: { firstName: nombre, lastName: apellido, phone: '600000000' },
    });
    socios.push({ id: m.id, nombre: `${nombre} ${apellido}` });
  }

  // Cuotas y un pago, para que la ficha tenga sus secciones llenas.
  for (let i = 0; i < 3; i++) {
    await pedir('POST', `/v1/gyms/${gym}/members/${socios[i].id}/subscription`, {
      token: tokenOwner,
      body: { planId: planes[i % planes.length].id },
    });
  }
  await pedir('POST', `/v1/gyms/${gym}/members/${socios[0].id}/payments`, {
    token: tokenOwner,
    body: { amountCents: 3500, method: 'cash', concept: 'subscription' },
  });

  // El primer socio tiene cuenta: es con quien se audita el area de socio.
  await pedir('PATCH', `/v1/gyms/${gym}/members/${socios[0].id}`, {
    token: tokenOwner,
    body: { email: correo('socia') },
  });
  await pedir('POST', `/v1/gyms/${gym}/members/${socios[0].id}/invite`, {
    token: tokenOwner,
    body: { email: correo('socia') },
  });
  const [jobSocia] = await sql(
    `SELECT data FROM pgboss.job WHERE name = 'email.invitation'
       AND data->>'to' = $1 ORDER BY created_on DESC LIMIT 1`,
    [correo('socia')],
  );
  await pedir('POST', '/v1/auth/accept-invitation', {
    body: { token: jobSocia.data.token, name: socios[0].nombre, password: clave },
  });

  // El socio con cuenta va al entrenador: sin eso, su ficha de entrenador es 404.
  for (let i = 0; i < 3; i++) {
    await pedir('POST', `/v1/gyms/${gym}/trainers/${trainerId}/members`, {
      token: tokenOwner,
      body: { memberId: socios[i].id },
    });
  }

  const ejercicios = await pedir('GET', `/v1/gyms/${gym}/exercises`, { token: tokenOwner });
  const rutinas = [];
  for (const [nombre, desc, n] of [
    ['Fuerza principiantes', 'Tres dias por semana, cuerpo completo', 5],
    ['Movilidad de hombro', 'Rehabilitacion, sin carga', 3],
    ['Hipertrofia tren superior', null, 6],
    ['Acondicionamiento general', 'Para volver despues de un paron', 4],
  ]) {
    const items = ejercicios.slice(0, n).map((e, i) => ({
      exerciseId: e.id,
      sets: 3 + (i % 2),
      reps: ['8', '10', '12'][i % 3],
      restSeconds: [60, 90][i % 2],
    }));
    rutinas.push(
      await pedir('POST', `/v1/gyms/${gym}/routines`, {
        token: tokenTrainer,
        body: { name: nombre, description: desc ?? undefined, items },
      }),
    );
  }

  await pedir('POST', `/v1/gyms/${gym}/routines/${rutinas[0].id}/members`, {
    token: tokenTrainer,
    body: { memberId: socios[0].id },
  });
  // La cuarta se archiva: es la que prueba el estado de #78C en pantalla.
  await pedir('POST', `/v1/gyms/${gym}/routines/${rutinas[3].id}/archive`, {
    token: tokenTrainer,
  });

  await db.end();
  log(`gimnasio ${gym} sembrado`);

  return {
    gimnasio: 'Gimnasio Vista',
    gym,
    trainerId,
    socios,
    rutinas: rutinas.map((r) => ({ id: r.id, name: r.name })),
    cuentas: {
      owner: { email: correo('duena'), clave },
      receptionist: { email: correo('recepcion'), clave },
      trainer: { email: correo('entrenador'), clave },
      member: { email: correo('socia'), clave },
    },
  };
}
