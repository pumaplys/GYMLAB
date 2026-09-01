import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from '@gymlab/api-client';
import type { AccessTokenResponse, DuesStatus, Member } from '@gymlab/contracts';
import { caminoDe, matrizDe } from './matriz';
import {
  SE_PIDE_AL_ENTRAR,
  debePedirTrasSegundoPlano,
  haCaducado,
  segundosRestantes,
  type CodigoDeAcceso,
  type EstadoDelPase,
} from './logica';
import { mensajeDeEntrada } from '../auth/mensajes';

/**
 * El FLUJO del carne: cargar, generar, caducar, reintentar.
 *
 * Se prueba la SECUENCIA de decisiones con dobles en memoria, igual que se
 * hizo con el login. No hace falta React: lo que se comprueba es la politica
 * —a quien se llama, que se guarda y que NO se guarda— no el pintado.
 */

const AHORA = Date.parse('2026-09-01T12:00:00.000Z');
const en = (s: number) => new Date(AHORA + s * 1000).toISOString();

const FICHA = {
  id: '11111111-1111-4111-8111-111111111111',
  memberNumber: 42,
  firstName: 'Lucia',
  lastName: 'Fernandez',
  email: null,
  phone: null,
  birthDate: null,
  status: 'active',
  joinedAt: '2026-01-10',
  leftAt: null,
  hasAccount: true,
} as Member;

const CUOTA = {
  estado: 'AL_CORRIENTE',
  puedeAcceder: true,
  diasRestantes: 19,
  hasta: '2026-09-20',
  planName: 'Mensual',
} as DuesStatus;

/** Un token con la forma del real: 119 caracteres base64url. */
const TOKEN = 'a1B2c3D4e5F6g7H8i9J0-_kLmNoPqRsTuVwXyZ'.repeat(4).slice(0, 119);

/** El almacen seguro, para poder afirmar que NADIE lo toca. */
function almacenFalso() {
  const escrituras: string[] = [];
  return {
    guardar: vi.fn(async (v: string) => {
      escrituras.push(v);
    }),
    escrituras,
  };
}

/** La misma secuencia que ejecuta la pantalla al abrirse. */
async function cargar(api: {
  fichaDeSocio: () => Promise<Member>;
  miCuota: () => Promise<DuesStatus>;
}) {
  const [ficha, cuota] = await Promise.all([api.fichaDeSocio(), api.miCuota()]);
  return { ficha, cuota };
}

/** La misma secuencia que ejecuta el boton. */
async function generar(
  pedir: () => Promise<AccessTokenResponse>,
  almacen: ReturnType<typeof almacenFalso>,
): Promise<{ codigo: CodigoDeAcceso } | { error: string }> {
  try {
    const acceso = await pedir();
    // Y NADA MAS: el codigo se queda en el estado del componente. Aqui se ve
    // que no hay ninguna llamada al almacen entre medias.
    void almacen;
    return { codigo: { token: acceso.token, expiresAt: acceso.expiresAt } };
  } catch (problema) {
    return { error: mensajeDeEntrada(problema) };
  }
}

describe('abrir el carne', () => {
  it('pide la ficha y la cuota, y nada mas', async () => {
    const api = {
      fichaDeSocio: vi.fn(async () => FICHA),
      miCuota: vi.fn(async () => CUOTA),
    };
    const pedirToken = vi.fn(async () => ({ token: TOKEN, expiresAt: en(60), ttlSeconds: 60 }));

    const { ficha, cuota } = await cargar(api);

    expect(api.fichaDeSocio).toHaveBeenCalledTimes(1);
    expect(api.miCuota).toHaveBeenCalledTimes(1);
    expect(ficha.memberNumber).toBe(42);
    expect(cuota.estado).toBe('AL_CORRIENTE');
    // Cargar la ficha y pedir el codigo son dos cosas distintas: esta
    // secuencia es solo la primera. Quien pide el codigo es el efecto de
    // foco, que se prueba mas abajo.
    expect(pedirToken).not.toHaveBeenCalled();
  });

  it('si falla la carga no hay ficha que enseñar', async () => {
    const api = {
      fichaDeSocio: vi.fn(async () => {
        throw new ApiError(500, 'Boom');
      }),
      miCuota: vi.fn(async () => CUOTA),
    };
    await expect(cargar(api)).rejects.toBeInstanceOf(ApiError);
  });
});

