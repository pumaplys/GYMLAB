# Configuración legal y de producción — #75

**CONFIGURACIÓN PRE-PRODUCCIÓN: APTA.**

Apta significa que la maquinaria está lista: se puede cargar una identidad real,
publicar un texto revisado, y demostrar qué aceptó cada socio. **No significa
que el contenido jurídico esté aprobado** — ese texto no existe todavía y no lo
escribe un programa.

---

## A. Quién es el responsable, según el modelo

| | |
|---|---|
| `organizations` | la **sociedad**. Contrata GYMLAB y es el **responsable del tratamiento** |
| `gyms` | la **sede**. Es el tenant: `gym_id` es lo que compara RLS |

El código decía «el gimnasio es responsable». Se matiza: lo es **la organización
propietaria del gimnasio**. Una sede no tiene NIF ni puede firmar nada; la
sociedad que la explota, sí.

Con una organización por gimnasio no se nota. Se nota con una cadena: tres sedes
de la misma empresa tienen **un** responsable, y repetir su razón social en cada
una solo crea tres sitios donde puede quedar desactualizada. Una franquicia
donde cada sede es sociedad distinta se modela con una organización por
sociedad, que es lo que el modelo ya permitía.

GYMLAB sigue siendo **encargado**.

## B. Campos, y por qué están separados

En `organizations`, todos anulables: `legal_name`, `tax_id`, `address`,
`privacy_email`.

No se reutiliza nada de lo operativo. El nombre comercial sirve para que un
socio reconozca su gimnasio; la razón social, para saber ante quién reclama. El
correo de recepción sirve para reservar una clase; el de privacidad, para
ejercer un derecho de supresión — y quien atiende la primera bandeja no tiene
por qué ver la segunda.

## C. Permisos

| rol | leer | escribir |
|---|---|---|
| owner | sí | sí |
| receptionist | **no** (403) | **no** (403) |
| trainer / member | no | no |

No es cuestión de confianza: cambiar la razón social cambia **quién figurará
como responsable en el próximo documento publicado**.

El socio nunca lee `organizations`. Ve el **snapshot** dentro del documento.
Comprobado sobre el contrato crudo: su respuesta no contiene `taxId`,
`legalName`, `privacyEmail` ni `missing` como campos — el NIF aparece
únicamente **dentro del cuerpo** del texto que acepta, que es donde debe estar.

## D. `/configuracion`

Solo dueño, y el enlace solo se le ofrece a él. Dos bloques separados:
**Datos del responsable** (lo que rellena) y **Documento de privacidad** (lo que
el sistema hace con ello). Mezclarlos invita a leer el estado como un campo más.

En ningún sitio dice «cumple RGPD» ni «legalmente válido». Los términos son
factuales: *Configuración completa / incompleta*, *Faltan: …*, *Documento
publicado / pendiente / no disponible*.

La lista de lo que falta **la calcula el servidor**, que es quien impide
publicar sin ello. El frontend solo traduce las claves a nombres.

## E. Estados del documento

Cinco causas distintas, porque cada una la arregla alguien distinto:

| estado | qué pasa | lo arregla |
|---|---|---|
| `publicado` | hay documento vigente | — |
| `listo` | todo correcto, se publicará con el primer socio | — |
| `falta_configuracion` | faltan datos del responsable | el **dueño** |
| `sin_version` | no hay versión activa en la plataforma | GYMLAB |
| `falta_plantilla` | la versión configurada no tiene texto | GYMLAB |
| `plantilla_en_borrador` | el texto activo es un borrador | GYMLAB |

`listo` se añadió al verlo en pantalla: decir «Documento publicado» junto a
«Versión publicada: Ninguna» es contradecirse en la misma tarjeta.

## F. Publicación: automática, y se mantiene así

**Decisión: A — publicación automática al necesitarla.**

