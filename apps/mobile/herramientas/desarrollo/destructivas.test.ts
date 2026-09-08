import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiError } from '@gymlab/api-client';
import { API_URL, esDeDesarrollo } from '../../src/api/config';
import { borrarToken, guardarToken } from '../../src/auth/almacen';
import {
  asignarEntrenador,
  cargarAccesos,
  cargarEntrenadores,
  cargarEntrenadoresDeSocio,
  cargarInvitaciones,
  cargarPersonal,
  crearInvitacion,
  retirarAcceso,
  retirarEntrenador,
  revocarInvitacion,
} from '../../src/personal/fuente';
import { lineaDeEvento, POR_PAGINA } from '../../src/accesos/historial';
import { estadoDeInvitacion, lineaDePersonal, sePuedeRevocar } from '../../src/personal/logica';
import {
  comprobarQueEsDesarrollo,
  consulta,
  ejecutar,
  variableDelEntorno,
  vigilarLaRed,
} from './cerrojo';

/**
 * LAS TRES ACCIONES DESTRUCTIVAS, EJECUTADAS DE VERDAD.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL HUECO QUE ESTO CIERRA                                                 │
 * │                                                                          │
 * │ PARITY-3 se entrego con 25 recorridos de navegador, y en TODOS la fuente │
 * │ era la de muestra: ninguna peticion salia y ninguna fila cambiaba. Se    │
 * │ habia comprobado que la pantalla PIDE confirmacion, no que la accion     │
 * │ OCURRA — y son dos cosas distintas.                                      │
 * │                                                                          │
 * │ Aqui se ejecutan contra la API y la base de datos de DESARROLLO, por el  │
 * │ camino real de la app:                                                   │
 * │                                                                          │
 * │   src/personal/fuente.ts   (el fichero NATIVO, el que viaja en el .ipa)  │
 * │     -> fuente-real.ts -> src/api/cliente.ts                              │
 * │     -> crearFetchAutenticado(leerToken) -> @gymlab/api-client -> HTTP    │
 * │                                                                          │
 * │ El unico doble es el Keychain, que no existe fuera de un telefono.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Requiere la API en :3001 y `docker compose up -d`. Se lanza a mano:
 *
 *   pnpm --filter @gymlab/mobile destructivas
 */

const sufijo = randomUUID().slice(0, 8);
const correo = (quien: string) => `${quien}-${sufijo}@test.local`;
/** La constante de pruebas del repositorio. No es la credencial de nadie. */
const CLAVE = 'contrasena-larga-1';
const RAIZ = 'http://localhost:3001/v1';

let red: ReturnType<typeof vigilarLaRed>;
let gimnasio = '';
let tokenDuena = '';
let tokenRecepcion = '';
let tokenEntrenador = '';
let tokenSocia = '';
let recepcionUserId = '';
let entrenadorUserId = '';
let entrenadorId = '';
let socioId = '';

interface Respuesta {
  estado: number;
  cuerpo: Record<string, unknown>;
}

async function pedir(
  metodo: string,
  ruta: string,
  opciones: { token?: string; cuerpo?: unknown } = {},
): Promise<Respuesta> {
  const res = await fetch(`${RAIZ}${ruta}`, {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      ...(opciones.token ? { authorization: `Bearer ${opciones.token}` } : {}),
    },
    ...(opciones.cuerpo === undefined ? {} : { body: JSON.stringify(opciones.cuerpo) }),
  });
  const texto = await res.text();
  return { estado: res.status, cuerpo: texto ? JSON.parse(texto) : {} };
}

/** El token de la invitacion, leido de la cola de correo. No se imprime. */
function tokenDeLaInvitacion(destinatario: string): string {
  const filas = consulta<{ token: string }>(
    `select data->>'token' as token from pgboss.job
     where name = 'email.invitation' and data->>'to' = '${destinatario}'
     order by created_on desc limit 1`,
  );
  const token = filas[0]?.token;
  if (!token) throw new Error(`sin invitacion encolada para ${destinatario}`);
  return token;
}

async function altaDePersonal(rol: string, quien: string): Promise<string> {
  const creada = await pedir('POST', `/gyms/${gimnasio}/invitations`, {
    token: tokenDuena,
    cuerpo: { email: correo(quien), role: rol },
  });
  expect(creada.estado).toBe(201);
  const aceptada = await pedir('POST', '/auth/accept-invitation', {
    cuerpo: { token: tokenDeLaInvitacion(correo(quien)), name: quien, password: CLAVE },
  });
  expect(aceptada.estado).toBe(201);
  return aceptada.cuerpo.token as string;
}

