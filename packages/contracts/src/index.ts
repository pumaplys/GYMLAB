/**
 * @gymlab/contracts
 *
 * Fuente unica de verdad de los tipos del dominio. Lo que se define aqui lo
 * consumen la API, el panel web y la app movil, de modo que un cambio de campo
 * rompe la compilacion en los tres sitios a la vez, antes de desplegar.
 *
 * Fase 0: solo la estructura. El contenido llega en Fase 1.
 *
 * Organizacion prevista:
 *   src/common/     tipos transversales (paginacion, errores, ids)
 *   src/identity/   usuarios, roles, sesiones
 *   src/members/    socios
 *   src/staff/      entrenadores y recepcion
 *   src/billing/    planes y suscripciones
 *   src/training/   ejercicios y rutinas
 *   src/progress/   peso y medidas
 *   src/access/     tokens QR y eventos de acceso
 */

export const CONTRACTS_VERSION = '0.0.0' as const;

export * from './auth';
export * from './members';
export * from './trainers';
export * from './billing';
export * from './access';
export * from './training';
export * from './progress';
export * from './dashboard';
export * from './legal';