El documento se publica dentro de la transacción de la petición del socio que lo
necesita, de forma idempotente (lo garantiza el índice único parcial de «uno
vigente por gimnasio y finalidad»). Añadir un botón administrativo no lo haría
más seguro: lo haría olvidable, y una funcionalidad que depende de que alguien
se acuerde de pulsar acaba apagada.

Lo que sí faltaba era que el dueño pudiera **saber** en qué punto está. Eso es
`GET /gyms/:gymId/privacy-document`, que solo lee.

## G. `HEALTH_CONSENT_VERSION` — una sola regla

```
HEALTH_CONSENT_VERSION  =  la versión que la plataforma espera
        │
        ├─ sin valor          → no hay documento vigente (aunque quede uno publicado)
        ├─ sin plantilla      → falla en cerrado
        ├─ plantilla borrador → falla en cerrado SOLO en producción
        └─ con plantilla      → se publica esa versión para el gimnasio
                                 la anterior queda superseded, no se edita
```

**No hay una segunda «versión vigente» en la base que pueda divergir.** Si lo
publicado no coincide con lo esperado, se republica; el env siempre manda. Un
consentimiento solo es vigente si su versión es la esperada, así que cambiarla
obliga a aceptar de nuevo — sin migrar nada en silencio.

La variable **sigue haciendo falta**: es el interruptor con el que la plataforma
activa un texto revisado sin tocar código.

## H. El borrador no vale en producción

`consent_document_templates.is_draft`, columna y no un sufijo en el nombre de la
versión. Una condición de seguridad que depende de cómo alguien escriba una
cadena no es una condición de seguridad.

Por defecto `true`: sembrar una plantilla y olvidar marcarla la deja
inutilizable — el fallo barato. Al revés, un borrador ampararía consentimientos
sin que nadie se enterase.

Con `NODE_ENV=production`, una plantilla en borrador **no ampara nada**. Se
bloquea *solo* eso: inicio, cuota, rutinas, QR, pagos y accesos siguen
funcionando. No tener el texto listo no puede apagar el producto.

## I. Inmutabilidad, y quién la sostiene

Cambiar la identidad **no toca los documentos ya publicados**. La siguiente
publicación congela los datos nuevos; la anterior se queda como estaba.

Falsificado deliberadamente: modifiqué el servicio para que reescribiera el
`controller` y el cuerpo del documento vigente. No falló solo el test — **lo
bloqueó la base de datos**:

```
Un documento de consentimiento publicado no se puede modificar: publica otra version
  PL/pgSQL function consent_documents_inmutable()
```

La inmutabilidad no es una convención del servicio. La impone Postgres.

## J. Exportación personal

Antes entregaba `version: 2026-09-01` y ahí se acababa. Quien la recibe no tiene
forma de saber qué ponía: el documento de su portal es el de **hoy**, y el que
aceptó pudo quedar superseded hace dos años. Una prueba a la que le falta justo
el objeto probado.

Ahora cada consentimiento lleva el documento: `id`, `titulo`, `responsable`
(el snapshot congelado), `publicadoEl` y el **texto completo**. Son una o dos
filas por persona y unos kilobytes.

## K. Multi-sede y aislamiento

- Dos gimnasios de la **misma** sociedad comparten identidad (se configura una
  vez) pero **cada uno publica su propio documento**, y los consentimientos
  siguen aislados por gimnasio.
- Dos **organizaciones distintas** no se cruzan: el dueño de B pidiendo el
  `gymId` de A recibe lo suyo. El `:gymId` de la URL nunca elige tenant.

---

## Variables de producción

Sin secretos. Ninguna cambia respecto a #74 salvo la última.

