/**
 * Que se visita, con que rol, y que tiene que seguir existiendo alli.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NADA DE CLASES CSS NI DE POSICIONES.                                     │
 * │                                                                          │
 * │ Lo que se comprueba es el NOMBRE VISIBLE de cada accion —el mismo que    │
 * │ lee una persona y el que anuncia un lector de pantalla—. Design 2.0 va a │
 * │ mover cajas, cambiar clases y reordenar pantallas: si estas pruebas se   │
 * │ atan a eso, se rompen en cada fase sin que nada este mal de verdad.      │
 * │                                                                          │
 * │ El texto tambien puede cambiar, y entonces la prueba falla — que es lo   │
 * │ que se quiere: cambiar el nombre de "Dar de baja la cuota" es una        │
 * │ decision de producto, no un efecto secundario de mover un div.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Los cuatro anchos, y por que estos.
 *
 * `tactil` no es lo mismo que estrecho: decide si `pointer: coarse` esta
 * activo, y por tanto si un objetivo pequeno es fallo o solo aviso. La tableta
 * cuenta como tactil aunque quepa una tabla.
 */
export const VIEWPORTS = [
  { nombre: 'movil', ancho: 375, alto: 812, tactil: true },
  { nombre: 'tableta', ancho: 768, alto: 1024, tactil: true },
  { nombre: 'compacto', ancho: 1024, alto: 768, tactil: false },
  { nombre: 'escritorio', ancho: 1440, alto: 900, tactil: false },
];

/**
 * Los destinos que cada rol DEBE poder alcanzar, y los que no le tocan.
 *
 * `prohibidos` no es una comprobacion de seguridad —esa la impone el servidor
 * y ya tiene 78 pruebas— sino de coherencia: ofrecer un destino que
 * respondería "esta seccion no es para tu rol" es un fallo de producto.
 */
export const AREAS = {
  owner: {
    alcanzables: ['/socios', '/personal', '/planes', '/accesos', '/configuracion'],
    prohibidos: [],
  },
  receptionist: {
    alcanzables: ['/socios', '/personal', '/accesos'],
    prohibidos: ['/planes', '/configuracion'],
  },
  trainer: {
    alcanzables: ['/entrenador', '/entrenador/rutinas', '/entrenador/ejercicios'],
    prohibidos: [],
  },
  member: {
    alcanzables: [
      '/socio',
      '/socio/rutina',
      '/socio/progreso',
      '/socio/carne',
      '/socio/pagos',
      '/socio/accesos',
      '/socio/privacidad',
    ],
    prohibidos: [],
  },
};

/**
 * Las pantallas que se auditan y lo que tiene que haber en cada una.
 *
 * `acciones` son nombres visibles que deben existir. `contiene` son textos que
 * deben aparecer en la pantalla —sirve para estados y datos, no para acciones—.
 */
export function pantallas(fixture) {
  const socio = fixture.socios[0].id;
  const rutinaActiva = fixture.rutinas[0].id;
  const rutinaArchivada = fixture.rutinas[3].id;

  return [
    // ------------------------------------------------------------- OWNER
    {
      rol: 'owner',
      ruta: '/socios',
      acciones: ['Nuevo socio', 'Buscar socios'],
      contiene: ['Socios'],
    },
    {
      rol: 'owner',
      ruta: `/socios/ficha?id=${socio}`,
      acciones: [
        'Editar',
        'Registrar pago',
        'Dar de baja la cuota',
        'Descargar sus datos',
        'Eliminar',
      ],
      contiene: ['Cuota', 'Pagos', 'Entrenador', 'Datos personales'],
      // La etiqueta que ya se degrado una vez (#78B) y tiene prueba propia.
      exactas: ['Dar de baja la cuota'],
    },
    {
      rol: 'owner',
      ruta: '/personal',
      // Las tres que importan: alta de personal, y las dos destructivas.
      acciones: ['Enviar invitacion', 'Retirar acceso', 'Revocar'],
      contiene: ['Personal'],
    },
    { rol: 'owner', ruta: '/planes', acciones: ['Crear plan'], contiene: ['Planes'] },
    {
      rol: 'owner',
      ruta: '/accesos',
      acciones: ['Encender la cámara'],
      contiene: ['Accesos'],
    },
    { rol: 'owner', ruta: '/configuracion', acciones: [], contiene: ['Configuración'] },

    // --------------------------------------------------------- RECEPCION
    { rol: 'receptionist', ruta: '/socios', acciones: ['Nuevo socio'], contiene: ['Socios'] },
    { rol: 'receptionist', ruta: '/accesos', acciones: [], contiene: ['Accesos'] },

    // --------------------------------------------------------- ENTRENADOR
    { rol: 'trainer', ruta: '/entrenador', acciones: [], contiene: ['Mis socios'] },
    {
      rol: 'trainer',
      ruta: '/entrenador/rutinas',
      acciones: ['Nueva rutina'],
      contiene: ['Rutinas'],
    },
    {
      rol: 'trainer',
      ruta: `/entrenador/rutinas/ficha?id=${rutinaActiva}`,
      acciones: ['Editar', 'Archivar'],
      contiene: ['Ejercicio'],
    },
    {
      rol: 'trainer',
      ruta: `/entrenador/rutinas/ficha?id=${rutinaArchivada}`,
      acciones: ['Editar'],
      contiene: ['Archivada'],
      // En V1 no se desarchiva: que no aparezca es parte del contrato de #78C.
      ausentes: ['Desarchivar', 'Restaurar', 'Archivar'],
    },
    {
      rol: 'trainer',
      ruta: `/entrenador/rutinas/editar?id=${rutinaActiva}`,
      acciones: ['Guardar cambios'],
      contiene: ['Editar'],
    },
    {
      rol: 'trainer',
      ruta: '/entrenador/ejercicios',
      acciones: ['Nuevo ejercicio'],
      contiene: ['Ejercicios'],
    },

    // -------------------------------------------------------------- SOCIO
    { rol: 'member', ruta: '/socio', acciones: [], contiene: ['Tu cuota'] },
    { rol: 'member', ruta: '/socio/rutina', acciones: [], contiene: [] },
    { rol: 'member', ruta: '/socio/carne', acciones: [], contiene: [] },
    { rol: 'member', ruta: '/socio/pagos', acciones: [], contiene: [] },
    { rol: 'member', ruta: '/socio/progreso', acciones: [], contiene: [] },
    { rol: 'member', ruta: '/socio/accesos', acciones: [], contiene: [] },
    { rol: 'member', ruta: '/socio/privacidad', acciones: [], contiene: [] },
  ];
}
