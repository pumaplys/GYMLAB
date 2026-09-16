# Evaluación de impacto — módulo de salud y progreso

**Adoptada por el responsable el 2026-09-16.** Art. 35 RGPD.

> **Ninguna autoridad de control ha aprobado esta evaluación, y no se ha
> consultado a ninguna.** Es el análisis propio del responsable sobre un
> tratamiento de categoría especial. Tampoco afirma que el tratamiento «cumpla»:
> describe qué hace, qué puede salir mal y qué se ha puesto para evitarlo.

---

## 1. Por qué se hace esta evaluación

Se tratan **datos de salud** (art. 9) de forma sistemática dentro de un producto
multiinquilino. Aunque el volumen sea pequeño y el tratamiento no implique
decisiones automatizadas ni perfilado, la categoría por sí sola justifica
analizarlo antes de abrirlo.

## 2. Qué se trata exactamente

Peso en kilogramos · porcentaje de grasa corporal · perímetros de pecho,
cintura, cadera, brazo y muslo · fecha de cada medición · **notas de texto libre
del entrenador** junto a cada medición · la versión del consentimiento bajo la
que se recogió cada dato.

Todos los campos son opcionales salvo la fecha y la versión del consentimiento.

**Dónde vive:** la tabla `body_metrics`, con `gym_id` y `member_id`. **Las notas
son una columna de esa misma fila**, no una tabla aparte: se borran con ella.

> **`member_notes` es otra cosa y no está aquí.** Son las notas internas de
> mostrador, las escriben dirección y recepción, y **no** están amparadas por el
> consentimiento de salud ni se borran al retirarlo. Confundirlas sería grave en
> las dos direcciones: borraría notas administrativas legítimas, o dejaría notas
> de salud sin borrar. Ver §9, riesgo residual 2.

## 3. Finalidad, necesidad y proporcionalidad

**Finalidad:** seguir la evolución física de un socio y personalizar su
entrenamiento.

**Necesidad:** es la función que el gimnasio y el socio esperan de un módulo de
progreso; sin estos datos no existe.

**Proporcionalidad:**

- **no hay fotos de progreso** — se descartaron del alcance: exigirían cifrado
  de objetos, URLs firmadas y una retención propia, y no son imprescindibles;
- **no hay inferencias** — el producto muestra lo medido y su evolución; no
  calcula índices de riesgo, no clasifica, no recomienda nada automáticamente;
- **no hay tratamiento secundario** — estos datos no se agregan, no se exportan,
  no se comparten con terceros ni alimentan ninguna analítica, porque no hay
  ninguna;
- **el consentimiento es separado y no condiciona la pertenencia al gimnasio.**

## 4. Interesados y quién accede

**Interesados:** socios que acepten el consentimiento. Sólo mayores de 18, en la
medida en que el producto conoce la edad — **la fecha de nacimiento es opcional,
así que no se afirma que todos estén verificados como mayores** (ver riesgo
residual 4).

| Quién | Acceso |
| --- | --- |
| El propio socio | Sus datos |
| Entrenador asignado | Los de sus socios |
| Dirección | Según los permisos configurados |
| **Recepción** | **Ninguno** |

Que recepción no acceda no lo garantiza RLS —dentro de un gimnasio no distingue
roles— sino la autorización de aplicación, y por eso tiene tests propios.

## 5. Multiinquilino: dónde está el riesgo de verdad

El riesgo mayor de un producto así no es que alguien de fuera entre: es que **un
gimnasio vea los datos de otro**.

- El aislamiento está en **la base de datos**, con Row Level Security, no en los
  `WHERE` del código. Un `WHERE` olvidado no filtra datos de otro inquilino
  porque la política de la tabla no los devuelve.
- La API se conecta con un rol **sin privilegios** sujeto a esas políticas, no
  con el propietario, y comprueba al arrancar que las políticas siguen activas.
- Las claves ajenas son **compuestas** `(gym_id, member_id)`: una medición no
  puede apuntar a un socio de otro gimnasio ni por error de programación.
- **El consentimiento es por gimnasio.** Aceptar en uno no dice nada del otro, y
  retirarlo en uno no toca los datos del otro. La purga filtra siempre por
  `(gym_id, member_id)`.

## 6. Amenazas consideradas

