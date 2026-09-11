# 18 · Preparación para las tiendas (RELEASE-2)

**Fecha de la auditoría:** 2026-09-11
**`main` auditado:** `19424c70ad9c6524b926605ca60eee0b9a8fd916`
**Artefactos:** iOS `production` IPA 0.1.0 (3) · Android `production` AAB 0.1.0 (versionCode 2)

Esto es una **auditoría**, no un plan de publicación. Nada se ha enviado a
revisión y no se ha generado ninguna build para escribirlo.

## Cómo se derivó

Todo lo marcado ✅ o 🔴 sale de mirar el artefacto, el esquema de la base de
datos o el código, no de la memoria ni de la documentación previa. Lo que
depende de una consola a la que no tenemos acceso desde aquí queda como
**UNKNOWN** y **no se convierte en OK**.

---

## 1. ¿RINDA permite crear cuenta desde la app?

**SÍ.** Derivado, no supuesto:

| Flujo | Qué hace | Evidencia |
| --- | --- | --- |
| `POST /auth/accept-invitation` | **Crea una identidad nueva**: `token` + `name` + `password` | `@Public()`, `invitations.controller.ts:73`; comentario propio: «SOLO cuentas nuevas» |
| `POST /auth/link-invitation` | Vincula una invitación a una cuenta **existente**. No crea identidad ni toca credenciales | `auth.ts:198`; el contrato no lleva ni nombre ni contraseña |
| `POST /auth/register-gym` | Crea gimnasio + cuenta de dueño. **Público**, pero sin pantalla en móvil | `auth.controller.ts:40` |

La pantalla `app/invitacion.tsx` dice literalmente **«Te han invitado a RINDA —
Crea tu cuenta para entrar en el gimnasio que te ha invitado»** con campos *Tu
nombre* y *Contraseña*, y se alcanza desde el Universal Link
`https://gymlabfit.tech/accept-invitation` y desde `rinda://invitacion`.
Comprobado abriendo los dos enlaces en el emulador.

Que no haya **registro libre** no cambia el hecho: el usuario crea una cuenta
nueva dentro de la app.

> **Consecuencia:** la directriz **5.1.1(v) de Apple** («las apps que permiten
> crear cuenta deben permitir iniciar su eliminación») **aplica**. El borrado de
> cuenta es requisito pendiente de **App Store y de Google Play**, no sólo de
> Play.

---

## 2. Política de privacidad dentro de la app

Apple exige que la política sea accesible **desde la app**, además de por URL.

Hay que distinguir dos cosas que en RINDA se llaman parecido:

| | Qué es | Estado |
| --- | --- | --- |
| **A. Controles de consentimiento** | `app/perfil/privacidad.tsx` → «Privacidad · Tus datos de salud». Muestra el documento de consentimiento **del gimnasio** y permite darlo y retirarlo | Existe y funciona |
| **B. Política de privacidad legal pública** | El documento de RINDA como servicio, accesible sin iniciar sesión | **No existe** |

**Una pantalla llamada «Privacidad» no cumple por el nombre.** La actual es (A):
el texto del responsable del tratamiento es *el gimnasio*, no RINDA, y sólo
cubre los datos de salud.

Medido: **la app móvil no contiene un solo enlace externo**. No hay
`Linking.openURL` ni ninguna URL `https://` fuera de la base de la API.

**PENDIENTE por partida doble:** implementación (acceso desde la app) y metadata
(la URL pública, que hoy da 404).

---

## 3. Matriz — App Store

