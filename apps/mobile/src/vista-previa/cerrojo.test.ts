import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { esDeDesarrollo } from '../api/config';

/**
 * Que la vista previa no pueda volver a hablar con produccion.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTO NO ES HIPOTETICO. PASO EL 2026-09-07, DURANTE PARITY-0B.           │
 * │                                                                          │
 * │ Una exportacion de la vista previa perdio `EXPO_PUBLIC_VISTA_PREVIA=1`   │
 * │ al encadenarse detras de las de iOS y Android. Sin esa variable las      │
 * │ fuentes de muestra se eliminan por codigo muerto y la pantalla llama a   │
 * │ la API de verdad. Y `expo export` produce un paquete de RELEASE, donde   │
 * │ `esDeDesarrollo` rechaza —bien— la IP privada del `.env` y cae al        │
 * │ dominio de produccion.                                                   │
 * │                                                                          │
 * │ Llego un `POST /v1/auth/forgot-password` a produccion. No se envio       │
 * │ correo, porque Better Auth no invoca `sendResetPassword` si la cuenta    │
 * │ no existe, pero `recordAuthEvent` escribe siempre: quedo una fila de     │
 * │ auditoria. No se borra. Lo que se arregla es que no vuelva a pasar.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const HERRAMIENTA = join(__dirname, '..', '..', 'herramientas', 'vista-previa.mjs');
const codigo = readFileSync(HERRAMIENTA, 'utf8');

describe('la herramienta pone las dos variables por su cuenta', () => {
  /*
   * La variable NO puede depender de que quien llame se acuerde. Ese fue
   * exactamente el fallo: la orden encadenada se la comio.
   */
  it('activa la vista previa dentro de la propia herramienta', () => {
    expect(codigo).toMatch(/EXPO_PUBLIC_VISTA_PREVIA:\s*'1'/);
  });

  it('y apunta la API a un dominio que no puede existir', () => {
    expect(codigo).toMatch(/EXPO_PUBLIC_API_URL:\s*API_IMPOSIBLE/);
    expect(codigo).toContain("API_IMPOSIBLE = 'https://vista-previa.invalid/v1'");
  });
});

/**
 * El cerrojo de verdad, y por que este y no otro.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `.invalid` ESTA RESERVADO POR EL RFC 2606 PARA QUE NO RESUELVA NUNCA.    │
 * │                                                                          │
 * │ Con esta URL, aunque manana alguien anada una pantalla y se olvide de su │
 * │ fuente `.web.ts`, su peticion no tiene a donde ir. La vista previa falla │
 * │ cerrada en vez de salir a Internet.                                      │
 * │                                                                          │
 * │ Y tiene que ser HTTPS: `esDeDesarrollo` descarta todo lo que no lo sea,  │
 * │ y en un paquete de release lo descartado se sustituye por PRODUCCION.    │
 * │ Poner aqui `http://localhost` seria repetir el accidente.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe('por que ese dominio y no localhost', () => {
  const IMPOSIBLE = 'https://vista-previa.invalid/v1';

  it('en un paquete de release se usa tal cual, sin caer a produccion', () => {
    expect(esDeDesarrollo(IMPOSIBLE)).toBe(false);
  });

  /*
   * Las alternativas que parecen mas naturales y que HABRIAN vuelto a mandar
   * las peticiones a produccion en un paquete de release.
   *
   * Van las versiones HTTPS ademas de las HTTP a proposito: sin `https`, la
   * comprobacion se resuelve en la primera linea de `esDeDesarrollo` —«no es
   * https, fuera»— y no llega a mirar el host. Con solo las HTTP, este test
   * seguiria verde aunque alguien borrara la regla de las IP privadas. Lo
   * descubrio la falsificacion, no la revision.
   */
  it('las alternativas evidentes si habrian caido a produccion', () => {
    for (const tentadora of [
      'http://localhost:3001/v1',
      'https://localhost:3001/v1',
      'http://127.0.0.1:3001/v1',
      'https://127.0.0.1:3001/v1',
      'http://192.168.1.130:3001/v1',
      'https://192.168.1.130:3001/v1',
      'https://10.0.0.5/v1',
    ]) {
      expect(esDeDesarrollo(tentadora), tentadora).toBe(true);
    }
  });
});

describe('la herramienta se niega a servir un paquete sin vista previa', () => {
  /*
   * Construir no basta: hay que MIRAR el resultado. Si el minificador se
   * llevo por delante las fuentes de muestra, el paquete parece correcto y
   * habla con la API. La comprobacion es lo unico que lo distingue.
   */
  it('comprueba la marca dentro del paquete y falla si no esta', () => {
    expect(codigo).toContain(`MARCA_DE_MUESTRA = "get('vista')"`);
    expect(codigo).toMatch(/if \(!paquete\.includes\(MARCA_DE_MUESTRA\)\)[\s\S]{0,200}throw new Error/);
  });

  it('y comprueba tambien a donde apunta la API', () => {
    expect(codigo).toMatch(/if \(!paquete\.includes\(API_IMPOSIBLE\)\)[\s\S]{0,160}throw new Error/);
  });

  it('las dos comprobaciones se ejecutan, no solo se declaran', () => {
    // Una funcion que nadie llama no protege de nada.
    expect(codigo).toMatch(/^comprobar\(\);$/m);
  });
});