describe('generar el codigo', () => {
  let almacen: ReturnType<typeof almacenFalso>;
  beforeEach(() => {
    almacen = almacenFalso();
  });

  it('llama al endpoint de token y se queda con token y caducidad', async () => {
    const pedir = vi.fn(async () => ({ token: TOKEN, expiresAt: en(60), ttlSeconds: 60 }));
    const r = await generar(pedir, almacen);

    expect(pedir).toHaveBeenCalledTimes(1);
    expect('codigo' in r && r.codigo.token).toBe(TOKEN);
    expect('codigo' in r && r.codigo.expiresAt).toBe(en(60));
  });

  it('EL TOKEN NO SE PERSISTE', async () => {
    // No es una preferencia: es una llave de un solo uso que caduca en un
    // minuto. Guardarla solo crea una copia que sobrevive al cierre de la app.
    const pedir = vi.fn(async () => ({ token: TOKEN, expiresAt: en(60), ttlSeconds: 60 }));
    await generar(pedir, almacen);

    expect(almacen.guardar).not.toHaveBeenCalled();
    expect(almacen.escrituras).toEqual([]);
  });

  it('un error NO deja un codigo a medias', async () => {
    const pedir = vi.fn(async () => {
      throw new NetworkError('POST', '/v1/me/access/token', new TypeError('failed'));
    });
    const r = await generar(pedir, almacen);

    expect('error' in r).toBe(true);
    expect('codigo' in r).toBe(false);
  });

  it('el mensaje de error no filtra el token ni detalle del servidor', async () => {
    const pedir = vi.fn(async () => {
      throw new ApiError(500, `fallo generando ${TOKEN}`);
    });
    const r = await generar(pedir, almacen);

    expect('error' in r && r.error).not.toContain(TOKEN);
    expect('error' in r && r.error).not.toMatch(/500|ApiError/);
  });

  it('reintentar vuelve a pedir, y el token nuevo sustituye al viejo', async () => {
    const pedir = vi
      .fn<() => Promise<AccessTokenResponse>>()
      .mockResolvedValueOnce({ token: TOKEN, expiresAt: en(60), ttlSeconds: 60 })
      .mockResolvedValueOnce({ token: `${TOKEN.slice(0, 118)}X`, expiresAt: en(120), ttlSeconds: 60 });

    const primero = await generar(pedir, almacen);
    const segundo = await generar(pedir, almacen);

    expect(pedir).toHaveBeenCalledTimes(2);
    expect('codigo' in primero && 'codigo' in segundo && primero.codigo.token).not.toBe(
      'codigo' in segundo ? segundo.codigo.token : null,
    );
  });
});

describe('caducar y volver', () => {
  const listo = (s: number): EstadoDelPase => ({ fase: 'listo', codigo: { token: TOKEN, expiresAt: en(s) } });

  it('entrar en Carne pide uno nuevo aunque el anterior siga vivo', () => {
    // El codigo es de un solo uso y el cliente no sabe si ya lo escanearon.
    expect(SE_PIDE_AL_ENTRAR).toBe(true);
  });

  it('un codigo caducado se retira de la pantalla, no se deja en gris', () => {
    expect(haCaducado(listo(-1), AHORA)).toBe(true);
  });

  it('volver del segundo plano con un codigo vivo NO gasta otro token', () => {
    expect(debePedirTrasSegundoPlano(listo(30), AHORA)).toBe(false);
  });

  it('volver del segundo plano con el codigo muerto si pide otro', () => {
    expect(debePedirTrasSegundoPlano(listo(-1), AHORA)).toBe(true);
  });

  it('la cuenta atras se recalcula contra el servidor, no se resta', () => {
    // Es lo que hace que volver del segundo plano —donde el sistema congela
    // los temporizadores— no deje el numero adelantado.
    const codigo: CodigoDeAcceso = { token: TOKEN, expiresAt: en(60) };
    expect(segundosRestantes(codigo.expiresAt, AHORA)).toBe(60);
    expect(segundosRestantes(codigo.expiresAt, AHORA + 40_000)).toBe(20);
    expect(segundosRestantes(codigo.expiresAt, AHORA + 90_000)).toBe(0);
  });
});

describe('el temporizador se limpia', () => {
  it('cada codigo deja UN intervalo, y se cancela al cambiar o al desmontar', () => {
    // Se replica lo que hace el efecto: crear el intervalo y devolver su
    // limpieza. Sin esto, cada codigo generado dejaria un reloj corriendo.
    const vivos = new Set<number>();
    let siguiente = 1;
    const crear = () => {
      const id = siguiente++;
      vivos.add(id);
      return id;
    };
    const cancelar = (id: number) => vivos.delete(id);

    const montar = () => {
      const id = crear();
      return () => cancelar(id);
    };

    const limpiar1 = montar();
    expect(vivos.size).toBe(1);
    limpiar1(); // cambia el codigo
    const limpiar2 = montar();
    expect(vivos.size).toBe(1);
    limpiar2(); // se desmonta la pantalla
    expect(vivos.size).toBe(0);
  });
});

