'use client';

import type { ReactNode } from 'react';
import { Shell } from '@/componentes/shell';
import { DESTINOS_PANEL } from '@/lib/navegacion';
import { useSesion } from '@/lib/sesion';

/**
 * El marco del PANEL DE GIMNASIO: dueña y recepcion.
 *
 * Cajon en movil y no barra inferior. No es por gusto: el personal trabaja en
 * un mostrador con pantalla fija y el movil es el caso raro, mientras que el
 * socio abre la aplicacion de pie en la puerta. Copiar la barra del socio aqui
 * seria gastar los 44 px de abajo —el sitio mas valioso de un telefono— en
 * algo que casi nadie usa desde el telefono.
 *
 * Los destinos salen de `lib/navegacion`: los mismos para las tres formas.
 */
export function Marco({ children }: { children: ReactNode }) {
  const { rol } = useSesion();
  const visibles = DESTINOS_PANEL.filter((destino) => !destino.soloDueno || rol === 'owner');

  return (
    <Shell destinos={visibles} modoMovil="cajon">
      {children}
    </Shell>
  );
}
