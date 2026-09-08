import type { Member, Role } from '@gymlab/contracts';
import { createMemberSchema, updateMemberSchema } from '@gymlab/contracts';
import { describe, expect, it } from 'vitest';
import {
  ETIQUETA_BAJA_DE_CUOTA,
  ETIQUETA_BAJA_DE_SOCIO,
  ETIQUETA_ELIMINAR,
  altaAEnvio,
  datosDesde,
  edicionAEnvio,
  estaDeBaja,
  porQueNoSePuedeInvitar,
  sePuedeInvitar,
  seIntentoBorrarUnCampo,
} from './gestion';
import {
  puedeAnularPagos,
  puedeAtenderMostrador,
  puedeEditarPlanes,
  puedeEliminarSocio,
  puedeExportarDatos,
  puedeVerPlanes,
} from './permisos';

const socio = (parcial: Partial<Member>): Member => ({
  id: 'm1',
  memberNumber: 12,
  firstName: 'Lucía',
  lastName: 'Fernández',
  email: 'lucia@ejemplo.local',
  phone: '600 000 000',
  birthDate: '1992-04-18',
  status: 'active',
  joinedAt: '2026-01-10',
  leftAt: null,
  hasAccount: false,
  ...parcial,
});

describe('dar de alta a un socio', () => {
  it('con lo minimo: nombre y apellidos', () => {
    const envio = altaAEnvio({
      firstName: '  Lucía ',
      lastName: ' Fernández ',
      email: '',
      phone: '',
      birthDate: '',
    });
    expect(envio).toEqual({ firstName: 'Lucía', lastName: 'Fernández' });
    expect(createMemberSchema.safeParse(envio).success).toBe(true);
  });

  /*
   * Vacio NO es cadena vacia: el contrato declara estos tres opcionales y `''`
   * lo rechaza por formato. Mandarlos vacios dejaria el alta imposible sin
   * que la pantalla supiera decir por que.
   */
  it('los opcionales vacios NO viajan', () => {
    const envio = altaAEnvio({
      firstName: 'A',
      lastName: 'B',
      email: '   ',
      phone: '  ',
      birthDate: '',
    });
    expect(envio).not.toHaveProperty('email');
    expect(envio).not.toHaveProperty('phone');
    expect(envio).not.toHaveProperty('birthDate');
  });

  it('y los que tienen valor van recortados', () => {
    const envio = altaAEnvio({
      firstName: 'A',
      lastName: 'B',
      email: ' lucia@ejemplo.local ',
      phone: ' 600 000 000 ',
      birthDate: '1992-04-18',
    });
    expect(envio.email).toBe('lucia@ejemplo.local');
    expect(createMemberSchema.safeParse(envio).success).toBe(true);
  });

  it('sin nombre no pasa, y lo rechaza el contrato, no una regla nuestra', () => {
    const envio = altaAEnvio({
      firstName: '  ',
      lastName: 'B',
      email: '',
      phone: '',
      birthDate: '',
    });
    expect(createMemberSchema.safeParse(envio).success).toBe(false);
  });
});

describe('editar la ficha', () => {
  it('parte de lo que hay, con los nulos como casillas vacias', () => {
    expect(datosDesde(socio({ email: null, phone: null, birthDate: null }))).toEqual({
      firstName: 'Lucía',
      lastName: 'Fernández',
      email: '',
      phone: '',
      birthDate: '',
    });
  });

  it('el envio pasa el contrato de actualizacion', () => {
    const envio = edicionAEnvio(datosDesde(socio({})));
    expect(updateMemberSchema.safeParse(envio).success).toBe(true);
  });

  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ VACIAR UNA CASILLA QUE TENIA VALOR NO LA BORRA, Y HAY QUE DECIRLO.   │
   * │                                                                      │
   * │ `updateMemberSchema` no admite `null`, asi que no hay forma de pedir  │
   * │ «quita el telefono». Si se callara, quien lo intenta guardaria, veria │
   * │ el dato ahi y no entenderia nada. El panel web avisa; aqui tambien.   │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('detecta que se ha vaciado un campo que tenia valor', () => {
    const antes = socio({ phone: '600 000 000' });
    expect(seIntentoBorrarUnCampo(antes, { ...datosDesde(antes), phone: '  ' })).toBe(true);
  });

  it('y NO se queja si el campo ya estaba vacio', () => {
    const antes = socio({ phone: null });
    expect(seIntentoBorrarUnCampo(antes, { ...datosDesde(antes), phone: '' })).toBe(false);
  });

  it('ni si simplemente se cambia por otro valor', () => {
    const antes = socio({ phone: '600 000 000' });
    expect(seIntentoBorrarUnCampo(antes, { ...datosDesde(antes), phone: '611' })).toBe(false);
  });
});

