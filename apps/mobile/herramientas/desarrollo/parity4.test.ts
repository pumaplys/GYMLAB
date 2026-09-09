import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiError } from '@gymlab/api-client';
import { API_URL, esDeDesarrollo } from '../../src/api/config';
import { borrarToken, guardarToken } from '../../src/auth/almacen';
import { cargarDocumento, cargarLegal, guardarLegal } from '../../src/legal/fuente';
import { cargarConsentimiento, registrarMedicion } from '../../src/entrenador/fuente';
import { aceptarPrivacidad, cargarPrivacidad } from '../../src/perfil/fuente';
import { estadoDelConsentimiento } from '../../src/progreso/registro';
import { explicarDocumento, faltantesLegibles } from '../../src/legal/logica';
import {
  comprobarQueEsDesarrollo,
  consulta,
  ejecutar,
  variableDelEntorno,
  vigilarLaRed,
} from './cerrojo';

/**
 * PARITY-4 EJECUTADA DE VERDAD: LO LEGAL Y UNA MEDICIÓN.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LAS DOS ESCRITURAS DE ESTA FASE, POR EL CAMINO REAL DE LA APP.          │
 * │                                                                          │
 * │   src/legal/fuente.ts        -> api.legal.update                         │
 * │   src/entrenador/fuente.ts   -> api.progreso.registrar                   │
 * │                                                                          │
 * │ Los ficheros NATIVOS, los que viajan en el .ipa. El unico doble sigue    │
 * │ siendo el Keychain. Mismo cerrojo que las destructivas de PARITY-3: si   │
 * │ el destino no es exactamente el de desarrollo, no se escribe nada.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Y una medicion son DATOS DE SALUD (RGPD art. 9). Los que se escriben aqui
 * son inventados, de un socio inventado, en un gimnasio temporal que se borra
 * al terminar. No se copia ni un dato de nadie.
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
let organizacion = '';
let tokenDuena = '';
let tokenRecepcion = '';
let tokenEntrenador = '';
let tokenSocia = '';
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

interface FilaLegal {
  legal_name: string | null;
  tax_id: string | null;
  address: string | null;
  privacy_email: string | null;
}

const filaLegal = () =>
  consulta<FilaLegal>(
    `select legal_name, tax_id, address, privacy_email
     from organizations where id = '${organizacion}'`,
  )[0]!;

beforeAll(async () => {
  red = vigilarLaRed();
  const destino = comprobarQueEsDesarrollo(API_URL, esDeDesarrollo);
  expect(destino.apiUrl).toBe('http://localhost:3001/v1');
  expect(destino.destino).toBe('localhost:5432/gymlab');
  expect((await fetch('http://localhost:3001/health')).status).toBe(200);

  const alta = await pedir('POST', '/auth/register-gym', {
    cuerpo: {
      organizationName: `Parity4 ${sufijo}`,
      gymName: `Parity4 ${sufijo}`,
      ownerName: 'Duena de prueba',
      email: correo('duena'),
      password: CLAVE,
      platformCode: variableDelEntorno('PLATFORM_INVITE_CODE'),
    },
  });
  expect(alta.estado).toBe(201);
  tokenDuena = alta.cuerpo.token as string;
  gimnasio = alta.cuerpo.activeGymId as string;
  organizacion = consulta<{ organization_id: string }>(
    `select organization_id from gyms where id = '${gimnasio}'`,
  )[0]!.organization_id;

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

  // El entrenador tiene que llevar a la socia: `asegurarAcceso` devuelve 404 si
  // no es suya, y entonces el 403 por rol no probaria lo que se pretende.
  const entrenadores = await pedir('GET', `/gyms/${gimnasio}/trainers`, { token: tokenDuena });
  const lista = entrenadores.cuerpo as unknown as { id: string; email: string }[];
  const entrenadorId = lista.find((t) => t.email === correo('entrenador'))!.id;
  const asignado = await pedir('POST', `/gyms/${gimnasio}/trainers/${entrenadorId}/members`, {
    token: tokenDuena,
    cuerpo: { memberId: socioId },
  });
  expect(asignado.estado).toBeLessThan(300);
}, 120_000);

afterAll(async () => {
  await borrarToken();
  if (gimnasio) {
    for (const tabla of [
      'body_metrics',
      'consents',
      'consent_documents',
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
    ejecutar(`delete from gyms where id = '${gimnasio}'`);
    if (organizacion) ejecutar(`delete from organizations where id = '${organizacion}'`);
  }
  ejecutar(`delete from users where email like '%-${sufijo}@test.local'`);
  ejecutar(`delete from auth_events where email_attempted like '%-${sufijo}@test.local'`);
  ejecutar(`delete from pgboss.job where data->>'to' like '%-${sufijo}@test.local'`);
  red?.soltar();
}, 120_000);

// =========================================================================
// A. CONFIGURACION LEGAL — SOLO EL DUEÑO
// =========================================================================
describe('A · los datos legales del responsable', () => {
  let antes: FilaLegal;

  it('un gimnasio recién creado no tiene ninguno de los cuatro', async () => {
    antes = filaLegal();
    expect(antes).toEqual({
      legal_name: null,
      tax_id: null,
      address: null,
      privacy_email: null,
    });

    await como(tokenDuena);
    const datos = await cargarLegal(gimnasio);
    expect([...datos.missing].sort()).toEqual(['address', 'legalName', 'privacyEmail', 'taxId']);
    expect(faltantesLegibles(datos.missing)).toContain('Razón social');
  });

  it('y su documento de privacidad no se puede publicar todavía', async () => {
    await como(tokenDuena);
    const documento = await cargarDocumento(gimnasio);
    expect(documento.state).toBe('falta_configuracion');
    expect(documento.publishedVersion).toBeNull();
    expect(explicarDocumento(documento.state).arreglaOtro).toBe(false);
  });

  it('recepción NO puede ni leerlos ni escribirlos', async () => {
    await como(tokenRecepcion);
    for (const llamada of [
      () => cargarLegal(gimnasio),
      () => cargarDocumento(gimnasio),
      () => guardarLegal(gimnasio, { legalName: 'Intento, S. L.' }),
    ]) {
      const fallo = await llamada().catch((e: unknown) => e);
      expect(fallo).toBeInstanceOf(ApiError);
      expect((fallo as ApiError).status).toBe(403);
    }
    // Y no ha cambiado nada.
    expect(filaLegal()).toEqual(antes);
  });

  it('el entrenador tampoco', async () => {
    await como(tokenEntrenador);
    const fallo = await cargarLegal(gimnasio).catch((e: unknown) => e);
    expect(fallo).toBeInstanceOf(ApiError);
    expect((fallo as ApiError).status).toBe(403);
  });

  it('sin sesión es 401, no 403', async () => {
    const sin = await pedir('GET', `/gyms/${gimnasio}/legal`);
    expect(sin.estado).toBe(401);
  });

  it('la dueña los guarda DE VERDAD y la base de datos lo refleja', async () => {
    await como(tokenDuena);
    const guardado = await guardarLegal(gimnasio, {
      legalName: 'Parity Cuatro, S. L.',
      taxId: 'B00000000',
      address: 'Calle de Prueba 4, 28001 Madrid',
      privacyEmail: correo('privacidad'),
    });
    expect(guardado.missing).toEqual([]);

    expect(filaLegal()).toEqual({
      legal_name: 'Parity Cuatro, S. L.',
      tax_id: 'B00000000',
      address: 'Calle de Prueba 4, 28001 Madrid',
      privacy_email: correo('privacidad'),
    });
  });

  it('y ahora el documento sí puede publicarse', async () => {
    await como(tokenDuena);
    const documento = await cargarDocumento(gimnasio);
    expect(documento.state).toBe('listo');
    expect(documento.expectedVersion).not.toBeNull();
  });

  it('un correo mal escrito lo rechaza el servidor, no solo la pantalla', async () => {
    await como(tokenDuena);
    const fallo = await guardarLegal(gimnasio, {
      privacyEmail: 'esto-no-es-un-correo',
    } as never).catch((e: unknown) => e);
    expect(fallo).toBeInstanceOf(ApiError);
    expect((fallo as ApiError).status).toBeGreaterThanOrEqual(400);
    // Y el correo bueno sigue donde estaba.
    expect(filaLegal().privacy_email).toBe(correo('privacidad'));
  });

  it('vaciar un campo lo BORRA: `null` es «bórralo», no «déjalo igual»', async () => {
    await como(tokenDuena);
    const guardado = await guardarLegal(gimnasio, { taxId: null });
    expect(guardado.missing).toEqual(['taxId']);
    expect(filaLegal().tax_id).toBeNull();
  });

  it('se restaura el fixture EXACTAMENTE como estaba', async () => {
    ejecutar(
      `update organizations set legal_name = null, tax_id = null, address = null,
       privacy_email = null where id = '${organizacion}'`,
    );
    expect(filaLegal()).toEqual(antes);

    await como(tokenDuena);
    const datos = await cargarLegal(gimnasio);
    expect(datos.missing).toHaveLength(4);
  });
});

// =========================================================================
// B. REGISTRAR UNA MEDICION — DATOS DE SALUD
// =========================================================================
describe('B · registrar una medición de un socio', () => {
  const mediciones = () =>
    consulta<{
      id: string;
      member_id: string;
      weight_kg: string | null;
      consent_version: string;
      recorded_by_user_id: string | null;
    }>(
      `select id, member_id, weight_kg, consent_version, recorded_by_user_id
       from body_metrics where gym_id = '${gimnasio}'`,
    );

  it('se prepara: la dueña completa lo legal para que haya documento', async () => {
    await como(tokenDuena);
    const guardado = await guardarLegal(gimnasio, {
      legalName: 'Parity Cuatro, S. L.',
      taxId: 'B00000000',
      address: 'Calle de Prueba 4, 28001 Madrid',
      privacyEmail: correo('privacidad'),
    });
    expect(guardado.missing).toEqual([]);
    expect(mediciones()).toHaveLength(0);
  });

  it('sin consentimiento el servidor NO deja registrar, aunque el rol valga', async () => {
    await como(tokenEntrenador);
    const estado = await cargarConsentimiento(gimnasio, socioId);
    expect(estado.accepted).toBe(false);
    expect(estadoDelConsentimiento(estado)).not.toBe('vigente');

    const fallo = await registrarMedicion(gimnasio, socioId, { weightKg: 70 }).catch(
      (e: unknown) => e,
    );
    expect(fallo).toBeInstanceOf(ApiError);
    expect((fallo as ApiError).status).toBeGreaterThanOrEqual(400);
    expect(mediciones()).toHaveLength(0);
  });

  it('recepción no puede registrar mediciones en ningún caso', async () => {
    await como(tokenRecepcion);
    const fallo = await registrarMedicion(gimnasio, socioId, { weightKg: 70 }).catch(
      (e: unknown) => e,
    );
    expect(fallo).toBeInstanceOf(ApiError);
    expect((fallo as ApiError).status).toBe(403);
    expect(mediciones()).toHaveLength(0);
  });

  it('lo autoriza LA SOCIA, desde su propia pantalla', async () => {
    await como(tokenSocia);
    const suyo = await cargarPrivacidad();
    // Al abrirlo se publica el documento: es idempotente y no depende de que
    // nadie se acuerde de pulsar un boton.
    expect(suyo.currentVersion).not.toBeNull();
    const aceptado = await aceptarPrivacidad(suyo.currentVersion!);
    expect(aceptado.accepted).toBe(true);
  });

  it('el entrenador lo ve vigente y registra la medición DE VERDAD', async () => {
    await como(tokenEntrenador);
    const estado = await cargarConsentimiento(gimnasio, socioId);
    expect(estadoDelConsentimiento(estado)).toBe('vigente');

    const guardada = await registrarMedicion(gimnasio, socioId, {
      weightKg: 72.4,
      waistCm: 80,
      notes: 'medición de prueba',
    });
    expect(guardada.weightKg).toBe(72.4);

    const filas = mediciones();
    expect(filas).toHaveLength(1);
    expect(filas[0]!.member_id).toBe(socioId);
    expect(Number(filas[0]!.weight_kg)).toBe(72.4);
    // Queda con QUE version del consentimiento se recogio. Sin eso, el dato no
    // se puede defender el dia que alguien pregunte bajo que texto se tomo.
    expect(filas[0]!.consent_version).not.toBe('');
    expect(filas[0]!.recorded_by_user_id).not.toBeNull();
  });

  it('la auditoría deja constancia SIN copiar los valores', async () => {
    const asientos = consulta<{ metadata: Record<string, unknown> }>(
      `select metadata from audit_log
       where gym_id = '${gimnasio}' and action = 'body_metric.recorded'`,
    );
    expect(asientos).toHaveLength(1);
    const texto = JSON.stringify(asientos[0]!.metadata);
    // Los NOMBRES de los campos si; los numeros NO. Una segunda copia de datos
    // de salud en una tabla con otra retencion y otro acceso seria un fallo.
    expect(texto).toContain('weightKg');
    expect(texto).not.toContain('72.4');
    expect(texto).not.toContain('medición de prueba');
  });

  it('el socio ve su propia medición, y nadie más la recibe por error', async () => {
    await como(tokenSocia);
    const mio = await pedir('GET', '/me/progress', { token: tokenSocia });
    expect(mio.estado).toBe(200);
    expect((mio.cuerpo as unknown as unknown[]).length).toBe(1);
  });

  it('si la socia retira el consentimiento, deja de poder registrarse', async () => {
    await como(tokenSocia);
    const retirado = await pedir('DELETE', '/me/health-consent', { token: tokenSocia });
    expect(retirado.estado).toBeLessThan(300);

    await como(tokenEntrenador);
    const estado = await cargarConsentimiento(gimnasio, socioId);
    expect(estadoDelConsentimiento(estado)).toBe('sin-aceptar');

    const fallo = await registrarMedicion(gimnasio, socioId, { weightKg: 71 }).catch(
      (e: unknown) => e,
    );
    expect(fallo).toBeInstanceOf(ApiError);
    // Y lo ya recogido legitimamente NO se borra: sigue habiendo una.
    expect(mediciones()).toHaveLength(1);
  });

  it('leer el historial NO exige consentimiento: hace falta para atenderlo', async () => {
    await como(tokenEntrenador);
    const historial = await pedir('GET', `/gyms/${gimnasio}/members/${socioId}/progress`, {
      token: tokenEntrenador,
    });
    expect(historial.estado).toBe(200);
    expect((historial.cuerpo as unknown as unknown[]).length).toBe(1);
  });

  it('sin sesión es 401', async () => {
    const sin = await pedir('POST', `/gyms/${gimnasio}/members/${socioId}/progress`, {
      cuerpo: { weightKg: 70 },
    });
    expect(sin.estado).toBe(401);
  });

  it('se limpia la medición de prueba', () => {
    ejecutar(`delete from body_metrics where gym_id = '${gimnasio}'`);
    expect(mediciones()).toHaveLength(0);
  });

  it('ninguna petición ha salido de localhost', () => {
    expect(red.peticiones.length).toBeGreaterThan(20);
    expect(red.peticiones.every((p) => p.includes('http://localhost:3001/'))).toBe(true);
  });
});
