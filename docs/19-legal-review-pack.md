# 19 · Pack de revisión legal

**Fecha:** 2026-09-14 · rama `release/account-deletion-privacy`
**Actualizado:** 2026-09-16 — identidad y domicilio del responsable inicial

Dos textos de RINDA necesitan una decisión que no puede tomar quien escribe el
código. Este documento reúne **los hechos verificados del producto** para que
quien decida no tenga que leer el esquema de la base de datos, y **enumera los
huecos** que siguen abiertos.

> ┌──────────────────────────────────────────────────────────────────────────┐
> │ **ESTE DOCUMENTO QUEDÓ SUPERADO EL 2026-09-16, Y SE CONSERVA A PROPÓSITO.**│
> └──────────────────────────────────────────────────────────────────────────┘
>
> El responsable **adoptó** las posiciones de trabajo sobre A2, A3 y A4 y los
> plazos de conservación, y el resultado vive en **[`docs/legal/`](legal/)**:
> [política de privacidad](legal/politica-privacidad.md) ·
> [aviso legal](legal/aviso-legal.md) ·
> [acuerdo de encargo](legal/acuerdo-encargo-art28.md) ·
> [RAT](legal/rat.md) · [EIPD de salud](legal/eipd-salud.md) ·
> [proveedores](legal/proveedores-subencargados.md) ·
> [conservación](legal/politica-conservacion.md).
>
> **Lo que sigue vivo de aquí** es el rastro de qué estaba abierto, quién lo
> cerró y cuándo, y **qué queda por revisar externamente**. Adoptar no es lo
> mismo que haber revisado: ninguno de esos documentos está aprobado por un
> profesional, y ninguno afirma estarlo.
>
> Las páginas ya **no** llevan aviso de borrador: son versiones de lanzamiento.
> El único bloqueo del gate de tiendas es el **identificador fiscal**.

---

## A · Política de privacidad

Publicada como borrador en `/privacidad`, enlazada desde la app (Perfil y
Panel) y desde `/eliminar-cuenta`.

### A.0 Quién está detrás de RINDA — aportado el 2026-09-16

**Dato facilitado por el responsable, no derivado del producto.**

> **EL NOMBRE Y EL DOMICILIO NO ESTÁN EN ESTE REPOSITORIO, A PROPÓSITO.**
>
> Están destinados a publicarse —un aviso legal sin ellos no sirve— pero el
> historial de git es para siempre y se clona entero. Viven en la configuración
> de release: `NEXT_PUBLIC_PRESTADOR_NOMBRE`, `NEXT_PUBLIC_PRESTADOR_DOMICILIO`
> y `NEXT_PUBLIC_PRESTADOR_NIF`, en el `.env` —que está en `.gitignore`— y en el
> entorno de construcción. Las páginas legales las leen de ahí
> (`apps/web/src/lib/prestador.ts`); sin ellas dicen que falta la identidad, en
> vez de inventarla.

| | |
| --- | --- |
| **Responsable inicial** | **Persona física**, no sociedad |
| **Nombre legal** | En `NEXT_PUBLIC_PRESTADOR_NOMBRE` |
| **Domicilio de contacto** | En `NEXT_PUBLIC_PRESTADOR_DOMICILIO`, una línea por cada línea postal, separadas por `\|` |
| **Contacto de privacidad** | `privacidad@gymlabfit.tech` |
| **Contacto de soporte** | `soporte@gymlabfit.tech` |

> **HECHOS DECLARADOS SOBRE A1, al 2026-09-16.** Son hechos aportados, no
> interpretaciones:
>
> - el responsable previsto es actualmente una **persona física**;
> - **no hay sociedad constituida**;
> - **no está dado de alta como autónomo en este momento**;
> - **no se ha facilitado ningún NIF al repositorio**, y no se inventa.
>
> **De estos hechos no se deriva aquí ninguna consecuencia fiscal ni
> mercantil.** Qué forma hace falta para prestar el servicio, y desde cuándo, es
> exactamente lo que sigue abierto en **A1, pendiente de revisión legal y
> fiscal**.
>
> Tampoco se decide aquí **qué papel jurídico** le corresponde —responsable,
> encargado del tratamiento de cada gimnasio, o ambos según la finalidad—: eso
> es A2, y de él depende cómo se redacta todo lo demás.

> **LA DIRECCIÓN ESTÁ TAL Y COMO SE FACILITÓ, LETRA POR LETRA.** No se le han
> puesto los acentos del callejero ni se ha reordenado nada: un dato legal no
> se «corrige» por su cuenta desde el código, porque quien lo normaliza sin
> saber es quien introduce el error. **La grafía oficial se verificará antes de
> publicar la política definitiva.**

