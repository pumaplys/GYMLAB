import type { DuesStatus } from '@gymlab/contracts';
import { describe, expect, it } from 'vitest';
import { diasEnPalabras, lecturaDe, requiereAtencion } from './cuota-logica';

/**
 * COMO SE LE CUENTA AL SOCIO EL ESTADO DE SU CUOTA.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LO QUE ESTAS PRUEBAS PROTEGEN ES QUE NO SE INVENTE NINGUN ESTADO.        │
 * │                                                                          │
 * │ El servidor calcula `estado` con el huso horario del gimnasio y sus dias │
 * │ de cortesia, los dos configurables. Si la pantalla dedujera algo a       │
 * │ partir de `hasta`, un socio en otro pais veria un estado distinto del    │
 * │ que aplica su torno — y el equivocado seria el de la pantalla.           │
 * │                                                                          │
 * │ Aqui solo se comprueba la traduccion: que los seis estados reales tengan │
 * │ texto, y que ninguno diga al socio que haga algo que no puede hacer.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const cuota = (parcial: Partial<DuesStatus>): DuesStatus => ({
  estado: 'AL_CORRIENTE',
  puedeAcceder: true,
  diasRestantes: 20,
  hasta: '2026-09-30',
  planName: 'Mensual',
  ...parcial,
});

describe('los seis estados que el backend puede devolver', () => {
  const TODOS: DuesStatus['estado'][] = [
    'AL_CORRIENTE',
    'POR_VENCER',
    'EN_GRACIA',
    'VENCIDA',
    'PAUSADA',
    'SIN_SUSCRIPCION',
  ];

  it('todos tienen lectura: ninguno cae en un hueco', () => {
    // Si el backend anade un estado, esto deja de compilar antes que de pasar:
    // el `switch` es exhaustivo sobre el tipo del contrato.
    for (const estado of TODOS) {
      const lectura = lecturaDe(cuota({ estado }));
      expect(lectura.titulo.length).toBeGreaterThan(0);
      expect(lectura.explicacion.length).toBeGreaterThan(0);
    }
  });

  it('ninguno promete pagar desde la aplicacion', () => {
    // Hoy no se puede pagar en GYMLAB. Un "renueva aqui" seria un boton que no
    // existe, asi que se manda al gimnasio, que es lo que de verdad resuelve.
    for (const estado of TODOS) {
      const texto = lecturaDe(cuota({ estado })).explicacion.toLowerCase();
      expect(texto).not.toMatch(/paga aqui|renueva aqui|pulsa para pagar/);
    }
  });

  it('al corriente se lee como algo bueno', () => {
    expect(lecturaDe(cuota({ estado: 'AL_CORRIENTE' })).tono).toBe('exito');
  });

  it('vencida se lee como algo que hay que resolver', () => {
    const lectura = lecturaDe(cuota({ estado: 'VENCIDA', puedeAcceder: false }));
    expect(lectura.tono).toBe('peligro');
    expect(lectura.explicacion).toContain('gimnasio');
  });

  it('en gracia dice que ya vencio, no que este al corriente', () => {
    // Es el estado mas facil de contar mal: puede entrar, pero la cuota vencio.
    // Decirle "todo bien" seria mentirle hasta el dia que no le abra la puerta.
    const lectura = lecturaDe(cuota({ estado: 'EN_GRACIA', puedeAcceder: true }));
    expect(lectura.explicacion.toLowerCase()).toContain('vencid');
  });

  it('el titulo distingue los estados SIN depender del color', () => {
    // Quien no distingue rojo de verde tiene que poder leerlo igual.
    const titulos = TODOS.map((estado) => lecturaDe(cuota({ estado })).titulo);
    expect(new Set(titulos).size).toBe(TODOS.length);
  });
});

describe('los dias, dichos como se dicen', () => {
  it('en singular y en plural', () => {
    expect(diasEnPalabras(cuota({ diasRestantes: 12 }))).toBe('Quedan 12 dias');
    expect(diasEnPalabras(cuota({ diasRestantes: 1 }))).toBe('Queda 1 dia');
  });

  it('hoy no son "0 dias"', () => {
    expect(diasEnPalabras(cuota({ diasRestantes: 0 }))).toBe('Vence hoy');
  });

  it('vencida no dice "quedan -3 dias"', () => {
    // Es lo que sale de pintar el numero tal cual, y no lo dice nadie.
    expect(diasEnPalabras(cuota({ diasRestantes: -1 }))).toBe('Vencio ayer');
    expect(diasEnPalabras(cuota({ diasRestantes: -3 }))).toBe('Vencio hace 3 dias');
  });

  it('sin cuota no se cuenta nada', () => {
    expect(
      diasEnPalabras(cuota({ estado: 'SIN_SUSCRIPCION', diasRestantes: null, hasta: null })),
    ).toBeNull();
  });
});

describe('que merece atencion', () => {
  it('lo que impide entrar, y tambien lo que va a impedirlo', () => {
    expect(requiereAtencion(cuota({ estado: 'AL_CORRIENTE' }))).toBe(false);
    expect(requiereAtencion(cuota({ estado: 'POR_VENCER' }))).toBe(true);
    expect(requiereAtencion(cuota({ estado: 'EN_GRACIA' }))).toBe(true);
    expect(requiereAtencion(cuota({ estado: 'VENCIDA', puedeAcceder: false }))).toBe(true);
    expect(requiereAtencion(cuota({ estado: 'PAUSADA', puedeAcceder: false }))).toBe(true);
  });

  it('se apoya en `puedeAcceder`, que es el atajo que ya da el servidor', () => {
    // Enumerar estados aqui significaria olvidarse del proximo que se anada.
    expect(requiereAtencion(cuota({ estado: 'AL_CORRIENTE', puedeAcceder: false }))).toBe(true);
  });
});
