import type { Role } from '@gymlab/contracts';

/**
 * Quien puede hacer que con ejercicios y rutinas.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTO NO DECIDE NADA: COPIA LO QUE YA DECIDIO LA API.                     │
 * │                                                                          │
 * │ El servidor rechaza por rol cada endpoint igualmente, y lo hace primero. │
 * │ Lo unico que se evita aqui es PINTAR un boton que la API va a rechazar,  │
 * │ que es la forma mas rapida de que alguien crea que la app esta rota.     │
 * │                                                                          │
 * │ Cada regla lleva escrito de donde sale. Si el servidor cambia y esto no, │
 * │ lo que se ve es un boton que da error — no un permiso de mas: el permiso │
 * │ real sigue estando donde estaba.                                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * El modulo entero de entrenamiento: `@Roles('owner', 'trainer')` en las
 * cuatro clases de `training.controller.ts`.
 *
 * Recepcion NO entra, y el comentario del controlador dice por que: «quien
 * decide como se entrena no es quien atiende el mostrador».
 */
export function puedeEntrenar(rol: Role): boolean {
  return rol === 'owner' || rol === 'trainer';
}

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ARCHIVAR NO SE FILTRA AQUI, Y ES DELIBERADO.                            │
 * │                                                                          │
 * │ El servidor lo permite al dueño siempre y al entrenador SOLO si creo la  │
 * │ rutina. Pero `routineSchema` no trae quien la creo: el cliente NO PUEDE  │
 * │ saberlo. Adivinarlo —«si soy entrenador, escondo el boton»— le quitaria  │
 * │ al entrenador el archivado de SUS PROPIAS rutinas, que es justo lo que   │
 * │ el servidor si le permite.                                               │
 * │                                                                          │
 * │ El panel web hace exactamente esto: ofrece Archivar y deja decidir al    │
 * │ servidor, enseñando su mensaje si dice que no. Es la misma decision, no  │
 * │ una version recortada. Ver `app/entrenador/rutinas/ficha/page.tsx`.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Lo unico que si se sabe sin preguntar es que una rutina YA archivada no se
 * vuelve a archivar, y eso no es un permiso: es su estado.
 */
export function tieneSentidoArchivar(estado: 'active' | 'archived'): boolean {
  return estado === 'active';
}

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ BORRAR UNA RUTINA NO ENTRA EN LA APP, Y NO ES UN RECORTE MOVIL.         │
 * │                                                                          │
 * │ El endpoint existe —`DELETE /gyms/:gymId/routines/:id`, solo dueño y     │
 * │ solo si nunca se asigno— pero `@gymlab/api-client` NO lo expone y el     │
 * │ panel web no lo ofrece en ninguna pantalla. La referencia de alcance de  │
 * │ producto es la web, asi que en movil tampoco.                            │
 * │                                                                          │
 * │ Y coincide con lo que dice el propio servicio: «Para retirar una rutina  │
 * │ en uso, archivala». La forma normal de retirar es archivar.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const BORRAR_RUTINA_NO_ESTA_EN_EL_PRODUCTO = true;

/**
 * Asignar y quitar una rutina a un socio.
 *
 * Los dos roles pueden; lo que el servidor comprueba ademas es DE QUIEN es el
 * socio: al entrenador le exige que sea suyo (`trainers.myMember`). Eso no se
 * replica aqui —seria adivinar— porque en el movil el entrenador solo llega a
 * la ficha de sus propios socios: la lista de la que sale es
 * `/me/trainer/members`.
 */
export function puedeAsignarRutinas(rol: Role): boolean {
  return puedeEntrenar(rol);
}

/** Crear, editar y borrar ejercicios: los dos roles, sin distincion. */
export function puedeEditarEjercicios(rol: Role): boolean {
  return puedeEntrenar(rol);
}