> **El domicilio es una dirección particular y va a ser pública.** Figurar en
> una política de privacidad significa que cualquiera puede leerla. Es una
> consecuencia buscada —quien reclama necesita saber ante quién— pero conviene
> decidirlo a sabiendas; la alternativa habitual es un domicilio a efectos de
> notificaciones distinto del de residencia.

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

**A1 se ha cerrado a medias.** Nombre, domicilio y los dos buzones ya están
(§A.0). Lo que sigue abierto de A1 es únicamente lo fiscal y mercantil, así que
la fila se queda, con el alcance recortado: un hueco a medio cerrar sigue
siendo un hueco.

| # | Hueco | Por qué no lo puede rellenar el código |
| --- | --- | --- |
| A1 | **Estatus fiscal y mercantil del responsable**, y el **identificador fiscal** que deba figurar cuando jurídicamente corresponda | No es un dato que se consulte: depende de bajo qué forma se preste el servicio, y de cuándo sea exigible publicarlo |
| A2 | **Rol jurídico**: ¿RINDA es encargado del tratamiento de cada gimnasio, responsable, o ambos según la finalidad? **Hay un modelo de trabajo propuesto en §A.4 — propuesto, no aprobado** | Determina todo el resto del texto |
| A3 | **Base jurídica de cada finalidad** más allá del consentimiento de salud | Interpretación legal |
| A4 | **Plazos de conservación** de cada categoría (ver §C) | Obligación fiscal y de seguridad |
| A5 | **Cuáles de los proveedores del inventario (§A.5) son encargados, y qué DPA hay que firmar con cada uno** — incluida la condición contractual de Monarx | El inventario ya está hecho y medido. Calificarlo y firmar contratos, no |
| A6 | **Cómo se califican los flujos del §A.6**, y la región contractual de Resend | Los hechos están; la calificación es jurídica |

### A.3 Lo que YA se decidió (2026-09-14)

Estaba en la lista de arriba y ha salido de ella. Se anota para que nadie lo
vuelva a preguntar.

| Antes | Decisión | Dónde está ya |
| --- | --- | --- |
| A1 · Identidad del responsable | **Persona física** (2026-09-16). El nombre, en la configuración de release | §A.0, `/aviso-legal` y `/privacidad` |
| A1 · Domicilio de contacto | En la configuración de release, **tal cual se facilitó** | Ídem |
| A7 · Buzón de derechos | `privacidad@gymlabfit.tech` | `/privacidad`, §«Tus derechos» |
| A8 · Edad mínima | **Dirigida a mayores de 18** | Contrato `birthDateSchema` + restricción `members_mayoria_de_edad`. **Alcance acotado abajo** |
| A9 · Buzón de soporte | `soporte@gymlabfit.tech` | `/soporte` |

> **LO QUE +18 CUBRE Y LO QUE NO.** Con la fecha de nacimiento conocida, el
> producto **impide** al menor en las dos capas. Pero la fecha es **opcional**,
> el personal no la aporta y las invitaciones no la piden: **no se puede decir
> que todas las personas usuarias estén verificadas como mayores de edad**.
>
> No se ha convertido RINDA en un sistema de verificación de edad, y no se va a
> hacer ahora: no se añade fecha obligatoria al alta de cuenta ni pantallas
> nuevas. **Cómo se redacta esa limitación en las condiciones es parte de la
> revisión legal pendiente** (queda ligado a A2 y A3).

> **Bloqueo operativo de correo: LEVANTADO el 2026-09-16.** Los dos buzones
> están **creados y comprobados**, según el responsable. Medido desde aquí sólo hay
> una parte: `gymlabfit.tech` tiene registros MX (`mx1`/`mx2.hostinger.com`),
> así que el dominio recibe correo. **Que cada buzón entregue no se ha
> verificado desde el repositorio** —haría falta enviar correo real— y por eso
> queda anotado como afirmación de quien los creó, no como medición.

### A.4 A2 — modelo de trabajo PROPUESTO, pendiente de revisión jurídica

> ┌────────────────────────────────────────────────────────────────────────┐
> │ **ESTO NO ES UNA DECISIÓN. ES UNA PROPUESTA PARA QUE ALGUIEN LA        │
> │ REVISE.**                                                              │
> │                                                                        │
> │ A2 **sigue abierta** en la tabla de §A.2 y el gate de tiendas sigue    │
> │ contándola. Se escribe aquí para que quien revise no parta de una      │
> │ hoja en blanco, no para darla por buena. **Nada de lo de abajo puede   │
> │ citarse como el reparto jurídico de RINDA.**                          │
> └────────────────────────────────────────────────────────────────────────┘