/** Quien manda la peticion: se guarda su token donde lo lee la app. */
async function como(token: string): Promise<void> {
  await guardarToken(token);
}

beforeAll(async () => {
  // ---- CERROJO: nada se escribe hasta que esto pasa -----------------------
  red = vigilarLaRed();
  const destino = comprobarQueEsDesarrollo(API_URL, esDeDesarrollo);
  expect(destino.apiUrl).toBe('http://localhost:3001/v1');
  expect(destino.destino).toBe('localhost:5432/gymlab');

  const salud = await fetch('http://localhost:3001/health');
  expect(salud.status).toBe(200);

  // ---- Fixture TEMPORAL: gimnasio propio, nada existente se toca ----------
  const alta = await pedir('POST', '/auth/register-gym', {
    cuerpo: {
      organizationName: `Destructivas ${sufijo}`,
      gymName: `Destructivas ${sufijo}`,
      ownerName: 'Duena de prueba',
      email: correo('duena'),
      password: CLAVE,
      platformCode: variableDelEntorno('PLATFORM_INVITE_CODE'),
    },
  });
  expect(alta.estado).toBe(201);
  tokenDuena = alta.cuerpo.token as string;
  gimnasio = alta.cuerpo.activeGymId as string;

  tokenRecepcion = await altaDePersonal('receptionist', 'recepcion');
  tokenEntrenador = await altaDePersonal('trainer', 'entrenador');

  const socia = await pedir('POST', `/gyms/${gimnasio}/members`, {
    token: tokenDuena,
    cuerpo: { firstName: 'Socia', lastName: 'De Prueba', email: correo('socia') },
  });
  expect(socia.estado).toBe(201);
  socioId = socia.cuerpo.id as string;

  const invitada = await pedir('POST', `/gyms/${gimnasio}/members/${socioId}/invite`, {
    token: tokenDuena,
    cuerpo: { email: correo('socia') },
  });
  expect(invitada.estado).toBeLessThan(300);
  const entra = await pedir('POST', '/auth/accept-invitation', {
    cuerpo: { token: tokenDeLaInvitacion(correo('socia')), name: 'Socia', password: CLAVE },
  });
  expect(entra.estado).toBe(201);
  tokenSocia = entra.cuerpo.token as string;

  const personal = await pedir('GET', `/gyms/${gimnasio}/staff`, { token: tokenDuena });
  const gente = personal.cuerpo as unknown as { userId: string; email: string }[];
  recepcionUserId = gente.find((p) => p.email === correo('recepcion'))!.userId;
  entrenadorUserId = gente.find((p) => p.email === correo('entrenador'))!.userId;

  const entrenadores = await pedir('GET', `/gyms/${gimnasio}/trainers`, { token: tokenDuena });
  const lista = entrenadores.cuerpo as unknown as { id: string; email: string }[];
  entrenadorId = lista.find((t) => t.email === correo('entrenador'))!.id;
}, 120_000);

afterAll(async () => {
  await borrarToken();
  if (gimnasio) {
    // La MISMA limpieza que usan los e2e de la API (`trainers.e2e.test.ts`),
    // acotada al gimnasio temporal que ha creado esta prueba.
    for (const tabla of [
      'access_events',
      'trainer_assignments',
      'trainers',
      'member_notes',
      'members',
      'member_counters',
      'invitations',
      'audit_log',
      'memberships',
    ]) {
      ejecutar(`delete from ${tabla} where gym_id = '${gimnasio}'`);
    }
    /*
     * El orden importa: `gyms.organization_id` referencia a `organizations`, asi
     * que la organizacion se APUNTA antes y se borra DESPUES del gimnasio. Al
     * reves da error de clave ajena, la limpieza revienta a la mitad y deja el
     * fixture temporal puesto — que es exactamente lo que paso la primera vez.
     */
    const organizacion = consulta<{ organization_id: string }>(
      `select organization_id from gyms where id = '${gimnasio}'`,
    )[0]?.organization_id;
    ejecutar(`delete from gyms where id = '${gimnasio}'`);
    if (organizacion) ejecutar(`delete from organizations where id = '${organizacion}'`);
  }
  ejecutar(`delete from users where email like '%-${sufijo}@test.local'`);
  ejecutar(`delete from auth_events where email_attempted like '%-${sufijo}@test.local'`);
  ejecutar(`delete from pgboss.job where data->>'to' like '%-${sufijo}@test.local'`);
  red?.soltar();
}, 120_000);

