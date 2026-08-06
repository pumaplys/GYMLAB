# GYMLAB — El producto

> Última actualización: **2026-08-05** · Tres verticales descritas: socios,
> cuotas y personal
>
> Este documento es la referencia **de negocio** del proyecto, igual que
> [`00-estado.md`](00-estado.md) lo es del estado técnico. De aquí salen la web
> comercial, el dossier de ventas y el pitch.

---

## La regla que gobierna este documento

> **No se describe nada que no esté implementado y verificado.**

Cada vertical separa lo que ya funciona de lo que existe solo en el servidor y
de lo que es visión. Un bloque de este documento debe poderse copiar tal cual a
una propuesta comercial **sin que ninguna frase resulte falsa el día que el
cliente abra el producto**.

Y cada vertical responde a una pregunta que, si no tiene respuesta clara, es
señal de que no hemos entendido el valor: **¿por qué un gimnasio pagaría por
esto?**

### Lo que hoy no se puede decir

Vale la pena tenerlo escrito, porque son las frases que salen solas:

- «Gimnasios que ya usan GYMLAB…» — **ninguno lo usa.**
- «Probado en producción» — **no hay producción.** El producto no está
  desplegado en ningún sitio.
- «Los socios reciben su invitación por correo» — el sistema **encola** el
  correo correctamente; el envío real nunca se ha ejecutado, porque no hay
  proveedor contratado.
- Cualquier cifra de ahorro, rendimiento o satisfacción. No hay ni una medición
  de uso real.

---

## Vertical 1 — Socios

### El problema que tenía el gimnasio

La ficha de un socio vive en una hoja de cálculo, en un cuaderno o en la cabeza
de quien lleva más tiempo en el mostrador. Cuando alguien pregunta «¿este quién
es?», la respuesta depende de quién esté ese día.

Y hay una confusión que cuesta cara: **un socio no es un usuario del sistema.**
Un gimnasio tiene gente apuntada que nunca tendrá cuenta, ni la quiere. Los
sistemas que obligan a crear un usuario para cada persona acaban con fichas
falsas y correos inventados.

### Cómo lo resuelve GYMLAB

Recepción da de alta a alguien con lo mínimo —nombre y apellidos—, y añade
correo, teléfono o fecha de nacimiento si los tiene. La ficha existe con o sin
cuenta.

Cuando esa persona sí necesita entrar al sistema, se le invita desde su propia
ficha, y la cuenta que cree queda vinculada a ella.

El listado busca por nombre, apellido, correo o número de socio, y pagina de
verdad: no es una lista que se arrastra cuando hay setecientos.

### Qué cambia para cada uno

| | |
|---|---|
| **Propietario** | Deja de depender de que una persona concreta recuerde quién es quién |
| **Recepción** | Encuentra a alguien en segundos, con el dato que tenga a mano: el nombre a medias o el número que trae apuntado |
| **Entrenador** | No aplica todavía: su acceso a socios llega con las asignaciones |

### ¿Por qué pagaría un gimnasio por esto?

Porque es el registro sobre el que se apoya todo lo demás —cobrar, dar acceso,
entrenar— y porque **el día que la persona que lo sabía todo se va, el gimnasio
no se queda a ciegas.**

### Limitaciones actuales

**Ya implementado y verificado**
- Alta, búsqueda, listado paginado, ficha, edición, baja y reactivación.
- Invitación a crear cuenta desde la ficha.

**Implementado en el servidor, sin pantalla todavía**
- Notas internas sobre un socio.
- Exportación de todos sus datos y borrado definitivo (RGPD).

**No existe en ninguna capa**
- No se puede **vaciar** un dato de la ficha: se cambia un teléfono, no se borra.
  El panel lo dice en vez de fingir que lo guardó.

**Visión**
- Fotografía, documentos y firma del contrato en la ficha.

### Valor para el negocio

| | |
|---|---|
| **Tiempo que ahorra** | Buscar a alguien deja de ser recorrer una hoja de cálculo |
| **Errores que evita** | Fichas duplicadas y correos repetidos: el sistema los rechaza |
| **Dependencia que elimina** | La del empleado que «se sabe» a los socios |
| **Riesgo que reduce** | Perder el registro entero por un archivo corrupto o un portátil robado |
| **Ingresos que protege** | Un socio que no está fichado es un socio al que nadie cobra |

