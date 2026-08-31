import { describe, expect, it } from 'vitest';
import { ApiError, ApiResponseError, NetworkError } from '@gymlab/api-client';
import { z } from 'zod';
import { clasificarError } from './clasificar';
import { debeBorrarToken, decidirEstado } from './estado';

/**
 * La regla de oro de la sesion: SOLO un 401 la invalida.
 *
 * Se prueba con los errores REALES de `@gymlab/api-client`, no con objetos
 * parecidos: si el paquete cambiara sus clases, estas pruebas se enterarian.
 */

/** Un `ZodError` de verdad, para construir un `ApiResponseError` autentico. */
function errorDeZod() {
  const r = z.object({ a: z.string() }).safeParse({ a: 1 });
  if (r.success) throw new Error('el esquema deberia haber fallado');
  return r.error;
}

describe('401 invalida la sesion; nada mas lo hace', () => {
  it('401 -> sesion invalida, y SI borra el token', () => {
    const r = clasificarError(new ApiError(401, 'No autorizado'));
    expect(r).toEqual({ clase: 'sesionInvalida' });
    expect(debeBorrarToken(r)).toBe(true);
    expect(decidirEstado(r).tipo).toBe('sinSesion');
  });

  // El caso que originaba el bug: cualquier error CON status se daba por 401.
  it.each([
    [403, 'prohibido'],
    [404, 'no encontrado'],
    [409, 'conflicto'],
    [429, 'demasiadas peticiones'],
    [500, 'error interno'],
    [502, 'puerta de enlace'],
    [503, 'no disponible'],
  ])('%i NO borra el token', (status) => {
    const r = clasificarError(new ApiError(status, 'lo que sea'));
    expect(r).toEqual({ clase: 'errorDelServidor', status });
    expect(debeBorrarToken(r)).toBe(false);

    const estado = decidirEstado(r);
    expect(estado).toEqual({ tipo: 'errorAlComprobar', motivo: 'servidor', status });
  });

  it('error de red NO borra el token', () => {
    const r = clasificarError(new NetworkError('GET', '/v1/auth/me', new TypeError('failed')));
    expect(r).toEqual({ clase: 'errorDeRed' });
    expect(debeBorrarToken(r)).toBe(false);
    expect(decidirEstado(r)).toEqual({ tipo: 'errorAlComprobar', motivo: 'red' });
  });

  it('respuesta que no cumple el contrato NO borra el token', () => {
    const r = clasificarError(new ApiResponseError('GET', '/v1/auth/me', errorDeZod()));
    expect(r).toEqual({ clase: 'respuestaInvalida' });
    expect(debeBorrarToken(r)).toBe(false);
    expect(decidirEstado(r)).toEqual({ tipo: 'errorAlComprobar', motivo: 'contrato' });
  });

  it('una excepcion desconocida tampoco borra el token', () => {
    // Ante la duda no se cierra una sesion que puede ser buena.
    const r = clasificarError(new Error('algo inesperado'));
    expect(debeBorrarToken(r)).toBe(false);
  });

  it('sin token guardado no hay nada que borrar', () => {
    expect(debeBorrarToken({ clase: 'sinToken' })).toBe(false);
    expect(decidirEstado({ clase: 'sinToken' }).tipo).toBe('sinSesion');
  });
});