| Ítem | Estado | Evidencia / qué falta |
| --- | --- | --- |
| Bundle `tech.gymlabfit.rinda` | ✅ | `Info.plist` del IPA |
| Versión / build `0.1.0` / `3` | ✅ | IPA |
| Nombre RINDA · icono 1024² sin alfa | ✅ | `icon.png` es RGB (App Store rechaza alfa) |
| Firma y perfil | ✅ | App Store profile, `get-task-allow=false`, equipo `956JGXGTKZ`, caduca 2027-09-05 |
| Associated Domains | ✅ | `applinks:gymlabfit.tech` en los entitlements firmados del binario |
| Export compliance | ✅ | `ITSAppUsesNonExemptEncryption=false` en el IPA |
| App Privacy → **tracking = NO** | ✅ | Sin `AppTrackingTransparency`, `AdSupport`, `IDFA`, `ASIdentifierManager`. Cero SDK de analítica en 27 dependencias |
| Manifiestos de privacidad de Apple | ✅ | 8 `PrivacyInfo.xcprivacy` en el IPA |
| Sign in with Apple | ✅ **no aplica** | Único proveedor en `accounts`: `credential` |
| Permisos | ✅ | Sólo `NSCameraUsageDescription`, en castellano |
| **Eliminación de cuenta (5.1.1 v)** | 🔴 | No existe ningún endpoint de autoservicio. **Aplica** (ver §1) |
| **Privacy Policy URL** | 🔴 | `/privacy`, `/privacidad`, `/legal` → 404 |
| **Política accesible desde la app** | 🔴 | Ver §2 |
| **Support URL** | 🔴 | `/soporte`, `/support` → 404 |
| **Screenshots** | 🔴 | Ninguno para iOS; requieren dispositivo o simulador (apéndice D) |
| Descripción · subtítulo · keywords · categoría | 🟡 | Propuesta redactada, sin aprobar (apéndice C) |
| Age rating | 🟡 | Sin contenido objetable; se recoge `birth_date`. Decisión |
| **Cuenta de revisión** | 🔴 | Obligatoria: sin credenciales el revisor no pasa del login |
| **Ficha creada en App Store Connect** | ❓ UNKNOWN | `eas.json` no tiene sección `submit` ni `ascAppId`. No verificable sin credenciales |
| Acuerdos pendientes en ASC | ❓ UNKNOWN | Requiere consola |

## 4. Matriz — Google Play

| Ítem | Estado | Evidencia / qué falta |
| --- | --- | --- |
| AAB `production` versionCode 2 | ✅ | Auditado |
| `targetSdk` 36 · `minSdk` 24 | ✅ | Leído del protobuf del manifiesto del AAB |
| Permisos solicitados | ✅ | `CAMERA`, `INTERNET`, `ACCESS_NETWORK_STATE`. `BIND_JOB_SERVICE` y `DUMP` son candados de componente, no permisos solicitados |
| Icono adaptativo | ✅ | 1024² con alfa (correcto en Android) |
| Data Safety → publicidad / tracking | ✅ **no** | Mismo escaneo del artefacto |
| `assetlinks.json` válido | ✅ parcial | La API oficial de Google valida el statement sin errores… |
| **Huella de Play App Signing** | 🔴 | …con **una sola** huella: `DB:43:1D:DB:4D:51:AC…`, la de subida de EAS. Play re-firma, así que **los App Links se romperán en instalaciones de Play** hasta añadir la suya. Procedimiento en [17-enlaces-a-la-app.md](17-enlaces-a-la-app.md) |
| **Eliminación de cuenta (in-app + URL web)** | 🔴 | No existe |
| **Privacy Policy URL** | 🔴 | Igual que Apple |
| **Feature graphic 1024×500** | 🔴 | No existe |
| **Screenshots** | 🟡 | Hay 44 capturas reales de los recorridos de QA en Android, con datos de fixture. Sirven de base; no son material de marketing |
| Descripción · descripción breve | 🟡 | Propuesta redactada, sin aprobar (apéndice C) |
| Content rating · público objetivo · ads | 🔴 | Cuestionarios sin rellenar |
| **App Access (credenciales de revisión)** | 🔴 | Igual que Apple |
| **Play Console: cuenta y ficha** | ❓ UNKNOWN | Requiere consola |
| **Requisito de 12 testers / 14 días** | ❓ UNKNOWN | Depende del tipo y antigüedad de la cuenta. **No se asume** |

---

