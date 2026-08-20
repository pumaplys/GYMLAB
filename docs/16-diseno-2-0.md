# Design 2.0 — bitácora

Rediseño visual completo del producto **manteniendo intacta la funcionalidad
congelada** en `5950bc4`. No entra funcionalidad nueva, ni cambian contratos,
endpoints, reglas de negocio, permisos, lifecycles, migraciones, esquema,
infraestructura, copias ni textos legales.

| Fase | Qué                                          | Estado      |
| ---- | -------------------------------------------- | ----------- |
| D0   | Red de seguridad: instrumentación y baseline | en revisión |
| D1   | Sistema: tokens y controles                  | pendiente   |
| D2   | Shell y navegación                           | pendiente   |
| D3   | Panel (dueña y recepción)                    | pendiente   |
| D4   | Entrenador                                   | pendiente   |
| D5   | Socio                                        | pendiente   |
| D6   | Tableta y pulido                             | pendiente   |

## D0

`apps/web/auditoria/` mide el panel con Chrome sin ventana en cuatro anchos y
con los cuatro roles. Sin dependencias nuevas: Node 24 trae `WebSocket` y CDP es
un WebSocket. Ver [su README](../apps/web/auditoria/README.md).

El baseline se toma contra el diseño anterior a D1 y es lo que permite demostrar
el «después». Las reglas que hoy son deuda visual conocida informan pero no
bloquean CI hasta la fase que las cierra.

---

## Hallazgos abiertos

Cosas encontradas durante el rediseño que **no se arreglan aquí**: Design 2.0 no
toca comportamiento. Quedan escritas para decidir qué hacer con ellas fuera de
estas fases.

### 1. `WEB_DIST_PATH` relativa desactiva el panel en silencio

**Dónde**: `apps/api/src/panel.ts`, `reescribirAHtml()`.

**Qué pasa**: la reescritura de `/socios` a `/socios.html` comprueba que la ruta
resuelta siga dentro del panel con

```ts
if (!candidato.startsWith(RUTA_PANEL + sep)) return siguiente();
```

`candidato` viene de `resolve()`, así que siempre es absoluto y con
separadores nativos. `RUTA_PANEL` es lo que valga `WEB_DIST_PATH`, tal cual. Si
esa variable trae una ruta **relativa** —o, en Windows, con barras hacia
delante—, la comparación nunca es cierta y **la reescritura se salta para todas
las pantallas**.

**Síntoma**: la API arranca sin errores y registra
`[api] sirviendo el panel desde … — mismo origen`. Después, `express.static` ve
el directorio `out/socios/` que genera la exportación, redirige a `/socios/`, y
ahí no hay `index.html`: **301 → 404 en todas las pantallas**. El panel no se
sirve y nada lo dice.

**Cómo se encontró**: montando D0 en CI. Se arranca la API desde la raíz del
repo, así que hay que indicarle dónde quedó `apps/web/out`. Con la ruta
relativa, D0 midió 84 pantallas en blanco.

**Alcance real**: **producción no está afectada.** Allí `WEB_DIST_PATH` no se
define y el valor por defecto es `join(process.cwd(), 'web')`, que es absoluto
y nativo. Solo afecta a quien use la variable, que hasta ahora era nadie.

**Rodeo aplicado**: CI pasa `${{ github.workspace }}/apps/web/out`.

**Si se decide arreglar**: resolver `RUTA_PANEL` con `resolve()` al calcularlo,
en lugar de guardar el valor crudo. Es una línea. Queda fuera de Design 2.0
porque toca `apps/api`, y el acuerdo es que ningún diff de estas fases salga de
`apps/web`.
