import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ApiError, ApiResponseError, NetworkError } from '@gymlab/api-client';
import { ACCOUNT_EXISTS } from '@gymlab/contracts';
import {
  caminoDeInvitacion,
  esCuentaExistente,
  mensajeDeInvitacion,
  mensajeDeRecuperacion,
  mensajeDeRestablecer,
  tokenDelEnlace,
} from './recuperacion';

/**
 * Volver a entrar cuando ya no se puede entrar.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ERA EL HUECO ENTERO DEL SOCIO EN LA AUDITORIA DE PARIDAD.                │
 * │                                                                          │
 * │ De las 18 capacidades que el web ejerce para un socio, al movil le       │
 * │ faltaban cuatro, y las cuatro ocurren ANTES de tener sesion: recuperar   │
 * │ la contraseña, restablecerla, aceptar una invitacion y vincularla. El    │
 * │ ensayo fisico no podia verlo porque empieza con la sesion ya abierta.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

describe('el token que viene en el enlace', () => {
  it('un token normal se acepta tal cual', () => {
    expect(tokenDelEnlace('abc123')).toBe('abc123');
  });

  it('se recortan los espacios de alrededor', () => {
    expect(tokenDelEnlace('  abc123  ')).toBe('abc123');
  });

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ UN TOKEN EN BLANCO ES EL CASO QUE FALLABA MUDO EN EL PANEL WEB.      │
   * │                                                                      │
   * │ `?token=%20` sale de un enlace que se partio al copiarlo a mano.     │
   * │ Alli el esquema se quejaba de un campo que la pantalla no pinta, el  │
   * │ aviso se guardaba donde nadie lo ve, y el boton dejaba de responder  │
   * │ sin decir por que. Aqui se iguala a «no hay token» desde el          │
   * │ principio, que es lo unico que se puede decir con verdad.            │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('un token en blanco es lo mismo que no traer ninguno', () => {
    for (const vacio of ['', '   ', '\n', '\t ']) {
      expect(tokenDelEnlace(vacio), JSON.stringify(vacio)).toBeNull();
    }
    expect(tokenDelEnlace(undefined)).toBeNull();
  });

  it('si el parametro viene repetido se coge el primero', () => {
    // `?token=a&token=b` llega como array; quedarse con el array entero
    // mandaria «a,b» al servidor.
    expect(tokenDelEnlace(['a', 'b'])).toBe('a');
    expect(tokenDelEnlace([])).toBeNull();
  });
});

describe('los tres caminos de una invitacion', () => {
  it('sin enlace no hay nada que hacer', () => {
    expect(caminoDeInvitacion(null, 'sinSesion', 'crear')).toBe('sinEnlace');
    expect(caminoDeInvitacion(null, 'conSesion', 'crear')).toBe('sinEnlace');
  });

  it('mientras se comprueba la sesion no se decide nada', () => {
    // Sin esto, la pantalla enseñaria «crea tu cuenta» durante un instante a
    // quien ya tiene sesion, y despues cambiaria sola.
    expect(caminoDeInvitacion('t', 'cargando', 'crear')).toBe('esperando');
  });

  it('con sesion se vincula sin pedir nada', () => {
    expect(caminoDeInvitacion('t', 'conSesion', 'crear')).toBe('vincular');
    // Y da igual lo que se hubiera elegido antes: tener sesion manda.
    expect(caminoDeInvitacion('t', 'conSesion', 'entrar')).toBe('vincular');
  });

  it('sin sesion se empieza por crear la cuenta', () => {
    expect(caminoDeInvitacion('t', 'sinSesion', 'crear')).toBe('crear');
  });

  it('y se pasa a entrar solo si alguien lo decide', () => {
    expect(caminoDeInvitacion('t', 'sinSesion', 'entrar')).toBe('entrar');
  });
});

describe('un correo que ya tiene cuenta no es un error', () => {
  /*
   * Se reconoce por el CODIGO del contrato, igual que en el panel web. El 409
   * es transporte —otro caso podria acabar usandolo— y el texto es copy.
   */
  it('se reconoce por `ACCOUNT_EXISTS`, no por el 409', () => {
    const conCodigo = new ApiError(409, 'ya existe', [], ACCOUNT_EXISTS);
    expect(esCuentaExistente(conCodigo)).toBe(true);
  });

  it('un 409 SIN ese codigo no cuenta', () => {
    expect(esCuentaExistente(new ApiError(409, 'otra cosa'))).toBe(false);
  });

  it('ni un 400, ni un fallo de red, ni cualquier otra cosa', () => {
    expect(esCuentaExistente(new ApiError(400, 'malo'))).toBe(false);
    expect(esCuentaExistente(new NetworkError('POST', '/auth/forgot-password', new Error('sin red')))).toBe(false);
    expect(esCuentaExistente(new Error('vete a saber'))).toBe(false);
  });
});

