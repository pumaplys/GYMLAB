import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RETENCION } from '../retencion';

/**
 * QUE EL SQL Y EL TYPESCRIPT DIGAN EL MISMO PLAZO.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ HAY DOS SITIOS, Y NO SE PUEDE REDUCIR A UNO.                             │
 * │                                                                          │
 * │ El plazo vive dentro de la funcion SQL para que la aplicacion no pueda   │
 * │ elegir cuanto borrar — si `app_purge_audit_log` aceptara un intervalo    │
 * │ por parametro, el caracter append-only del registro seria un adorno.     │
 * │                                                                          │
 * │ Y vive en `retencion.ts` para poder documentarlo, ensenarlo junto y      │
 * │ citarlo desde la politica de privacidad.                                 │
 * │                                                                          │
 * │ Dos sitios se separan. La unica defensa posible es un test que los       │
 * │ compare y diga CUAL cambio.                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const AQUI = dirname(fileURLToPath(import.meta.url));
const RLS = readFileSync(resolve(AQUI, '..', '..', join('sql', '01-rls.sql')), 'utf8');

/** El cuerpo de una funcion, para no encontrar un intervalo de la de al lado. */
function cuerpoDe(funcion: string): string {
  const inicio = RLS.indexOf(`CREATE OR REPLACE FUNCTION ${funcion}(`);
  expect(inicio, `no existe la funcion ${funcion}`).toBeGreaterThan(-1);
  const fin = RLS.indexOf('REVOKE EXECUTE ON FUNCTION', inicio);
  return RLS.slice(inicio, fin === -1 ? undefined : fin);
}

describe('los plazos del SQL coinciden con los declarados', () => {
  it(`audit_log: ${RETENCION.auditLogAnios} años`, () => {
    expect(cuerpoDe('app_purge_audit_log')).toContain(
      `INTERVAL '${RETENCION.auditLogAnios} years'`,
    );
  });

  it(`invitations: ${RETENCION.invitationsMeses} meses`, () => {
    expect(cuerpoDe('app_purge_invitations')).toContain(
      `INTERVAL '${RETENCION.invitationsMeses} months'`,
    );
  });

  it(`constancia del consentimiento: ${RETENCION.constanciaConsentimientoAnios} años`, () => {
    expect(cuerpoDe('app_purge_health_data')).toContain(
      `INTERVAL '${RETENCION.constanciaConsentimientoAnios} years'`,
    );
  });
});

describe('lo que las purgas NO pueden hacer', () => {
  it('ninguna acepta el plazo por parámetro: sólo el límite de filas', () => {
    for (const funcion of ['app_purge_audit_log', 'app_purge_invitations', 'app_purge_health_data']) {
      const cuerpo = cuerpoDe(funcion);
      const firma = cuerpo.slice(0, cuerpo.indexOf(')'));
      /*
       * La firma entera tiene que ser `(p_limite int DEFAULT n)`. Si algun dia
       * aparece ahi un `interval`, la aplicacion podria pedir «borra lo de
       * mas de un segundo» y esto deja de ser una politica de conservacion.
       */
      expect(firma, `${funcion} no deberia aceptar nada mas que el limite`).toMatch(
        /\(p_limite int DEFAULT \d+$/,
      );
      expect(firma.toLowerCase()).not.toContain('interval');
    }
  });

  it('todas son SECURITY DEFINER con search_path fijado', () => {
    for (const funcion of [
      'app_purge_access_data',
      'app_purge_audit_log',
      'app_purge_invitations',
      'app_purge_health_data',
    ]) {
      const cuerpo = cuerpoDe(funcion);
      expect(cuerpo, `${funcion} deberia ser SECURITY DEFINER`).toContain('SECURITY DEFINER');
      /*
       * Sin `SET search_path`, quien pudiera manipularlo haria que la funcion
       * resolviera a otras tablas y ejecutara con los permisos del propietario.
       * En una funcion que BORRA, eso es lo mas grave que puede pasar.
       */
      expect(cuerpo, `${funcion} necesita search_path fijado`).toContain('SET search_path = public');
    }
  });

  it('ninguna la puede ejecutar PUBLIC', () => {
    for (const funcion of [
      'app_purge_access_data',
      'app_purge_audit_log',
      'app_purge_invitations',
      'app_purge_health_data',
    ]) {
      expect(RLS).toContain(`REVOKE EXECUTE ON FUNCTION ${funcion}`);
      expect(RLS).toContain(`GRANT EXECUTE ON FUNCTION ${funcion}`);
    }
  });
});

describe('las copias de seguridad', () => {
  it('el techo declarado es el mayor de las reglas del bucket', () => {
    /*
     * 31 dias no es un numero elegido: es `predeploy/` y `postdeploy/` con
     * 30 dias hasta ocultar mas 1 hasta borrar. Si alguien cambia la regla en
     * B2 y no este numero, la politica de privacidad promete algo falso.
     */
    expect(RETENCION.copiasMaximoDias).toBe(30 + 1);
    // Y el plazo de salud no puede prometer menos de lo que dura una copia
    // sin decirlo: son promesas distintas y la politica las separa.
    expect(RETENCION.saludMaximoDias).toBeLessThanOrEqual(RETENCION.copiasMaximoDias);
  });
});