El reparto que se propone **no es único para todo el producto**: depende de la
finalidad, porque hay datos que existen por ser de RINDA y datos que existen
porque un gimnasio gestiona a sus socios.

#### 1 · RINDA como RESPONSABLE, en sus finalidades propias

Lo que existiría aunque el gimnasio no fuera cliente: la cuenta es de la
persona, no del gimnasio.

| Finalidad propuesta | Dónde vive en el producto |
| --- | --- |
| Identidad y cuenta RINDA | `users`, `accounts` |
| Autenticación y sesiones | `sessions` (IP y agente), Better Auth |
| Seguridad y prevención de abuso | `auth_events`, límites de intentos |
| Soporte | `soporte@gymlabfit.tech`, `/soporte` |
| Administración técnica de la plataforma | copias, migraciones, registros de servicio |
| Ejercicio de derechos sobre la propia cuenta RINDA | `/eliminar-cuenta` y el borrado del art. 17 ([20](20-borrado-de-cuenta.md)) |

#### 2 · GIMNASIO responsable, RINDA encargado — para lo que el gimnasio gestiona

| Ámbito propuesto | Dónde vive en el producto |
| --- | --- |
| Ficha del socio | `members`, `member_notes` |
| Cuotas y registros económicos gestionados por el gimnasio | `plans`, `subscriptions`, `payments` |
| Accesos | `access_events` |
| Rutinas y asignaciones | `routines`, `routine_assignments` |
| Progreso y mediciones de salud | `body_metrics` |
| Consentimiento y documento de salud publicado por ese gimnasio | `consent_documents`, `consents` |

**Coherente con lo que el producto ya hace:** el documento de consentimiento
lleva como responsable el nombre del gimnasio, no el de RINDA, y los datos
están aislados por gimnasio mediante RLS. Pero que el producto se comporte así
**no decide** cómo se califica jurídicamente.

#### 3 · Lo que este modelo arrastra si se confirma

| | |
| --- | --- |
| **Acuerdo de encargo del tratamiento con cada gimnasio** | Si el reparto se confirma, hace falta uno —art. 28 RGPD— y hoy **no existe ninguno**. Es un documento a firmar, no algo que se programe |
| **El borrado de cuenta cruza los dos lados** | Eliminar la identidad RINDA (responsable) toca también las fichas de socio (encargado). Está implementado y probado; **cómo se describe jurídicamente depende de A2** |
| **Frontera dudosa que hay que señalar** | `auth_events` y las invitaciones guardan correos de personas que aún no son socias de nadie. De qué lado caen es parte de lo que hay que revisar |

**No se afirma que este reparto sea correcto ni definitivo.** A2 queda
**PENDIENTE DE REVISIÓN JURÍDICA**, y con ella A3, que depende de ella.

### A.5 Inventario de proveedores — derivado, no supuesto

Cada línea sale de leer el repositorio, el servidor o el DNS. **Los hechos son
hechos; la calificación jurídica de cada uno es justamente A5 y A6, que siguen
abiertas.**

#### Producción, con datos personales

