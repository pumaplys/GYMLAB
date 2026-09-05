import { describe, expect, it } from 'vitest';
import { esDeDesarrollo } from './config';

/**
 * La red de seguridad de la URL de la API.
 *
 * El caso real que la motiva: `.env` de este repositorio tiene la IP del PC en
 * la red local, `expo export` lo carga tambien al compilar para produccion, y
 * se comprobo mirando el paquete que la IP quedaba dentro. Un telefono fuera
 * de esa red no llega ahi.
 */
describe('que URL no puede usar un build de release', () => {
  it('la de produccion vale', () => {
    expect(esDeDesarrollo('https://gymlabfit.tech/v1')).toBe(false);
    expect(esDeDesarrollo('https://api.gymlabfit.tech/v1')).toBe(false);
  });

  it('una IP privada no vale, en las tres franjas', () => {
    expect(esDeDesarrollo('http://192.168.1.100:3001/v1')).toBe(true);
    expect(esDeDesarrollo('https://192.168.1.100:3001/v1')).toBe(true);
    expect(esDeDesarrollo('https://10.0.0.5/v1')).toBe(true);
    expect(esDeDesarrollo('https://172.16.4.4/v1')).toBe(true);
    expect(esDeDesarrollo('https://172.31.255.1/v1')).toBe(true);
  });

  it('172.32 ya es publica y no se bloquea de mas', () => {
    expect(esDeDesarrollo('https://172.32.0.1/v1')).toBe(false);
    expect(esDeDesarrollo('https://172.15.0.1/v1')).toBe(false);
  });

  it('localhost, .local, enlace local y ::1 tampoco valen', () => {
    expect(esDeDesarrollo('http://localhost:3001/v1')).toBe(true);
    expect(esDeDesarrollo('https://localhost:3001/v1')).toBe(true);
    expect(esDeDesarrollo('https://mi-mac.local/v1')).toBe(true);
    expect(esDeDesarrollo('https://169.254.1.1/v1')).toBe(true);
    expect(esDeDesarrollo('https://[::1]/v1')).toBe(true);
  });

  it('sin HTTPS no vale aunque el dominio sea el bueno', () => {
    expect(esDeDesarrollo('http://gymlabfit.tech/v1')).toBe(true);
  });

  it('lo que no es una URL tampoco vale', () => {
    expect(esDeDesarrollo('')).toBe(true);
    expect(esDeDesarrollo('gymlabfit.tech/v1')).toBe(true);
    expect(esDeDesarrollo('  ')).toBe(true);
  });
});
