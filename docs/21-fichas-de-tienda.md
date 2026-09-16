# 21 · Fichas de tienda — todo lo que no necesita decisión jurídica

**Fecha:** 2026-09-14 · rama `release/hardening-mayoria-de-edad`

Textos, assets y respuestas a los cuestionarios, **derivados del producto
auditado**. Nada de esto está publicado ni enviado a revisión.

Los documentos legales adoptados viven en [`legal/`](legal/); el rastro de qué
estaba abierto y quién lo cerró, en
[`19-legal-review-pack.md`](19-legal-review-pack.md). **Aquí no se rellena
ningún dato jurídico.**

## Decisiones de producto ya tomadas

| | |
| --- | --- |
| Público | **Dirigida a mayores de 18 años** (ver el alcance exacto abajo) |
| Privacidad | `privacidad@gymlabfit.tech` |
| Soporte | `soporte@gymlabfit.tech` |
| Publicidad / seguimiento | **No hay** |
| Compras dentro de la app | **No hay** |

> **ALCANCE DEL +18, DICHO CON PRECISIÓN.** RINDA está **dirigida** a mayores
> de 18. Cuando la fecha de nacimiento se conoce, el producto **impide** dar de
> alta o editar a una persona menor —en el contrato y en la base de datos—.
> Pero esa fecha es **opcional**, el personal no la tiene y las invitaciones no
> la piden: **no se puede afirmar que todas las personas usuarias estén
> verificadas como mayores de edad**, y en ningún texto se afirma. El
> tratamiento jurídico de esa limitación queda dentro de lo pendiente de
> revisión legal.

> **Bloqueo operativo de correo: LEVANTADO (2026-09-16).** Los dos buzones
> están creados y comprobados. Desde el repositorio sólo se mide una parte —que
> `gymlabfit.tech` tiene registros MX (`mx1`/`mx2.hostinger.com`)—; que cada
> buzón entregue lo confirma quien los creó.

---

## 1. App Store

| Campo | Valor |
| --- | --- |
| **Nombre** | RINDA |
| **Subtítulo** (30) | `Tu gimnasio, en el bolsillo` |
| **Categoría** | Salud y forma física · secundaria: Negocios |
| **Palabras clave** (100) | `gimnasio,socio,carne,acceso,entrenador,rutina,cuota,progreso,recepcion,fitness` |
| **URL de privacidad** | `https://gymlabfit.tech/privacidad` |
| **URL de soporte** | `https://gymlabfit.tech/soporte` |
| **Copyright** | `2026` + el nombre del prestador, que vive en `NEXT_PUBLIC_PRESTADOR_NOMBRE` y **no en el repositorio**. Se escribe a mano en la consola: Apple pide el titular de los derechos, y el responsable inicial es persona física |
| **Clasificación por edad** | 18+ |
| **Export compliance** | ya resuelto en el binario: `ITSAppUsesNonExemptEncryption=false` |

### Descripción

```
RINDA es la app del gimnasio y de quien trabaja en él.

El socio lleva encima su carné de acceso, su rutina del día y su progreso.
Recepción cobra cuotas, da de alta y abre la puerta con el escáner. El
entrenador asigna rutinas y sigue las mediciones de quien entrena con él. La
dirección lo ve todo y decide quién puede hacer qué.

Cada quien ve lo suyo: los permisos no son una pantalla de ajustes, son cómo
está construida la aplicación.

· Carné de acceso con código que caduca en segundos
· Escáner de puerta que funciona con la cámara del móvil
· Rutinas y ejercicios, asignados por tu entrenador
· Cuotas, pagos y planes del gimnasio
· Tu progreso, sólo si tú das tu permiso — y puedes retirarlo cuando quieras

RINDA está dirigida a personas mayores de 18 años.
```

### Notas para App Review

```
RINDA no permite el registro libre: las cuentas las crea el gimnasio enviando
una invitación. Por eso hace falta usar las credenciales que adjuntamos.

La app tiene CUATRO perfiles y cada uno ve una aplicación distinta. Con la
cuenta de socio se ve el carné, la rutina y el progreso. Adjuntamos también las
credenciales de dirección, recepción y entrenador para que puedan verlos.

El escáner de la puerta (permiso de cámara) sólo lee un código QR y muestra si
la persona puede pasar. No se guarda ninguna imagen. Para probarlo hacen falta
dos dispositivos, o abrir el carné en uno y escanearlo desde otro.

La sección "Progreso" pide un permiso explícito de datos de salud, separado de
todo lo demás. Sin aceptarlo no se registra ninguna medición. Puede retirarse
en cualquier momento desde la misma pantalla; al retirarlo, las mediciones se
eliminan.

Eliminar la cuenta: Perfil (o Panel) → "Eliminar mi cuenta". Pide escribir
ELIMINAR y la contraseña actual. También está disponible sin la app en
https://gymlabfit.tech/eliminar-cuenta
```

### App Privacy — inventario

**Tracking: NO.** Medido en el IPA: sin `AppTrackingTransparency`, `AdSupport`,
`IDFA` ni `ASIdentifierManager`; cero SDK de analítica en 27 dependencias.

| Categoría | Datos | Uso | ¿Vinculado? | ¿Tracking? |
| --- | --- | --- | --- | --- |
| Contact Info | Nombre, correo, teléfono | Funcionalidad | Sí | No |
| Health & Fitness | Peso, % grasa, perímetros, notas | Funcionalidad | Sí | No |
| Financial Info | Historial de cuotas y pagos. **Sin datos de tarjeta** | Funcionalidad | Sí | No |
| Identifiers | ID de usuario, número de socio | Funcionalidad | Sí | No |
| Usage Data | Entradas al gimnasio | Funcionalidad | Sí | No |
| Diagnostics | IP y agente de las sesiones | Seguridad | Sí | No |
| Other Data | Fecha de nacimiento | Funcionalidad | Sí | No |

