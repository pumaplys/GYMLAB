#!/usr/bin/env node
/**
 * D0 — RED DE SEGURIDAD DE DESIGN 2.0
 *
 * Mide el panel en cuatro anchos, con los cuatro roles, y dice que esta bien,
 * que es deuda conocida y que se ha roto.
 *
 * No cambia nada del producto: abre Chrome, mira y escribe un informe.
 *
 *   pnpm --filter @gymlab/web auditar              informe en pantalla
 *   pnpm --filter @gymlab/web auditar --guardar    ademas fija el baseline
 *   pnpm --filter @gymlab/web auditar --ci         solo bloqueantes; sale != 0 si fallan
 *
 * Necesita la API en marcha (por defecto http://localhost:3001) sirviendo el
 * panel, o `next dev` en el 3000 con `D0_WEB=http://localhost:3000`.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { abrirNavegador } from './navegador.mjs';
import { SONDA_PANTALLA, SONDA_LISTA, sondaAcciones, sondaEntrar } from './sondas.mjs';
import { AREAS, VIEWPORTS, pantallas } from './plan.mjs';
import { REGLAS, bloquea, evaluar } from './reglas.mjs';
import { obtenerFixture } from './sembrar.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const BASELINE = join(AQUI, 'baseline.json');
const CREDENCIALES = join(AQUI, 'credenciales.local.json');

const API = process.env.D0_API ?? 'http://localhost:3001';
const WEB = process.env.D0_WEB ?? API;

const guardar = process.argv.includes('--guardar');
const modoCi = process.argv.includes('--ci');

const log = (...a) => console.log(...a);
const COLOR = { PASS: '\x1b[32m', WARN: '\x1b[33m', FAIL: '\x1b[31m', reset: '\x1b[0m' };
const pinta = (estado) =>
  process.stdout.isTTY ? `${COLOR[estado]}${estado.padEnd(4)}${COLOR.reset}` : estado.padEnd(4);

async function main() {
  log('D0 — auditoria de la red de seguridad\n');
  log(`  API : ${API}`);
  log(`  WEB : ${WEB}`);

  const salud = await fetch(`${API}/health`).catch(() => null);
  if (!salud?.ok) {
    console.error(`\nLa API no responde en ${API}. Arrancala antes de auditar.`);
    process.exit(2);
  }

  const fixture = await obtenerFixture({ api: API, ficheroCredenciales: CREDENCIALES, log: (m) => log('  ' + m) });

  const nav = await abrirNavegador();
  log(`  navegador: ${nav.navegador}\n`);

  const lista = pantallas(fixture);
  let filas = [];

  /*
   * Los cuatro anchos, a la vez.
   *
   * Cada uno en su propio contexto de navegador —cookies separadas— porque si
   * no, entrar como entrenador en una pestana echaria a la duena de las otras
   * tres. Secuencial esto tardaba trece minutos y medio en CI y se comia el
   * limite del job; en paralelo cuesta lo que el ancho mas lento.
   */
  try {
    const porViewport = await Promise.all(
      VIEWPORTS.map(async (vp) => {
        const pestana = await nav.pestana({ contextoAislado: true });
        try {
          await pestana.viewport(vp.ancho, vp.alto, vp.tactil);
          // La sesion se establece desde una pagina del MISMO origen: la cookie
          // es httpOnly y SameSite=Lax, y no hay forma de inyectarla desde fuera.
          await pestana.ir(`${WEB}/login`);

          const suyas = [];
          let rolActual = null;
          for (const pantalla of lista) {
            if (pantalla.rol !== rolActual) {
              const cuenta = fixture.cuentas[pantalla.rol];
              const estado = await pestana.evaluar(sondaEntrar(API, cuenta.email, cuenta.clave));
              if (estado >= 400) {
                throw new Error(`No se pudo entrar como ${pantalla.rol}: ${estado}`);
              }
              rolActual = pantalla.rol;
            }

            await pestana.ir(`${WEB}${pantalla.ruta}`);
            await pestana.esperarA(SONDA_LISTA, 9000);
            // Y ademas se espera a lo que se va a comprobar: la ficha del socio
            // pinta cuota, pagos y entrenador en peticiones aparte, asi que
            // "hay texto" no significa "ha terminado". Si no aparece nunca,
            // salta el limite y el fallo es real, no una carrera.
            if (pantalla.acciones?.length) {
              await pestana.esperarA(sondaAcciones(pantalla.acciones), 9000);
            }
            const medida = await pestana.evaluar(SONDA_PANTALLA);

            suyas.push({
              rol: pantalla.rol,
              ruta: pantalla.ruta,
              viewport: vp.nombre,
              ancho: vp.ancho,
              hallazgos: evaluar({ medida, pantalla, viewport: vp, areas: AREAS[pantalla.rol] }),
              // Datos crudos que interesan para comparar antes/despues.
              metricas: {
                scrollAlto: medida?.scrollAlto ?? null,
                interactivos: medida?.interactivos ?? 0,
                pequenos: (medida?.pequenos ?? []).length,
                navRecorte: medida?.navRecorte ?? 0,
                tablaVisible: medida?.tablaVisible ?? null,
                filaAlto: medida?.filaAlto ?? null,
                tamanos: medida?.tamanos ?? [],
              },
            });
          }
          log(`  ${vp.nombre} (${vp.ancho}px) — ${lista.length} pantallas medidas`);
          return suyas;
        } finally {
          await pestana.cerrar().catch(() => {});
        }
      }),
    );
    filas = porViewport.flat();
  } finally {
    await nav.cerrar();
  }

  informe(filas);
  const resumen = contar(filas);

  if (guardar) {
    writeFileSync(
      BASELINE,
      JSON.stringify(
        { generado: new Date().toISOString(), resumen, filas },
        null,
        2,
      ) + '\n',
    );
    log(`\nBaseline escrito en ${BASELINE}`);
  } else if (existsSync(BASELINE)) {
    comparar(filas);
  }

  if (modoCi && resumen.bloqueantesFallando > 0) {
    console.error(
      `\nD0: ${resumen.bloqueantesFallando} comprobacion(es) bloqueante(s) en rojo.`,
    );
    process.exit(1);
  }
}