// =========================================================================
// A. RETIRAR EL ACCESO DE ALGUIEN DEL PERSONAL
// =========================================================================
describe('A · retirar el acceso de alguien del personal', () => {
  interface FilaPertenencia {
    id: string;
    ended_at: string | null;
    ended_by_user_id: string | null;
    updated_at: string;
    role: string;
  }
  const pertenencia = (userId: string) =>
    consulta<FilaPertenencia>(
      `select id, ended_at, ended_by_user_id, updated_at, role from memberships
       where gym_id = '${gimnasio}' and user_id = '${userId}'`,
    );

  let antes: FilaPertenencia;

  it('recepcion VE el personal pero NO puede retirar a nadie', async () => {
    await como(tokenRecepcion);

    // Ver la lista si: es operativa diaria.
    const visto = await cargarPersonal(gimnasio);
    expect(visto.map((p) => p.email)).toContain(correo('entrenador'));
    expect(lineaDePersonal(visto[0]!, (iso) => iso.slice(0, 10))).toContain('desde el');

    // Retirar no: eso es del dueno.
    const fallo = await retirarAcceso(gimnasio, entrenadorUserId).catch((e: unknown) => e);
    expect(fallo).toBeInstanceOf(ApiError);
    expect((fallo as ApiError).status).toBe(403);

    // Y no ha cambiado nada.
    expect(pertenencia(entrenadorUserId)[0]!.ended_at).toBeNull();
  });

  it('la duena la retira DE VERDAD y la base de datos lo refleja', async () => {
    antes = pertenencia(recepcionUserId)[0]!;
    expect(antes.ended_at).toBeNull();

    await como(tokenDuena);
    await expect(retirarAcceso(gimnasio, recepcionUserId)).resolves.toBeDefined();

    const despues = pertenencia(recepcionUserId)[0]!;
    // NO BORRA: la fila sigue, con su rol, y con fecha de fin.
    expect(despues.id).toBe(antes.id);
    expect(despues.role).toBe('receptionist');
    expect(despues.ended_at).not.toBeNull();
    expect(despues.ended_by_user_id).not.toBeNull();

    // Queda asiento de auditoria.
    const asiento = consulta<{ n: number }>(
      `select count(*)::int as n from audit_log
       where gym_id = '${gimnasio}' and action = 'membership.revoked'
       and entity_id = '${recepcionUserId}'`,
    );
    expect(asiento[0]!.n).toBe(1);

    // Ya no sale en la lista del personal.
    const quedan = await cargarPersonal(gimnasio);
    expect(quedan.map((p) => p.email)).not.toContain(correo('recepcion'));

    // Y su sesion deja de valer en la siguiente peticion.
    const suya = await pedir('GET', '/auth/me', { token: tokenRecepcion });
    expect(suya.estado).toBe(401);
  });

  it('se restaura el fixture EXACTAMENTE como estaba', async () => {
    ejecutar(
      `update memberships set ended_at = null, ended_by_user_id = null,
       updated_at = '${antes.updated_at}' where id = '${antes.id}'`,
    );
    expect(pertenencia(recepcionUserId)[0]).toEqual(antes);

    // Y vuelve a poder entrar: la restauracion es real, no cosmetica.
    const suya = await pedir('GET', '/auth/me', { token: tokenRecepcion });
    expect(suya.estado).toBe(200);
  });
});

