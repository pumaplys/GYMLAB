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

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LOS DOS PLAZOS QUE NO PUEDEN MOVERSE SOLOS.                             │
 * │                                                                          │
 * │ Estos dos tests fijan un numero literal, que es justo lo que el resto de │
 * │ este fichero evita. No es un descuido: los dos ya se movieron una vez y  │
 * │ el movimiento tenia que haberse justificado antes, no despues.           │
 * │                                                                          │
 * │ Si alguien necesita cambiarlos, que cambie tambien esta linea — y al     │
 * │ hacerlo lea por que estaban asi.                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('los plazos que no se mueven sin justificarlo', () => {
  it('auth_events son 90 dias, NO doce meses', () => {
    /*
     * Subio a 12 meses el 2026-09-16, sobre la premisa equivocada de que estos
     * eventos no se purgaban. Se purgaban, a 90 dias. Cuadruplicar la
     * conservacion de IP y user-agent sin necesidad demostrada es lo que el
     * art. 5.1.e no permite.
     */
    expect(RETENCION.authEventsDias).toBe(90);
    expect(RETENCION.authEventsQuienDecide).toBe('rinda-responsable');
  });

  it('la supresion de salud son 24 horas, NO 30 dias', () => {
    /*
     * Prometer un mes para borrar datos de categoria especial que se pueden
     * borrar en segundos no se sostiene. La retirada encola la supresion en su
     * propia transaccion; el trabajo diario es solo la red de seguridad.
     */
    expect(RETENCION.saludMaximoHoras).toBe(24);
    expect(RETENCION).not.toHaveProperty('saludMaximoDias');
  });

  it('los plazos de datos tenant NO los decide RINDA', () => {
    /*
     * El gimnasio es el responsable. Marcar uno de estos como decision propia
     * seria atribuirse una base juridica sobre datos de los que no se responde.
     */
    for (const clave of [
      'accessEventsQuienDecide',
      'invitationsQuienDecide',
      'paymentsQuienDecide',
      'saludQuienDecide',
    ] as const) {
      expect(RETENCION[clave], clave).toBe('gimnasio-instruccion-documentada');
    }
  });
});

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

describe('el SQL dice lo mismo que la politica', () => {
  it('el comentario de auth_events en la base habla de 90 dias', () => {
    /*
     * El comentario vive EN LA BASE DE DATOS, y es lo que lee quien se conecta
     * con psql sin abrir el repositorio. Si dice un plazo y la purga aplica
     * otro, el que sobra es el comentario — y nadie lo revisa.
     */
    // Acotado a SU sentencia: sin el corte, el `slice` llegaba al final del
    // fichero y encontraba «12 meses» en la purga de invitaciones — que es
    // correcto ahi, y no tiene nada que ver con esta tabla.
    const desde = RLS.indexOf('COMMENT ON TABLE auth_events');
    const comentario = RLS.slice(desde, RLS.indexOf(';', desde));
    expect(comentario).toContain(`Retencion ${RETENCION.authEventsDias} dias`);
    expect(comentario).not.toContain('12 meses');
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
    /*
     * La promesa de salud —24 horas— es MAS CORTA que la vida de una copia, y
     * eso no es una contradiccion: son dos promesas distintas y la politica
     * las separa. Lo que no puede pasar es que la de base activa se acerque a
     * la de las copias sin decirlo.
     */
    expect(RETENCION.saludMaximoHoras / 24).toBeLessThan(RETENCION.copiasMaximoDias);
  });
});