| Proveedor | Servicio | Para qué | Qué puede pasar por él | ¿Almacena? | Evidencia |
| --- | --- | --- | --- | --- | --- |
| **Hostinger** | VPS | Ejecuta la API, el panel y **el Postgres** | Todo: identidad, credenciales, sesiones con IP, socios, pagos, accesos, rutinas, salud, consentimientos, auditoría | **Sí** | `docker/compose.produccion.yml`; `186.240.156.16`, PTR `srv1888886.hstgr.cloud` |
| **Hostinger** | Correo de buzón | `privacidad@` y `soporte@gymlabfit.tech` | **Las solicitudes de derechos y su contenido**, con la identidad de quien reclama | **Sí** | MX `mx1`/`mx2.hostinger.com`; SPF `_spf.mail.hostinger.com` |
| **Hostinger** | DNS autoritativo | Resolución del dominio | Consultas de resolución. Ningún dato de usuario | No | NS `athena`/`apollo.dns-parking.com` |
| **Hostinger** | **Monarx**, agente de seguridad | Escáner de *webshells* que Hostinger instala en el VPS | Convive con el sistema de ficheros que contiene la base | Por documentar | Servicio `monarx-agent` activo; conexión TLS a `32.189.158.86:443` (bloque de Amazon) |
| **Resend** | Correo transaccional | Invitación, restablecer contraseña, verificar dirección | **La dirección del destinatario y una URL con token de un solo uso.** Los cuerpos no llevan nombre ni gimnasio | Metadatos de entrega | `resend.mailer.ts`, `templates.ts`; remitente en el arranque del contenedor |
| **Backblaze B2** | Almacenamiento de copias | Copia diaria, semanal y de cada despliegue | El volcado completo de la base, **cifrado con `age`**: B2 no puede leerlo | **Sí** | `docker/backup.sh`; bucket `gymlab-copias`, privado, sin replicación |
| **healthchecks.io** | Interruptor de hombre muerto | Avisa si la copia diaria deja de ejecutarse | UUID del check e IP del servidor. Ningún dato de usuario | No | `HEALTHCHECK_URL` en `backup.sh` |
| **Let's Encrypt** | Certificados TLS | HTTPS del dominio | Dominio e IP; el certificado queda en registros públicos de transparencia | No | Emisor real: `O=Let's Encrypt, CN=YE1` |

#### Cadena de publicación, sin datos personales de usuarios

| Proveedor | Servicio | Qué toca |
| --- | --- | --- |
| **Expo / EAS** | Compilación de los binarios | Código fuente y **credenciales de firma**. Proyecto `94dd2583-…`, cuenta `pumaplysz` |
| **Apple** | App Store y caché de la AASA | Nuestro fichero público; cuentas de revisión; los datos de quien descargue, por su cuenta |
| **Google** | Play y Play App Signing | Binario, ficha, cuentas de revisión; ídem sobre descargas |
| **GitHub** | Repositorio y CI | Código y tests con datos sintéticos. Sin datos de producción |

> **Monarx, dicho con precisión.** Es un **servicio/agente de seguridad
> proporcionado por Hostinger**, no contratado ni instalado por RINDA. Su
> condición contractual —si es subencargado de Hostinger y si está cubierto por
> su DPA— **está pendiente de confirmar**, y **no se afirma que ya esté
> correctamente declarado**. Se decidió **no retirarlo**.

#### Verificado que NO intervienen

Grep sobre todo `apps` y `packages`: cero analítica, cero Firebase, cero
Sentry, sin `expo-notifications` (no hay APNs ni FCM), sin `expo-updates` (no
hay actualizaciones por aire), sin pasarela de pago, sin mapas. La tipografía
es `@fontsource-variable/inter`, **autoalojada**. Fuera de `api.resend.com`, el
código de producción no llama a ningún host externo.

### A.6 Dónde se procesa — hechos medidos, sin calificar

| Proveedor | Dónde, confirmado | Qué falta por saber |
| --- | --- | --- |
| **Hostinger — VPS** | **Fráncfort, Alemania.** Confirmado en el panel el 2026-09-16 | La cadena de subencargados de Hostinger y su DPA |
| **Backblaze B2** | **`eu-central-003`, Ámsterdam (UE).** `s3endpoint` de la propia cuenta; bucket `gymlab-copias`, **sin replicación** a otra región | El DPA de Backblaze y si su matriz estadounidense implica acceso |
| **Resend** | Dominio `envios.gymlabfit.tech` **VERIFICADO** (panel, 2026-09-16). La ruta de retorno apunta a `feedback-smtp.eu-west-1.amazonses.com`, es decir **AWS Irlanda** | **La región contractual de tratamiento de Resend sigue sujeta a la documentación del proveedor.** La ruta de rebotes no basta para determinarla |
| **Hostinger — buzones** | Los buzones **existen y funcionan** | En qué país se almacena el correo |
| **healthchecks.io · Let's Encrypt · Expo · Apple · Google · GitHub** | Sin determinar desde nuestra configuración | Región de cada uno. Ninguno recibe datos de socios |

> **Aquí no se concluye nada jurídico.** No se dice si una transferencia es
> válida, si hacen falta cláusulas, ni si algo cumple. A6 sigue abierta.

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

### C.1 Las copias de seguridad también conservan — y ahí sí hay decisión

Una copia contiene **todo lo anterior sin anonimizar**, así que su caducidad es
parte de la conservación aunque no viva en ninguna tabla.

| Prefijo en B2 | Retención | Estado |
| --- | --- | --- |
| `diario/` | 8 días + 1 hasta borrar = **9** | Ya aplicada |
| `semanal/` | 29 + 1 = **30** | Ya aplicada |
| `predeploy/` · `postdeploy/` | 30 + 1 = **31** | **Aplicada el 2026-09-16** |

Hasta el 2026-09-16 esos dos prefijos **no tenían ninguna regla**: 20 volcados
completos de agosto de 2026 iban a quedarse para siempre. Ya caducan. La
primera eliminación automática cae sobre los tres objetos del 18 de agosto,
alrededor del **2026-09-18**, y el último de la tanda desaparece hacia el
**2026-10-01**.

> **Una copia retrasa una supresión hasta 31 días.** Si algún plazo de arriba
> obliga a *suprimir* en menos que eso, hay que decirlo: el borrado de cuenta
> actúa sobre la base, no sobre las copias. Es parte de lo que valora A4.
