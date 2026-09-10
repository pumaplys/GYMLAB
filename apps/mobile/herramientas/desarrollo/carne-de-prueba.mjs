import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Un carné de verdad, en PNG, para dárselo a la cámara del emulador.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL TOKEN NO SE INVENTA NI SE IMPRIME.                                    │
 * │                                                                          │
 * │ Sale de `POST /me/access/token` de la API LOCAL, con la sesion de un      │
 * │ socio del fixture: es el mismo token firmado que genera la pantalla del   │
 * │ carne en el telefono. Un texto inventado lo rechazaria la firma, y        │
 * │ entonces el escaner solo probaria el camino del error.                    │
 * │                                                                          │
 * │ No se escribe en la salida: va directo al PNG. Lo unico que se cuenta es  │
 * │ cuantos caracteres tiene y a que socio pertenece.                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 *   node herramientas/desarrollo/carne-de-prueba.mjs [salida.png]
 *
 * Las credenciales salen de `apps/web/auditoria/credenciales.local.json`, que
 * esta en .gitignore y lo crea la auditoria del panel.
 */
const AQUI = dirname(fileURLToPath(import.meta.url));
const MOVIL = resolve(AQUI, '..', '..');
const RAIZ = resolve(MOVIL, '..', '..');
const CREDENCIALES = join(RAIZ, 'apps', 'web', 'auditoria', 'credenciales.local.json');
const API = 'http://localhost:3001/v1';

/** El mismo cerrojo de siempre: esto no habla con produccion. */
if (!API.startsWith('http://localhost:')) {
  throw new Error(`la API tiene que ser local y es ${API}`);
}

const fixture = JSON.parse(readFileSync(CREDENCIALES, 'utf8'));
const socia = fixture.cuentas.member;

const entrada = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: socia.email, password: socia.clave }),
});
if (!entrada.ok) throw new Error(`no se pudo entrar como socia: ${entrada.status}`);
const { token: sesion } = await entrada.json();

const carne = await fetch(`${API}/me/access/token`, {
  method: 'POST',
  headers: { authorization: `Bearer ${sesion}`, 'content-type': 'application/json' },
});
if (!carne.ok) throw new Error(`no se pudo generar el carne: ${carne.status}`);
const { token, ttlSeconds } = await carne.json();

const salida = process.argv[2] ?? join(MOVIL, '.expo', 'carne.png');
const QRCode = createRequire(join(MOVIL, 'package.json'))('qrcode');

/*
 * Grande, con mucho margen y en blanco y negro puro: la camara virtual del
 * emulador mete el poster en una escena 3D con perspectiva y luz, asi que el
 * codigo llega peor que en una pantalla. `errorCorrectionLevel: 'H'` recupera
 * hasta un 30 % ilegible, que es justo lo que se pierde por el camino.
 */
await QRCode.toFile(salida, token, {
  errorCorrectionLevel: 'H',
  margin: 4,
  width: 1400,
  color: { dark: '#000000ff', light: '#ffffffff' },
});

console.log(`Carne de ${socia.email.split('@')[0]} escrito en ${salida}`);
console.log(`Token de ${token.length} caracteres, valido ${ttlSeconds} s. No se imprime.`);
