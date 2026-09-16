-- Consentimiento de datos de salud: VERSION DE LANZAMIENTO.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ SE CREA UNA VERSION NUEVA. NO SE APRUEBA LA VIEJA.                      │
-- │                                                                          │
-- │ Marcar `is_draft = false` sobre '2026-09-01-borrador' habria sido una    │
-- │ linea menos y una mentira: ese texto empieza literalmente diciendo       │
-- │ «BORRADOR — pendiente de redaccion juridica definitiva». Convertirlo en  │
-- │ definitivo con un UPDATE dejaria a quien lo aceptara leyendo que esta    │
-- │ aceptando un borrador.                                                   │
-- │                                                                          │
-- │ El borrador se queda como HISTORICO. No se borra —podria haber           │
-- │ aceptaciones apuntando a el— pero deja de poder ampararlas: quien manda  │
-- │ es `HEALTH_CONSENT_VERSION`, y a partir de aqui apunta a la nueva.       │
-- │                                                                          │
-- │ Comprobado antes de escribir esto, en la base de PRODUCCION: cero        │
-- │ documentos publicados, cero consentimientos y cero mediciones. No hay    │
-- │ ninguna aceptacion historica que proteger.                               │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- `is_draft = false` se pone EXPLICITO aunque la columna tenga ese valor por
-- defecto al reves: quien lea esta migracion dentro de un ano tiene que ver,
-- sin ir a buscar el DDL, que esta version SI ampara datos de categoria
-- especial.
INSERT INTO "consent_document_templates" ("purpose", "version", "title", "body", "is_draft") VALUES
  (
    'health_data',
    '2026-09-16',
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
    '  - las mediciones y notas que ya existan en este gimnasio SE ELIMINAN, '
    'como muy tarde en 30 dias.\n\n'
    'De ese borrado se conserva solo la constancia del hecho —que version '
    'aceptaste, cuando la aceptaste y cuando la retiraste— durante 3 anos, '
    'para poder demostrar que el tratamiento estuvo amparado. Esa constancia '
    'no guarda ninguna medida corporal ni ninguna nota.\n\n'
    'Retirar el consentimiento no afecta a lo que fue licito mientras estuvo '
    'vigente.\n\n'

    'COPIAS DE SEGURIDAD\n'
    'Los datos eliminados pueden seguir existiendo dentro de una copia de '
    'seguridad cifrada durante un maximo aproximado de 31 dias, hasta que esa '
    'copia caduca y se destruye sola.\n\n'

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