## 5. Mapa de borrado de datos

Extraído de las reglas `ON DELETE` reales de PostgreSQL, no del código.

### 5.1 Al borrar la ficha de socio (`members`)

| Categoría | Tabla | Regla | Efecto |
| --- | --- | --- | --- |
| Salud | `body_metrics` | CASCADE | **DELETE** — desaparecen las mediciones |
| Consentimientos | `consents` | CASCADE | **DELETE** |
| Notas del entrenador | `member_notes` | CASCADE | **DELETE** |
| Cuotas | `member_subscriptions` | CASCADE | **DELETE** |
| Rutinas asignadas | `routine_assignments` | CASCADE | **DELETE** |
| Entrenador asignado | `trainer_assignments` | CASCADE | **DELETE** |
| Carnés emitidos | `access_tokens` | CASCADE | **DELETE** |
| Invitaciones | `invitations` | CASCADE | **DELETE** |
| **Accesos** | `access_events.member_id` | SET NULL | **ANONYMIZE** — el hecho se conserva, la persona no |
| **Pagos** | `payments.member_id` | SET NULL | **ANONYMIZE** — el importe se conserva, la persona no |

### 5.2 Al borrar la cuenta (`users`)

| Categoría | Tabla | Regla | Efecto |
| --- | --- | --- | --- |
| Credenciales | `accounts` | CASCADE | **DELETE** |
| Sesiones abiertas | `sessions` | CASCADE | **DELETE** |
| Pertenencias | `memberships` | CASCADE | **DELETE** |
| Perfil de entrenador | `trainers` | CASCADE | **DELETE** |
| Consentimientos | `consents` | CASCADE | **DELETE** |
| Ficha de socio | `members.user_id` | SET NULL | **ANONYMIZE** — la ficha del gimnasio sobrevive sin cuenta |
| Auditoría | `audit_log.actor_user_id` | SET NULL | **ANONYMIZE** |
| Eventos de auth | `auth_events.user_id` | SET NULL | **ANONYMIZE** |
| Quién escaneó | `access_events.scanned_by_user_id` | SET NULL | **ANONYMIZE** |
| Quién midió | `body_metrics.recorded_by_user_id` | SET NULL | **ANONYMIZE** |
| Quién cobró / anuló | `payments.recorded_by/voided_by` | SET NULL | **ANONYMIZE** |
| Autoría de notas y rutinas | `member_notes`, `routines` | SET NULL | **ANONYMIZE** |
| **Quién invitó** | `invitations.invited_by_user_id` | **RESTRICT** | **PostgreSQL RECHAZA el borrado** |

### 5.3 Lo que ya existe

`apps/api/src/auth/identity-erasure.ts` implementa el artículo 17 **disparado
por el personal** al borrar una ficha de socio: elimina la pertenencia
`(gym_id, user_id, role='member')` y, **sólo si no le queda ninguna otra
pertenencia**, la cuenta entera. No es autoservicio y no lo puede iniciar la
persona interesada, que es justo lo que piden las dos tiendas.

### 5.4 Los cuatro casos que no se pueden resolver en código

1. **Cuenta en varios gimnasios.** Borrar la cuenta afecta a gimnasios que no
   han pedido nada. El mecanismo actual —borrar sólo la pertenencia, y la cuenta
   sólo si queda huérfana— es el correcto, pero hay que confirmarlo como
   política.
2. **Dueño de un gimnasio.** Si es el único dueño, borrar su cuenta deja el
   gimnasio sin quien lo administre, con socios y cobros vivos. Y `RESTRICT`
   sobre `invitations.invited_by_user_id` lo **impide técnicamente** en cuanto
   haya invitado a alguien. Hace falta decidir: ¿se bloquea?, ¿se exige
   transferir la titularidad?, ¿se anonimiza el emisor de la invitación?
3. **Historial económico.** Los pagos ya se anonimizan, no se borran. Cuánto
   tiempo deben conservarse **es una decisión legal/fiscal, no técnica**.