| variable | obligatoria | ejemplo | propósito | si falta |
|---|---|---|---|---|
| `NODE_ENV` | sí | `production` | activa los cierres en cerrado | arranca en modo desarrollo |
| `DOMINIO` | sí | `https://gimnasio.tudominio.com` | alimenta las tres de abajo | **la API no arranca** |
| `API_URL` | sí | = `DOMINIO` | de aquí sale el `Secure` de la cookie | **no arranca** |
| `WEB_APP_URL` | sí | = `DOMINIO` | base de los enlaces de los correos | **no arranca** |
| `CORS_ORIGINS` | sí | = `DOMINIO` | lista blanca | **no arranca** si es local |
| `TRUST_PROXY` | sí | `1` | un Caddy delante | la IP de todos pasa a ser la del proxy |
| `DATABASE_URL` | sí | — | rol propietario, solo migraciones | no migra |
| `DATABASE_URL_APP` | sí | — | rol de la app, sujeto a RLS | **no arranca** |
| `AUTH_SECRET` | sí | — | firma de sesiones | **no arranca** |
| `ACCESS_TOKEN_SECRET` | sí | — | semilla del QR | **no arranca** |
| `PLATFORM_INVITE_CODE` | sí | — | alta de gimnasios en piloto | **no arranca** |
| `RESEND_API_KEY` | sí | — | envío real de correo | **no arranca** en producción |
| `EMAIL_FROM` | sí | `GYMLAB <no-reply@tudominio.com>` | remitente verificado | **no arranca** con clave puesta |
| `HEALTH_CONSENT_VERSION` | **no** | `2026-11-15` | versión del texto activo | sin ella no se recogen datos de salud; el resto funciona |

`pg-boss` y Better Auth no tienen variables propias: usan `DATABASE_URL_APP` y
`AUTH_SECRET`/`API_URL` respectivamente.

## Procedimiento para el texto definitivo

**No lo escribe GYMLAB.** Cuando exista:

1. la persona competente entrega o revisa el texto final;
2. se crea una plantilla nueva con su versión (`is_draft = false`);
3. se configura `HEALTH_CONSENT_VERSION` con esa versión;
4. se despliega y migra;
5. el dueño completa su identidad en `/configuracion`;
6. el documento queda publicable;
7. el socio lo lee y lo acepta.

El borrador se queda en el repositorio para desarrollo y tests. **Producción no
lo usa** — lo impide `is_draft`.

---

## Qué garantiza GYMLAB técnicamente

- documento **versionado** y **inmutable** (lo impone un disparador de Postgres);
- **snapshot** de la identidad del responsable congelado al publicar;
- el consentimiento apunta al **documento exacto**, no a una etiqueta;
- aceptación y revocación registradas, con fecha e IP;
- una versión nueva **exige aceptación nueva**;
- el histórico se conserva: los documentos aceptados no se borran (`RESTRICT`);
- aislamiento por gimnasio y por organización;
- **fallo en cerrado** ante configuración inválida o texto en borrador;
- exportación que permite relacionar cada aceptación con su texto.

## Qué necesita aportación o revisión humana

Nada de lo siguiente lo puede resolver el código, y **no está resuelto**:

- razón social, identificador fiscal y domicilio **reales**;
- correo de privacidad real y atendido;
- el **texto jurídico definitivo**;
- la finalidad, redactada correctamente;
- el plazo de conservación;
- los destinatarios y las transferencias, si las hay;
- la información sobre derechos y la autoridad de control;
- **la revisión jurídica del conjunto**.

Que los campos estén rellenos no significa que el texto ampare nada. Esta
documentación no afirma en ningún punto que GYMLAB «cumpla el RGPD»: afirma qué
mecanismos existen para que un texto revisado por quien corresponda pueda usarse
y demostrarse.

---

## Deuda no bloqueante

- El botón primario mide **36 px de alto**, por debajo del objetivo de 44 px que
  el proyecto aplica en otros controles. Es del componente compartido `Boton`,
  así que afecta a todo el panel y cambiarlo aquí sería tocar el sistema de
  diseño entero desde este PR.
- Las tres deudas de #74 siguen abiertas: readiness de la cola, `login` que
  devuelve 500 y no 503 durante un corte, y la sesión de 90 días.

## CONFIGURACIÓN PRE-PRODUCCIÓN: APTA
