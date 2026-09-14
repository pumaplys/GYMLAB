import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * LOS ASSETS DE LAS FICHAS DE TIENDA, GENERADOS Y NO DIBUJADOS A MANO.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LAS CAPTURAS SON DE VERDAD: SALEN DE LOS RECORRIDOS DE QA.              │
 * │                                                                          │
 * │ No son maquetas ni fotomontajes. Son las pantallas que Maestro fotografió│
 * │ recorriendo la app en el emulador contra la API local. Lo único que se   │
 * │ hace aquí es ajustarlas al formato que exige Google Play.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ 1080×2400 SE SALE DE LO QUE PLAY ADMITE, Y HABRÍA QUE DESCUBRIRLO EN EL │
 * │ RECHAZO.                                                                 │
 * │                                                                          │
 * │ Play exige que la proporción esté entre 1:2 y 2:1. Un móvil moderno da   │
 * │ 1080×2400, que es 1:2.22 — fuera por poco, y lo bastante poco como para  │
 * │ que nadie lo mire hasta que la ficha se rechaza.                          │
 * │                                                                          │
 * │ Se resuelve ENSANCHANDO, no recortando: recortar se comería la interfaz  │
 * │ por los lados. Se añaden bandas del color de fondo de la propia app      │
 * │ hasta 1200×2400, que es 1:2 exacto, y la captura se queda entera.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 *   node herramientas/assets-de-tienda.mjs <carpeta-de-capturas>
 *
 * Idempotente: vuelve a generar los mismos ficheros a partir de las mismas
 * fuentes. No publica nada.
 */
const AQUI = dirname(fileURLToPath(import.meta.url));
const MOVIL = resolve(AQUI, '..');
const DESTINO = join(MOVIL, 'tienda');

/*
 * Anclado al paquete que SI lo declara, igual que `sembrar.mjs` hace con `pg`:
 * `sharp` llega como dependencia de las herramientas de Metro de Expo, y pnpm
 * aisla los `node_modules`, asi que desde aqui no se resuelve solo.
 */
const require = createRequire(
  resolve(MOVIL, '..', '..', 'node_modules/.pnpm/@expo+metro-config@57.0.12__4d58efecb801c0ff780baeed1ef39305/node_modules/@expo/metro-config/package.json'),
);
let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error(
    'Falta `sharp`. Llega con las herramientas de Expo; si no está, este guion no puede\n' +
      'generar imágenes y NO se deben subir capturas sin ajustar.',
  );
  process.exit(2);
}

/** El fondo de la app. Las bandas laterales no pueden ser de otro color. */
const FONDO = '#0D0F12';
const ACENTO = '#A3FF12';

/**
 * Las ocho capturas de la ficha, en el orden en que cuentan el producto.
 *
 * Ocho es el máximo de Play y de sobra para Apple. El orden importa: la primera
 * es la que se ve sin desplazar, y tiene que decir qué es esto.
 */
const GUION = [
  ['socio-01-inicio.png', '01-socio-inicio'],
  ['socio-03-carne.png', '02-socio-carne'],
  ['escaner-03-pasa.png', '03-escaner-pasa'],
  ['dueno-01-panel.png', '04-panel'],
  ['dueno-03-ficha.png', '05-ficha-de-socio'],
  ['dueno-04-cuota.png', '06-cuota'],
  ['dueno-11-rutinas.png', '07-rutinas'],
  ['socio-08-privacidad.png', '08-privacidad'],
];

const origen = process.argv[2];
if (!origen || !existsSync(origen)) {
  console.error('Uso: node herramientas/assets-de-tienda.mjs <carpeta-de-capturas>');
  process.exit(2);
}

mkdirSync(join(DESTINO, 'capturas'), { recursive: true });

// ─── Capturas ────────────────────────────────────────────────────────────────
const disponibles = new Set(readdirSync(origen));
const hechas = [];
const faltan = [];

for (const [fuente, nombre] of GUION) {
  if (!disponibles.has(fuente)) {
    faltan.push(fuente);
    continue;
  }
  const entrada = readFileSync(join(origen, fuente));
  const ancho = entrada.readUInt32BE(16);
  const alto = entrada.readUInt32BE(20);

  // El ancho mínimo que deja la proporción dentro de 1:2.
  const anchoFinal = Math.max(ancho, Math.ceil(alto / 2));
  const margen = Math.floor((anchoFinal - ancho) / 2);

  await sharp(entrada)
    .extend({
      top: 0,
      bottom: 0,
      left: margen,
      right: anchoFinal - ancho - margen,
      background: FONDO,
    })
    .png()
    .toFile(join(DESTINO, 'capturas', `${nombre}.png`));

  hechas.push(`${nombre}.png  ${anchoFinal}x${alto}  (1:${(alto / anchoFinal).toFixed(2)})`);
}

// ─── Gráfico destacado de Google Play ────────────────────────────────────────
/*
 * 1024×500 exactos, y SIN texto pequeño: Play lo recorta y lo reescala en
 * varios sitios, así que lo que no se lea a tamaño de miniatura no sirve de
 * nada. Nombre, una línea, y el color de la marca.
 */
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500">
  <rect width="1024" height="500" fill="${FONDO}"/>
  <rect x="0" y="0" width="1024" height="6" fill="${ACENTO}"/>
  <text x="80" y="235" font-family="Arial, Helvetica, sans-serif" font-size="104"
        font-weight="700" fill="#FFFFFF" letter-spacing="6">RINDA</text>
  <text x="84" y="305" font-family="Arial, Helvetica, sans-serif" font-size="38"
        fill="${ACENTO}">Tu gimnasio, en el bolsillo</text>
  <text x="84" y="365" font-family="Arial, Helvetica, sans-serif" font-size="27"
        fill="#9AA3AD">Carné, rutina, cuotas y accesos. Cada quien ve lo suyo.</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(join(DESTINO, 'feature-graphic.png'));
writeFileSync(join(DESTINO, 'feature-graphic.svg'), svg);

// ─── Qué ha salido ───────────────────────────────────────────────────────────
console.log(`Assets en ${DESTINO}\n`);
console.log('capturas:');
for (const h of hechas) console.log(`  ${h}`);
if (faltan.length > 0) {
  console.log('\nNO ENCONTRADAS (la ficha queda incompleta):');
  for (const f of faltan) console.log(`  ${f}`);
}
console.log('\nfeature-graphic.png  1024x500');
console.log('\nNo se ha publicado nada.');
process.exit(faltan.length === 0 ? 0 : 1);
