# Contrato de servicio y acuerdo de encargo — modelo

**Adoptado el 2026-09-16, corregido el 2026-09-17.** Modelo reutilizable para
cualquier gimnasio.

> **Esto es un modelo redactado por el prestador, no un contrato revisado por un
> abogado, y no se afirma que lo esté.** Antes de firmarlo con un cliente real
> conviene que lo revise quien tenga competencia para ello.
>
> **Los datos identificativos no se escriben en este repositorio.** Donde el
> texto dice `[[PRESTADOR_*]]` se sustituye por lo que figura en el
> [aviso legal](aviso-legal.md), que los toma de la configuración de release.
> **El prestador es una persona física**, y el modelo está redactado para que
> funcione así: no hay ninguna referencia a razón social, número de sociedad ni
> objeto mercantil.

---

# Parte A · Contrato de prestación del servicio

## A.1 Partes

**El prestador:** `[[PRESTADOR_NOMBRE]]`, persona física, con domicilio en
`[[PRESTADOR_DOMICILIO]]` e identificador fiscal `[[PRESTADOR_NIF]]`, que presta
el servicio RINDA.

**El cliente:** el gimnasio, con la denominación, el identificador fiscal y el
domicilio que él mismo configura en la aplicación y que aparecerán como
responsable en los documentos que publique a sus socios.

## A.2 Objeto

El prestador pone a disposición del cliente la aplicación RINDA para gestionar
sus socios, sus cuotas y cobros, su control de acceso, su equipo y sus rutinas de
entrenamiento, y para que sus socios dispongan de carné, rutina y —si lo
consienten— seguimiento de progreso.

**El servicio es la aplicación.** El prestador no gestiona el gimnasio, no cobra
a los socios, no presta asesoramiento deportivo ni sanitario, y no interviene en
la relación entre el gimnasio y sus socios.

## A.3 Alta y acceso

El acceso es **por invitación**: el cliente crea las cuentas de su personal y de
sus socios desde la aplicación. **No hay registro libre.** Cada cuenta es
personal, y quien comparte sus credenciales responde del uso que se haga de
ellas.

## A.4 Obligaciones del cliente

1. Facilitar datos identificativos **reales** —denominación, identificador
   fiscal y domicilio—, porque son los que figurarán como responsable del
   tratamiento en los documentos que acepten sus socios.
2. Tener derecho a tratar los datos que introduce, y mantenerlos exactos.
3. Informar a sus socios de cómo trata sus datos, y recoger las bases jurídicas
   que le correspondan como responsable.
4. Usar el servicio conforme a la ley y no intentar acceder a datos de otros
   clientes.
5. Custodiar las credenciales de su personal y retirar los accesos de quien deja
   de trabajar con él.

## A.5 Obligaciones del prestador

1. Mantener el servicio disponible con diligencia, **sin garantizar
   disponibilidad ininterrumpida**: hay mantenimientos, incidencias y cortes de
   terceros que no dependen de él.
2. Mantener el aislamiento entre clientes descrito en la Parte B.
3. Hacer copias de seguridad cifradas y poder restaurarlas.
4. Avisar al cliente de cualquier incidencia de seguridad que le afecte.
5. Devolver o suprimir los datos al terminar, según la Parte B.

## A.6 Datos personales

Todo lo relativo a datos personales se rige por la **Parte B**, que forma parte
inseparable de este contrato.

## A.7 Precio y duración

Precio y periodo de facturación, según lo acordado por escrito entre las partes.
El contrato se mantiene mientras el cliente use el servicio; cualquiera de las
dos partes puede terminarlo con preaviso razonable. La terminación activa lo
previsto en B.13.

## A.8 Responsabilidad

El prestador responde de los daños directos que cause por incumplimiento propio.
**No responde** de las decisiones del cliente sobre sus socios, de la exactitud
de los datos que él introduce, ni de los cortes de proveedores de
infraestructura ajenos a su control.

## A.9 Ley aplicable

Legislación española, con la normativa europea de protección de datos que
resulte aplicable.

---

# Parte B · Acuerdo de encargo del tratamiento (art. 28 RGPD)

## B.1 Objeto

El cliente, como **responsable del tratamiento**, encarga al prestador, como
**encargado**, el tratamiento de los datos personales necesarios para prestar el
servicio RINDA descrito en la Parte A.

**Qué queda fuera de este encargo.** El prestador actúa como **responsable
independiente** —no como encargado— respecto de la identidad y la cuenta RINDA
de cada persona, la autenticación y las sesiones, la seguridad y prevención de
abuso, el soporte, la administración técnica de la plataforma y la atención de
derechos sobre la propia cuenta. Ese reparto está detallado en el
[registro de actividades](rat.md).

## B.2 Duración

La del contrato de la Parte A, y se prolonga hasta que concluya lo previsto en
B.13.

## B.3 Naturaleza y finalidad

**Naturaleza:** alojamiento, almacenamiento, estructuración, consulta,
modificación, comunicación al propio responsable y a los interesados, y
supresión.