**No se recoge:** ubicación, contactos, fotos, audio, navegación, publicidad.
**La cámara sólo decodifica QR y no guarda imágenes.**

> Los nombres exactos de categoría hay que confirmarlos contra el cuestionario
> vivo de App Store Connect. Lo firme aquí es **qué se recoge**.

---

## 2. Google Play

| Campo | Valor |
| --- | --- |
| **Nombre** | RINDA |
| **Descripción breve** (80) | `El carné, la rutina y las cuotas de tu gimnasio. Cada quien ve lo suyo.` |
| **Categoría** | Salud y bienestar |
| **Público objetivo** | **18 y más** |
| **Anuncios** | **No** |
| **Compras en la aplicación** | **No** |
| **URL de privacidad** | `https://gymlabfit.tech/privacidad` |
| **URL de soporte** | `https://gymlabfit.tech/soporte` |
| **URL de eliminación de cuenta** | `https://gymlabfit.tech/eliminar-cuenta` |
| **Gráfico destacado** | `apps/mobile/tienda/feature-graphic.png` (1024×500) |
| **Capturas** | `apps/mobile/tienda/capturas/` — 8, a 1200×2400 (1:2 exacto) |

La descripción larga es la misma de la App Store.

### App Access

```
RINDA no permite el registro libre: las cuentas las crea el gimnasio por
invitación. Sin credenciales no se pasa de la pantalla de entrada.

Adjuntamos una cuenta por cada uno de los cuatro perfiles (dirección,
recepción, entrenador y socio), porque cada uno ve una aplicación distinta.

Todas las funciones están disponibles con esas credenciales. No hay contenido
de pago ni funciones ocultas.
```

### Content rating — respuestas propuestas

Derivadas del producto, no de una plantilla.

| Pregunta | Respuesta |
| --- | --- |
| Violencia, sexo, lenguaje, drogas, apuestas | **No** a todas |
| Contenido generado por usuarios | **No** — las notas del entrenador sólo las ve el propio socio, su entrenador y la dirección; no hay nada compartido entre usuarios |
| Compartir ubicación | **No** |
| Compartir información personal con terceros | **No** |
| Compras digitales | **No** |
| ¿App para niños? | **No** — 18+ |

### Data Safety

**Recoge datos: sí. Los comparte con terceros: no. Cifrado en tránsito: sí
(HTTPS). Se pueden solicitar la eliminación: sí, `/eliminar-cuenta`.**

| Tipo | Recogido | Compartido | Obligatorio | Para qué |
| --- | --- | --- | --- | --- |
| Nombre | Sí | No | Sí | Funcionalidad |
| Correo | Sí | No | Sí | Funcionalidad, gestión de cuenta |
| Teléfono | Sí | No | No | Funcionalidad |
| Fecha de nacimiento | Sí | No | No | Funcionalidad |
| **Salud y forma física** | Sí | No | **No** — requiere permiso explícito | Funcionalidad |
| Historial de compras | Sí | No | No | Funcionalidad |
| Otras acciones en la app (accesos) | Sí | No | Sí | Funcionalidad, seguridad |
| IDs de usuario | Sí | No | Sí | Funcionalidad, seguridad |
| Fotos y vídeos | **No** | — | — | La cámara sólo lee QR y no guarda nada |
| Ubicación | **No** | — | — | — |

---

## 3. Gimnasio de revisión — procedimiento

**No hay un sembrador nuevo.** Ya existe uno que monta un gimnasio entero
**por la API pública**, con los mismos flujos que usaría una persona:

```bash
node apps/web/auditoria/sembrar.mjs
```

Produce, y es **idempotente** —si el fichero de credenciales existe, reutiliza
el gimnasio en vez de crear otro—:

- las **cuatro cuentas**: dirección, recepción, entrenador y socio;
- planes, cuotas activas y pagos registrados;
- rutinas asignadas y ejercicios;
- socios con ficha completa.

Las credenciales quedan en `apps/web/auditoria/credenciales.local.json`, que
está **en `.gitignore`**. **Ninguna contraseña se imprime en consola ni en
ningún informe.**

Para el carné QR real:

```bash
node apps/mobile/herramientas/desarrollo/carne-de-prueba.mjs
```

**Progreso queda fuera a propósito:** el consentimiento de salud sigue en
borrador y en producción no se publica documento, así que no hay mediciones que
enseñar. Las notas de revisión lo explican.

> **No se han creado datos de revisión en producción.** Cuándo y dónde hacerlo
> es una decisión que depende de tener las consolas.

---

## 4. Lo que sigue siendo UNKNOWN hasta tener consola

| | Por qué |
| --- | --- |
| **Huella de Play App Signing** | Google la genera al crear la app. Hay que **añadirla a `assetlinks.json`** o los App Links se romperán en instalaciones de Play — hoy sólo está la de subida de EAS |
| **Requisito de 12 testers / 14 días** | Depende del tipo y antigüedad de la cuenta de Play. **No se asume** |
| **Ficha en App Store Connect** | No verificable sin credenciales |
| **Acuerdos pendientes en ASC** | Ídem |

---

## 5. Lo que bloquea la publicación, y sólo eso

1. **Revisión legal** de la política de privacidad y del consentimiento de
   salud, los plazos de conservación, y el papel jurídico y la base de cada
   finalidad (A1–A6, B1–B5 del pack).
2. **Estatus fiscal y mercantil** del responsable, y el identificador fiscal
   cuando corresponda. Nombre y domicilio **ya están** (2026-09-16).
3. **Consolas** de Apple y Google, y el envío.

Todo lo demás de esta ficha está preparado.