---

## Vertical 2 — Cuotas y pagos

### El problema que tenía el gimnasio

Saber quién está al corriente es la pregunta que más veces se hace al día en un
mostrador, y la que peor se responde. La información está repartida entre
recibos, una hoja de cálculo y la memoria.

De ahí salen las dos pérdidas clásicas: **gente que entrena sin haber pagado**, y
**gente a la que se le reclama un pago que sí hizo** — que es peor, porque
además de no cobrar, molesta a un cliente.

### Cómo lo resuelve GYMLAB

La ficha del socio dice, en una etiqueta, si está al corriente, si vence pronto,
si está vencida o si no tiene cuota. Se le asigna su plan, se le registra el
cobro y queda el historial completo.

Hay una regla deliberada que evita una discusión frecuente: **cada pago cubre
exactamente un periodo.** Quien debe tres meses y paga uno sigue debiendo, y la
pantalla lo dice **en el momento del cobro**, no cuando la persona se planta en
la puerta.

**GYMLAB no cobra el dinero.** Registra cobros que el gimnasio hace por sus
medios. Esto no es una carencia: es una decisión que le ahorra al gimnasio
entregar sus datos bancarios a un tercero.

### Qué cambia para cada uno

| | |
|---|---|
| **Propietario** | Deja de descubrir a fin de mes que llevaba semanas sin cobrar a alguien |
| **Recepción** | Responde «¿estoy al día?» sin consultar a nadie, y cobra dejando rastro |
| **Entrenador** | No ve nada de esto: el dato económico no le hace falta para entrenar |

### ¿Por qué pagaría un gimnasio por esto?

Porque **encuentra dinero que ya era suyo.** Un socio activo sin cuota vigente o
una cuota vencida que nadie miró son ingresos perdidos que no aparecen en ningún
sitio hasta que alguien los busca.

### Limitaciones actuales

**Ya implementado y verificado**
- Estado de la cuota, alta con plan, registro de pagos e historial.
- Importes en céntimos enteros, sin decimales que deriven.

**Implementado en el servidor, sin pantalla todavía**
- Crear y editar los planes y sus precios: **hoy el catálogo se monta a mano.**
- Congelar una cuota por lesión o vacaciones, y reanudarla.
- Cancelar una cuota.
- Anular un pago mal apuntado (solo el propietario, y deja constancia del motivo).

**Visión**
- Cobro automático de las cuotas.
- Avisos al socio antes de que le venza.

### Valor para el negocio

| | |
|---|---|
| **Tiempo que ahorra** | Se acaba el cuadre manual entre recibos y lista de socios |
| **Errores que evita** | Reclamar un pago ya hecho, o dejar pasar a quien no ha pagado |
| **Dependencia que elimina** | La hoja de cálculo que solo entiende una persona |
| **Riesgo que reduce** | Discusiones en el mostrador sin nada que enseñar |
| **Ingresos que protege** | **Este es el bloque que directamente encuentra dinero:** cuotas vencidas y socios activos sin cuota |

---

## Vertical 3 — Personal

### El problema que tenía el gimnasio

Un gimnasio no lo lleva una sola persona. Hay quien abre por la mañana, quien
cierra, entrenadores que entran y salen. Cada uno necesita acceso, y **cada
acceso es una decisión sobre quién puede tocar el dinero y los datos de todos
los socios.**

Sin forma de gestionarlo, quedan dos salidas y las dos son malas: compartir la
contraseña del dueño —y perder todo rastro de quién hizo qué— o depender de un
tercero para cada alta.

### Cómo lo resuelve GYMLAB

El dueño invita por correo indicando el rol. La persona elige su contraseña y
entra. Si ya trabajaba en otro gimnasio con GYMLAB, añade el nuevo a su cuenta
sin tocar nada de lo que ya tenía.

Cada invitación queda a la vista con su estado, y las pendientes se revocan.

**Y cuando alguien se va, se le retira el acceso.** Pierde la entrada en la
siguiente pantalla que toque, sin esperar a que caduque su sesión. Su historial
no se borra: queda constancia de que trabajó allí, de cuándo dejó de hacerlo y
de quién lo decidió. Si vuelve meses después, se le invita otra vez y quedan las
dos etapas.

