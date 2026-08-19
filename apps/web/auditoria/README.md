# D0 — Red de seguridad de Design 2.0

Mide el panel en cuatro anchos con los cuatro roles y dice qué está bien, qué es
deuda conocida y qué se ha roto. **No cambia nada del producto**: abre Chrome,
mira y escribe un informe.

```bash
# la API tiene que estar en marcha
pnpm --filter @gymlab/web auditar               # informe
pnpm --filter @gymlab/web auditar --guardar     # además fija el baseline
pnpm --filter @gymlab/web auditar --ci          # solo bloqueantes; sale ≠0 si fallan
```

Contra `next dev` en el 3000:

```bash
D0_WEB=http://localhost:3000 pnpm --filter @gymlab/web auditar
```

## Por qué no hay dependencias nuevas

Lo que D0 necesita del navegador cabe en cinco órdenes: abrir pestaña, fijar el
viewport, navegar, ejecutar JavaScript y leer el resultado. Node 24 trae
`WebSocket` en el runtime y CDP _es_ un WebSocket, así que el cliente completo
es [`navegador.mjs`](navegador.mjs) — unas 150 líneas.

La alternativa era Playwright o Puppeteer: un runner con fixtures, reintentos y
trazas que aquí no se usan, más un Chromium descargado por desarrollador.
`puppeteer-core` habría sido 1 dependencia directa y 6 transitivas para
ahorrar esas 150 líneas.

Usa el Chrome que ya está en la máquina. Si no lo encuentra:
`D0_CHROME=/ruta/a/chrome`.

## Qué mide

| Regla                                            | Bloquea CI              |
| ------------------------------------------------ | ----------------------- |
| La pantalla carga y tiene contenido              | sí                      |
| Las acciones críticas siguen existiendo          | sí                      |
| Lo que no debe existir, no existe                | sí                      |
| Ningún rol recibe destinos que no le tocan       | sí                      |
| El destino actual se identifica en la navegación | sí                      |
| La página no se desplaza de lado                 | sí                      |
| Contraste WCAG AA                                | sí                      |
| Ningún destino queda fuera del viewport          | no — deuda hasta **D2** |
| Ningún control queda entero fuera del viewport   | no — deuda hasta **D2** |
| Controles de 44px o más en táctil                | no — deuda hasta **D1** |

**Severidad y bloqueo son cosas distintas.** La navegación recortada en móvil es
un `FAIL` real, y aun así no puede tumbar `main` mientras D2 no la arregle: por
eso cada regla lleva `cierraEn`, la fase que la convierte en bloqueante. Al
cerrar una fase se añade a `FASES_CERRADAS` en [`reglas.mjs`](reglas.mjs) y sus
reglas empiezan a bloquear. Es una fecha de caducidad escrita, no una excepción
que se olvida.

En táctil (375 y 768) un control pequeño es `FAIL`; con ratón (1024 y 1440) es
`WARN`, porque un panel denso con filas de 36px es perfectamente usable con
puntero fino.

## Las pruebas no se atan al layout

Se comprueba el **nombre visible** de cada acción, el mismo que lee una persona
y el que anuncia un lector de pantalla. Nunca clases CSS, jerarquía del DOM ni
posiciones: Design 2.0 va a mover todo eso, y unas pruebas atadas a ello se
romperían en cada fase sin que nada estuviera mal.

Si cambia el _texto_ de una acción, D0 falla — y eso se quiere: renombrar
«Dar de baja la cuota» es una decisión de producto, no un efecto secundario de
mover un `div`.

## Datos

`credenciales.local.json` (ignorado por git) apunta al gimnasio contra el que se
audita. Si no existe, [`sembrar.mjs`](sembrar.mjs) crea uno entero por la API
pública —mismos flujos que usa una persona— y lo guarda ahí.

Durante Design 2.0 el gimnasio es **«Gimnasio Vista»**, en la base de
desarrollo. En CI la base nace vacía en cada job, así que siembra siempre.

## Baseline

`baseline.json` es la foto del diseño **anterior** a D1. Sin `--guardar`, cada
ejecución se compara con él y solo informa de lo que ha cambiado, separando
mejoras de regresiones. Es lo que permite demostrar el «después».

Se vuelve a fijar (`--guardar`) al cerrar cada fase, no antes.