// =========================================================================
// B. REVOCAR UNA INVITACION
// =========================================================================
describe('B · revocar una invitacion', () => {
  let invitacionId = '';
  const destinatario = () => correo('invitada');

  it('el entrenador NO puede crear invitaciones', async () => {
    await como(tokenEntrenador);
    const fallo = await crearInvitacion(gimnasio, destinatario(), 'trainer').catch(
      (e: unknown) => e,
    );
    expect(fallo).toBeInstanceOf(ApiError);
    expect((fallo as ApiError).status).toBe(403);
  });

  it('la duena crea una invitacion temporal y aparece PENDIENTE', async () => {
    await como(tokenDuena);
    const creada = await crearInvitacion(gimnasio, destinatario(), 'trainer');
    invitacionId = creada.id;

    const todas = await cargarInvitaciones(gimnasio);
    const mia = todas.find((i) => i.id === invitacionId)!;
    expect(estadoDeInvitacion(mia)).toBe('pendiente');
    expect(sePuedeRevocar(mia)).toBe(true);
  });

  it('se revoca DE VERDAD: la fila queda, con fecha de revocacion', async () => {
    await como(tokenDuena);
    await expect(revocarInvitacion(gimnasio, invitacionId)).resolves.toBeDefined();

    const fila = consulta<{ id: string; revoked_at: string | null; accepted_at: string | null }>(
      `select id, revoked_at, accepted_at from invitations where id = '${invitacionId}'`,
    );
    expect(fila).toHaveLength(1);
    expect(fila[0]!.revoked_at).not.toBeNull();
    expect(fila[0]!.accepted_at).toBeNull();

    const todas = await cargarInvitaciones(gimnasio);
    const mia = todas.find((i) => i.id === invitacionId)!;
    expect(estadoDeInvitacion(mia)).toBe('revocada');
    expect(sePuedeRevocar(mia)).toBe(false);
  });

  it('el enlace del correo deja de servir', async () => {
    const intento = await pedir('POST', '/auth/accept-invitation', {
      cuerpo: {
        token: tokenDeLaInvitacion(destinatario()),
        name: 'Quien sea',
        password: CLAVE,
      },
    });
    expect(intento.estado).toBeGreaterThanOrEqual(400);
    // Y nadie ha entrado por esa puerta.
    const cuentas = consulta<{ n: number }>(
      `select count(*)::int as n from users where email = '${destinatario()}'`,
    );
    expect(cuentas[0]!.n).toBe(0);
  });

  it('revocarla otra vez no es un exito silencioso', async () => {
    await como(tokenDuena);
    const fallo = await revocarInvitacion(gimnasio, invitacionId).catch((e: unknown) => e);
    expect(fallo).toBeInstanceOf(ApiError);
    expect((fallo as ApiError).status).toBe(404);
  });

  it('se limpia la invitacion temporal', async () => {
    ejecutar(`delete from invitations where id = '${invitacionId}'`);
    ejecutar(`delete from pgboss.job where data->>'to' = '${destinatario()}'`);
    const quedan = consulta<{ n: number }>(
      `select count(*)::int as n from invitations where id = '${invitacionId}'`,
    );
    expect(quedan[0]!.n).toBe(0);
  });
});

// =========================================================================
// C. RETIRAR UN ENTRENADOR DE UN SOCIO
// =========================================================================
describe('C · retirar un entrenador de un socio', () => {
  interface FilaAsignacion {
    id: string;
    trainer_id: string;
    member_id: string;
    assigned_at: string;
    ended_at: string | null;
    updated_at: string;
  }
  const asignacion = () =>
    consulta<FilaAsignacion>(
      `select id, trainer_id, member_id, assigned_at, ended_at, updated_at
       from trainer_assignments where gym_id = '${gimnasio}'
       and trainer_id = '${entrenadorId}' and member_id = '${socioId}'`,
    );
  const rutinasDelSocio = () =>
    consulta<Record<string, unknown>>(
      `select ra.id, ra.routine_id, ra.member_id, ra.assigned_by_trainer_id, ra.ended_at,
              r.name, r.status
       from routine_assignments ra join routines r on r.id = ra.routine_id
       where ra.gym_id = '${gimnasio}' and ra.member_id = '${socioId}' order by ra.id`,
    );

  let antes: FilaAsignacion;
  let rutinasAntes: Record<string, unknown>[];

  it('se prepara: la duena asigna el entrenador y el entrenador deja una rutina', async () => {
    await como(tokenDuena);
    const libres = await cargarEntrenadores(gimnasio);
    expect(libres.map((t) => t.id)).toContain(entrenadorId);

    await asignarEntrenador(gimnasio, entrenadorId, socioId);
    const suyos = await cargarEntrenadoresDeSocio(gimnasio, socioId);
    expect(suyos.map((t) => t.trainerId)).toEqual([entrenadorId]);

    const ejercicio = await pedir('POST', `/gyms/${gimnasio}/exercises`, {
      token: tokenEntrenador,
      cuerpo: { name: 'Sentadilla de prueba', muscleGroup: 'legs' },
    });
    expect(ejercicio.estado).toBe(201);
    const rutina = await pedir('POST', `/gyms/${gimnasio}/routines`, {
      token: tokenEntrenador,
      cuerpo: {
        name: `Rutina ${sufijo}`,
        items: [{ exerciseId: ejercicio.cuerpo.id as string, sets: 3, reps: '8-10' }],
      },
    });
    expect(rutina.estado).toBe(201);
    const asignada = await pedir(
      'POST',
      `/gyms/${gimnasio}/routines/${rutina.cuerpo.id as string}/members`,
      { token: tokenEntrenador, cuerpo: { memberId: socioId } },
    );
    expect(asignada.estado).toBeLessThan(300);

    antes = asignacion()[0]!;
    rutinasAntes = rutinasDelSocio();
    expect(antes.ended_at).toBeNull();
    expect(rutinasAntes).toHaveLength(1);
  });

  it('el entrenador NO puede retirarse a si mismo del socio', async () => {
    await como(tokenEntrenador);
    const fallo = await retirarEntrenador(gimnasio, entrenadorId, socioId).catch((e: unknown) => e);
    expect(fallo).toBeInstanceOf(ApiError);
    expect((fallo as ApiError).status).toBe(403);
    expect(asignacion()[0]!.ended_at).toBeNull();
  });

  it('la duena lo retira DE VERDAD, y la rutina que dejo se conserva', async () => {
    await como(tokenDuena);
    await expect(retirarEntrenador(gimnasio, entrenadorId, socioId)).resolves.not.toThrow();

    const despues = asignacion()[0]!;
    // NO BORRA: misma fila, misma fecha de alta, y ahora con fecha de fin.
    expect(despues.id).toBe(antes.id);
    expect(despues.assigned_at).toBe(antes.assigned_at);
    expect(despues.ended_at).not.toBeNull();

    // Ya no es su entrenador.
    const suyos = await cargarEntrenadoresDeSocio(gimnasio, socioId);
    expect(suyos).toHaveLength(0);

    // Y lo que el backend debe conservar, sigue exactamente igual.
    expect(rutinasDelSocio()).toEqual(rutinasAntes);
  });

  it('se restaura la asignacion EXACTAMENTE como estaba', async () => {
    ejecutar(
      `update trainer_assignments set ended_at = null, updated_at = '${antes.updated_at}'
       where id = '${antes.id}'`,
    );
    expect(asignacion()[0]).toEqual(antes);

    await como(tokenDuena);
    const suyos = await cargarEntrenadoresDeSocio(gimnasio, socioId);
    expect(suyos.map((t) => t.trainerId)).toEqual([entrenadorId]);
    expect(rutinasDelSocio()).toEqual(rutinasAntes);
  });
});