**Y hay un límite que el sistema impone, no sugiere:** recepción puede
incorporar entrenadores, pero **no puede crear propietarios ni otras
recepcionistas**, ni retirarle el acceso a nadie. No es una opción escondida: el
servidor rechaza la petición aunque alguien se salte la pantalla.

Un detalle que evita un accidente caro: **un propietario no puede retirarse a sí
mismo**, así que un gimnasio no puede quedarse sin nadie que mande.

### Qué cambia para cada uno

| | |
|---|---|
| **Propietario** | Monta su equipo el mismo día y lo desmonta cuando toca, sin llamar a nadie. Y sabe que quien está en el mostrador no puede ampliarse los permisos |
| **Recepción** | Cubre el hueco cuando el dueño no está: incorpora entrenadores y ve quién trabaja allí, sin poder tocar la estructura del negocio |
| **Entrenador** | Entra con su cuenta, no con una compartida |

### ¿Por qué pagaría un gimnasio por esto?

Porque responde a un miedo concreto del dueño: **en un negocio donde recepción
maneja el dinero y los datos de todos los socios, saber quién tiene acceso —y
poder quitárselo el día que alguien se va— vale dinero.**

La pregunta que lo resume: *«esta mañana he despedido a alguien que conocía los
datos de todos mis socios. ¿Cuánto tarda en dejar de entrar?»* La respuesta es
la siguiente vez que toque una pantalla.

### Limitaciones actuales

**Ya implementado y verificado**
- Invitar a propietario, recepción y entrenador, con la matriz de permisos
  aplicada en el servidor y reflejada en el panel.
- Ver quién forma parte del gimnasio ahora mismo, con su rol y desde cuándo.
- Retirar el acceso, solo el propietario y nunca a sí mismo.
- Estado de cada invitación y revocación de las pendientes.
- Aceptar creando cuenta nueva, o añadiendo el gimnasio a una cuenta existente
  sin tocar su contraseña.

**Implementado en el servidor, sin pantalla todavía**
- Perfil del entrenador, su baja, y asignarle socios.

**No existe en ninguna capa**
- **Cambiar el rol de alguien que ya está dentro.** Hoy hay que retirarle el
  acceso y volver a invitarle con el rol nuevo.
- **Ver qué socios se han quedado sin entrenador.** Al retirar a un entrenador
  sus asignaciones sobreviven, así que esos socios apuntan a alguien que ya no
  entra, y ninguna pantalla lo muestra. Fue una decisión consciente: es
  preferible a que un gimnasio no pueda cortar un acceso por no haber
  reasignado antes.

**Visión**
- Historial de quién hizo qué dentro del gimnasio, visible para el propietario.
- Permisos más finos que los cuatro roles actuales.

### Valor para el negocio

| | |
|---|---|
| **Tiempo que ahorra** | Una contratación —o una salida— deja de ser un trámite con el proveedor |
| **Errores que evita** | Contraseñas compartidas, accesos sin dueño conocido, y el clásico «se fue hace meses y seguía entrando» |
| **Dependencia que elimina** | La nuestra: el gimnasio gestiona su equipo entero sin pedirnos nada |
| **Riesgo que reduce** | **El mayor de esta vertical:** un exempleado con acceso a los datos y los cobros de todos los socios. Y, del otro lado, que alguien del mostrador se dé permisos que no le tocan |
| **Ingresos que protege** | Indirecto, pero real: un incidente de acceso indebido a datos de socios es el tipo de cosa que termina una relación comercial |

---

## Lo que sostiene todo lo anterior

No se vende solo, pero es lo que hace que lo demás se pueda vender.

**Los datos de un gimnasio no son visibles para otro.** No por cuidado al
programar: lo impone la base de datos. Es la primera comprobación de cada
cambio, y hay 40 pruebas dedicadas exclusivamente a eso.

**Los datos de salud están bloqueados a propósito.** Peso y medidas son
categoría especial del RGPD. El módulo existe y **no acepta ni un dato** hasta
que existan los textos de consentimiento. Preferimos entregarlo bloqueado antes
que tratar datos de salud sin base legal.

**Recepción no ve datos de salud.** No es una preferencia de producto: es
minimización de datos, y está impuesta por rol y por base de datos.