describe('lo que se dice cuando algo falla', () => {
  const util = (texto: string) => {
    // Ni codigos, ni nombres de campo, ni «error». Una frase que se entiende.
    expect(texto.length).toBeGreaterThan(15);
    expect(texto).not.toMatch(/\b40\d\b|\b50\d\b|undefined|null|Error:/);
    return texto;
  };

  it('pedir el enlace: cada fallo tiene su frase', () => {
    expect(util(mensajeDeRecuperacion(new ApiError(400, 'x')))).toMatch(/formato/i);
    expect(util(mensajeDeRecuperacion(new ApiError(429, 'x')))).toMatch(/intentos/i);
    expect(util(mensajeDeRecuperacion(new NetworkError('POST', '/auth/forgot-password', new Error('sin red'))))).toMatch(/conexión|conectar/i);
    expect(util(mensajeDeRecuperacion(new ApiResponseError('POST', '/auth/forgot-password', { issues: [] } as never)))).toBeTruthy();
    expect(util(mensajeDeRecuperacion(new Error('x')))).toBeTruthy();
  });

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ GASTADO, CADUCADO E INVENTADO SON EL MISMO MENSAJE, Y ESTA BIEN.     │
   * │                                                                      │
   * │ Distinguirlos le diria a quien prueba tokens cual de ellos existio    │
   * │ alguna vez. El servidor los devuelve como el mismo 400 justamente     │
   * │ por eso, y la pantalla no puede saber mas que el servidor.            │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('restablecer: un enlace que no sirve se explica y se ofrece salida', () => {
    const texto = util(mensajeDeRestablecer(new ApiError(400, 'x')));
    expect(texto).toMatch(/ya no sirve/i);
    expect(texto).toMatch(/nuevo/i);
  });

  it('invitacion: 400 y 404 dicen lo mismo, que ya no sirve', () => {
    const a = mensajeDeRestablecer(new ApiError(400, 'x'));
    expect(a).toBe(mensajeDeRestablecer(new ApiError(400, 'y')));
    expect(util(mensajeDeInvitacion(new ApiError(400, 'x')))).toBe(
      mensajeDeInvitacion(new ApiError(404, 'y')),
    );
  });

  it('ninguna frase filtra el correo ni el token', () => {
    const conDatos = new ApiError(400, 'token abc123 de alguien@ejemplo.local no vale');
    for (const mensaje of [
      mensajeDeRecuperacion(conDatos),
      mensajeDeRestablecer(conDatos),
      mensajeDeInvitacion(conDatos),
    ]) {
      expect(mensaje).not.toContain('abc123');
      expect(mensaje).not.toContain('alguien@ejemplo.local');
    }
  });
});

/**
 * Que las cuatro capacidades existan DE VERDAD en la app, no solo en un modulo.
 *
 * Es la comprobacion que convierte «hay logica de recuperacion» en «un socio
 * puede recuperar su acceso desde el telefono».
 */
describe('las cuatro capacidades de PARITY-0 estan enchufadas', () => {
  const APP = join(__dirname, '..', '..', 'app');
  const leer = (fichero: string) =>
    readFileSync(join(APP, fichero), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*\/\/.*$/gm, ' ');

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ SE COMPRUEBA LA CADENA ENTERA, NO CADA ESLABON POR SU CUENTA.        │
   * │                                                                      │
   * │ Pantalla -> envoltorio -> `api.auth.*`. Las tres piezas pueden estar  │
   * │ bien y no estar ATADAS: es exactamente lo que paso con la lista del   │
   * │ entrenador, donde cada parte era correcta y aun asi la pantalla       │
   * │ equivocada aparecio en el iPhone.                                     │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  const REAL = readFileSync(join(__dirname, 'acceso-real.ts'), 'utf8');

  const cadena = (pantalla: string, envoltorio: string, metodo: string) => {
    expect(leer(pantalla), `${pantalla} debe llamar a ${envoltorio}`).toMatch(
      new RegExp(`\\b${envoltorio}\\(`),
    );
    expect(REAL, `acceso-real.ts debe llamar a api.auth.${metodo}`).toMatch(
      new RegExp(`api\\.auth\\.${metodo}\\(`),
    );
  };

  it('recuperar contraseña llega hasta `forgotPassword`', () => {
    cadena('recuperar.tsx', 'pedirEnlace', 'forgotPassword');
  });

  it('restablecer contraseña llega hasta `resetPassword`', () => {
    cadena('restablecer.tsx', 'restablecerClave', 'resetPassword');
  });

  it('la invitacion llega hasta `acceptInvitation` Y `linkInvitation`', () => {
    cadena('invitacion.tsx', 'aceptarInvitacion', 'acceptInvitation');
    cadena('invitacion.tsx', 'vincularInvitacion', 'linkInvitation');
  });

  it('ninguna de las tres llama a la API por su cuenta', () => {
    // Saltarse el envoltorio deja esa llamada fuera de la vista previa, y con
    // ella el estado que solo se puede ver simulando la respuesta.
    for (const pantalla of ['recuperar.tsx', 'restablecer.tsx', 'invitacion.tsx']) {
      expect(leer(pantalla), pantalla).not.toMatch(/api\.auth\./);
    }
  });

  /*
   * Una pantalla a la que no se llega no existe. Antes de PARITY-0 este enlace
   * abria el NAVEGADOR, que es justo lo que la paridad venia a quitar.
   */
  it('desde el login se llega a recuperar, y sin salir de la app', () => {
    const codigo = leer('entrar.tsx');
    expect(codigo).toMatch(/router\.push\(['"`]\/recuperar['"`]\)/);
    expect(codigo, 'ya no se abre el navegador').not.toMatch(/openURL|openBrowserAsync/);
  });

  it('restablecer cierra la sesion vieja con `revisar`', () => {
    // Cambiar la contraseña mata todas las sesiones, incluida la de este
    // telefono. Sin esto, la siguiente pantalla pediria datos con un token
    // muerto y rebotaria con un 401 que nadie esperaba.
    expect(leer('restablecer.tsx')).toMatch(/revisar\(\)/);
  });
});
