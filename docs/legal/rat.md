# Registro de actividades de tratamiento — RINDA

**Adoptado el 2026-09-16, corregido el 2026-09-17.** Art. 30 RGPD.

> **La identidad del responsable no está escrita en este documento.** Vive en la
> configuración de release (`NEXT_PUBLIC_PRESTADOR_*`) y se publica en el
> [aviso legal](aviso-legal.md). Este repositorio no guarda datos personales de
> quien presta el servicio.
>
> Este registro **no está auditado ni aprobado por nadie externo**. Describe lo
> que el producto hace, verificado contra el esquema de la base de datos y los
> endpoints de la API.

---

## Parte I · Tratamientos en los que RINDA es RESPONSABLE

Son los que existirían aunque ningún gimnasio fuera cliente: la cuenta es de la
persona, no del gimnasio.

### R1 · Identidad y cuenta RINDA

| | |
| --- | --- |
| **Finalidad** | Crear y mantener la cuenta con la que una persona entra en RINDA |
| **Base jurídica** | Ejecución del servicio; relación contractual o precontractual |
| **Interesados** | Personas con cuenta: dirección, recepción, entrenadores y socios |
| **Categorías** | Nombre, correo electrónico, contraseña cifrada, estado de verificación del correo |
| **Origen** | La invitación del gimnasio y lo que la propia persona introduce |
| **Destinatarios** | Ninguno, salvo el proveedor de alojamiento |
| **Conservación** | Mientras exista la cuenta. Se elimina a petición, desde la propia aplicación |
| **Transferencias** | Ver [proveedores](proveedores-subencargados.md) |
| **Medidas** | Contraseña con hash; la tabla `users` guarda sólo identidad y credenciales, nunca datos de negocio ni de salud |

### R2 · Autenticación y sesiones

| | |
| --- | --- |
| **Finalidad** | Comprobar quién entra y mantener la sesión abierta |
| **Base jurídica** | Ejecución del servicio |
| **Interesados** | Personas con cuenta |
| **Categorías** | Identificador de sesión, **dirección IP**, agente de usuario, fechas |
| **Conservación** | Mientras la sesión esté viva |
| **Medidas** | Cookie de primera parte; `Secure` deducido de la URL pública, y el proceso se niega a arrancar en producción si esa URL no es HTTPS |

### R3 · Seguridad y prevención de abuso

| | |
| --- | --- |
| **Finalidad** | Detectar y frenar intentos de acceso no autorizado |
| **Base jurídica** | **Interés legítimo** en proteger las cuentas de las personas usuarias y el servicio |
| **Interesados** | Quien intenta entrar, tenga cuenta o no |
| **Categorías** | Tipo de evento, correo intentado, **IP**, agente de usuario, marca de tiempo (`auth_events`); contadores de intentos (`auth_throttle`) |
| **Conservación** | **90 días**, purga automática diaria |
| **Medidas** | Tabla global sin RLS a propósito —un login fallido aún no tiene gimnasio—; la IP se toma de la cabecera sólo si hay un proxy de confianza declarado |

> **Ponderación del interés legítimo, en corto.** Sin registrar los intentos
> fallidos no hay forma de distinguir un olvido de contraseña de un ataque, ni de
> limitar por IP. Se guarda lo mínimo para eso, durante un plazo acotado, y no se
> usa para ninguna otra cosa. Quien intenta entrar puede oponerse ante el
> responsable.

### R4 · Soporte

| | |
| --- | --- |
| **Finalidad** | Atender consultas sobre el funcionamiento de la aplicación |
| **Base jurídica** | Ejecución del servicio; interés legítimo cuando quien escribe no es cliente |
| **Interesados** | Quien escriba al buzón de soporte |
| **Categorías** | Las que la persona decida incluir en su mensaje |
| **Destinatarios** | El proveedor del buzón de correo |
| **Conservación** | Mientras sea útil para la consulta y su seguimiento |

### R5 · Ejercicio de derechos sobre la cuenta RINDA

| | |
| --- | --- |
| **Finalidad** | Atender acceso, rectificación, supresión, limitación, oposición y portabilidad |
| **Base jurídica** | **Obligación legal** |
| **Categorías** | La petición, su identificación y lo que se responda |
| **Destinatarios** | El gimnasio correspondiente, cuando la petición se refiere a datos de los que él es responsable |
| **Conservación** | La constancia de haberlo atendido |
| **Medidas** | La supresión de la cuenta es **autoservicio**, exige contraseña actual y no necesita escribir a nadie |