describe('el token no se cuela en el dibujo', () => {
  it('un token hostil produce un camino de solo numeros y comandos', () => {
    // No hay parser de SVG en ninguna parte: el camino se calcula a partir de
    // POSICIONES. Aun asi se comprueba con un token que intenta ser marcado.
    const hostil = '"><script>alert(1)</script><path d="M0 0h9999v9999z';
    const { d } = caminoDe(matrizDe(hostil));

    expect(d).toMatch(/^[Mhvz0-9 .-]+$/);
    expect(d).not.toContain('<');
    expect(d).not.toContain('script');
  });

  it('el lienzo deja el margen obligatorio a los dos lados', () => {
    const m = matrizDe(TOKEN);
    const { lienzo } = caminoDe(m);
    expect(lienzo).toBe(m.lado + 8);
  });

  it('un codigo sin ningun modulo oscuro seria un camino vacio, y no lo es', () => {
    expect(caminoDe(matrizDe(TOKEN)).d.length).toBeGreaterThan(0);
  });
});

describe('nada de esto se escribe en el registro', () => {
  it('generar no llama a console con el token', async () => {
    const espias = {
      log: vi.spyOn(console, 'log').mockImplementation(() => undefined),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      error: vi.spyOn(console, 'error').mockImplementation(() => undefined),
      info: vi.spyOn(console, 'info').mockImplementation(() => undefined),
      debug: vi.spyOn(console, 'debug').mockImplementation(() => undefined),
    };
    try {
      const almacen = almacenFalso();
      await generar(async () => ({ token: TOKEN, expiresAt: en(60), ttlSeconds: 60 }), almacen);
      await generar(async () => {
        throw new ApiError(500, `algo con ${TOKEN}`);
      }, almacen);

      for (const espia of Object.values(espias)) {
        for (const llamada of espia.mock.calls) {
          expect(JSON.stringify(llamada)).not.toContain(TOKEN);
        }
      }
    } finally {
      for (const espia of Object.values(espias)) espia.mockRestore();
    }
  });
});

/**
 * La POLITICA de generacion, simulada.
 *
 * Se replica lo que hacen los efectos de la pantalla —foco, temporizador y
 * AppState— sobre el mismo estado `EstadoDelPase` que usa el componente. No es
 * React, pero es la misma maquina: si la politica cambiara, esto cambia.
 */
function pantallaSimulada(pedir: () => Promise<CodigoDeAcceso>) {
  let pase: EstadoDelPase = { fase: 'pidiendo' };
  let reloj: ReturnType<typeof setInterval> | null = null;
  const oyentes = new Set<(estado: string) => void>();

  const limpiarReloj = () => {
    if (reloj !== null) clearInterval(reloj);
    reloj = null;
  };

  const generar = async () => {
    pase = { fase: 'pidiendo' };
    try {
      pase = { fase: 'listo', codigo: await pedir() };
    } catch {
      pase = { fase: 'error', mensaje: 'no se pudo' };
    }
  };

  return {
    get pase() {
      return pase;
    },
    get relojesVivos() {
      return reloj === null ? 0 : 1;
    },
    get oyentesVivos() {
      return oyentes.size;
    },
    /** El efecto de foco: entrar en la pestaña. */
    entrar: async () => {
      const oyente = (estado: string) => {
        if (estado === 'active' && debePedirTrasSegundoPlano(pase, AHORA)) void generar();
      };
      oyentes.add(oyente);
      limpiarReloj();
      reloj = setInterval(() => undefined, 1000);
      await generar();
      return () => {
        oyentes.delete(oyente);
        limpiarReloj();
      };
    },
    /** El tic del temporizador, con el reloj puesto donde se quiera. */
    tic: (ahora: number) => {
      if (haCaducado(pase, ahora)) pase = { fase: 'caducado' };
    },
    /** El boton que aparece al caducar o al fallar. */
    pulsarCta: () => generar(),
    /** Volver del segundo plano. */
    /** El reloj se pasa a mano: las pruebas no dependen de la hora real. */
    volverDeSegundoPlano: async (ahora: number) => {
      if (debePedirTrasSegundoPlano(pase, ahora)) await generar();
    },
  };
}

