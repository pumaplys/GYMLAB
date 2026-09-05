import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from '@gymlab/api-client';
import type { Me, SessionResponse } from '@gymlab/contracts';
import { clasificarError } from './clasificar';
import { debeBorrarToken, decidirEstado } from './estado';
import { mensajeDeEntrada, mensajeDeRestauracion } from './mensajes';

/**
 * El FLUJO de sesion: entrar, restaurar, salir.
 *
 * Se prueba la secuencia de decisiones —cuando se guarda el token, cuando se
 * borra y cuando NO— con un almacen de mentira en memoria. No hace falta ni
 * React ni SecureStore: lo que se comprueba es la politica, no el pintado.
 */

const GIMNASIO = '11111111-1111-4111-8111-111111111111';

const YO_SOCIO: Me = {
  user: {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Lucia Fernandez',
    email: 'socia@ejemplo.local',
    emailVerified: true,
    isPlatformAdmin: false,
  },
  activeGymId: GIMNASIO,
  memberships: [{ gymId: GIMNASIO, gymName: 'Gimnasio Vista', role: 'member' }],
} as Me;

/** Un almacen en memoria con la misma forma que el de SecureStore. */
function almacenFalso(inicial: string | null = null) {
  let token = inicial;
  return {
    leer: vi.fn(async () => token),
    guardar: vi.fn(async (t: string) => {
      token = t;
    }),
    borrar: vi.fn(async () => {
      token = null;
    }),
    get valor() {
      return token;
    },
  };
}

/**
 * La misma secuencia que ejecuta `ProveedorDeSesion.entrar`, sin React.
 * Si el proveedor cambiara de orden, este test dejaria de representarlo — por
 * eso el orden esta escrito aqui explicitamente y no deducido.
 */
async function entrar(
  almacen: ReturnType<typeof almacenFalso>,
  login: () => Promise<SessionResponse>,
) {
  const sesion = await login();
  await almacen.guardar(sesion.token);
  return sesion;
}

/** La misma secuencia que ejecuta `ProveedorDeSesion.resolver`. */
async function restaurar(
  almacen: ReturnType<typeof almacenFalso>,
  me: () => Promise<Me>,
) {
  const token = await almacen.leer();
  if (!token) return decidirEstado({ clase: 'sinToken' });

  let resultado;
  try {
    resultado = { clase: 'yo' as const, yo: await me() };
  } catch (problema) {
    resultado = clasificarError(problema);
  }
  if (debeBorrarToken(resultado)) await almacen.borrar();
  return decidirEstado(resultado);
}

describe('entrar', () => {
  let almacen: ReturnType<typeof almacenFalso>;
  beforeEach(() => {
    almacen = almacenFalso();
  });

  it('un login correcto guarda el token que devuelve el contrato', async () => {
    const login = vi.fn(async () => ({ token: 'tok-abc', activeGymId: GIMNASIO }));
    await entrar(almacen, login);

    expect(login).toHaveBeenCalledTimes(1);
    expect(almacen.guardar).toHaveBeenCalledWith('tok-abc');
    expect(almacen.valor).toBe('tok-abc');
  });

  it('credenciales incorrectas NO guardan ningun token', async () => {
    const login = vi.fn(async () => {
      throw new ApiError(401, 'No autorizado');
    });

    await expect(entrar(almacen, login)).rejects.toBeInstanceOf(ApiError);
    expect(almacen.guardar).not.toHaveBeenCalled();
    expect(almacen.valor).toBeNull();
  });

  it('un fallo de red al entrar tampoco guarda nada', async () => {
    const login = vi.fn(async () => {
      throw new NetworkError('POST', '/v1/auth/login', new TypeError('failed'));
    });

    await expect(entrar(almacen, login)).rejects.toBeInstanceOf(NetworkError);
    expect(almacen.valor).toBeNull();
  });
});

