# 19 · Pack de revisión legal

**Fecha:** 2026-09-14 · rama `release/account-deletion-privacy`

Dos textos de RINDA necesitan una decisión que no puede tomar quien escribe el
código. Este documento reúne **los hechos verificados del producto** para que
quien decida no tenga que leer el esquema de la base de datos, y **enumera los
huecos** que siguen abiertos.

> **Nada de lo que hay aquí está aprobado.** Los dos textos que ya existen —la
> política de privacidad publicada en `/privacidad` y el consentimiento de
> salud— llevan un aviso de borrador visible y **no pueden darse por
> definitivos** mientras lo lleven.

---

## A · Política de privacidad

Publicada como borrador en `/privacidad`, enlazada desde la app (Perfil y
Panel) y desde `/eliminar-cuenta`.

### A.1 Lo que el texto YA afirma, y por qué se puede afirmar

Cada línea sale de mirar el producto, no de suponer.

| Afirmación del texto | De dónde sale |
| --- | --- |
| Identidad y contacto: nombre, apellidos, correo, teléfono, fecha de nacimiento | Columnas de `users` y `members` |
| Contraseña cifrada y sesiones con IP y agente | `accounts.password`, `sessions.ip_address`, `sessions.user_agent` |
| Entradas al gimnasio con fecha y decisión | `access_events` |
| Cuotas y pagos con concepto, importe, fecha y método | `payments`; el método es un enum `cash` / `transfer` / `card` |
| **No se guarda ningún dato bancario** | No existe ninguna columna de tarjeta ni pasarela en el esquema |
| Rutinas y ejercicios asignados | `routines`, `routine_assignments` |
| Datos de salud sólo con permiso explícito | `body_metrics` + el gate de `consents` |
| Registro de actividad del personal | `audit_log` |
| **Sin ubicación, contactos, fotos ni micrófono** | Permisos de los binarios auditados: sólo `CAMERA`, `INTERNET` y `ACCESS_NETWORK_STATE` en Android; sólo `NSCameraUsageDescription` en iOS |
| **Sin publicidad, analítica ni seguimiento** | Cero SDK de medición en 27 dependencias; sin `AppTrackingTransparency`, `AdSupport`, `IDFA` ni `ASIdentifierManager` en el IPA |
| **La cámara sólo lee QR y no guarda imágenes** | El escáner decodifica y descarta; no hay escritura de ficheros |
| El gimnasio decide, RINDA trata por cuenta de él | El documento de consentimiento lleva el nombre del gimnasio como responsable |

### A.2 Huecos que exigen decisión humana

| # | Hueco | Por qué no lo puede rellenar el código |
| --- | --- | --- |
| A1 | **Identidad del responsable del tratamiento** de RINDA como servicio: razón social, NIF, domicilio, contacto de privacidad | Dato societario real |
| A2 | **Rol jurídico**: ¿RINDA es encargado del tratamiento de cada gimnasio, responsable, o ambos según la finalidad? | Determina todo el resto del texto |
| A3 | **Base jurídica de cada finalidad** más allá del consentimiento de salud | Interpretación legal |
| A4 | **Plazos de conservación** de cada categoría (ver §C) | Obligación fiscal y de seguridad |
| A5 | **Encargados y proveedores** que intervienen de verdad: alojamiento, correo transaccional, copias de seguridad | Hay que enumerar los reales, no los que parezcan |
| A6 | **Transferencias internacionales**, si las hay | Depende de A5 |

### A.3 Lo que YA se decidió (2026-09-14)

Estaba en la lista de arriba y ha salido de ella. Se anota para que nadie lo
vuelva a preguntar.

| Antes | Decisión | Dónde está ya |
| --- | --- | --- |
| A7 · Buzón de derechos | `privacidad@gymlabfit.tech` | `/privacidad`, §«Tus derechos» |
| A8 · Edad mínima | **18 años**, y el producto la impone | Contrato `birthDateSchema` + restricción `members_mayoria_de_edad` en la base |
| A9 · Buzón de soporte | `soporte@gymlabfit.tech` | `/soporte` |

