import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AccessResult } from '@gymlab/contracts';
import {
  ESTADO_INICIAL,
  camaraActiva,
  debeEnviar,
  siguiente,
  type EstadoDelEscaner,
  type Suceso,
} from './maquina';

const CARNE = randomBytes(89).toString('base64url');
const OTRO_CARNE = randomBytes(89).toString('base64url');

const ALLOW: AccessResult = {
  decision: 'ALLOW',
  reason: 'OK',
  member: { id: 'x', memberNumber: 7, firstName: 'Nombre', lastName: 'Apellido' },
  diasRestantes: 12,
  isRetry: false,
} as AccessResult;

/** Aplica una lista de sucesos en orden, como haria `useReducer`. */
function reproducir(sucesos: Suceso[], desde = ESTADO_INICIAL): EstadoDelEscaner {
  return sucesos.reduce(siguiente, desde);
}

describe('el mismo QR delante del objetivo se envia UNA vez', () => {
  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ ESTE ES EL TEST QUE JUSTIFICA QUE LA MAQUINA SEA PURA.               │
   * │                                                                      │
   * │ La camara llama a `onBarcodeScanned` en cada fotograma legible. Diez  │
   * │ llamadas seguidas es lo que ocurre en menos de dos segundos con un    │
   * │ carne quieto delante.                                                 │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('diez lecturas consecutivas producen un solo envio', () => {
    let estado = ESTADO_INICIAL;
    let envios = 0;
    for (let i = 0; i < 10; i++) {
      const antes = estado;
      estado = siguiente(estado, { tipo: 'leido', texto: CARNE });
      if (estado !== antes) envios++;
    }
    expect(envios).toBe(1);
    expect(estado.fase.tipo).toBe('verificando');
    expect(estado.ultimoEnviado).toBe(CARNE);
  });

  it('una lectura ignorada devuelve EL MISMO objeto de estado', () => {
    const tras = siguiente(ESTADO_INICIAL, { tipo: 'leido', texto: CARNE });
    // Identidad, no igualdad: si se reconstruyera un estado equivalente, React
    // repintaria y el test de arriba contaria envios que no existen.
    expect(siguiente(tras, { tipo: 'leido', texto: CARNE })).toBe(tras);
  });

  it('con la peticion EN VUELO no se envia nada mas, ni siquiera otro carne', () => {
    const enVuelo = reproducir([{ tipo: 'leido', texto: CARNE }]);
    expect(enVuelo.fase.tipo).toBe('verificando');
    expect(debeEnviar(CARNE, enVuelo)).toBe(false);
    expect(debeEnviar(OTRO_CARNE, enVuelo)).toBe(false);
    expect(siguiente(enVuelo, { tipo: 'leido', texto: OTRO_CARNE })).toBe(enVuelo);
  });

  it('con un veredicto en pantalla tampoco se envia: nadie lo ha cerrado', () => {
    const conVeredicto = reproducir([
      { tipo: 'leido', texto: CARNE },
      { tipo: 'respondio', resultado: ALLOW },
    ]);
    expect(conVeredicto.fase.tipo).toBe('resultado');
    expect(debeEnviar(OTRO_CARNE, conVeredicto)).toBe(false);
  });
});

describe('al cerrar el veredicto se vuelve a escanear', () => {
  const trasCerrar = reproducir([
    { tipo: 'leido', texto: CARNE },
    { tipo: 'respondio', resultado: ALLOW },
    { tipo: 'cerrar' },
  ]);

  it('la pantalla queda leyendo otra vez', () => {
    expect(trasCerrar.fase.tipo).toBe('leyendo');
  });

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ EL CARNE PUEDE SEGUIR DELANTE DEL OBJETIVO AL CERRAR.                │
   * │                                                                      │
   * │ Si se reenviara, el servidor responderia —correctamente—              │
   * │ `TOKEN_REUSED`, y en la puerta se veria un rojo grande sobre una      │
   * │ entrada que ya se habia contado bien. Por eso `ultimoEnviado`         │
   * │ SOBREVIVE al cierre.                                                  │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('el MISMO carne no se reenvia solo', () => {
    expect(debeEnviar(CARNE, trasCerrar)).toBe(false);
    expect(siguiente(trasCerrar, { tipo: 'leido', texto: CARNE })).toBe(trasCerrar);
  });

  it('el carne del SIGUIENTE socio si se envia', () => {
    expect(debeEnviar(OTRO_CARNE, trasCerrar)).toBe(true);
    const tras = siguiente(trasCerrar, { tipo: 'leido', texto: OTRO_CARNE });
    expect(tras.fase.tipo).toBe('verificando');
    expect(tras.ultimoEnviado).toBe(OTRO_CARNE);
  });
});