| Amenaza | Qué se ha puesto |
| --- | --- |
| Datos de salud escritos sin consentimiento | Puerta en el **servicio**, no en la ruta: cubre controlador, trabajos de fondo, importaciones y guiones. Falla en cerrado: sin documento publicado no se registra nada |
| Consentimiento amparado en un texto que nadie puede enseñar | El documento aceptado es **inmutable por disparador de base de datos**; cada aceptación apunta al texto exacto, y cada medición guarda la versión bajo la que se tomó |
| Cambio de texto que deja consentimientos «heredados» | Publicar una versión nueva retira la anterior; los consentimientos de la vieja dejan de servir solos, sin que nadie tenga que invalidarlos |
| Un borrador usado como si fuera definitivo | Columna `is_draft`, no un sufijo en el nombre. En producción, un borrador **no ampara nada** |
| Recepción accediendo | Autorización por rol, con tests |
| Fuga por copia de seguridad | Copias **cifradas con clave pública**: el servidor que las crea no puede leerlas. Caducan solas en ≤ 31 días |
| Retirada que no borra nada | Purga diaria automática; el plazo vive en SQL, no en el código |
| Purga que borra de más | La función exige que **no exista** consentimiento vigente, y filtra por gimnasio. Tiene test que comprueba lo que **no** debe borrar |
| Registro de auditoría reescrito | `UPDATE` y `DELETE` retirados al rol de la aplicación |
| Datos de salud en la tabla de identidad | `users` guarda sólo credenciales; está escrito como comentario en la propia base de datos |

## 7. Consentimiento: cómo se demuestra

1. El texto se publica **por gimnasio**, con la identidad del responsable
   congelada dentro. Sin esa identidad configurada, **no se publica**.
2. La aceptación guarda: el documento exacto, la versión, la fecha y la IP.
3. Cada medición guarda **la versión bajo la que se tomó**.
4. `audit_log` registra `consent.granted`, `consent.revoked` y cada
   `progress.recorded`.
5. Aceptar dos veces no crea dos filas: un registro con duplicados es peor
   prueba, no mejor.

## 8. Ciclo de vida y borrado

| Momento | Qué pasa |
| --- | --- |
| Se retira el consentimiento | **Inmediato:** no se registra ni se modifica nada más. **Programado:** mediciones y notas de ese gimnasio se eliminan en **≤ 30 días** (en la práctica, menos de 24 horas) |
| Tras el borrado | Queda sólo versión, fecha de aceptación y fecha de retirada. **Se elimina también la IP** |
| A los 3 años | Se elimina también esa constancia |
| Se elimina la cuenta | Consentimientos, mediciones y notas **se eliminan**, no se anonimizan |
| Copias de seguridad | Pueden contenerlos hasta **31 días** |

## 9. Riesgos residuales — los que quedan

1. **La ventana de la copia de seguridad.** Entre que algo se borra y que la
   última copia que lo contiene caduca pasan hasta 31 días. Se acepta: la
   alternativa —no tener copias, o excluir de ellas una tabla— es peor para la
   persona, que perdería sus datos ante un incidente. Están cifradas y sólo se
   consultan para restaurar.

2. **Texto libre.** Las notas del entrenador pueden contener más de lo
   necesario, y recepción podría escribir algo de salud en `member_notes`, que
   **no** está cubierta por este consentimiento ni por su borrado. Mitigación
   actual: una indicación en la propia pantalla de notas, en móvil y en web,
   pidiendo no incluir información sensible innecesaria. **No hay control
   técnico sobre el contenido de un campo de texto**, y no se pretende que lo
   haya.

3. **La dirección IP en la aceptación.** Se guarda como prueba de la
   aceptación. Se elimina en cuanto se retira el consentimiento, pero mientras
   está vigente es un dato más de lo estrictamente necesario. Se acepta a cambio
   de la robustez de la prueba.

4. **La edad.** RINDA está *dirigida* a mayores de 18 y lo impide cuando conoce
   la fecha de nacimiento, en el contrato compartido y en una restricción de la
   base de datos. Pero **la fecha es opcional**: no se afirma que todas las
   personas usuarias estén verificadas.

5. **El agente de seguridad del proveedor.** Monarx corre en el servidor y lo
   pone Hostinger. Su cobertura contractual está pendiente de confirmar.

6. **Los plazos y la calificación jurídica no están revisados externamente.**

## 10. Conclusión del responsable

Con las medidas descritas, el tratamiento **puede iniciarse** cuando se
resuelvan los bloqueos de identidad fiscal y se firmen los contratos de encargo
con los gimnasios. **No se concluye que exista un riesgo bajo en términos
jurídicos**, porque esa conclusión no corresponde a quien escribe el código:
se concluye que los riesgos identificados tienen una medida concreta y
comprobable detrás, y que los residuales están escritos en vez de ignorados.

**Revisión:** cuando cambie el texto del consentimiento, cuando se añadan datos
al módulo (por ejemplo fotos), o cuando cambie un proveedor con acceso.
