import { describe, expect, it } from 'vitest';
import { problemasDeEntorno } from './env';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ QUE PASA SI SE OLVIDA UNA VARIABLE AL DESPLEGAR.                         │
 * │                                                                          │
 * │ Casi todo tiene un valor por defecto comodo para desarrollo que apunta a │
 * │ `localhost` por HTTP. El riesgo no es que sea incomodo: es que un        │
 * │ despliegue con esos valores ARRANCA, responde 200 y parece sano.         │
 * │                                                                          │
 * │ Y no es rebuscado. El compose pasa `API_URL: ${DOMINIO}`; si esa         │
 * │ variable no esta en el `.env`, Compose la sustituye por cadena vacia,    │
 * │ que cuenta como ausente, y entra el default. De ahi deduce Better Auth   │
 * │ si la cookie de sesion lleva `Secure`.                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Se usa `problemasDeEntorno` en lugar de arrancar el proceso porque el modulo
 * valida al importarse: no hay forma de probar varias configuraciones distintas
 * dentro del mismo fichero de otro modo.
 */
const MINIMO = {
  DATABASE_URL_APP: 'postgresql://gymlab_app:x@postgres:5432/gymlab',
  AUTH_SECRET: 'a'.repeat(32),
  ACCESS_TOKEN_SECRET: 'b'.repeat(32),
  PLATFORM_INVITE_CODE: 'codigo-piloto',
};

const PRODUCCION = {
  ...MINIMO,
  NODE_ENV: 'production',
  API_URL: 'https://gymlabfit.tech',
  WEB_APP_URL: 'https://gymlabfit.tech',
  CORS_ORIGINS: 'https://gymlabfit.tech',
};

describe('entorno de produccion', () => {
  it('acepta una configuracion completa', () => {
    expect(problemasDeEntorno(PRODUCCION)).toEqual([]);
  });

  it('en desarrollo los valores por defecto siguen valiendo', () => {
    // Lo contrario romperia a cualquiera que clone el repositorio y arranque.
    expect(problemasDeEntorno(MINIMO)).toEqual([]);
  });

  it('rechaza produccion si falta DOMINIO y entra el localhost por defecto', () => {
    // Exactamente lo que produce Compose con `${DOMINIO}` sin definir.
    const problemas = problemasDeEntorno({ ...PRODUCCION, API_URL: '', WEB_APP_URL: '' });

    expect(problemas.join('\n')).toContain('API_URL');
    expect(problemas.join('\n')).toContain('WEB_APP_URL');
  });

  it('rechaza produccion por HTTP: de ahi sale el Secure de la cookie', () => {
    const problemas = problemasDeEntorno({ ...PRODUCCION, API_URL: 'http://gymlabfit.tech' });

    expect(problemas.join('\n')).toContain('API_URL');
  });

  it('rechaza un origen CORS local en produccion', () => {
    // Con `credentials: true`, un origen de confianza puede hacer peticiones
    // autenticadas contra el despliegue publico.
    const problemas = problemasDeEntorno({ ...PRODUCCION, CORS_ORIGINS: 'http://localhost:3000' });

    expect(problemas.join('\n')).toContain('CORS_ORIGINS');
  });

  it('no confunde un dominio publico que empieza por localhost', () => {
    // `esLocal` mira el HOST, no la cadena: `localhost.gymlabfit.tech` es un
    // dominio publico perfectamente valido.
    expect(
      problemasDeEntorno({ ...PRODUCCION, API_URL: 'https://localhost.gymlabfit.tech' }),
    ).toEqual([]);
  });
});
