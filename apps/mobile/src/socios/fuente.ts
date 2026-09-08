/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA VERSION NATIVA: NO HAY VISTA PREVIA. SON LAS LLAMADAS DE VERDAD.     │
 * │                                                                          │
 * │ Metro elige `fuente.web.ts` al compilar para web y ESTE fichero para iOS │
 * │ y Android. Ninguna ficha de muestra —ni un solo importe— se empaqueta en │
 * │ el binario.                                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export {
  actualizarPlanReal as actualizarPlan,
  actualizarSocioReal as actualizarSocio,
  anularPagoReal as anularPago,
  archivarPlanReal as archivarPlan,
  cargarCuotaDeSocioReal as cargarCuotaDeSocio,
  cargarPagosReal as cargarPagos,
  cargarPlanesReal as cargarPlanes,
  congelarCuotaReal as congelarCuota,
  crearPlanReal as crearPlan,
  crearSocioReal as crearSocio,
  darDeAltaCuotaReal as darDeAltaCuota,
  darDeBajaCuotaReal as darDeBajaCuota,
  darDeBajaSocioReal as darDeBajaSocio,
  eliminarSocioReal as eliminarSocio,
  exportarDatosReal as exportarDatos,
  invitarSocioReal as invitarSocio,
  reactivarSocioReal as reactivarSocio,
  registrarPagoReal as registrarPago,
  reanudarCuotaReal as reanudarCuota,
} from './fuente-real';
