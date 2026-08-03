import { describe, expect, it } from 'vitest';
import { memberSchema } from '@gymlab/contracts';
import { createHttp } from '../http';
import { NetworkError } from '../errors';
import type { Fetch } from '../http';

describe('sonda: cancelar con motivo propio', () => {
  it('el motivo del AbortController se propaga tal cual', async () => {
    const control = new AbortController();
    const motivo = new Error('la pantalla se ha desmontado');
    control.abort(motivo);

    // Lo que hace la plataforma: fetch rechaza con `signal.reason`.
    const fetch: Fetch = async () => {
      throw control.signal.reason as Error;
    };
    const http = createHttp({ baseUrl: '/v1', fetch });

    const error = await http({
      method: 'GET',
      path: '/x',
      schema: memberSchema,
      signal: control.signal,
    }).catch((e: unknown) => e);

    expect(error).toBe(motivo);
    expect(error).not.toBeInstanceOf(NetworkError);
  });
});