/** rol -> ruta -> viewport -> estado -> causa */
function informe(filas) {
  log('\n' + '='.repeat(78));
  log('INFORME');
  log('='.repeat(78));

  let rolPrevio = null;
  let rutaPrevia = null;

  for (const fila of filas.slice().sort(ordenar)) {
    if (fila.rol !== rolPrevio) {
      log(`\n${fila.rol.toUpperCase()}`);
      rolPrevio = fila.rol;
      rutaPrevia = null;
    }
    if (fila.ruta !== rutaPrevia) {
      log(`\n  ${fila.ruta}`);
      rutaPrevia = fila.ruta;
    }

    const malos = fila.hallazgos.filter((h) => h.estado !== 'PASS');
    const peor = malos.some((h) => h.estado === 'FAIL')
      ? 'FAIL'
      : malos.length
        ? 'WARN'
        : 'PASS';

    log(`    ${String(fila.ancho).padStart(4)}px  ${pinta(peor)}`);
    for (const h of malos) {
      const etiqueta = bloquea(h.regla) ? 'bloquea' : `deuda→${REGLAS[h.regla].cierraEn}`;
      log(`            ${pinta(h.estado)} ${REGLAS[h.regla].titulo} [${etiqueta}]`);
      if (h.causa) log(`                 ${h.causa}`);
    }
  }
}

const ORDEN_ROL = { owner: 0, receptionist: 1, trainer: 2, member: 3 };
const ordenar = (a, b) =>
  ORDEN_ROL[a.rol] - ORDEN_ROL[b.rol] ||
  a.ruta.localeCompare(b.ruta) ||
  a.ancho - b.ancho;

function contar(filas) {
  const porRegla = {};
  let bloqueantesFallando = 0;

  for (const fila of filas) {
    for (const h of fila.hallazgos) {
      porRegla[h.regla] ??= { PASS: 0, WARN: 0, FAIL: 0, bloquea: bloquea(h.regla) };
      porRegla[h.regla][h.estado]++;
      if (h.estado === 'FAIL' && bloquea(h.regla)) bloqueantesFallando++;
    }
  }

  log('\n' + '='.repeat(78));
  log('RESUMEN POR REGLA');
  log('='.repeat(78));
  for (const [regla, c] of Object.entries(porRegla)) {
    const etiqueta = c.bloquea ? 'BLOQUEA CI' : `deuda hasta ${REGLAS[regla].cierraEn}`;
    log(
      `  ${REGLAS[regla].titulo.padEnd(46)} ` +
        `${String(c.PASS).padStart(3)} pass  ${String(c.WARN).padStart(3)} warn  ` +
        `${String(c.FAIL).padStart(3)} fail   ${etiqueta}`,
    );
  }
  log(`\n  Bloqueantes en rojo: ${bloqueantesFallando}`);
  return { porRegla, bloqueantesFallando, filas: filas.length };
}

/** Compara con el baseline guardado y avisa solo de lo que ha EMPEORADO. */
function comparar(filas) {
  const previo = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const clave = (f, h) => `${f.rol}|${f.ruta}|${f.ancho}|${h.regla}`;
  const antes = new Map();
  for (const f of previo.filas) for (const h of f.hallazgos) antes.set(clave(f, h), h.estado);

  const peores = [];
  const mejores = [];
  const PESO = { PASS: 0, WARN: 1, FAIL: 2 };
  for (const f of filas) {
    for (const h of f.hallazgos) {
      const anterior = antes.get(clave(f, h));
      if (anterior === undefined || anterior === h.estado) continue;
      const linea = `${f.rol} ${f.ruta} @${f.ancho} — ${REGLAS[h.regla].titulo}: ${anterior} → ${h.estado}`;
      (PESO[h.estado] > PESO[anterior] ? peores : mejores).push(linea);
    }
  }

  log('\n' + '='.repeat(78));
  log(`COMPARACION CON EL BASELINE (${previo.generado})`);
  log('='.repeat(78));
  if (!peores.length && !mejores.length) log('  sin cambios');
  for (const l of mejores) log(`  ${COLOR.PASS}mejora${COLOR.reset}   ${l}`);
  for (const l of peores) log(`  ${COLOR.FAIL}regresa${COLOR.reset}  ${l}`);
}

main().catch((e) => {
  console.error('\nD0 se detuvo:', e.message);
  process.exit(2);
});
