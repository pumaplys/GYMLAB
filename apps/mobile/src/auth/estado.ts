/**
 * La maquina de estados de la sesion, sin React y sin red.
 *
 * Vive aparte del proveedor a proposito: son las decisiones que hay que poder
 * probar —y las que es facil equivocar— y no necesitan un componente montado
 * para comprobarse.
 */
import type { Me, Role } from '@gymlab/contracts';

/**
 * Las tres experiencias que caben en la misma app.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ES LA MISMA TABLA QUE EL PANEL WEB, Y ESO NO ES CASUALIDAD.             │
 * │                                                                          │
 * │ `apps/web/src/lib/areas.ts` reparte los mismos cuatro roles en las       │
 * │ mismas tres areas. Si aqui se decidiera otra cosa, la misma persona      │
 * │ acabaria en un sitio distinto segun abriera el movil o el navegador.     │
 * │                                                                          │
 * │ `Record<Role, Area>` obliga a que un rol NUEVO del contrato pase por     │
 * │ aqui: si se añadiera uno, esto deja de compilar en lugar de dejar a esa  │
 * │ gente sin sitio — o, peor, de colarla en el area de otro.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export type Area = 'socio' | 'panel' | 'entrenador';

export const AREA_DE_ROL: Record<Role, Area> = {
  member: 'socio',
  owner: 'panel',
  receptionist: 'panel',
  trainer: 'entrenador',
};

/**
 * Una membresia, derivada de `Me`.
 *
 * `@gymlab/contracts` no exporta el tipo suelto y NO se toca: esta bajo
 * freeze y no hace falta. Derivarlo del contrato que si exporta da
 * exactamente el mismo tipo y se mueve solo si el contrato se mueve.
 */
export type Membresia = Me['memberships'][number];

export type EstadoDeSesion =
  /** Todavia no sabemos: se esta leyendo el almacen o preguntando al servidor. */
  | { tipo: 'cargando' }
  /**
   * Hay sesion y hay gimnasio activo. `area` dice a cual de las tres
   * experiencias pertenece el rol que se tiene EN ESE gimnasio.
   */
  /*
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ EL `rol` VA ADEMAS DEL `area`, Y NO ES REDUNDANTE.                     │
   * │                                                                        │
   * │ Hasta PARITY-1 el area bastaba, porque area y permisos coincidian. Ya  │
   * │ no: `owner` y `receptionist` viven los dos en el area `panel`, y solo  │
   * │ el dueño puede tocar ejercicios y rutinas —lo dice la API, que exige   │
   * │ `@Roles('owner', 'trainer')` en todo el modulo de entrenamiento—.      │
   * │                                                                        │
   * │ El area dice DONDE vives. El rol dice QUE puedes hacer. Son la misma   │
   * │ cosa en tres de los cuatro roles y por eso se podia derivar una del    │
   * │ otro; en cuanto dejan de serlo, derivarla seria inventarse un permiso. │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  | { tipo: 'autenticado'; yo: Me; gymId: string; area: Area; rol: Role }
  /** No hay sesion, o la que habia ya no vale. */
  | { tipo: 'sinSesion' }
  /**
   * Hay sesion valida, pero esta cuenta no pertenece a ningun gimnasio.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │ YA NO SIGNIFICA "NO ERES SOCIO". SIGNIFICA "NO ERES DE NINGUN GIMNASIO".│
   * │                                                                        │
   * │ Cuando la app era solo del socio, aqui caia todo el personal. Ahora     │
   * │ owner, recepcion y entrenador tienen su area, y este estado queda para  │
   * │ lo que de verdad no tiene sitio: una cuenta de plataforma sin           │
   * │ pertenencias, o una a la que se le retiraron todas.                     │
   * │                                                                        │
   * │ Se conserva —en vez de borrarlo— porque ese caso EXISTE y porque un rol │
   * │ futuro tiene que caer en algun sitio conocido mientras no se le da uno. │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  | { tipo: 'rolNoAdmitido'; yo: Me }
  /**
   * La sesion no tiene gimnasio activo y hay que elegir.
   *
   * NO se elige aqui. Ver el comentario de `resolverAcceso`.
   */
  | { tipo: 'requiereSeleccionGimnasio'; yo: Me; opciones: readonly Membresia[] }
  /**
   * Se pudo leer el token pero no confirmar la sesion.
   *
   * NO borra el token. Es lo que separa "tu sesion ha caducado" de "el
   * servidor devuelve 500" o "no hay cobertura": en los dos ultimos casos la
   * sesion puede seguir siendo perfectamente valida.
   */
  | { tipo: 'errorAlComprobar'; motivo: MotivoDeError; status?: number };

export type MotivoDeError =
  /** No hubo respuesta: sin red, DNS, servidor caido. */
  | 'red'
  /** Hubo respuesta, y no fue un 401: 403, 404, 429, 5xx… */
  | 'servidor'
  /** Respondio 2xx pero el cuerpo no cumple el contrato. */
  | 'contrato';

/** Lo que puede pasar al intentar resolver la sesion. */
export type Resultado =
  | { clase: 'sinToken' }
  | { clase: 'yo'; yo: Me }
  /** SOLO un 401. */
  | { clase: 'sesionInvalida' }
  | { clase: 'errorDeRed' }
  | { clase: 'errorDelServidor'; status: number }
  | { clase: 'respuestaInvalida' };