> **Bloqueo OPERATIVO, no jurídico.** `gymlabfit.tech` tiene registros MX
> (`mx1`/`mx2.hostinger.com`), así que el dominio recibe correo. **No está
> confirmado que esos dos buzones concretos existan** — se crean y se comprueban
> en el panel de Hostinger. Una dirección publicada que nadie atiende es peor
> que no publicar ninguna.
>
> Esto **no** bloquea el gate de tiendas, que es jurídico. Bloquea el envío.

---

## B · Consentimiento de datos de salud

### B.1 Estado actual, medido

- Plantilla vigente: `2026-09-01-borrador`, con `is_draft = true`.
- Su cuerpo empieza literalmente por `BORRADOR — texto pendiente de redaccion
  juridica definitiva`.
- `consent-documents.service.ts` hace
  `if (plantilla.isDraft && env.NODE_ENV === 'production') return null;`
  y `estado()` devuelve `plantilla_en_borrador`.

**Consecuencia:** en producción **no puede concederse ningún consentimiento
nuevo ni registrarse ninguna medición**. La función de Progreso viaja en el
binario pero está inerte.

> **No se ha tocado `is_draft` ni se ha levantado el bloqueo de producción.**

### B.2 Lo que el consentimiento debe describir, según el producto

| | |
| --- | --- |
| **Datos exactos** | Peso (kg), porcentaje de grasa corporal, y perímetros de pecho, cintura, cadera, brazo y muslo (cm). Fecha de cada medición. Notas de texto libre del entrenador |
| **Finalidad funcional** | Seguimiento del entrenamiento del socio y adaptación de su rutina |
| **Quién registra** | El entrenador asignado y la dirección del gimnasio |
| **Quién consulta** | El propio socio, su entrenador asignado y la dirección. **Recepción no accede** |
| **Base que el producto pretende usar** | Consentimiento explícito del interesado. Son datos de categoría especial |
| **Dónde se muestra** | `app/perfil/privacidad.tsx` en móvil y `/socio/privacidad` en web, con el texto íntegro antes de poder aceptar |
| **Cómo acepta** | Botón explícito tras leer el documento completo. Sin texto publicado no hay botón |
| **Versionado** | `consent_documents` es inmutable por disparador de base de datos. Cada aceptación apunta a una versión concreta, y `body_metrics.consent_version` sella cada medición con la versión bajo la que se tomó |
| **Cómo retira** | Desde la misma pantalla, en cualquier momento |
| **Efecto de retirar** | Impide registrar mediciones nuevas. Las anteriores se conservan |
| **Auditoría existente** | `audit_log` registra `consent.granted`, `consent.revoked` y cada `progress.recorded`, con la versión |

### B.3 Huecos que exigen decisión humana

| # | Hueco |
| --- | --- |
| B1 | **El texto jurídico definitivo**, que sustituya al borrador |
| B2 | **Plazo de conservación** de las mediciones tras retirar el consentimiento o causar baja |
| B3 | Si la **retirada** debe además ofrecer la supresión inmediata de lo ya registrado |
| B4 | Si las **notas del entrenador** necesitan mención aparte, al ser texto libre sobre la salud de una persona |
| B5 | Quién es el **responsable** cuando un socio pertenece a **varios gimnasios**: hoy cada gimnasio publica su propio documento |

> **No se afirma en ningún sitio que esto cumpla el RGPD.** Lo que se afirma es
> qué hace el producto.

---

## C · Plazos de conservación — la decisión que bloquea a las dos

Al eliminar una cuenta, estos registros **sobreviven anonimizados** (ver
[18-store-readiness.md](18-store-readiness.md) §5):

| Categoría | Qué queda | Plazo |
| --- | --- | --- |
| `payments` | Importe, concepto, fecha, método. Sin persona | **PENDIENTE** — fiscal |
| `access_events` | Marca de tiempo y decisión. Sin persona | **PENDIENTE** — hoy configurable por gimnasio en `access_events_retention_months` |
| `audit_log` | Acción y entidad. Sin actor | **PENDIENTE** — seguridad |
| `auth_events` | Tipo de evento, IP, agente. Sin correo ni cuenta | **PENDIENTE** — seguridad |
| `invitations` | Rol y fechas. Sin correo ni autor | **PENDIENTE** |

**No he fijado ninguno.** Ninguno de estos plazos es una decisión técnica.
