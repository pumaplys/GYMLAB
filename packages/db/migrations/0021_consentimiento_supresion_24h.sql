-- Consentimiento de salud: version 2026-09-17, con el plazo de supresion real.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ OTRA VERSION, OTRA VEZ. NO SE EDITA LA ANTERIOR.                        │
-- │                                                                          │
-- │ `2026-09-16` prometia borrar las mediciones «como muy tarde en 30 dias». │
-- │ El comportamiento real pasa a ser un SLA de 24 HORAS en base activa: la  │
-- │ retirada encola la supresion en el acto y el trabajo diario queda como   │
-- │ red de seguridad.                                                        │
-- │                                                                          │
-- │ Corregir el texto de la version anterior con un UPDATE habria sido una   │
-- │ linea menos y la misma trampa de siempre: quien lo hubiera aceptado      │
-- │ tendria guardada una version cuyo contenido cambio despues, y la prueba  │
-- │ de que acepto ESE texto se evapora. La regla de esta base de datos es    │
-- │ que un texto no se edita: se publica otro.                                │
-- │                                                                          │
-- │ `2026-09-16` se queda como historico. Nunca llego a publicarse como      │
-- │ documento de ningun gimnasio en produccion — comprobado antes de         │
-- │ escribir esto — pero eso no la convierte en editable.                     │
-- │                                                                          │
-- │ Y ademas dice lo que pasa si se restaura una copia de seguridad, que es  │
-- │ el unico camino por el que un dato suprimido puede reaparecer.           │
-- └──────────────────────────────────────────────────────────────────────────┘
INSERT INTO "consent_document_templates" ("purpose", "version", "title", "body", "is_draft") VALUES
  (
    'health_data',
    '2026-09-17',
    'Consentimiento para el tratamiento de tus datos de salud',
    E'RESPONSABLE DEL TRATAMIENTO\n'
    'El responsable es {{responsable}}, es decir, tu gimnasio. RINDA es la '
    'aplicacion que el gimnasio utiliza y actua como encargada del '
    'tratamiento, siguiendo sus instrucciones.\n\n'

    'QUE DATOS\n'
    'Peso en kilogramos. Porcentaje de grasa corporal. Perimetros de pecho, '
    'cintura, cadera, brazo y muslo, en centimetros. La fecha de cada '
    'medicion. Y las notas que tu entrenador escriba sobre tu estado fisico o '
    'tu salud junto a esas mediciones.\n\n'
    'Todos son opcionales: se registra lo que se mida, no hace falta medirlo '
    'todo.\n\n'

    'PARA QUE\n'
    'Para seguir la evolucion de tu estado fisico y personalizar tu '
    'entrenamiento. Para nada mas: estos datos no se usan con fines '
    'comerciales, no se ceden a terceros y no alimentan ninguna analitica.\n\n'

    'BASE JURIDICA\n'
    'Tu consentimiento explicito (art. 9.2.a del RGPD). Son datos de categoria '
    'especial, y sin este consentimiento no puede registrarse ni una sola '
    'medicion.\n\n'

    'QUIEN ACCEDE\n'
    'Tu. El entrenador que tengas asignado. Y la direccion del gimnasio, '
    'segun los permisos que tenga configurados.\n\n'
    'EL PERSONAL DE RECEPCION NO ACCEDE a estos datos. No es una norma '
    'interna: la aplicacion se lo impide.\n\n'

    'ESTE CONSENTIMIENTO ES VOLUNTARIO\n'
    'Se pide por separado y no va dentro de ninguna otra aceptacion. NO '
    'CONDICIONA TU PERTENENCIA AL GIMNASIO: puedes ser socio, entrenar y usar '
    'la aplicacion sin aceptarlo. Lo unico que no tendras es el seguimiento de '
    'mediciones.\n\n'

    'CADA GIMNASIO, POR SEPARADO\n'
    'Este consentimiento vale para el gimnasio que figura arriba y para ningun '
    'otro. Si eres socio de varios, aceptar en uno no dice nada de los demas, '
    'y retirarlo en uno tampoco.\n\n'

    'PUEDES RETIRARLO CUANDO QUIERAS\n'
    'Desde tu area privada, sin dar explicaciones y sin coste. Al retirarlo:\n'
    '  - se bloquea de inmediato el registro de nuevas mediciones y notas;\n'
    '  - las mediciones y notas que ya existan en este gimnasio SE ELIMINAN. '
    'La supresion se pone en marcha en el mismo momento en que la pides, y '
    'como maximo se completa en 24 HORAS.\n\n'
    'De ese borrado se conserva solo la constancia del hecho —que version '
    'aceptaste, cuando la aceptaste y cuando la retiraste— durante 3 anos, '
    'para poder demostrar que el tratamiento estuvo amparado. Esa constancia '
    'no guarda ninguna medida corporal ni ninguna nota.\n\n'
    'Retirar el consentimiento no afecta a lo que fue licito mientras estuvo '
    'vigente.\n\n'

    'COPIAS DE SEGURIDAD\n'
    'Se hacen copias cifradas del sistema. Un dato ya suprimido puede seguir '
    'existiendo dentro de una copia hasta que esa copia caduca sola, lo que '
    'ocurre como maximo unos 31 dias despues. Las copias no se consultan salvo '
    'para restaurar el servicio tras un incidente, y SI ALGUNA VEZ SE '
    'RESTAURA UNA que contenga datos ya suprimidos, la supresion se vuelve a '
    'aplicar.\n\n'

    'SI CAMBIA EL TEXTO\n'
    'Publicar una version nueva obliga a pedirte el consentimiento otra vez. '
    'La version que aceptaste queda guardada tal cual, junto a cada medicion '
    'que se tomo bajo ella.\n\n'

    'TUS DERECHOS\n'
    'Puedes pedir acceso, rectificacion, supresion, limitacion, oposicion y '
    'portabilidad de tus datos ante el gimnasio, que es el responsable. '
    'Tambien puedes reclamar ante la autoridad de control.',
    false
  )
ON CONFLICT ("purpose", "version") DO NOTHING;
