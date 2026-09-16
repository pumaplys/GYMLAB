import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * La identidad del prestador, leida del entorno.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL MODULO LEE `process.env` AL IMPORTARSE, asi que cada caso necesita    │
 * │ una importacion FRESCA. De ahi `resetModules` + `await import`.          │
 * │                                                                          │
 * │ No es un rodeo del test: es la propiedad que se quiere. Son variables de │
 * │ RELEASE, no de ejecucion — cambiarlas exige volver a construir, que es   │
 * │ la ceremonia que merece cambiar quien responde ante una autoridad.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const CLAVES = [
  'NEXT_PUBLIC_PRESTADOR_NOMBRE',
  'NEXT_PUBLIC_PRESTADOR_DOMICILIO',
  'NEXT_PUBLIC_PRESTADOR_NIF',
] as const;

const original: Record<string, string | undefined> = {};

beforeEach(async () => {
  for (const clave of CLAVES) {
    original[clave] = process.env[clave];
    delete process.env[clave];
  }
  vi.resetModules();
});

afterEach(() => {
  for (const clave of CLAVES) {
    if (original[clave] === undefined) delete process.env[clave];
    else process.env[clave] = original[clave];
  }
});

async function cargar() {
  vi.resetModules();
  return import('../prestador');
}

describe('sin configurar', () => {
  it('no se inventa nada: todo vacio y sin identidad', async () => {
    const { PRESTADOR, hayIdentidad, identidadCompleta } = await cargar();
    expect(PRESTADOR.nombre).toBeNull();
    expect(PRESTADOR.domicilio).toEqual([]);
    expect(PRESTADOR.nif).toBeNull();
    expect(hayIdentidad()).toBe(false);
    expect(identidadCompleta()).toBe(false);
  });

  it('una variable vacia cuenta como ausente', async () => {
    process.env.NEXT_PUBLIC_PRESTADOR_NOMBRE = '   ';
    const { PRESTADOR, hayIdentidad } = await cargar();
    expect(PRESTADOR.nombre).toBeNull();
    expect(hayIdentidad()).toBe(false);
  });
});

describe('configurada', () => {
  it('parte el domicilio en lineas y NO le toca nada mas', async () => {
    process.env.NEXT_PUBLIC_PRESTADOR_NOMBRE = 'Nombre De Prueba';
    process.env.NEXT_PUBLIC_PRESTADOR_DOMICILIO = 'Calle Sin Acentos 3|Piso 1D|00000 Ciudad|Pais';

    const { PRESTADOR, hayIdentidad, identidadCompleta } = await cargar();

    expect(PRESTADOR.domicilio).toEqual([
      'Calle Sin Acentos 3',
      'Piso 1D',
      '00000 Ciudad',
      'Pais',
    ]);
    // Un dato legal se transcribe, no se normaliza: ni acentos, ni mayusculas.
    expect(PRESTADOR.nombre).toBe('Nombre De Prueba');
    expect(hayIdentidad()).toBe(true);
    // Sin identificador fiscal, la identidad NO esta completa.
    expect(identidadCompleta()).toBe(false);
  });

  it('con identificador fiscal, la identidad esta completa', async () => {
    process.env.NEXT_PUBLIC_PRESTADOR_NOMBRE = 'Nombre De Prueba';
    process.env.NEXT_PUBLIC_PRESTADOR_DOMICILIO = 'Calle 1|Ciudad';
    process.env.NEXT_PUBLIC_PRESTADOR_NIF = 'X0000000X';

    const { identidadCompleta, PRESTADOR } = await cargar();
    expect(identidadCompleta()).toBe(true);
    expect(PRESTADOR.nif).toBe('X0000000X');
  });

  it('descarta las lineas vacias de un domicilio mal escrito', async () => {
    process.env.NEXT_PUBLIC_PRESTADOR_NOMBRE = 'N';
    process.env.NEXT_PUBLIC_PRESTADOR_DOMICILIO = 'Calle 1||  |Ciudad|';
    const { PRESTADOR } = await cargar();
    expect(PRESTADOR.domicilio).toEqual(['Calle 1', 'Ciudad']);
  });
});

describe('lo que este fichero garantiza', () => {
  it('el modulo no lleva ni un dato personal escrito', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const codigo = readFileSync(join(process.cwd(), 'src', 'lib', 'prestador.ts'), 'utf8');

    /*
     * La comprobacion que de verdad importa de todo este diseno: que nadie
     * «arregle» el modulo pegando el nombre real como valor por defecto. Se
     * buscan las formas de escribir un valor junto a la lectura del entorno.
     */
    expect(codigo).not.toMatch(/process\.env\[[^\]]+\]\s*\?\?\s*'/);
    /*
     * Una direccion DE VERDAD, no la palabra «Calle». El fichero documenta el
     * formato con `NEXT_PUBLIC_PRESTADOR_DOMICILIO=Calle...|Piso...`, que es
     * un ejemplo y tiene que poder seguir ahi: lo que no puede aparecer es una
     * via con nombre y numero.
     */
    expect(codigo).not.toMatch(/\bcalle\s+[a-záéíóúñ]+\s+\d/i);
    expect(codigo).not.toMatch(/\b\d{5}\s+[A-ZÁÉÍÓÚÑ]/);
    expect(codigo.match(/@[a-z0-9.-]+\.[a-z]{2,}/i), 'ningun correo escrito aqui').toBeNull();
  });
});