4. **Auditoría y accesos.** Ya se anonimizan. `access_events` tiene retención
   configurable por gimnasio (`access_events_retention_months`). El periodo
   mínimo y máximo **es decisión legal**.

> **No he fijado ningún periodo de conservación.** No me corresponde.

---

## 6. Decisiones que necesita Eduardo

| # | Decisión | Por qué no la puede tomar el código |
| --- | --- | --- |
| 1 | ¿Borrar la cuenta borra también las fichas de socio de cada gimnasio, o sólo desvincula? | Afecta a responsables del tratamiento distintos |
| 2 | ¿Qué pasa si quien borra es el único dueño de un gimnasio vivo? | Puede dejar un negocio sin administrador |
| 3 | Periodo de conservación de pagos anonimizados | Obligación fiscal |
| 4 | Periodo de conservación de `audit_log` y `access_events` | Obligación de seguridad y laboral |
| 5 | ¿El borrado es inmediato o con ventana de gracia y confirmación por correo? | Riesgo de borrado accidental o malicioso |
| 6 | Texto jurídico del consentimiento de salud | Categoría especial (art. 9 RGPD) |
| 7 | Texto de la política de privacidad pública | Legal |
| 8 | ¿Se publica con la función de progreso inerte, o se espera al texto? | Alcance de producto |

---

## 7. Consentimiento de salud — estado de release

**HOY, en producción:**

- la plantilla vigente es `2026-09-01-borrador`, con `is_draft = true`;
- su cuerpo empieza literalmente por `BORRADOR — texto pendiente de redaccion
  juridica definitiva`;
- `consent-documents.service.ts:116` hace
  `if (plantilla.isDraft && env.NODE_ENV === 'production') return null;`
- y `estado()` devuelve `plantilla_en_borrador`.

**Por tanto: en producción no puede concederse ningún consentimiento nuevo ni
registrarse ninguna medición.** La función viaja en el binario pero está inerte.

Lo que el consentimiento debe describir, **derivado del producto** (no es texto
jurídico):

- **A · Qué datos:** peso, % de grasa corporal, perímetros de pecho, cintura,
  cadera, brazo y muslo, fecha de cada medición y notas del entrenador.
- **B · Dónde se muestra:** `app/perfil/privacidad.tsx` en móvil y
  `/socio/privacidad` en web, antes de poder registrar nada.
- **C · Versionado:** `consent_documents` es inmutable por disparador; cada
  aceptación apunta a una versión concreta, y `body_metrics.consent_version`
  sella cada medición con la versión bajo la que se tomó.
- **D · Retirada:** desde la misma pantalla. Impide mediciones nuevas; las
  anteriores se conservan.
- **E · Histórico:** se conserva hasta que se solicite supresión.

> **Contenido jurídico: PENDIENTE DE APROBACIÓN LEGAL/PRODUCTO.** No se redacta
> aquí.

---

## 8. Lo que está bloqueado y por qué

| Bloqueo | Naturaleza |
| --- | --- |
| Ficha en App Store Connect · Play Console · requisito de testers · huella de Play App Signing | **Sólo consola** |
| Texto de privacidad pública · texto de consentimiento de salud · periodos de conservación · política de borrado | **Sólo decisión legal/producto** |
| Screenshots de iOS | **Sólo dispositivo o simulador** |

Todo lo demás —páginas públicas, borrado de cuenta, `assetlinks.json`,
screenshots de Android, feature graphic, copy— se puede hacer aquí en cuanto
esas decisiones estén tomadas.

---

## Apéndice A · Inventario de datos, para las dos declaraciones

Derivado del esquema real. **Los nombres de categoría hay que confirmarlos
contra el cuestionario vivo de cada consola**: aquí lo que es firme es *qué se
recoge*, no cómo lo llama hoy Apple o Google.