### R6 · Administración técnica de la plataforma

| | |
| --- | --- |
| **Finalidad** | Mantener el servicio en pie: despliegues, copias, diagnóstico de incidencias |
| **Base jurídica** | Ejecución del servicio; interés legítimo en su continuidad |
| **Categorías** | Todo lo alojado, de forma incidental; registros de servicio |
| **Conservación** | Copias, **≤ 31 días**; registros, lo que dure el diagnóstico |
| **Medidas** | Copias **cifradas con clave pública**: el servidor puede crearlas y no puede leerlas. Base de datos no expuesta fuera del host. Purga automática de lo caducado |

---

## Parte II · Tratamientos en los que RINDA es ENCARGADO

Aquí **el responsable es cada gimnasio**. RINDA trata estos datos siguiendo sus
instrucciones documentadas, recogidas en el
[acuerdo de encargo](acuerdo-encargo-art28.md). **Este registro no sustituye al
del responsable:** cada gimnasio debe llevar el suyo.

| # | Tratamiento | Categorías de datos | Conservación |
| --- | --- | --- | --- |
| E1 | Ficha del socio y contacto | Nombre, apellidos, correo, teléfono, fecha de nacimiento, número de socio, alta y baja | Mientras exista la ficha |
| E2 | Cuotas, planes y pagos | Concepto, importe, fecha, método (efectivo, transferencia, tarjeta). **Sin dato bancario alguno** | 6 años |
| E3 | Control de acceso | Entradas con marca de tiempo y decisión; tokens QR de vida muy corta | 12 meses por defecto, configurable por el gimnasio |
| E4 | Entrenamiento | Rutinas, ejercicios, asignaciones, entrenador asignado | Mientras exista la ficha |
| E5 | **Progreso y datos de salud** | Peso, grasa corporal, perímetros, fecha y **notas del entrenador** | Hasta retirar el consentimiento; entonces **≤ 24 horas** |
| E6 | Consentimientos y documentos | Versión aceptada, fechas, IP, y el texto exacto aceptado | Constancia mínima, 3 años tras la retirada |
| E7 | Invitaciones | Correo, rol, fechas | 12 meses desde que se resuelven |
| E8 | Registro de actividad del personal | Acción, entidad, actor, fecha | 3 años |

**Base jurídica:** la determina el gimnasio como responsable. La excepción es
E5, donde el producto **impone** el consentimiento explícito del interesado
(art. 9.2.a) y no admite ninguna otra base: sin consentimiento vigente no entra
ni una medición, venga la llamada de donde venga.

> **Los plazos de esta tabla NO son una decisión jurídica de RINDA.** Son la
> **configuración estándar del servicio**, que el gimnasio acepta como
> **instrucción documentada** al firmar el anexo del art. 28, y puede sustituir
> por otra instrucción donde la arquitectura lo permita — E3 ya es literalmente
> suya, en `gyms.access_events_retention_months`. Ver
> [política de conservación](politica-conservacion.md) §0.
>
> **E8 tiene dos caras**: sirve a la seguridad del propio servicio y a la vez
> registra actividad del personal del gimnasio. No se rediseña ahora; se dice.

### Frontera entre las dos partes: las invitaciones

Una invitación existe **antes** de que haya cuenta. Mientras sólo hay una
invitación pendiente, el correo al que se envió se trata **por cuenta del
gimnasio** que invita (E7). Cuando la persona acepta y crea su identidad RINDA,
esa identidad pasa al ámbito propio de RINDA (R1). Es el mismo dato en dos
momentos con responsables distintos, y por eso está escrito.

---

## Medidas de seguridad comunes

- **Aislamiento por gimnasio en la base de datos** (Row Level Security), no en el
  código de la aplicación. La conexión de la API usa un rol sin privilegios
  sujeto a esas políticas, y el proceso comprueba al arrancar que siguen activas.
- **El registro de auditoría es *append-only***: al rol de la aplicación se le
  retiran `UPDATE` y `DELETE`.
- **Los datos de salud están detrás de una puerta en el servicio**, no en una
  ruta: ninguna entrada —controlador, trabajo de fondo, importación o guion—
  puede escribirlos sin consentimiento vigente.
- **Recepción no accede a datos de salud.** Lo impide la autorización de
  aplicación, con sus tests.
- Transporte por HTTPS, cabeceras de seguridad y base de datos no expuesta.