describe('invitar a la app', () => {
  it('se puede si no tiene cuenta y si tiene correo', () => {
    expect(sePuedeInvitar(socio({ hasAccount: false }))).toBe(true);
    expect(porQueNoSePuedeInvitar(socio({ hasAccount: false }))).toBeNull();
  });

  /*
   * Las dos condiciones las pone la realidad, no nosotros: al que ya tiene
   * cuenta el servidor lo rechaza, y al que no tiene correo no hay a donde
   * mandarle nada. Se dice el motivo en vez de esconder el boton sin mas.
   */
  it('si ya tiene cuenta, no; y se explica', () => {
    expect(sePuedeInvitar(socio({ hasAccount: true }))).toBe(false);
    expect(porQueNoSePuedeInvitar(socio({ hasAccount: true }))).toMatch(/ya tiene cuenta/i);
  });

  it('sin correo, tampoco; y tambien se explica', () => {
    expect(sePuedeInvitar(socio({ email: null }))).toBe(false);
    expect(sePuedeInvitar(socio({ email: '   ' }))).toBe(false);
    expect(porQueNoSePuedeInvitar(socio({ email: null }))).toMatch(/correo/i);
  });
});

describe('las tres bajas se llaman distinto', () => {
  /*
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ TRES COSAS QUE LA GENTE LLAMA IGUAL Y NO SON LA MISMA.               │
   * │                                                                      │
   * │ Baja del SOCIO: deja de poder entrar, se reactiva.                    │
   * │ Baja de la CUOTA: se cancela la suscripcion, sigue siendo socio.      │
   * │ ELIMINAR: se borra a la persona para siempre.                         │
   * │                                                                      │
   * │ El panel web tuvo que alargar una de las etiquetas porque en la misma │
   * │ pantalla habia dos botones iguales que hacian cosas distintas.        │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  it('ninguna etiqueta se parece a otra', () => {
    const todas = [ETIQUETA_BAJA_DE_SOCIO, ETIQUETA_BAJA_DE_CUOTA, ETIQUETA_ELIMINAR];
    expect(new Set(todas).size).toBe(3);
    // Y las dos bajas dicen DE QUE, no solo «dar de baja».
    expect(ETIQUETA_BAJA_DE_SOCIO).toMatch(/socio/i);
    expect(ETIQUETA_BAJA_DE_CUOTA).toMatch(/cuota/i);
    expect(ETIQUETA_ELIMINAR).toMatch(/siempre/i);
  });

  it('estar de baja se lee del estado, no del `leftAt`', () => {
    expect(estaDeBaja(socio({ status: 'inactive' }))).toBe(true);
    expect(estaDeBaja(socio({ status: 'active', leftAt: '2026-01-01' }))).toBe(false);
  });
});

describe('quien puede que', () => {
  const ROLES: Role[] = ['owner', 'receptionist', 'trainer', 'member'];

  it('el mostrador es de dueño y recepcion', () => {
    expect(ROLES.filter(puedeAtenderMostrador)).toEqual(['owner', 'receptionist']);
    expect(ROLES.filter(puedeVerPlanes)).toEqual(['owner', 'receptionist']);
  });

  /*
   * Las tres del dueño son irreversibles o tocan el historial economico:
   * llevarse los datos fuera, borrar a alguien para siempre y reescribir la
   * caja. Recepcion atiende todos los dias; estas tres no son de todos los dias.
   */
  it('exportar, eliminar, anular un pago y tocar los planes son del dueño', () => {
    for (const puede of [
      puedeExportarDatos,
      puedeEliminarSocio,
      puedeAnularPagos,
      puedeEditarPlanes,
    ]) {
      expect(ROLES.filter(puede)).toEqual(['owner']);
    }
  });

  it('el entrenador no atiende el mostrador', () => {
    expect(puedeAtenderMostrador('trainer')).toBe(false);
    expect(puedeVerPlanes('trainer')).toBe(false);
  });
});
