import type { Role } from '@gymlab/contracts';
import { describe, expect, it } from 'vitest';
import { AREA_DE_ROL, areaDeRuta, destinoSegunArea, inicioPara } from './areas';

/**
 * A DONDE VA CADA ROL, Y QUE PASA SI ESCRIBE OTRA URL A MANO.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTO NO PRUEBA SEGURIDAD, Y CONVIENE DECIRLO.                            │
 * │                                                                          │
 * │ El panel se sirve estatico: cualquiera puede descargar los ficheros y    │
 * │ saltarse estas comprobaciones. Lo que impide leer datos ajenos son las   │
 * │ cuatro barreras del servidor, y hay pruebas de backend que las cubren.   │
 * │                                                                          │
 * │ Lo que se prueba aqui es que la experiencia no sea absurda: que un       │
 * │ entrenador que teclea /socios acabe en su area y no en una pantalla      │
 * │ vacia, y que nada dependa de haber escondido un enlace.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const RUTAS_DEL_PANEL = ['/socios', '/socios/nuevo', '/socios/ficha', '/personal', '/planes'];

describe('a que area pertenece cada rol', () => {
  it('el dueno y recepcion trabajan en el panel', () => {
    expect(AREA_DE_ROL.owner).toBe('panel');
    expect(AREA_DE_ROL.receptionist).toBe('panel');
    expect(inicioPara('owner')).toBe('/socios');
    expect(inicioPara('receptionist')).toBe('/socios');
  });

  it('el entrenador y el socio tienen la suya', () => {
    expect(inicioPara('trainer')).toBe('/entrenador');
    expect(inicioPara('member')).toBe('/socio');
  });

  it('todos los roles del contrato tienen area', () => {
    // Si manana se anade un rol y nadie le da area, esto lo dice. El
    // `Record<Role, Area>` ya lo impone en compilacion; esto lo cubre tambien
    // en ejecucion, por si alguien lo ensancha a `Partial`.
    const roles: Role[] = ['owner', 'receptionist', 'trainer', 'member'];
    for (const rol of roles) {
      expect(AREA_DE_ROL[rol], `el rol "${rol}" no tiene area`).toBeDefined();
      expect(inicioPara(rol)).toMatch(/^\//);
    }
  });
});

describe('a que area pertenece cada ruta', () => {
  it('las del panel', () => {
    for (const ruta of RUTAS_DEL_PANEL) expect(areaDeRuta(ruta)).toBe('panel');
  });

  it('las de entrenador y socio, incluidas las futuras subrutas', () => {
    expect(areaDeRuta('/entrenador')).toBe('entrenador');
    expect(areaDeRuta('/entrenador/mis-socios')).toBe('entrenador');
    expect(areaDeRuta('/socio')).toBe('socio');
    expect(areaDeRuta('/socio/carne')).toBe('socio');
  });

  it('/socio y /socios son areas DISTINTAS', () => {
    // El parecido de los nombres es el fallo evidente de una comparacion por
    // prefijo mal escrita: `/socios` empieza por `/socio`.
    expect(areaDeRuta('/socio')).toBe('socio');
    expect(areaDeRuta('/socios')).toBe('panel');
    expect(areaDeRuta('/socios/nuevo')).toBe('panel');
  });

  it('las publicas no son de ningun area', () => {
    for (const ruta of ['/login', '/forgot-password', '/reset-password', '/accept-invitation']) {
      expect(areaDeRuta(ruta)).toBeNull();
    }
  });
});

describe('quien escribe a mano la URL de otra area', () => {
  it('el entrenador que abre el panel acaba en su area', () => {
    for (const ruta of RUTAS_DEL_PANEL) {
      expect(destinoSegunArea('trainer', ruta)).toBe('/entrenador');
    }
  });

  it('el socio que abre el panel o el area de entrenador acaba en la suya', () => {
    for (const ruta of [...RUTAS_DEL_PANEL, '/entrenador', '/entrenador/mis-socios']) {
      expect(destinoSegunArea('member', ruta)).toBe('/socio');
    }
  });

  it('el dueno y recepcion que abren areas ajenas vuelven al panel', () => {
    for (const rol of ['owner', 'receptionist'] as const) {
      expect(destinoSegunArea(rol, '/entrenador')).toBe('/socios');
      expect(destinoSegunArea(rol, '/socio')).toBe('/socios');
    }
  });

  it('en su propia area no se redirige a nadie', () => {
    expect(destinoSegunArea('owner', '/socios')).toBeNull();
    expect(destinoSegunArea('owner', '/planes')).toBeNull();
    expect(destinoSegunArea('receptionist', '/personal')).toBeNull();
    expect(destinoSegunArea('trainer', '/entrenador')).toBeNull();
    expect(destinoSegunArea('member', '/socio')).toBeNull();
  });

  it('las rutas sin area no redirigen nunca', () => {
    // `/login` y compania no exigen sesion, asi que tampoco rol. Redirigir
    // desde ahi dejaria a quien esta entrando dando vueltas.
    const roles: Role[] = ['owner', 'receptionist', 'trainer', 'member'];
    for (const rol of roles) {
      expect(destinoSegunArea(rol, '/login')).toBeNull();
      expect(destinoSegunArea(rol, '/reset-password')).toBeNull();
    }
  });

  it('el destino de una redireccion nunca vuelve a redirigir', () => {
    // Un ciclo aqui deja el navegador dando saltos sin llegar a pintar nada.
    const roles: Role[] = ['owner', 'receptionist', 'trainer', 'member'];
    for (const rol of roles) {
      const destino = inicioPara(rol);
      expect(destinoSegunArea(rol, destino), `"${destino}" redirige otra vez`).toBeNull();
    }
  });
});

describe('la misma cuenta con rol distinto en cada gimnasio', () => {
  /*
   * El caso que el backend ya cubre con una prueba: entrenadora en A y socia
   * en B. Aqui se comprueba la consecuencia en el frontend — que la decision
   * dependa SOLO del rol que se le pase, y no de nada del usuario.
   *
   * Es lo que hace que cambiar de gimnasio cambie de aplicacion: `sesion.tsx`
   * recalcula el rol desde la pertenencia activa y esta funcion responde otra
   * cosa con el mismo camino.
   */
  it('con el gimnasio de entrenadora activo, el panel la manda a /entrenador', () => {
    expect(destinoSegunArea('trainer', '/socios')).toBe('/entrenador');
    expect(destinoSegunArea('trainer', '/socio')).toBe('/entrenador');
  });

  it('con el gimnasio de socia activo, la MISMA ruta la manda a /socio', () => {
    expect(destinoSegunArea('member', '/socios')).toBe('/socio');
    expect(destinoSegunArea('member', '/entrenador')).toBe('/socio');
  });

  it('estando en /entrenador, cambiar al gimnasio donde es socia la saca de ahi', () => {
    // Antes del cambio esta en su sitio; despues, la misma ruta ya no es suya.
    expect(destinoSegunArea('trainer', '/entrenador')).toBeNull();
    expect(destinoSegunArea('member', '/entrenador')).toBe('/socio');
  });
});