describe('restaurar sesion al arrancar', () => {
  it('sin token guardado no se llama al servidor', async () => {
    const almacen = almacenFalso(null);
    const me = vi.fn(async () => YO_SOCIO);

    const estado = await restaurar(almacen, me);

    expect(me).not.toHaveBeenCalled();
    expect(estado.tipo).toBe('sinSesion');
  });

  it('con token valido queda autenticado y el token se conserva', async () => {
    const almacen = almacenFalso('tok-abc');
    const estado = await restaurar(almacen, async () => YO_SOCIO);

    expect(estado.tipo).toBe('autenticado');
    expect(almacen.borrar).not.toHaveBeenCalled();
    expect(almacen.valor).toBe('tok-abc');
  });

  it('un 401 borra el token', async () => {
    const almacen = almacenFalso('tok-viejo');
    const estado = await restaurar(almacen, async () => {
      throw new ApiError(401, 'No autorizado');
    });

    expect(estado.tipo).toBe('sinSesion');
    expect(almacen.borrar).toHaveBeenCalledTimes(1);
    expect(almacen.valor).toBeNull();
  });

  it('un error de RED conserva el token existente', async () => {
    const almacen = almacenFalso('tok-bueno');
    const estado = await restaurar(almacen, async () => {
      throw new NetworkError('GET', '/v1/auth/me', new TypeError('failed'));
    });

    expect(estado).toEqual({ tipo: 'errorAlComprobar', motivo: 'red' });
    expect(almacen.borrar).not.toHaveBeenCalled();
    expect(almacen.valor).toBe('tok-bueno');
  });

  it('un 500 conserva el token existente', async () => {
    const almacen = almacenFalso('tok-bueno');
    const estado = await restaurar(almacen, async () => {
      throw new ApiError(500, 'Boom');
    });

    expect(estado).toEqual({ tipo: 'errorAlComprobar', motivo: 'servidor', status: 500 });
    expect(almacen.valor).toBe('tok-bueno');
  });
});

describe('los mensajes son para personas', () => {
  it('401 al entrar habla de correo y contrasena, no de codigos', () => {
    const m = mensajeDeEntrada(new ApiError(401, 'Unauthorized'));
    expect(m).toBe('El correo o la contraseña no son correctos.');
  });

  it('429 dice que espere', () => {
    expect(mensajeDeEntrada(new ApiError(429, 'Too many'))).toMatch(/Espera un momento/);
  });

  it('la red dice que compruebe la conexion', () => {
    const m = mensajeDeEntrada(new NetworkError('POST', '/x', new TypeError('failed')));
    expect(m).toMatch(/Comprueba tu conexión/);
  });

  it('NINGUN mensaje filtra codigos, clases ni detalle interno', () => {
    const mensajes = [
      mensajeDeEntrada(new ApiError(401, 'Unauthorized')),
      mensajeDeEntrada(new ApiError(400, 'Bad Request')),
      mensajeDeEntrada(new ApiError(429, 'Too Many Requests')),
      mensajeDeEntrada(new ApiError(500, 'PG::UniqueViolation en users_email_key')),
      mensajeDeEntrada(new ApiError(503, 'upstream connect error')),
      mensajeDeEntrada(new NetworkError('GET', '/v1/auth/me', new TypeError('fetch failed'))),
      mensajeDeEntrada(new Error('algo raro')),
      mensajeDeRestauracion('red'),
      mensajeDeRestauracion('servidor'),
      mensajeDeRestauracion('contrato'),
    ];

    for (const m of mensajes) {
      expect(m).not.toMatch(/401|403|429|500|503|Error:|NetworkError|ApiError|PG::|upstream/);
      // Y todos terminan en punto: son frases, no etiquetas.
      expect(m.endsWith('.')).toBe(true);
    }
  });

  it('el mensaje del servidor no se reenvia tal cual en un 5xx', () => {
    // Un 500 puede traer detalle interno; no es asunto de quien queria entrenar.
    const m = mensajeDeEntrada(new ApiError(500, 'connection refused a postgres:5432'));
    expect(m).not.toMatch(/postgres/);
  });
});
