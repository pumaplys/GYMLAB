/**
 * Lo que se mide DENTRO de la pagina.
 *
 * Todo esto viaja al navegador como texto y se ejecuta alli, asi que no puede
 * importar nada ni usar sintaxis que Chrome no entienda. A cambio, mide el
 * arbol de verdad —posiciones, tamanos y colores ya resueltos— y no una
 * simulacion: `jsdom` devolveria ceros en cada `getBoundingClientRect`, que es
 * justo el dato del que dependen casi todas las reglas.
 */

/**
 * Una sola pasada que devuelve todo lo medible de la pantalla.
 *
 * Se hace de golpe y no en varias llamadas para que todos los numeros
 * correspondan al MISMO instante del renderizado.
 */
export const SONDA_PANTALLA = `(() => {
  const doc = document.documentElement;
  const anchoVista = window.innerWidth;

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };

  // ---------------------------------------------------------------- color
  const canal = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const luminancia = (c) => 0.2126 * canal(c[0]) + 0.7152 * canal(c[1]) + 0.0722 * canal(c[2]);
  const aRgb = (s) => { const m = String(s).match(/[\\d.]+/g); return m ? m.slice(0, 3).map(Number) : null; };
  const opaco = (s) => { const m = String(s).match(/rgba?\\(([^)]+)\\)/); if (!m) return false; const p = m[1].split(','); return p.length < 4 || parseFloat(p[3]) > 0.95; };
  const fondoReal = (el) => {
    let n = el;
    while (n && n !== doc) {
      const bg = getComputedStyle(n).backgroundColor;
      if (opaco(bg)) return aRgb(bg);
      n = n.parentElement;
    }
    const bg = getComputedStyle(document.body).backgroundColor;
    return opaco(bg) ? aRgb(bg) : [255, 255, 255];
  };
  const contraste = (a, b) => {
    const l1 = luminancia(a), l2 = luminancia(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  // ------------------------------------------------------------ etiquetas
  // Como se llama un control para una persona. Mismo orden que usa un lector
  // de pantalla, y a proposito NO se mira la clase CSS: las pruebas no pueden
  // depender del layout que vamos a cambiar.
  const nombreDe = (el) => (
    el.getAttribute('aria-label') ||
    (el.labels && el.labels[0] && el.labels[0].textContent) ||
    el.textContent ||
    el.getAttribute('placeholder') ||
    el.getAttribute('title') ||
    el.value ||
    ''
  ).replace(/\\s+/g, ' ').trim();

  // ------------------------------------------------------------ navegacion
  const nav = document.querySelector('nav');
  const destinos = nav ? [...nav.querySelectorAll('a[href]')].map((a) => {
    const r = a.getBoundingClientRect();
    return {
      texto: nombreDe(a),
      href: a.getAttribute('href'),
      alto: Math.round(r.height),
      ancho: Math.round(r.width),
      // "Alcanzable" no es "visible": un destino dentro de un contenedor que
      // se desplaza SI se alcanza. Lo que no se alcanza es lo que queda fuera
      // sin que nada permita traerlo.
      dentroDelViewport: r.left >= -1 && r.right <= anchoVista + 1,
      activo: a.getAttribute('aria-current') === 'page',
    };
  }) : [];

  const navRecorte = nav ? Math.max(0, nav.scrollWidth - nav.clientWidth) : 0;

  // -------------------------------------------------------- hit targets
  const interactivos = [...document.querySelectorAll(
    'button, a[href], input:not([type=hidden]), select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])'
  )].filter(visible);

  const pequenos = [];
  const fueraDeVista = [];
  for (const el of interactivos) {
    const r = el.getBoundingClientRect();
    const nombre = nombreDe(el).slice(0, 40);
    if (r.height < 44 || r.width < 44) {
      pequenos.push({ que: el.tagName.toLowerCase(), nombre, w: Math.round(r.width), h: Math.round(r.height) });
    }
    // Completamente fuera: ni un pixel dentro del viewport horizontalmente.
    if (r.right < 0 || r.left > anchoVista) {
      fueraDeVista.push({ que: el.tagName.toLowerCase(), nombre, izq: Math.round(r.left), der: Math.round(r.right) });
    }
  }

  // ---------------------------------------------------------- desbordes
  // Un contenedor que se desplaza a proposito NO es un fallo. Lo que se busca
  // es lo que rompe el marco: la pagina entera moviendose de lado.
  const desbordaPagina = doc.scrollWidth > doc.clientWidth + 1;
  const culpables = [];
  if (desbordaPagina) {
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.right <= anchoVista + 1) continue;
      const cs = getComputedStyle(el);
      // Si el o alguno de sus padres se desplaza solo, el desborde esta contenido.
      let contenido = false;
      let n = el.parentElement;
      while (n && n !== doc) {
        const o = getComputedStyle(n).overflowX;
        if (o === 'auto' || o === 'scroll' || o === 'hidden') { contenido = true; break; }
        n = n.parentElement;
      }
      if (contenido) continue;
      culpables.push({
        que: el.tagName.toLowerCase(),
        clase: String(el.className || '').split(' ')[0].slice(0, 34),
        der: Math.round(r.right),
        overflowX: cs.overflowX,
      });
      if (culpables.length >= 6) break;
    }
  }

  // ---------------------------------------------------------- contraste
  const conTexto = [...document.querySelectorAll('body *')].filter(
    (el) => visible(el) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
  );
  const flojos = [];
  const tamanos = {};
  for (const el of conTexto) {
    const cs = getComputedStyle(el);
    const px = parseFloat(cs.fontSize);
    tamanos[Math.round(px)] = (tamanos[Math.round(px)] || 0) + 1;
    const frente = aRgb(cs.color);
    if (!frente) continue;
    const r = contraste(frente, fondoReal(el));
    const grande = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
    const minimo = grande ? 3 : 4.5;
    if (r < minimo) {
      flojos.push({
        texto: el.textContent.trim().slice(0, 38),
        px: Math.round(px),
        ratio: Number(r.toFixed(2)),
        pide: minimo,
      });
    }
  }

  // ------------------------------------------------------------ inventario
  // Lo que existe en pantalla, por su nombre visible. Es lo que permite
  // comprobar despues del rediseno que una accion sigue ahi sin atarse ni a
  // una clase CSS ni a una posicion.
  const acciones = interactivos
    .map((el) => nombreDe(el))
    .filter((t) => t.length > 0 && t.length < 60);

  const tabla = document.querySelector('table');
  const filaTabla = tabla && tabla.querySelector('tbody tr');

  return {
    url: location.pathname,
    ancho: anchoVista,
    titulo: (document.querySelector('h1') || {}).textContent || null,
    destinos,
    navRecorte,
    interactivos: interactivos.length,
    pequenos,
    fueraDeVista,
    desbordaPagina,
    culpables,
    contrasteFlojo: flojos,
    tamanos: Object.entries(tamanos).sort((a, b) => b[1] - a[1]).map(([px, n]) => px + 'px x' + n),
    acciones,
    tablaVisible: tabla ? visible(tabla) : null,
    filaAlto: filaTabla ? Math.round(filaTabla.getBoundingClientRect().height) : null,
    scrollAlto: doc.scrollHeight,
  };
})()`;

/** Entra con una cuenta. Devuelve el estado HTTP; la cookie la guarda el navegador. */
export const sondaEntrar = (origen, email, clave) => `(async () => {
  await fetch(${JSON.stringify(origen)} + '/v1/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
  const r = await fetch(${JSON.stringify(origen)} + '/v1/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: ${JSON.stringify(email)}, password: ${JSON.stringify(clave)} }),
  });
  return r.status;
})()`;

/** Hay sesion viva? Se usa para esperar a que la pantalla termine de montarse. */
export const SONDA_LISTA = `(() => {
  const m = document.querySelector('main');
  if (!m) return false;
  const t = m.innerText || '';
  if (/Cargando|Abriendo/i.test(t) && t.length < 80) return false;
  return t.trim().length > 0;
})()`;