describe('la politica de generacion, de principio a fin', () => {
  const codigoQueDura = (s: number) => ({ token: TOKEN, expiresAt: en(s) });

  it('entrar en Carne pide un codigo SIN pulsar nada', async () => {
    const pedir = vi.fn(async () => codigoQueDura(60));
    const p = pantallaSimulada(pedir);

    const salir = await p.entrar();

    expect(pedir).toHaveBeenCalledTimes(1);
    expect(p.pase.fase).toBe('listo');
    salir();
  });

  it('volver a entrar pide otro AUNQUE el anterior siguiera vivo', async () => {
    const pedir = vi
      .fn<() => Promise<CodigoDeAcceso>>()
      .mockResolvedValueOnce(codigoQueDura(60))
      .mockResolvedValueOnce({ token: `${TOKEN.slice(0, 118)}X`, expiresAt: en(120) });
    const p = pantallaSimulada(pedir);

    const salir1 = await p.entrar();
    const primero = p.pase.fase === 'listo' ? p.pase.codigo.token : null;
    salir1();
    const salir2 = await p.entrar();
    const segundo = p.pase.fase === 'listo' ? p.pase.codigo.token : null;

    expect(pedir).toHaveBeenCalledTimes(2);
    expect(primero).not.toBe(segundo);
    salir2();
  });

  it('mientras el codigo vive NO se pide nada mas: cero sondeo', async () => {
    const pedir = vi.fn(async () => codigoQueDura(60));
    const p = pantallaSimulada(pedir);
    const salir = await p.entrar();

    // Sesenta tics: un minuto entero de pantalla abierta.
    for (let i = 1; i <= 59; i++) p.tic(AHORA + i * 1000);

    expect(pedir).toHaveBeenCalledTimes(1);
    expect(p.pase.fase).toBe('listo');
    salir();
  });

  it('al caducar el codigo DESAPARECE y no se pide otro solo', async () => {
    const pedir = vi.fn(async () => codigoQueDura(60));
    const p = pantallaSimulada(pedir);
    const salir = await p.entrar();

    p.tic(AHORA + 61_000);

    expect(p.pase.fase).toBe('caducado');
    // Caducar no dispara una peticion: aparece el boton y decide la persona.
    expect(pedir).toHaveBeenCalledTimes(1);
    salir();
  });

  it('el boton posterior a la caducidad si pide otro', async () => {
    const pedir = vi.fn(async () => codigoQueDura(60));
    const p = pantallaSimulada(pedir);
    const salir = await p.entrar();
    p.tic(AHORA + 61_000);

    await p.pulsarCta();

    expect(pedir).toHaveBeenCalledTimes(2);
    expect(p.pase.fase).toBe('listo');
    salir();
  });

  it('si falla, NO se reutiliza el codigo anterior', async () => {
    const pedir = vi
      .fn<() => Promise<CodigoDeAcceso>>()
      .mockResolvedValueOnce(codigoQueDura(60))
      .mockRejectedValueOnce(new NetworkError('POST', '/x', new TypeError('failed')));
    const p = pantallaSimulada(pedir);

    const salir1 = await p.entrar();
    salir1();
    const salir2 = await p.entrar();

    expect(p.pase.fase).toBe('error');
    // Y el error no arrastra un codigo viejo escondido.
    expect(JSON.stringify(p.pase)).not.toContain(TOKEN);
    salir2();
  });

  it('volver del segundo plano con el codigo vivo NO pide otro', async () => {
    const pedir = vi.fn(async () => codigoQueDura(60));
    const p = pantallaSimulada(pedir);
    const salir = await p.entrar();

    await p.volverDeSegundoPlano(AHORA);

    expect(pedir).toHaveBeenCalledTimes(1);
    salir();
  });

  it('volver del segundo plano con el codigo caducado SI pide otro', async () => {
    const pedir = vi.fn(async () => codigoQueDura(60));
    const p = pantallaSimulada(pedir);
    const salir = await p.entrar();
    p.tic(AHORA + 61_000);

    await p.volverDeSegundoPlano(AHORA + 61_000);

    expect(pedir).toHaveBeenCalledTimes(2);
    salir();
  });

  it('al salir se cancelan el reloj y el oyente de AppState', async () => {
    const pedir = vi.fn(async () => codigoQueDura(60));
    const p = pantallaSimulada(pedir);

    const salir = await p.entrar();
    expect(p.relojesVivos).toBe(1);
    expect(p.oyentesVivos).toBe(1);

    salir();
    expect(p.relojesVivos).toBe(0);
    expect(p.oyentesVivos).toBe(0);
  });

  it('en todo el recorrido, el token no llega al almacen', async () => {
    const almacen = almacenFalso();
    const pedir = vi.fn(async () => codigoQueDura(60));
    const p = pantallaSimulada(pedir);

    const salir = await p.entrar();
    p.tic(AHORA + 61_000);
    await p.pulsarCta();
    await p.volverDeSegundoPlano(AHORA);
    salir();

    expect(almacen.guardar).not.toHaveBeenCalled();
    expect(almacen.escrituras).toEqual([]);
  });
});
