import { describe, expect, it } from 'vitest';
import type { DuesStatus, Member } from '@gymlab/contracts';
import { DUES_STATES } from '@gymlab/contracts';
import { lecturaDeCuota, lecturaDeCuotaParaPersonal } from '../cuota/lectura';
import {
  LETRAS_MINIMAS,
  datosDeLaFicha,
  debeBuscar,
  estaDeBaja,
  faseDeRespuesta,
  lineaDeSocio,
  nombreCompleto,
  siguePidiendose,
} from './logica';

function socio(parcial: Partial<Member> = {}): Member {
  return {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    memberNumber: 128,
    firstName: 'Nombre',
    lastName: 'Apellido',
    email: null,
    phone: null,
    birthDate: null,
    status: 'active',
    joinedAt: '2026-01-10',
    leftAt: null,
    hasAccount: false,
    ...parcial,
  } as Member;
}

/** Formateador de mentira: se comprueba QUE se formatea, no COMO. */
const fecha = (iso: string) => `[${iso}]`;

describe('cuando se busca y cuando no', () => {
  it('no se busca con menos de dos letras', () => {
    // Con una letra volveria medio gimnasio: una lista que no responde nada y
    // que ademas hay que traer entera mientras alguien sigue escribiendo.
    expect(debeBuscar('')).toBe(false);
    expect(debeBuscar('a')).toBe(false);
    expect(debeBuscar('   ')).toBe(false);
    expect(debeBuscar(' a ')).toBe(false);
  });

  it('a partir del minimo, si', () => {
    expect(debeBuscar('ab')).toBe(true);
    expect(debeBuscar('  ab  ')).toBe(true);
    expect(debeBuscar('12')).toBe(true);
    expect('ab').toHaveLength(LETRAS_MINIMAS);
  });
});

describe('las respuestas que llegan tarde se tiran', () => {
  it('la de la consulta vigente se pinta', () => {
    expect(siguePidiendose('fernandez', 'fernandez')).toBe(true);
  });

  /*
   * El caso que justifica que esto exista: se teclea «fern» y despues
   * «fernandez». Si la respuesta de «fern» llega la ultima y se pinta, en la
   * pantalla queda el resultado de una consulta que ya no esta escrita.
   */
  it('la de una consulta anterior NO', () => {
    expect(siguePidiendose('fern', 'fernandez')).toBe(false);
  });

  it('tampoco si mientras tanto se borro el campo', () => {
    expect(siguePidiendose('fern', '')).toBe(false);
  });
});

describe('de la respuesta del servidor a lo que se pinta', () => {
  it('con resultados, se listan y se dice el total', () => {
    const fase = faseDeRespuesta({ items: [socio()], total: 9 }, 'ape');
    expect(fase).toEqual({ tipo: 'resultados', socios: [socio()], total: 9 });
  });

  /*
   * Cero resultados no es una lista vacia: es una respuesta. Se distingue para
   * poder decir «no hay nadie con ese nombre» en vez de dejar un hueco que
   * parece que la pantalla se ha roto.
   */
  it('sin resultados, se dice con la consulta que se hizo', () => {
    expect(faseDeRespuesta({ items: [], total: 0 }, 'zzz')).toEqual({
      tipo: 'sinResultados',
      consulta: 'zzz',
    });
  });
});

describe('como se resume un socio en una fila', () => {
  it('el numero va SIEMPRE, aunque se haya buscado por nombre', () => {
    // Es lo que desempata cuando dos personas se llaman igual.
    expect(lineaDeSocio(socio({ memberNumber: 7 }))).toEqual({
      titulo: 'Nombre Apellido',
      detalle: 'nº 7',
    });
  });

  it('y se avisa si esta de baja', () => {
    expect(lineaDeSocio(socio({ status: 'inactive' })).detalle).toBe('nº 128 · de baja');
    expect(estaDeBaja(socio({ status: 'inactive' }))).toBe(true);
    expect(estaDeBaja(socio())).toBe(false);
  });

  it('el nombre no arrastra espacios sueltos', () => {
    expect(nombreCompleto(socio({ firstName: 'Ana', lastName: '' }))).toBe('Ana');
  });
});

