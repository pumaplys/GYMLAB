import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Que NINGUNA pantalla que pide datos se quede fuera de la politica de sesion.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTE TEST EXISTE PORQUE EL MISMO FALLO APARECIO TRES VECES.             │
 * │                                                                          │
 * │ Inicio lo tuvo y se corrigio en el hotfix #97. En el barrido final       │
 * │ seguian igual el Carne —en sus DOS peticiones— y la seleccion de         │
 * │ gimnasio: un 401 pintaba "El correo o la contraseña no son correctos",   │
 * │ que es el mensaje del LOGIN, en mitad de la app, con un boton de         │
 * │ reintentar que no podia funcionar y el token muerto en el telefono.      │
 * │                                                                          │
 * │ La lista de pantallas NO esta escrita a mano: se descubre leyendo el     │
 * │ directorio. Una pantalla nueva que capture un error entra sola en la     │
 * │ comprobacion, que es justo lo que fallo las tres veces.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const RAIZ = join(__dirname, '..', '..');

function pantallas(dir: string, salida: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) pantallas(p, salida);
    else if (e.name.endsWith('.tsx')) salida.push(p);
  }
  return salida;
}

const sinComentarios = (codigo: string) =>
  codigo
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const FICHEROS = pantallas(join(RAIZ, 'app')).map((f) => ({
  relativo: f.slice(RAIZ.length + 1).split('\\').join('/'),
  codigo: sinComentarios(readFileSync(f, 'utf8')),
}));

/*
 * La UNICA excepcion, y por que.
 *
 * En el login un 401 no es una sesion caducada: es que el correo o la
 * contraseña no valen, que es justo lo que hay que decir. Ahi `revisar()` no
 * tendria a donde llevar a nadie —ya se esta en la puerta— y borraria el
 * mensaje que la persona necesita leer.
 */
const FUERA = ['app/entrar.tsx'];

/** Las que capturan un fallo de una peticion. */
const CON_PETICION = FICHEROS.filter(
  (f) => /catch\s*\(/.test(f.codigo) && !FUERA.includes(f.relativo),
);

describe('la politica de sesion la usan TODAS las pantallas que piden datos', () => {
  it('hay pantallas que mirar', () => {
    expect(CON_PETICION.length).toBeGreaterThanOrEqual(8);
  });

  it('cada una pregunta con `laSesionYaNoVale`', () => {
    for (const { relativo, codigo } of CON_PETICION) {
      expect(codigo, relativo).toMatch(/laSesionYaNoVale\(/);
    }
  });

  it('cada `catch` de una peticion consulta la politica', () => {
    for (const { relativo, codigo } of CON_PETICION) {
      /*
       * Un `catch` que no pregunta por la sesion es exactamente el fallo que
       * tuvieron Inicio, Carne y la seleccion de gimnasio. Se mira el cuerpo
       * del catch hasta su cierre aproximado: basta con que la politica
       * aparezca dentro.
       */
      const bloques = codigo.split(/catch\s*\([^)]*\)\s*\{/).slice(1);
      for (const [i, bloque] of bloques.entries()) {
        expect(bloque.slice(0, 700), `${relativo} · catch #${i + 1}`).toMatch(
          /laSesionYaNoVale\(/,
        );
      }
    }
  });

  it('ninguna decide por su cuenta ni navega a mano al login', () => {
    for (const { relativo, codigo } of FICHEROS) {
      expect(codigo, relativo).not.toMatch(/clasificarError/);
      expect(codigo, relativo).not.toMatch(/borrarToken/);
      expect(codigo, relativo).not.toMatch(/router\.(replace|push)\(['"`]\/entrar/);
    }
  });
});
