import type { Role } from '@gymlab/contracts';

/**
 * Quién configura la identidad legal del gimnasio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SOLO EL DUEÑO, Y NO ES UNA DECISION DE ESTA PANTALLA.                   │
 * │                                                                          │
 * │   LegalController            @Roles('owner')  en la CLASE                │
 * │   PrivacyDocumentController  @Roles('owner')  en la CLASE                │
 * │                                                                          │
 * │ Ninguno de los dos baja el rol en ningun metodo, asi que el `@Get` y el  │
 * │ `@Patch` heredan `owner` los dos. Recepcion no entra: quien figura como  │
 * │ responsable del tratamiento ante los socios es la empresa, y cambiarlo   │
 * │ no es operativa de mostrador.                                            │
 * │                                                                          │
 * │ En el panel web la pantalla vive en `/configuracion`, dentro del area    │
 * │ `panel` y ademas con `<RutaPrivada roles={['owner']}>`. Aqui pasa lo     │
 * │ mismo: el grupo `(panel)` deja entrar a recepcion, asi que esta pantalla │
 * │ comprueba el rol POR DENTRO, como hace retirar el acceso del personal.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function puedeConfigurarLoLegal(rol: Role): boolean {
  return rol === 'owner';
}

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LOS AJUSTES DEL GIMNASIO NO ENTRAN, Y NO ES UN RECORTE MOVIL.           │
 * │                                                                          │
 * │ `GymSettingsController` —dias de cortesia de las cuotas y meses de       │
 * │ retencion de accesos, `@Roles('owner')`— existe en la API, pero NINGUNA  │
 * │ pantalla del panel web lo usa y `@gymlab/api-client` ni siquiera tiene   │
 * │ modulo para el. La referencia de alcance del producto es la web.         │
 * │                                                                          │
 * │ Anadirlo solo aqui romperia la paridad en el sentido contrario: el movil │
 * │ tendria una capacidad que el panel no tiene. Si algun dia se activa, se  │
 * │ implementa en WEB y MOVIL a la vez.                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const AJUSTES_DEL_GIMNASIO_SON_SOLO_DE_API = true;