describe('la ficha enseña lo que hay y nada mas', () => {
  it('sin correo, telefono ni fecha de nacimiento, esos campos NO aparecen', () => {
    // Un «Teléfono: —» no informa de nada y ensucia la ficha.
    const datos = datosDeLaFicha(socio(), fecha);
    const etiquetas = datos.map((d) => d.etiqueta);
    expect(etiquetas).toEqual(['Número de socio', 'Alta']);
  });

  it('con todos los campos, salen todos y las fechas se formatean', () => {
    const datos = datosDeLaFicha(
      socio({
        email: 'alguien@ejemplo.local',
        phone: '600 000 000',
        birthDate: '1992-04-18',
        leftAt: '2026-07-01',
        status: 'inactive',
      }),
      fecha,
    );
    expect(datos.map((d) => d.etiqueta)).toEqual([
      'Número de socio',
      'Correo',
      'Teléfono',
      'Fecha de nacimiento',
      'Alta',
      'Baja',
    ]);
    // Las fechas civiles pasan por el formateador; el numero no.
    expect(datos.find((d) => d.etiqueta === 'Alta')?.valor).toBe('[2026-01-10]');
    expect(datos.find((d) => d.etiqueta === 'Número de socio')?.valor).toBe('128');
  });

  it('NO se cuela nada que el endpoint no traiga', () => {
    /*
     * La ficha del Panel movil responde «quien es». Notas internas, historial
     * de accesos o entrenador asignado son OTRAS peticiones y otras decisiones
     * de privacidad: si alguien las añade aqui, este test lo dice.
     */
    const etiquetas = datosDeLaFicha(socio({ email: 'a@b.local', phone: '1' }), fecha).map(
      (d) => d.etiqueta,
    );
    for (const prohibida of ['Notas', 'Entrenador', 'Accesos', 'Pagos', 'Cuenta']) {
      expect(etiquetas, prohibida).not.toContain(prohibida);
    }
  });
});

function cuota(parcial: Partial<DuesStatus>): DuesStatus {
  return {
    estado: 'AL_CORRIENTE',
    puedeAcceder: true,
    diasRestantes: 12,
    hasta: '2026-09-25',
    planName: 'Mensual',
    ...parcial,
  } as DuesStatus;
}

describe('la cuota, contada a quien atiende el mostrador', () => {
  it('hay texto para los SEIS estados del contrato', () => {
    for (const estado of DUES_STATES) {
      const lectura = lecturaDeCuotaParaPersonal(cuota({ estado }));
      expect(lectura.explicacion.trim().length, estado).toBeGreaterThan(10);
      expect(lectura.titulo.trim().length, estado).toBeGreaterThan(0);
    }
  });

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ EL DEL SOCIO ESTA EN SEGUNDA PERSONA. EL DEL PERSONAL, NO.          │
   * │                                                                      │
   * │ «Tu cuota está pagada» delante de la ficha de otra persona no es solo │
   * │ raro: es incorrecto. Este test es el que impide que alguien reutilice │
   * │ el texto del socio en el Panel por ahorrarse seis frases.            │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('NUNCA tutea al socio: no habla de «tu» cuota', () => {
    for (const estado of DUES_STATES) {
      const texto = lecturaDeCuotaParaPersonal(cuota({ estado })).explicacion;
      expect(texto, estado).not.toMatch(/\bTu\b|\btu\b|\btienes\b|\bpuedes\b/);
    }
  });

  it('y el del socio SI lo hace: son dos textos distintos a proposito', () => {
    const delSocio = DUES_STATES.map((estado) => lecturaDeCuota(cuota({ estado })).explicacion);
    const delPersonal = DUES_STATES.map(
      (estado) => lecturaDeCuotaParaPersonal(cuota({ estado })).explicacion,
    );
    for (const [i, estado] of DUES_STATES.entries()) {
      expect(delSocio[i], estado).not.toBe(delPersonal[i]);
    }
  });

  it('el titulo y el tono SI se comparten: el semaforo es uno solo', () => {
    // Si divergieran, un dia el socio veria «Vencida» donde recepcion ve
    // «Al corriente», y el que estaria mal seria uno de los dos.
    for (const estado of DUES_STATES) {
      const socioLo = lecturaDeCuota(cuota({ estado }));
      const personalLo = lecturaDeCuotaParaPersonal(cuota({ estado }));
      expect(personalLo.titulo, estado).toBe(socioLo.titulo);
      expect(personalLo.tono, estado).toBe(socioLo.tono);
    }
  });
});