| Dato | Dónde vive | Para qué | ¿Vinculado a la persona? |
| --- | --- | --- | --- |
| Nombre | `users.name`, `members.first_name/last_name` | Identificar a quien entra y a quien se cobra | Sí |
| Correo | `users.email`, `members.email`, `invitations.email` | Acceso y recuperación de contraseña | Sí |
| Teléfono | `members.phone`, `trainers.phone` | Contacto del gimnasio con su socio | Sí |
| Fecha de nacimiento | `members.birth_date` | Ficha del socio | Sí |
| **Salud y forma física** | `body_metrics` — peso, % grasa, pecho, cintura, cadera, brazo, muslo, notas | Seguimiento del entrenamiento | Sí |
| Consentimientos | `consents` — incluye `ip_address` | Prueba del art. 9 RGPD | Sí |
| **Compras** | `payments` — importe, moneda, concepto, método | Cuotas del gimnasio | Sí |
| Identificadores | ids de usuario, `members.member_number` | Funcionamiento | Sí |
| Accesos al gimnasio | `access_events` | Control de entrada | Sí (anonimizable) |
| Auditoría | `audit_log` | Seguridad | Sí |
| IP y agente de usuario | `sessions` | Sesión y seguridad | Sí |

**Lo que NO se recoge, medido en los binarios:** ubicación, contactos, fotos,
micrófono, identificadores de publicidad, datos biométricos. **La cámara sólo
decodifica un QR: no se guarda ninguna imagen.**

**No se guarda ningún dato de instrumento de pago.** `payments.method` es una
etiqueta —`cash`, `transfer`, `card`— y no hay pasarela ni número de tarjeta.

**Tracking: NO**, en ninguna de las dos tiendas. Cero SDK de analítica,
publicidad o atribución.

## Apéndice B · Cuentas de revisión (diseño, sin ejecutar)

Apple y Google necesitan credenciales porque **sin ellas no se pasa del login**.

- **Un gimnasio de revisión aislado en producción.** Nunca datos de clientes
  reales.
- **Cuatro cuentas**, una por rol: `owner`, `receptionist`, `trainer`, `member`.
  Nombres ficticios.
- **Datos mínimos para que la app se pueda recorrer:** un plan, una cuota
  vigente para el socio —si no, el escáner sólo da `NO PASA`— y una rutina
  asignada.
- **El carné se genera desde la propia app**, así que el revisor puede probar el
  escáner con dos dispositivos o con una captura.
- Cada tienda admite **una** credencial en su formulario; para que vean los
  cuatro roles hay que listar las otras tres en las notas de revisión.

Ninguna contraseña se escribe en este documento ni en ningún informe.

## Apéndice C · Propuesta de textos (sin aprobar)

**App Store**

- *Subtítulo (30):* `Tu gimnasio, en el bolsillo`
- *Palabras clave (100):* `gimnasio,socios,carné,acceso,entrenador,rutinas,cuotas,progreso,recepción,fitness`
- *Categoría:* Salud y forma física · secundaria: Negocios
- *Descripción:* RINDA es la app del gimnasio y de quien trabaja en él. El socio
  lleva su carné, su rutina y su progreso; recepción cobra cuotas y da paso;
  el entrenador asigna rutinas y sigue mediciones; la dirección lo ve todo. Cada
  quien ve lo suyo.

**Google Play**

- *Descripción breve (80):* `El carné, la rutina y las cuotas de tu gimnasio, cada quien lo suyo.`
- *Descripción larga:* misma base, ampliando rol por rol.

Redactado a partir del producto auditado. **Sin aprobar.**

## Apéndice D · Capturas disponibles

Hay **44 capturas reales** de los recorridos de QA de Android (1080×2400),
tomadas contra el entorno local con datos de fixture: panel de cada rol, ficha
de socio, cuota, pagos, planes, personal, accesos, configuración, rutinas,
ejercicios, carné, progreso, privacidad y los veredictos del escáner.

Sirven como base y cumplen el formato de Play. **No son material de marketing**
—muestran «Lucia Fernandez» y «ZZ Diseno»— y **no hay ninguna de iOS**, que
requiere dispositivo o simulador.