**Finalidad:** exclusivamente prestar el servicio. El encargado **no trata los
datos para fines propios**, no los cede a terceros, no los usa para publicidad,
no los agrega y no entrena con ellos ningún modelo.

## B.4 Categorías de interesados

Socios del gimnasio · personal del gimnasio (dirección, recepción y
entrenadores) · personas invitadas que aún no han aceptado.

## B.5 Categorías de datos

| Categoría | Datos |
| --- | --- |
| Identificativos y de contacto | Nombre, apellidos, correo, teléfono, fecha de nacimiento, número de socio |
| Económicos | Cuotas, planes, importes, conceptos, fechas y método de pago. **Ningún dato bancario ni de tarjeta** |
| Asistencia | Entradas al gimnasio con marca de tiempo y decisión |
| Entrenamiento | Rutinas, ejercicios, asignaciones, entrenador asignado |
| **Categoría especial (art. 9)** | **Datos de salud:** peso, porcentaje de grasa, perímetros corporales, fechas y notas del entrenador sobre el estado físico |
| Consentimientos | Versión aceptada, fechas, dirección IP y el texto exacto aceptado |
| Trazabilidad | Registro de qué hizo cada miembro del personal sobre cada ficha |

**Los datos de salud sólo se tratan con el consentimiento explícito del
interesado** (art. 9.2.a). El producto lo exige técnicamente: sin consentimiento
vigente no admite ni una medición, venga la llamada de donde venga.

## B.6 Instrucciones documentadas

El encargado trata los datos **únicamente** siguiendo instrucciones documentadas
del responsable. Son instrucciones documentadas:

1. este acuerdo;
2. las operaciones que la aplicación pone a disposición del responsable y de su
   personal, tal y como están implementadas;
3. la configuración que el responsable elige en la aplicación —entre otras, el
   **plazo de conservación de los accesos**, que él fija;
4. **el calendario de conservación de B.6 bis**, que el responsable acepta como
   configuración estándar del servicio;
5. cualquier instrucción adicional que el responsable dé por escrito y que sea
   técnicamente posible.

### B.6 bis · Calendario de conservación

Estos plazos son la **configuración estándar del servicio**. **No son una
decisión jurídica del encargado:** el responsable los acepta como instrucción
documentada al firmar, y puede sustituirlos por otra instrucción escrita donde
sea técnicamente posible.

| Datos | Configuración estándar | Nota |
| --- | --- | --- |
| Ficha del socio y contacto | Mientras exista la ficha | El responsable la da de baja o pide su supresión |
| Cuotas y pagos | **6 años** | Sigue los criterios habituales de conservación contable y fiscal, **que valora el responsable**. **El encargado no ejecuta ninguna supresión automática de registros económicos** |
| Accesos | **12 meses por defecto** | **Ya es configurable por el responsable** en la aplicación; su valor prevalece sobre el estándar |
| Invitaciones resueltas | **12 meses** | Las pendientes no se tocan |
| Rutinas y asignaciones | Mientras exista la ficha | |
| **Datos de salud** | Hasta que el interesado retire el consentimiento; entonces **≤ 24 horas** en base activa | Lo dispara el interesado, no el responsable. La supresión se encola en el acto |
| Constancia mínima del consentimiento retirado | **3 años** | Versión y fechas. Sin métricas, sin notas y sin IP |
| Registro de actividad del personal | **3 años** | Sirve a la vez a la seguridad del servicio y a la trazabilidad del responsable |

**Datos propios del encargado.** Los eventos de autenticación (`auth_events`,
con IP y agente de usuario) se conservan **90 días** y **no** forman parte de
este encargo: son finalidad propia del prestador —seguridad de las cuentas—, que
actúa sobre ellos como responsable. Se declaran aquí por transparencia, no como
instrucción del cliente.

**Copias de seguridad.** Lo suprimido puede persistir en copias cifradas hasta un
**máximo aproximado de 31 días**. Si alguna vez se restaura una copia que
contenga datos ya suprimidos, **el encargado reaplicará la supresión**.

**Si el encargado considera que una instrucción infringe la normativa, lo
comunicará y podrá suspender su ejecución.**

## B.7 Confidencialidad

El encargado garantiza que quien trate estos datos está sujeto a un deber de
confidencialidad. **A fecha de este documento, el prestador es una persona
física que presta el servicio por sí misma**; si en el futuro interviene alguien
más, quedará sujeto por escrito a la misma obligación antes de tener acceso.

## B.8 Medidas de seguridad (art. 32)

