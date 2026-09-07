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
 * Las excepciones, y por que. Son TODAS las pantallas de antes de la sesion.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SIN SESION, UN 401 NO ES UNA SESION CADUCADA.                           │
 * │                                                                          │
 * │ En el login es que el correo o la contraseña no valen. En recuperar y    │
 * │ restablecer, que el enlace ya no sirve. En la invitacion, que el token   │
 * │ se uso o caduco. En los cuatro casos `revisar()` no tendria a donde      │
 * │ llevar a nadie —ya se esta en la puerta— y borraria el mensaje que la    │
 * │ persona necesita leer.                                                   │
 * │                                                                          │
 * │ La lista se escribe A MANO justamente para que crezca despacio: cada     │
 * │ pantalla que entra aqui es una decision, y una pantalla CON sesion no    │
 * │ puede colarse sin que alguien lo note.                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const FUERA = [
  'app/entrar.tsx',
  'app/recuperar.tsx',
  'app/restablecer.tsx',
  'app/invitacion.tsx',
];

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

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ IR AL LOGIN POR DECISION PROPIA vs. IR AL LOGIN PORQUE ES LA VUELTA. │
   * │                                                                      │
   * │ La regla existe para que ninguna pantalla CON sesion mande a nadie a  │
   * │ la puerta por su cuenta: eso es una segunda politica de              │
   * │ autenticacion, y dos politicas se desincronizan. Quien decide que una │
   * │ sesion se acabo es `revisar()`.                                       │
   * │                                                                      │
   * │ En las pantallas de acceso, «Volver a entrar» es un enlace de         │
   * │ navegacion — el mismo que el panel web pinta como `<Link             │
   * │ href="/login">`— y no una decision sobre ninguna sesion, porque no    │
   * │ hay ninguna. Se exceptuan las MISMAS cuatro de arriba, no una lista   │
   * │ aparte: si una pantalla deja de ser publica, sale de las dos a la vez.│
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('ninguna decide por su cuenta ni navega a mano al login', () => {
    for (const { relativo, codigo } of FICHEROS) {
      expect(codigo, relativo).not.toMatch(/clasificarError/);
      expect(codigo, relativo).not.toMatch(/borrarToken/);
      if (FUERA.includes(relativo)) continue;
      expect(codigo, relativo).not.toMatch(/router\.(replace|push)\(['"`]\/entrar/);
    }
  });

  it('y las cuatro exceptuadas son exactamente las de antes de la sesion', () => {
    // Si alguien mete aqui una pantalla con sesion, este test lo dice.
    for (const relativo of FUERA) {
      const fichero = FICHEROS.find((f) => f.relativo === relativo);
      expect(fichero, `${relativo} no existe`).toBeDefined();
      // Ninguna de ellas puede leer la sesion para decidir que enseña de la
      // cuenta: como mucho, para saber si YA hay una.
      expect(fichero!.codigo, relativo).not.toMatch(/laSesionYaNoVale|estado\.yo\.memberships\.map/);
    }
  });
});