describe('un fallo de red no deja a nadie fuera', () => {
  const trasFallo = reproducir([
    { tipo: 'leido', texto: CARNE },
    { tipo: 'fallo', mensaje: 'sin conexión' },
  ]);

  it('mientras se enseña el fallo no se reintenta solo', () => {
    expect(trasFallo.fase.tipo).toBe('fallo');
    expect(debeEnviar(CARNE, trasFallo)).toBe(false);
  });

  /*
   * La diferencia con el veredicto: si NO hubo respuesta, el acceso no se
   * decidio y a ese codigo todavia le queda vida. La persona sigue delante
   * con el telefono en la mano, asi que el MISMO carne tiene que poder
   * reintentarse — es justo lo contrario del caso anterior, y a proposito.
   */
  it('al cerrarlo, el mismo carne SI se puede reintentar', () => {
    const listo = siguiente(trasFallo, { tipo: 'cerrar' });
    expect(listo.fase.tipo).toBe('leyendo');
    expect(listo.ultimoEnviado).toBeNull();
    expect(debeEnviar(CARNE, listo)).toBe(true);
  });
});

describe('lo que no tiene forma de carne no llega a la API', () => {
  it('un QR cualquiera no cambia el estado', () => {
    for (const basura of ['https://ejemplo.local/promo', 'rinda://panel', 'hola', '']) {
      expect(siguiente(ESTADO_INICIAL, { tipo: 'leido', texto: basura }), basura).toBe(
        ESTADO_INICIAL,
      );
    }
  });

  it('y no deja rastro: `ultimoEnviado` sigue vacio', () => {
    const tras = siguiente(ESTADO_INICIAL, { tipo: 'leido', texto: 'https://ejemplo.local' });
    expect(tras.ultimoEnviado).toBeNull();
  });
});

describe('el token no sobrevive a la pantalla', () => {
  /*
   * No hay forma de comprobar «no se guarda» mirando la maquina: lo que se
   * comprueba es que el token vive SOLO en el estado que devuelve, y que el
   * estado inicial —el de cada vez que se abre el escaner— esta vacio.
   */
  it('el estado inicial no trae ningun token', () => {
    expect(ESTADO_INICIAL.ultimoEnviado).toBeNull();
  });

  it('la maquina no escribe en ningun sitio: el estado de entrada no se toca', () => {
    const entrada: EstadoDelEscaner = { fase: { tipo: 'leyendo' }, ultimoEnviado: null };
    const copia = structuredClone(entrada);
    siguiente(entrada, { tipo: 'leido', texto: CARNE });
    expect(entrada).toEqual(copia);
  });
});

describe('la camara solo mira cuando hay algo que leer', () => {
  it('esta activa leyendo y en primer plano', () => {
    expect(camaraActiva(ESTADO_INICIAL, true)).toBe(true);
  });

  it('se apaga en segundo plano aunque este leyendo', () => {
    expect(camaraActiva(ESTADO_INICIAL, false)).toBe(false);
  });

  it('se apaga mientras se verifica, con un veredicto y con un fallo', () => {
    const casos: EstadoDelEscaner[] = [
      { fase: { tipo: 'verificando' }, ultimoEnviado: CARNE },
      { fase: { tipo: 'resultado', resultado: ALLOW }, ultimoEnviado: CARNE },
      { fase: { tipo: 'fallo', mensaje: 'x' }, ultimoEnviado: null },
    ];
    for (const estado of casos) {
      expect(camaraActiva(estado, true), estado.fase.tipo).toBe(false);
    }
  });
});

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ FALSIFICACION: SE COMPRUEBA QUE LA GUARDIA SABE FALLAR.                  │
 * │                                                                          │
 * │ Un test en verde no vale nada si pasaria igual sin el filtro. Aqui se    │
 * │ reimplementa `debeEnviar` SIN cada una de sus tres condiciones y se      │
 * │ exige que la version rota se comporte distinto. Si alguna sabotea sin    │
 * │ que cambie nada, es que esa condicion no la estaba probando nadie.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('falsificacion del anti doble-lectura', () => {
  const enVuelo: EstadoDelEscaner = { fase: { tipo: 'verificando' }, ultimoEnviado: CARNE };
  const yaEnviado: EstadoDelEscaner = { fase: { tipo: 'leyendo' }, ultimoEnviado: CARNE };

  it('sin la condicion de fase, una lectura en vuelo se colaria', () => {
    const roto = (texto: string, estado: EstadoDelEscaner) => texto !== estado.ultimoEnviado;
    expect(roto(OTRO_CARNE, enVuelo)).toBe(true);
    expect(debeEnviar(OTRO_CARNE, enVuelo)).toBe(false);
  });

  it('sin la memoria del ultimo, el mismo carne se reenviaria', () => {
    const roto = (_texto: string, estado: EstadoDelEscaner) => estado.fase.tipo === 'leyendo';
    expect(roto(CARNE, yaEnviado)).toBe(true);
    expect(debeEnviar(CARNE, yaEnviado)).toBe(false);
  });

  it('sin el filtro de formato, una URL viajaria al servidor', () => {
    const roto = (texto: string, estado: EstadoDelEscaner) =>
      estado.fase.tipo === 'leyendo' && texto !== estado.ultimoEnviado;
    const url = 'https://ejemplo.local/algo';
    expect(roto(url, ESTADO_INICIAL)).toBe(true);
    expect(debeEnviar(url, ESTADO_INICIAL)).toBe(false);
  });
});
