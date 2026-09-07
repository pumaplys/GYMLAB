import { CabeceraDeVuelta } from './cabecera-de-vuelta';

/**
 * El encabezado de una pantalla apilada sobre Perfil.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ES `CabeceraDeVuelta` CON PERFIL FIJO. NADA MAS.                        │
 * │                                                                          │
 * │ Nacio con sus propios estilos cuando Perfil era la unica pila            │
 * │ secundaria de la app. En STAFF-FINAL aparecieron dos mas —la ficha del   │
 * │ socio en el Panel y la del asignado en el area del entrenador— que       │
 * │ necesitan exactamente lo mismo con otro destino.                         │
 * │                                                                          │
 * │ Se generaliza en vez de copiar los estilos una tercera vez: dos copias   │
 * │ de la misma cabecera acaban separandose, y entonces la app tiene dos     │
 * │ cabeceras que casi se parecen.                                           │
 * │                                                                          │
 * │ Lo que se pinta NO cambia: mismo boton, mismo carril, mismos tamaños.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Se conserva el nombre porque es el que usan las tres secciones de Perfil y
 * porque dice a que sirve: renombrarlas seria ruido en el historial sin
 * ninguna ganancia.
 */
export function CabeceraDeSubpantalla({
  titulo,
  descriptor,
}: {
  titulo: string;
  descriptor?: string;
}) {
  return (
    <CabeceraDeVuelta
      titulo={titulo}
      descriptor={descriptor}
      volverA="/perfil"
      etiquetaDeVuelta="Perfil"
    />
  );
}
