import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Me } from '@gymlab/contracts';
import type { EstadoDeSesion } from '../auth/estado';
import { DESTINOS_DE_TABS, RUTAS, destinoDe, puedeEntrarEnTabs } from './destinos';

const GIMNASIO = '11111111-1111-4111-8111-111111111111';

const YO: Me = {
  user: {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Lucia Fernandez',
    email: 'socia@ejemplo.local',
    emailVerified: true,
    isPlatformAdmin: false,
  },
  activeGymId: GIMNASIO,
  memberships: [{ gymId: GIMNASIO, gymName: 'Gimnasio Vista', role: 'member' }],
} as Me;

/** Un ejemplar de CADA estado. Si aparece uno nuevo, esta lista deja de compilar. */
const TODOS: Record<EstadoDeSesion['tipo'], EstadoDeSesion> = {
  cargando: { tipo: 'cargando' },
  sinSesion: { tipo: 'sinSesion' },
  autenticado: { tipo: 'autenticado', yo: YO, gymId: GIMNASIO },
  rolNoAdmitido: { tipo: 'rolNoAdmitido', yo: YO },
  requiereSeleccionGimnasio: {
    tipo: 'requiereSeleccionGimnasio',
    yo: YO,
    opciones: YO.memberships,
  },
  errorAlComprobar: { tipo: 'errorAlComprobar', motivo: 'red' },
};

describe('quien entra en las pestañas', () => {
  it('autenticado entra', () => {
    expect(puedeEntrarEnTabs(TODOS.autenticado)).toBe(true);
    expect(destinoDe(TODOS.autenticado)).toBe(RUTAS.inicio);
  });

  it('sin sesion NO entra: va a entrar', () => {
    expect(puedeEntrarEnTabs(TODOS.sinSesion)).toBe(false);
    expect(destinoDe(TODOS.sinSesion)).toBe(RUTAS.entrar);
  });

  it('rol no admitido NO entra: no se le dice que las credenciales fallan', () => {
    expect(puedeEntrarEnTabs(TODOS.rolNoAdmitido)).toBe(false);
    expect(destinoDe(TODOS.rolNoAdmitido)).toBe(RUTAS.noAdmitido);
  });

  it('la seleccion de gimnasio sigue interceptando', () => {
    expect(puedeEntrarEnTabs(TODOS.requiereSeleccionGimnasio)).toBe(false);
    expect(destinoDe(TODOS.requiereSeleccionGimnasio)).toBe(RUTAS.elegirGimnasio);
  });

  it('un error recuperable NO entra y NO manda a entrar', () => {
    // Si mandara a entrar, un 500 pediria la contrasena otra vez.
    expect(puedeEntrarEnTabs(TODOS.errorAlComprobar)).toBe(false);
    expect(destinoDe(TODOS.errorAlComprobar)).toBe(RUTAS.problema);
  });

  it('mientras carga no se redirige a ningun sitio', () => {
    expect(destinoDe(TODOS.cargando)).toBeNull();
    expect(puedeEntrarEnTabs(TODOS.cargando)).toBe(false);
  });

  it('SOLO autenticado llega a las pestañas; ninguno de los otros cinco', () => {
    for (const [tipo, estado] of Object.entries(TODOS)) {
      if (tipo === 'autenticado') continue;
      expect(puedeEntrarEnTabs(estado)).toBe(false);
      expect(destinoDe(estado)).not.toBe(RUTAS.inicio);
    }
  });
});

describe('los cinco destinos', () => {
  const DIRECTORIO = join(__dirname, '..', '..', 'app', '(tabs)');

  it('son exactamente cinco y en su orden', () => {
    expect(DESTINOS_DE_TABS.map((d) => d.nombre)).toEqual([
      'inicio',
      'rutina',
      'carne',
      'progreso',
      'perfil',
    ]);
  });

  it('el Carne va en el centro: se abre de pie delante de un torno', () => {
    expect(DESTINOS_DE_TABS[2]?.nombre).toBe('carne');
  });

  it('cada destino declarado TIENE su fichero de ruta', () => {
    const ficheros = readdirSync(DIRECTORIO);
    for (const { nombre } of DESTINOS_DE_TABS) {
      expect(ficheros).toContain(`${nombre}.tsx`);
    }
  });

  it('no hay rutas de pestaña de mas: el arbol y la barra dicen lo mismo', () => {
    // Sin esto, un fichero suelto en (tabs) se convierte en una sexta pestaña
    // sin que nadie lo haya decidido.
    const rutas = readdirSync(DIRECTORIO)
      .filter((f) => f.endsWith('.tsx') && !f.startsWith('_'))
      .map((f) => f.replace(/\.tsx$/, ''))
      .sort();
    expect(rutas).toEqual([...DESTINOS_DE_TABS.map((d) => d.nombre)].sort());
  });

  it('cada destino tiene etiqueta e icono, y los iconos no se repiten', () => {
    for (const d of DESTINOS_DE_TABS) {
      expect(d.etiqueta.length).toBeGreaterThan(0);
      expect(d.icono.length).toBeGreaterThan(0);
    }
    expect(new Set(DESTINOS_DE_TABS.map((d) => d.icono)).size).toBe(DESTINOS_DE_TABS.length);
  });

  it('ninguna pestaña es de propietario o entrenador', () => {
    // La app es del socio. Cobros, altas, fichas de otros y ajustes del
    // gimnasio son del panel web, y no deben aparecer aqui por descuido.
    const prohibidos = [
      'socios',
      'personal',
      'planes',
      'cobros',
      'facturacion',
      'ajustes',
      'configuracion',
      'admin',
      'gimnasio',
    ];
    for (const { nombre } of DESTINOS_DE_TABS) {
      expect(prohibidos).not.toContain(nombre);
    }
  });
});
