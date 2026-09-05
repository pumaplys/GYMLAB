import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La ortografia de lo que se VE, comprobada de una vez para toda la app.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LOS COMENTARIOS VAN SIN TILDE. LO QUE LEE UNA PERSONA, CON ELLA.        │
 * │                                                                          │
 * │ Es la convencion del repositorio, y hasta el barrido final se habia ido  │
 * │ perdiendo pantalla a pantalla: "Contrasena", "Cerrar sesion", "Buenos    │
 * │ dias", "El codigo ha caducado". Ninguna de esas es una preferencia de    │
 * │ estilo: son faltas de ortografia en la cara de quien paga el gimnasio.   │
 * │                                                                          │
 * │ Este test mira SOLO el texto visible —lo que hay entre dos etiquetas     │
 * │ JSX, las props de texto y las frases que devuelven los modulos de        │
 * │ lectura— y NUNCA los comentarios ni los identificadores. Por eso el      │
 * │ codigo se limpia de comentarios antes de mirarlo.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const RAIZ = join(__dirname, '..');

function ficheros(dir: string, salida: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!/node_modules|dist|\.expo/.test(e.name)) ficheros(p, salida);
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      salida.push(p);
    }
  }
  return salida;
}

/** Quita comentarios conservando las lineas, para que el numero siga valiendo. */
function sinComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const PROPS_DE_TEXTO =
  /(accessibilityLabel|accessibilityHint|placeholder|titulo|descriptor|etiqueta|mensaje)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

interface Visible {
  fichero: string;
  linea: number;
  texto: string;
}

const VISIBLES: Visible[] = [];
for (const f of [...ficheros(join(RAIZ, 'app')), ...ficheros(join(RAIZ, 'src'))]) {
  const rel = f.slice(RAIZ.length + 1).split('\\').join('/');
  /*
   * Los `*.web.ts` son los datos de MUESTRA de la vista previa: nombres de
   * ejercicios, notas del entrenador, conceptos de pago. No son la copy de la
   * app —no viajan al paquete nativo, y eso lo comprueba el gate de
   * aislamiento— y sus cadenas exactas estan fijadas ALLI. Cambiarlas aqui
   * romperia esa comprobacion sin mejorar nada que vea un socio.
   */
  if (rel.endsWith('.web.ts') || rel.endsWith('.web.tsx')) continue;
  const codigo = sinComentarios(readFileSync(f, 'utf8'));
  const linea = (i: number) => codigo.slice(0, i).split('\n').length;
  /*
   * `>...<` tambien atrapa codigo: `a > b`, `Math.min(...v); return (`. Una
   * frase para una persona no lleva punto y coma, ni llaves, ni parentesis,
   * ni flechas. Lo que las lleve es JavaScript y no se mira.
   */
  const esCodigo = (t: string) =>
    /[;{}()[\]=<>]|=>|\.\.\.|\|\||&&|\w\.\w/.test(t) ||
    // Rutas de import, modulos y claves: `../../src/componentes/boton`.
    /\//.test(t) ||
    /^[a-z@][a-z0-9@-]*$/.test(t);
  const anotar = (i: number, t: string) => {
    const texto = t.replace(/\s+/g, ' ').trim();
    if (!texto || esCodigo(texto)) return;
    // Una cadena suelta de una sola palabra no es una frase: "primario",
    // "portrait", "email-address". Se miran las que tienen al menos dos.
    if (!/\s/.test(texto) && !/[áéíóúñÁÉÍÓÚÑ¿¡]/.test(texto)) return;
    VISIBLES.push({ fichero: rel, linea: linea(i), texto });
  };

  for (const m of codigo.matchAll(/>([^<>{}]*[a-zA-Z][^<>{}]*)</g)) anotar(m.index, m[1] ?? '');
  for (const m of codigo.matchAll(PROPS_DE_TEXTO)) anotar(m.index, m[2] ?? m[3] ?? '');

  /*
   * Y TODA cadena que parezca una frase, venga de donde venga.
   *
   * La primera version de este test solo miraba el texto entre etiquetas y
   * las props, y se dejo fuera lo que vive dentro de {llaves}: los ternarios
   * —`visible ? 'Ocultar la contrasena' : ...`—, las plantillas —`quedan
   * ${dias} dias`— y las frases que devuelven los modulos de lectura. Ahi
   * quedaban once cadenas sin tilde que nadie habia visto.
   */
  for (const m of codigo.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) anotar(m.index, m[1] ?? '');
  /*
   * En una plantilla, las interpolaciones se sustituyen por una palabra
   * neutra en lugar de trocear la cadena. Partiendola, `quedan ${dias} dias`
   * daba "quedan" y "dias" sueltas, y una palabra suelta no se mira: la falta
   * se colaba entera. Sustituyendo queda "quedan N dias", que si es una frase.
   */
  for (const m of codigo.matchAll(/`([^`]*)`/g)) {
    anotar(m.index, (m[1] ?? '').replace(/\$\{[^}]*\}/g, 'N'));
  }
}

describe('la copy visible esta escrita en español', () => {
  it('hay texto que mirar (si esto falla, el extractor se ha roto)', () => {
    expect(VISIBLES.length).toBeGreaterThan(80);
  });

  /*
   * Formas que en el texto de ESTA app siempre llevan tilde. No se meten
   * ambiguas como "el/el", "mas/mas", "tu/tu" o "solo/solo": ahi la correcta
   * depende de la frase y un test no puede decidirlo.
   */
  const SIN_TILDE =
    /\b(contrasena|sesion|conexion|codigo|carne|aqui|asi|todavia|dias|despues|tambien|intentalo|recuperacion|informacion|medicion|ultima|ultimo|proxima|proximo|numero|mediciones nuevas sin|esta disponible|esperabamos|renuevala|version|pagina|metodo|articulo|minimo|maximo|grafico|metrica|boton|seccion|estan)\b/i;

  it('ninguna cadena visible se ha quedado sin tilde', () => {
    for (const v of VISIBLES) {
      expect(v.texto, `${v.fichero}:${v.linea}  ${v.texto}`).not.toMatch(SIN_TILDE);
    }
  });

  it('"Cerrar sesión" se escribe igual en las cuatro pantallas que lo ofrecen', () => {
    const donde = VISIBLES.filter((v) => /cerrar sesi/i.test(v.texto));
    expect(donde.length).toBeGreaterThanOrEqual(4);
    for (const v of donde) expect(v.texto, v.fichero).toBe('Cerrar sesión');
  });

  /*
   * `/me/accesses` devuelve ALLOW, WARN y DENY: llamar "entradas" a la lista
   * entera afirma que la persona paso, y en dos de los tres casos no paso.
   */
  it('accesos no llama "entradas" a la lista entera', () => {
    const accesos = VISIBLES.filter((v) => v.fichero === 'app/perfil/accesos.tsx');
    expect(accesos.length).toBeGreaterThan(3);
    for (const v of accesos) {
      expect(v.texto, `${v.linea}: ${v.texto}`).not.toMatch(/tus entradas/i);
    }
  });
});
