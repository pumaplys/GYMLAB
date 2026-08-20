/**
 * Que cuenta como PASS, WARN o FAIL — y que puede tumbar CI.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SEVERIDAD Y BLOQUEO SON DOS COSAS DISTINTAS.                             │
 * │                                                                          │
 * │ La severidad dice como de malo es. El bloqueo dice si main se pone rojo. │
 * │ Hoy hay fallos REALES que Design 2.0 va a arreglar en su fase: la        │
 * │ navegacion recortada es FAIL de verdad, y aun asi no puede tumbar CI     │
 * │ mientras D2 no la toque — o habriamos convertido documentar un problema  │
 * │ en romper la rama.                                                       │
 * │                                                                          │
 * │ Por eso cada regla lleva `cierraEn`: la fase que la convierte en         │
 * │ bloqueante. Hasta entonces informa. Es una fecha de caducidad escrita,   │
 * │ no una excepcion que se olvida.                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** Fases ya cerradas. Al cerrar D2, se anade aqui y sus reglas pasan a bloquear. */
export const FASES_CERRADAS = new Set(['D0']);

export const REGLAS = {
  rutaCarga: {
    titulo: 'La pantalla carga y tiene contenido',
    cierraEn: 'D0',
  },
  accionesPresentes: {
    titulo: 'Las acciones criticas siguen existiendo',
    cierraEn: 'D0',
  },
  accionesAusentes: {
    titulo: 'Lo que no debe existir, no existe',
    cierraEn: 'D0',
  },
  rolSinDestinosProhibidos: {
    titulo: 'Ningun rol recibe destinos que no le tocan',
    cierraEn: 'D0',
  },
  rutaActiva: {
    titulo: 'El destino actual se identifica en la navegacion',
    cierraEn: 'D0',
  },
  contraste: {
    titulo: 'Contraste WCAG AA',
    cierraEn: 'D0',
  },
  sinDesbordeHorizontal: {
    titulo: 'La pagina no se desplaza de lado',
    cierraEn: 'D0',
  },
  navegacionAlcanzable: {
    titulo: 'Ningun destino queda fuera del viewport',
    // Lo arregla el shell nuevo. Hasta D2, se informa.
    cierraEn: 'D2',
  },
  objetivosTactiles: {
    titulo: 'Controles de 44px o mas en tactil',
    // Las alturas por tipo de puntero entran en D1.
    cierraEn: 'D1',
  },
  nadaFueraDeVista: {
    titulo: 'Ningun control queda entero fuera del viewport',
    cierraEn: 'D2',
  },
};

/** Una regla bloquea CI cuando su fase ya se dio por cerrada. */
export const bloquea = (regla) => FASES_CERRADAS.has(REGLAS[regla].cierraEn);

/**
 * Evalua una pantalla medida y devuelve la lista de hallazgos.
 *
 * Cada hallazgo lleva su causa en texto: el informe tiene que poder leerse sin
 * abrir el codigo.
 */
export function evaluar({ medida, pantalla, viewport, areas }) {
  const hallazgos = [];
  const anota = (regla, estado, causa) => hallazgos.push({ regla, estado, causa });

  // --- la pantalla existe -------------------------------------------------
  const hayContenido = medida && medida.titulo !== null;
  const textos = (medida?.acciones ?? []).join(' | ');
  anota(
    'rutaCarga',
    hayContenido || (medida?.acciones?.length ?? 0) > 0 ? 'PASS' : 'FAIL',
    hayContenido ? '' : 'sin <h1> ni controles: la pantalla no llego a montarse',
  );

  // --- inventario funcional ----------------------------------------------
  const faltan = (pantalla.acciones ?? []).filter(
    (a) => !medida?.acciones?.some((t) => t.toLowerCase().includes(a.toLowerCase())),
  );
  anota(
    'accionesPresentes',
    faltan.length === 0 ? 'PASS' : 'FAIL',
    faltan.length ? `no aparecen: ${faltan.join(', ')}` : '',
  );

  const sobran = (pantalla.ausentes ?? []).filter((a) =>
    medida?.acciones?.some((t) => t.toLowerCase() === a.toLowerCase()),
  );
  anota(
    'accionesAusentes',
    sobran.length === 0 ? 'PASS' : 'FAIL',
    sobran.length ? `aparecen y no deberian: ${sobran.join(', ')}` : '',
  );

  // --- navegacion ---------------------------------------------------------
  const destinos = medida?.destinos ?? [];
  const prohibidos = (areas?.prohibidos ?? []).filter((p) =>
    destinos.some((d) => d.href === p),
  );
  anota(
    'rolSinDestinosProhibidos',
    prohibidos.length === 0 ? 'PASS' : 'FAIL',
    prohibidos.length ? `se le ofrecen: ${prohibidos.join(', ')}` : '',
  );

  if (destinos.length > 0) {
    const fuera = destinos.filter((d) => !d.dentroDelViewport);
    anota(
      'navegacionAlcanzable',
      fuera.length === 0 ? 'PASS' : 'FAIL',
      fuera.length
        ? `${fuera.length} fuera de pantalla (${fuera.map((d) => d.texto).join(', ')}); recorte ${medida.navRecorte}px`
        : '',
    );

    const marcado = destinos.some((d) => d.activo);
    // Las subpantallas —fichas, editores— no marcan destino, y es correcto.
    const esRaiz = (areas?.alcanzables ?? []).includes(pantalla.ruta.split('?')[0]);
    anota(
      'rutaActiva',
      marcado || !esRaiz ? 'PASS' : 'FAIL',
      marcado || !esRaiz ? '' : 'ningun destino lleva aria-current="page"',
    );
  }

  // --- desbordes ----------------------------------------------------------
  anota(
    'sinDesbordeHorizontal',
    medida?.desbordaPagina ? 'FAIL' : 'PASS',
    medida?.desbordaPagina
      ? `culpables: ${(medida.culpables ?? []).map((c) => `${c.que}.${c.clase}`).join(', ') || 'sin identificar'}`
      : '',
  );

  const fueraDeVista = medida?.fueraDeVista ?? [];
  anota(
    'nadaFueraDeVista',
    fueraDeVista.length === 0 ? 'PASS' : 'FAIL',
    fueraDeVista.length
      ? `${fueraDeVista.length}: ${fueraDeVista.map((f) => f.nombre || f.que).join(', ')}`
      : '',
  );

  // --- objetivos tactiles -------------------------------------------------
  // En tactil es fallo; con raton es aviso, porque un panel denso con filas de
  // 36px sigue siendo perfectamente usable con puntero fino.
  const pequenos = medida?.pequenos ?? [];
  if (pequenos.length === 0) {
    anota('objetivosTactiles', 'PASS', '');
  } else {
    const minimo = Math.min(...pequenos.map((p) => p.h));
    anota(
      'objetivosTactiles',
      viewport.tactil ? 'FAIL' : 'WARN',
      `${pequenos.length} controles por debajo de 44px (el menor, ${minimo}px)`,
    );
  }

  // --- contraste ----------------------------------------------------------
  const flojos = medida?.contrasteFlojo ?? [];
  anota(
    'contraste',
    flojos.length === 0 ? 'PASS' : 'FAIL',
    flojos.length
      ? flojos.map((f) => `"${f.texto}" ${f.ratio}:1 (pide ${f.pide})`).slice(0, 3).join(' · ')
      : '',
  );

  return hallazgos;
}