// =========================================================================
// D. LO QUE NO DESTRUYE, TAMBIEN CONTRA LA API DE VERDAD
// =========================================================================
describe('D · el resto de acciones de PARITY-3, de extremo a extremo', () => {
  it('un carne real deja un evento, y el historial lo lee', async () => {
    // El escaner: la socia pide su token y el mostrador lo verifica.
    const carne = await pedir('POST', '/me/access/token', { token: tokenSocia });
    expect(carne.estado).toBeLessThan(300);
    const verificado = await pedir('POST', `/gyms/${gimnasio}/access/verify`, {
      token: tokenDuena,
      cuerpo: { token: carne.cuerpo.token as string },
    });
    expect(verificado.estado).toBeLessThan(300);

    await como(tokenDuena);
    const historial = await cargarAccesos(gimnasio, POR_PAGINA);
    expect(historial.items.length).toBeGreaterThan(0);
    const linea = lineaDeEvento(historial.items[0]!);
    expect(linea.titulo).toContain('Socia');
    expect(linea.motivo).not.toBe('');
  });

  it('recepcion tambien ve el historial; el entrenador no', async () => {
    await como(tokenRecepcion);
    await expect(cargarAccesos(gimnasio, POR_PAGINA)).resolves.toBeDefined();

    await como(tokenEntrenador);
    const fallo = await cargarAccesos(gimnasio, POR_PAGINA).catch((e: unknown) => e);
    expect(fallo).toBeInstanceOf(ApiError);
    expect((fallo as ApiError).status).toBe(403);
  });

  it('el entrenador no ve el personal ni las invitaciones', async () => {
    await como(tokenEntrenador);
    for (const llamada of [
      () => cargarPersonal(gimnasio),
      () => cargarInvitaciones(gimnasio),
      () => cargarEntrenadores(gimnasio),
      () => cargarEntrenadoresDeSocio(gimnasio, socioId),
    ]) {
      const fallo = await llamada().catch((e: unknown) => e);
      expect(fallo).toBeInstanceOf(ApiError);
      expect((fallo as ApiError).status).toBe(403);
    }
  });

  it('ninguna peticion ha salido de localhost', () => {
    expect(red.peticiones.length).toBeGreaterThan(20);
    expect(red.peticiones.every((p) => p.includes('http://localhost:3001/'))).toBe(true);
  });
});
