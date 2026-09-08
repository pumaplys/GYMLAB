import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * El cerrojo que hace imposible que esta prueba toque produccion.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AQUI SE MUTA DE VERDAD. POR ESO SE COMPRUEBA ANTES, Y SE ABORTA.        │
 * │                                                                          │
 * │ El 2026-09-07 una vista previa acabo hablando con produccion porque una │
 * │ variable se perdio por el camino. La leccion no fue «poner mas cuidado»: │
 * │ fue que la comprobacion tiene que estar en el codigo y tiene que cortar. │
 * │                                                                          │
 * │ Cuatro condiciones, y basta con que falle una para que no se ejecute ni  │
 * │ una sola escritura:                                                      │
 * │                                                                          │
 * │   1. la API es exactamente `http://localhost:3001/v1`;                   │
 * │   2. `esDeDesarrollo` —la funcion de la app, no una copia— dice que si;  │
 * │   3. la base de datos del `.env` es `localhost:5432/gymlab`;             │
 * │   4. el dominio de produccion no aparece por ningun lado.                │
 * │                                                                          │
 * │ Y ademas `vigilarLaRed()` envuelve `fetch` y REVIENTA la peticion que    │
 * │ no vaya a localhost, para que ni un descuido posterior pueda salir.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const API_DE_DESARROLLO = 'http://localhost:3001/v1';
export const CONTENEDOR = 'gymlab-postgres';
export const BASE_DE_DESARROLLO = 'gymlab';
export const HOST_DE_DESARROLLO = 'localhost:5432';
const DOMINIO_DE_PRODUCCION = 'gymlabfit.tech';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..', '..', '..');

/**
 * Lee `.env` y devuelve lo que hace falta, SIN la contrasena.
 *
 * De `DATABASE_URL` solo se extrae `host:puerto/base`. La credencial no se
 * copia a ninguna variable, no se devuelve y no puede acabar en un informe.
 */
export function destinoDeLaBaseDeDatos(): string {
  const env = readFileSync(join(RAIZ, '.env'), 'utf8');
  const linea = env.split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
  if (!linea) throw new Error('no hay DATABASE_URL en .env');
  const despuesDeLaArroba = linea.slice('DATABASE_URL='.length).split('@').pop();
  if (!despuesDeLaArroba) throw new Error('DATABASE_URL no tiene la forma esperada');
  return despuesDeLaArroba.trim();
}

export function variableDelEntorno(nombre: string): string {
  const env = readFileSync(join(RAIZ, '.env'), 'utf8');
  const linea = env.split(/\r?\n/).find((l) => l.startsWith(`${nombre}=`));
  if (!linea) throw new Error(`no hay ${nombre} en .env`);
  return linea.slice(nombre.length + 1).trim();
}

/** Aborta si algo de esto no es el entorno de desarrollo de esta maquina. */
export function comprobarQueEsDesarrollo(apiUrl: string, esDeDesarrollo: (u: string) => boolean) {
  if (apiUrl !== API_DE_DESARROLLO) {
    throw new Error(`la app apunta a ${apiUrl} y no a ${API_DE_DESARROLLO}: no se muta nada`);
  }
  if (!esDeDesarrollo(apiUrl)) {
    throw new Error(`la propia app no reconoce ${apiUrl} como desarrollo: no se muta nada`);
  }
  if (apiUrl.includes(DOMINIO_DE_PRODUCCION)) {
    throw new Error('la API apunta al dominio de produccion: no se muta nada');
  }
  const destino = destinoDeLaBaseDeDatos();
  if (destino !== `${HOST_DE_DESARROLLO}/${BASE_DE_DESARROLLO}`) {
    throw new Error(`la base de datos es ${destino} y no la de desarrollo: no se muta nada`);
  }
  const base = consulta<{ d: string }>('select current_database() as d')[0]?.d;
  if (base !== BASE_DE_DESARROLLO) {
    throw new Error(`psql esta conectado a ${String(base)}: no se muta nada`);
  }
  return { apiUrl, destino };
}

/**
 * SQL contra la base de DESARROLLO, por el contenedor local.
 *
 * Va por `docker exec` a proposito: no hay cadena de conexion en juego, asi
 * que esta funcion no puede apuntar por accidente a otro servidor aunque
 * alguien cambie una variable.
 */
export function consulta<T>(sql: string): T[] {
  const salida = execFileSync(
    'docker',
    [
      'exec',
      CONTENEDOR,
      'psql',
      '-U',
      'gymlab',
      '-d',
      BASE_DE_DESARROLLO,
      '-At',
      '-c',
      `select coalesce(json_agg(t), '[]'::json)::text from (${sql}) t`,
    ],
    { encoding: 'utf8' },
  );
  return JSON.parse(salida.trim()) as T[];
}

/** Escrituras de PREPARACION y de RESTAURACION. Nunca la accion que se prueba. */
export function ejecutar(sql: string): void {
  execFileSync(
    'docker',
    ['exec', CONTENEDOR, 'psql', '-U', 'gymlab', '-d', BASE_DE_DESARROLLO, '-At', '-c', sql],
    { encoding: 'utf8' },
  );
}

/**
 * Envuelve `fetch` para que una peticion fuera de localhost no llegue a salir.
 *
 * Devuelve la lista de todo lo que se pidio: es la prueba, no una promesa.
 */
export function vigilarLaRed(): { peticiones: string[]; soltar: () => void } {
  const peticiones: string[] = [];
  const original = globalThis.fetch;
  const permitido = 'http://localhost:3001/';

  globalThis.fetch = ((entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entrada === 'string' ? entrada : entrada.toString();
    if (!url.startsWith(permitido)) {
      throw new Error(`peticion BLOQUEADA fuera de desarrollo: ${url}`);
    }
    peticiones.push(`${init?.method ?? 'GET'} ${url}`);
    return original(entrada, init);
  }) as typeof fetch;

  return { peticiones, soltar: () => (globalThis.fetch = original) };
}