| Medida | Cómo está implementada |
| --- | --- |
| **Aislamiento entre clientes** | Row Level Security en PostgreSQL: las políticas viven en la base de datos, no en los `WHERE` del código. La aplicación se conecta con un rol sin privilegios sujeto a ellas, y comprueba al arrancar que siguen activas |
| Control de acceso por rol | Cuatro perfiles con permisos distintos. **Recepción no accede a datos de salud** |
| Cifrado en tránsito | HTTPS con cabeceras de seguridad |
| Cifrado de las copias | Copias cifradas con clave pública: **el servidor que las crea no puede leerlas** |
| Contraseñas | Almacenadas con función de hash; nadie, tampoco el prestador, puede recuperarlas |
| Trazabilidad | Registro de actividad ***append-only***: al rol de la aplicación se le retiran `UPDATE` y `DELETE` |
| Minimización | Plazos de conservación aplicados por purga automática diaria |
| Restauración | Copias diarias, con **restauración probada** sobre un entorno limpio |
| Limitación de exposición | La base de datos no se publica fuera del servidor |

## B.9 Subencargados

El responsable **autoriza de forma general** al encargado a recurrir a los
subencargados relacionados en
[proveedores y subencargados](proveedores-subencargados.md), donde consta qué
hace cada uno y dónde trata los datos.

El encargado **informará de cualquier alta o baja** con antelación razonable, y
el responsable podrá oponerse por motivos fundados; si la oposición impide
prestar el servicio, cualquiera de las partes podrá terminar el contrato.

El encargado impondrá a cada subencargado obligaciones equivalentes a las de
este acuerdo y responderá de su actuación.

## B.10 Asistencia en derechos de los interesados

El encargado asistirá al responsable para atender acceso, rectificación,
supresión, limitación, portabilidad y oposición, teniendo en cuenta que:

- el interesado puede **eliminar su cuenta RINDA por sí mismo**, desde la
  aplicación o desde la web, sin pasar por nadie;
- si un interesado se dirige al encargado sobre datos de los que **responde el
  gimnasio**, el encargado se lo trasladará sin demora indebida y no responderá
  por su cuenta;
- las funciones de la aplicación (consulta, edición, exportación de lo que
  corresponda y supresión) son la vía principal de asistencia.

## B.11 Asistencia en seguridad, notificación de brechas y evaluaciones

El encargado asistirá al responsable en el cumplimiento de los arts. 32 a 36 y,
**sin dilación indebida desde que la conozca**, le notificará cualquier violación
de seguridad que afecte a sus datos, con lo que sepa en ese momento: qué ha
pasado, a qué categorías y a cuántos interesados afecta aproximadamente,
consecuencias probables y medidas adoptadas, ampliándolo después si hace falta.

**El encargado no notifica por su cuenta a la autoridad de control ni a los
interesados en nombre del responsable:** esa decisión es del responsable.

Para el módulo de salud existe una [evaluación de impacto](eipd-salud.md) que el
encargado pone a disposición del responsable.

## B.12 Registro, información y auditorías

El encargado pondrá a disposición del responsable la información necesaria para
demostrar el cumplimiento de este acuerdo, y permitirá auditorías —incluidas
inspecciones— realizadas por el responsable o por un auditor mandatado por él,
con preaviso razonable, en horario acordado y sin comprometer la seguridad ni la
confidencialidad de otros clientes.

Se consideran medio válido de acreditación la documentación técnica publicada, la
información de los proveedores y los registros de aplicación de la política de
conservación.

## B.13 Supresión o devolución al terminar

**La decisión es del responsable.** Terminada la prestación, **el responsable
determina, conforme a este contrato y a la normativa que le resulte aplicable**,
si los datos se le devuelven o se suprimen:

- **devolución** en formato estructurado y de uso común; o
- **supresión**.

El encargado ejecuta lo que el responsable determine. **A falta de instrucción**,
y tras avisarle, el encargado **suprimirá** transcurridos **30 días naturales**
desde la terminación efectiva — plazo que existe para no retener indefinidamente
datos de los que ya nadie responde, no para sustituir la decisión del
responsable.

El encargado conservará los datos únicamente mientras una obligación legal que le
sea aplicable se lo exija, y en tal caso se lo comunicará al responsable.

**La supresión no es instantánea en las copias de seguridad:** lo suprimido puede
persistir en copias cifradas hasta un **máximo aproximado de 31 días**, tras los
cuales esas copias caducan y se destruyen solas. Durante ese periodo no se
consultan salvo para restaurar el servicio.

## B.14 Transferencias internacionales

El tratamiento principal se realiza en la **Unión Europea**: servidor en
Fráncfort (Alemania) y copias en Ámsterdam. Algún subencargado puede implicar
operaciones fuera del Espacio Económico Europeo según su propia documentación;
los detalles y su estado están en
[proveedores y subencargados](proveedores-subencargados.md).

**El encargado no adopta aquí ninguna conclusión sobre la validez de esas
transferencias ni sobre los mecanismos que las amparen.** Es materia de la
revisión pendiente, y se incorporará cuando esté verificada.

## B.15 Responsabilidad

Cada parte responde de sus propias obligaciones. **El encargado no responde de
las decisiones del responsable** sobre la licitud del tratamiento, las bases
jurídicas que elija, la información que dé a sus interesados ni la exactitud de
los datos que introduce.

---

**Firmas.** Este modelo se firma por duplicado. El prestador firma como persona
física; el cliente, por quien tenga poder para obligarle.
