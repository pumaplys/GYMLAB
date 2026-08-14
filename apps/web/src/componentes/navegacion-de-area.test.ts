import { describe, expect, it } from 'vitest';

/**
 * CUAL DE LOS DESTINOS SE MARCA COMO ACTIVO.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SE PRUEBA LA REGLA, NO EL COMPONENTE.                                    │
 * │                                                                          │
 * │ Lo fragil aqui no es como se pinta un subrayado: es la eleccion cuando   │
 * │ varios destinos encajan a la vez. Con `/entrenador`,                     │
 * │ `/entrenador/rutinas` y `/entrenador/ejercicios`, la regla ingenua       │
 * │ —"activo si la ruta empieza por su href"— marca DOS estando en rutinas,  │
 * │ porque todo empieza por `/entrenador`.                                   │
 * │                                                                          │
 * │ La regla real es "gana el prefijo mas largo", y eso se puede comprobar   │
 * │ sin navegador. La copia esta a proposito: extraer la funcion solo para   │
 * │ probarla obligaria a exportar un detalle interno del componente.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function activoPara(destinos: readonly string[], ruta: string): string | null {
  return destinos.reduce<string | null>((mejor, href) => {
    const coincide = ruta === href || ruta.startsWith(`${href}/`);
    if (!coincide) return mejor;
    return mejor === null || href.length > mejor.length ? href : mejor;
  }, null);
}

const ENTRENADOR = ['/entrenador', '/entrenador/rutinas', '/entrenador/ejercicios'] as const;
const PANEL = ['/socios', '/personal', '/planes'] as const;

describe('area de entrenador', () => {
  it('el indice se marca solo en el indice y en la ficha de socio', () => {
    expect(activoPara(ENTRENADOR, '/entrenador')).toBe('/entrenador');
    expect(activoPara(ENTRENADOR, '/entrenador/socio')).toBe('/entrenador');
  });

  it('en rutinas gana Rutinas, no el indice', () => {
    // El fallo que evita: con la regla por prefijo simple, "Mis socios"
    // tambien saldria marcado porque `/entrenador/rutinas` empieza por
    // `/entrenador`. Dos destinos activos a la vez.
    expect(activoPara(ENTRENADOR, '/entrenador/rutinas')).toBe('/entrenador/rutinas');
    expect(activoPara(ENTRENADOR, '/entrenador/rutinas/ficha')).toBe('/entrenador/rutinas');
  });

  it('en ejercicios gana Ejercicios', () => {
    expect(activoPara(ENTRENADOR, '/entrenador/ejercicios')).toBe('/entrenador/ejercicios');
  });

  it('nunca hay mas de un destino activo', () => {
    const rutas = [
      '/entrenador',
      '/entrenador/socio',
      '/entrenador/rutinas',
      '/entrenador/rutinas/ficha',
      '/entrenador/ejercicios',
    ];
    for (const ruta of rutas) {
      const ganador = activoPara(ENTRENADOR, ruta);
      const cuantos = ENTRENADOR.filter((h) => h === ganador).length;
      expect(cuantos, `"${ruta}" no marca exactamente uno`).toBe(1);
    }
  });
});

describe('la misma regla sirve para el panel', () => {
  it('la ficha y el alta marcan Socios', () => {
    expect(activoPara(PANEL, '/socios')).toBe('/socios');
    expect(activoPara(PANEL, '/socios/ficha')).toBe('/socios');
    expect(activoPara(PANEL, '/socios/nuevo')).toBe('/socios');
  });

  it('personal y planes se marcan solos', () => {
    expect(activoPara(PANEL, '/personal')).toBe('/personal');
    expect(activoPara(PANEL, '/planes')).toBe('/planes');
  });

  it('una ruta de otra area no marca nada', () => {
    expect(activoPara(PANEL, '/entrenador')).toBeNull();
    expect(activoPara(ENTRENADOR, '/socios')).toBeNull();
  });
});