/**
 * Los gimnasios entre los que puede elegir esta persona.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TODOS, NO SOLO AQUELLOS EN LOS QUE ES SOCIA.                            │
 * │                                                                          │
 * │ Antes esto filtraba `role === 'member'`, y era coherente con una app     │
 * │ que solo servia al socio. Ahora las tres areas viven aqui, asi que       │
 * │ filtrar dejaria fuera precisamente los gimnasios donde esa persona       │
 * │ trabaja.                                                                 │
 * │                                                                          │
 * │ Y el rol NO se mira en esta lista: se mira en el gimnasio que se elija.  │
 * │ Quien es socia en uno y entrenadora en otro cambia de area al cambiar de │
 * │ gimnasio, y eso solo funciona si la eleccion es previa al rol.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function gimnasiosDondePuedeEntrar(yo: Me): readonly Membresia[] {
  return yo.memberships;
}

/**
 * Que hacer con esta cuenta.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AQUI NO SE ELIGE GIMNASIO. NI SIQUIERA CUANDO SOLO HAY UNO.              │
 * │                                                                          │
 * │ La regla de seleccion automatica YA EXISTE y es del servidor:            │
 * │                                                                          │
 * │   auth.service.ts:200                                                    │
 * │   const activeGymId = propias.length === 1 ? propias[0].gymId : null;    │
 * │                                                                          │
 * │ Con UNA membresia el servidor la fija al entrar; con varias devuelve     │
 * │ null a proposito, porque adivinar cual quiere es peor que preguntar.     │
 * │                                                                          │
 * │ Si `activeGymId` viene a null, es que el servidor DECIDIO no elegir.     │
 * │ Elegir aqui seria inventar una segunda politica al lado de la suya —y    │
 * │ ademas una que el servidor no conoce, porque el rol se recalcula al      │
 * │ cambiar de gimnasio—. Se ofrece elegir y se llama a `switchGym`, que es  │
 * │ lo que ya hace el panel web.                                            │
 * │                                                                          │
 * │ El rol se mira SIEMPRE en el gimnasio activo, no "en la primera          │
 * │ membresia que haya": una misma persona puede ser socia de un gimnasio y  │
 * │ entrenadora de otro, y el modelo lo permite.                             │
 * │                                                                          │
 * │ Y el rol NO decide si se entra: decide A DONDE se entra. Es el cambio de │
 * │ STAFF-1. Antes, cualquier rol que no fuera `member` acababa en           │
 * │ `rolNoAdmitido`, y eso dejaba fuera de la app a todo el personal del     │
 * │ gimnasio — que tambien la necesita.                                      │
 * │                                                                          │
 * │ La traduccion de rol a area la hace `AREA_DE_ROL`, que es un             │
 * │ `Record<Role, Area>`: un rol NUEVO del contrato no compila hasta que     │
 * │ alguien decida su area. Eso conserva lo que protegia el `=== 'member'`   │
 * │ de antes —que nadie entre sin que se haya decidido— sin cerrarle la      │
 * │ puerta a quien ya tiene un sitio.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function resolverAcceso(yo: Me): EstadoDeSesion {
  const activa = yo.activeGymId
    ? yo.memberships.find((m) => m.gymId === yo.activeGymId)
    : undefined;

  // Hay gimnasio activo: manda su rol, y solo el suyo.
  if (activa) {
    return {
      tipo: 'autenticado',
      yo,
      gymId: activa.gymId,
      area: AREA_DE_ROL[activa.role],
      // El mismo rol del que sale el area, no otro leido en otra parte: dos
      // lecturas son dos politicas, y dos politicas acaban separandose.
      rol: activa.role,
    };
  }

  // Sin gimnasio activo y sin ninguna pertenencia: esta cuenta no es de
  // ningun gimnasio. Es el unico caso que se queda sin sitio.
  const donde = gimnasiosDondePuedeEntrar(yo);
  if (donde.length === 0) return { tipo: 'rolNoAdmitido', yo };

  // Pertenece a uno o a varios: que elija, y el area saldra del que elija.
  return { tipo: 'requiereSeleccionGimnasio', yo, opciones: donde };
}

/** De un resultado, un estado. Toda la politica de sesion en una funcion. */
export function decidirEstado(resultado: Resultado): EstadoDeSesion {
  switch (resultado.clase) {
    case 'sinToken':
    case 'sesionInvalida':
      return { tipo: 'sinSesion' };

    case 'errorDeRed':
      return { tipo: 'errorAlComprobar', motivo: 'red' };

    case 'errorDelServidor':
      return { tipo: 'errorAlComprobar', motivo: 'servidor', status: resultado.status };

    case 'respuestaInvalida':
      return { tipo: 'errorAlComprobar', motivo: 'contrato' };

    case 'yo':
      return resolverAcceso(resultado.yo);
  }
}

/**
 * Si hay que borrar el token guardado ante este resultado.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SOLO UN 401. NI 403, NI 429, NI 500, NI UN FALLO DE RED.                │
 * │                                                                          │
 * │ La primera version preguntaba "¿el error trae `status`?" y daba por      │
 * │ invalida la sesion en cuanto lo traia. Con eso, un 500 del servidor o un │
 * │ 429 por exceso de peticiones echaban de la app a alguien cuya sesion     │
 * │ seguia siendo perfectamente valida, y le obligaban a escribir la         │
 * │ contrasena otra vez por un problema que no era suyo.                     │
 * │                                                                          │
 * │ Quien decide que un token ya no vale es el servidor diciendo 401. Todo   │
 * │ lo demas se reintenta.                                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function debeBorrarToken(resultado: Resultado): boolean {
  return resultado.clase === 'sesionInvalida';
}
