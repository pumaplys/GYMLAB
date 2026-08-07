/**
 * Guardarrail del cableado de variables de entorno.
 *
 * Anadir una variable exige tocar tres sitios, y en local solo se nota uno:
 *
 *   config/env.ts          el esquema
 *   turbo.json             modo estricto: lo que no se declara, no llega
 *   .github/workflows/ci   si es obligatoria, hay que darle valor
 *
 * En desarrollo `.env` lo tapa todo, asi que el olvido no aparece hasta que CI se
 * pone en rojo — y ha pasado ya dos veces: con las variables de Resend y con la
 * semilla del QR de acceso. Este test lo convierte en un fallo local.
 *
 * Es hermano del que exige RLS a toda tabla con `gym_id`: no comprueba una
 * funcionalidad, comprueba que nadie se salte un paso del proceso.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENV_KEYS, ENV_KEYS_OBLIGATORIAS, problemasDeEntorno } from '../config/env';

// `process.cwd()` y no `import.meta.url`: la API se compila a CommonJS, donde
// `import.meta` es un error de compilacion. Vitest corre con el directorio del
// paquete como raiz, asi que dos niveles arriba esta la del repositorio.
const raiz = resolve(process.cwd(), '../..');
const leer = (ruta: string) => readFileSync(resolve(raiz, ruta), 'utf8');

describe('cableado de variables de entorno', () => {
  it('todas estan declaradas en turbo.json', () => {
    const turbo = leer('turbo.json');

    for (const clave of ENV_KEYS) {
      expect(turbo, `${clave} no esta declarada en turbo.json`).toContain(`"${clave}"`);
    }
  });

  it('las obligatorias tienen valor en el workflow de CI', () => {
    const ci = leer('.github/workflows/ci.yml');

    for (const clave of ENV_KEYS_OBLIGATORIAS) {
      expect(ci, `${clave} no tiene valor en ci.yml`).toContain(`${clave}:`);
    }
  });

  it('con clave de Resend, un remitente de mentira NO deja arrancar', () => {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ ES EL FALLO CON PEOR FORMA QUE TENIA EL MODULO DE CORREO.            │
    // │                                                                      │
    // │ Con la clave puesta y `EMAIL_FROM` olvidado, el proceso arrancaba    │
    // │ PERFECTAMENTE con el valor por defecto, `no-reply@localhost`. Resend │
    // │ respondia `invalid_from_address`, que esta clasificado como error    │
    // │ DEFINITIVO, asi que el trabajo se descartaba SIN REINTENTO y nadie   │
    // │ recibia nada: ni invitaciones ni recuperaciones de contrasena.       │
    // │                                                                      │
    // │ El unico rastro era una linea de ERROR en el log.                    │
    // └──────────────────────────────────────────────────────────────────────┘
    const base = { ...process.env, RESEND_API_KEY: 're_una_clave_cualquiera' };

    // El defecto de desarrollo, que es el que se cuela por olvido.
    expect(problemasDeEntorno({ ...base, EMAIL_FROM: undefined }).join(' ')).toContain('EMAIL_FROM');
    // Y cualquier otro dominio sin punto.
    expect(problemasDeEntorno({ ...base, EMAIL_FROM: 'GYMLAB <no-reply@localhost>' })).not.toEqual(
      [],
    );
    // Un remitente sin direccion tampoco vale.
    expect(problemasDeEntorno({ ...base, EMAIL_FROM: 'GYMLAB' })).not.toEqual([]);
  });

  it('y las dos formas que acepta Resend si valen', () => {
    const base = { ...process.env, RESEND_API_KEY: 're_una_clave_cualquiera' };

    expect(problemasDeEntorno({ ...base, EMAIL_FROM: 'GYMLAB <no-reply@gymlab.test>' })).toEqual([]);
    expect(problemasDeEntorno({ ...base, EMAIL_FROM: 'no-reply@gymlab.test' })).toEqual([]);
  });

  it('sin clave de Resend, el remitente de desarrollo sigue valiendo', () => {
    // El transporte de consola no manda nada a ningun sitio, asi que exigir un
    // dominio real ahi seria pedir una cuenta de Resend para trabajar en local.
    expect(
      problemasDeEntorno({
        ...process.env,
        RESEND_API_KEY: undefined,
        EMAIL_FROM: 'GYMLAB <no-reply@localhost>',
      }),
    ).toEqual([]);
  });

  it('todas aparecen en .env.example', () => {
    // El fichero que copia quien clona el repositorio. Si falta una variable
    // obligatoria, su primer `pnpm test` falla sin explicacion util.
    const ejemplo = leer('.env.example');

    for (const clave of ENV_KEYS_OBLIGATORIAS) {
      expect(ejemplo, `${clave} no aparece en .env.example`).toContain(clave);
    }
  });
});
