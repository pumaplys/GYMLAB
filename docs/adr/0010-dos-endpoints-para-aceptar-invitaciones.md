# ADR-0010 — Dos endpoints para aceptar invitaciones

- **Fecha:** 2026-07-30
- **Estado:** Aceptado
- **Relacionado:** ADR-0004 (Better Auth), ADR-0006 (fronteras de módulo), ADR-0007 (autenticación)

## Contexto

Aceptar una invitación hace dos escrituras en **dos conexiones distintas**:

```
1. auth.api.signUpEmail(...)     → conexión de Better Auth   (users, accounts)
2. withTenant(gymId, tx => ...)  → nuestra conexión          (invitations, memberships, audit_log)
```

El adaptador Drizzle de Better Auth se construye con una instancia de base de
datos **fija**, la del pool. No hay forma de pasarle la transacción de la
petición, así que el paso 1 commitea por su cuenta antes de que empiece el 2.

**Existe por tanto una ventana no atómica.** Si algo falla entre ambos —error de
base de datos, carrera con otra aceptación, caída del proceso— queda una cuenta
creada sin pertenencia a ningún gimnasio.

## El problema

Con el código actual, reintentar **no funciona**. `signUpEmail` rechaza un email
que ya existe, así que el segundo intento falla y la invitación **nunca puede
aceptarse**: la persona se queda con cuenta, sin pertenencia y sin salida.

El comentario que había en `accept()` afirmaba que era «recuperable, se puede
reintentar». Era falso.

## El riesgo que hay que evitar al arreglarlo

El arreglo evidente —*detectar que el usuario ya existe y continuar con la
vinculación*— **abre un secuestro de cuentas entre gimnasios**.

> Ana es socia del Gimnasio 1 con la cuenta `ana@ejemplo.com`.
>
> El recepcionista del Gimnasio 2 da de alta un socio con **ese mismo email** y le
> envía invitación. El email lo elige él: nada se lo impide.
>
> Si aceptar con un email ya existente permitiera **fijar una contraseña**, quien
> tenga ese token se apodera de la cuenta de Ana — y con ella de su acceso al
> Gimnasio 1.

No es un caso rebuscado: es la consecuencia directa de permitir que un token de
invitación escriba credenciales de una cuenta preexistente.

**Importante para quien lea esto:** el riesgo **no está** en el código anterior a
este ADR. Hoy `signUpEmail` falla con un email duplicado, así que el sistema es
seguro aunque poco útil. El riesgo aparecería al implementar la recuperación de
forma ingenua. Este ADR existe para que eso no ocurra.

De ahí la regla que gobierna todo lo demás:

> **Un token de invitación nunca puede crear ni modificar credenciales de una
> cuenta que ya existe.**

## Alternativas consideradas

| Alternativa | Por qué se descarta |
|---|---|
| **Un endpoint con dos comportamientos** según si el email existe | Fue la primera propuesta. Concentra en un handler la decisión más delicada del sistema —¿toco credenciales o no?— y la hace depender de una consulta. Un `if` mal editado dentro de esa bifurcación es un secuestro de cuentas |
| **Pasar nuestra transacción a Better Auth** | Su adaptador se ata a una instancia fija. Exigiría parchear la librería |
| **Crear el usuario nosotros, sin su API** | Obligaría a replicar su hashing y el formato de credenciales, que es justo lo que ADR-0004 le delegó por ser peligroso a mano |
| **Encolar la creación de cuenta** | La persona espera sin poder entrar, y el fallo se traslada a un sitio donde no puede reaccionar |
| **Un job que borre cuentas huérfanas** | Borrar cuentas de forma automática es peligroso, y con la recuperación por reintento no hace falta |

## Decisión

**Dos endpoints separados, cada uno con un único comportamiento.**

| Endpoint | Acceso | Cuerpo | Qué hace |
|---|---|---|---|
| `POST /v1/auth/accept-invitation` | Público | `token`, `name`, `password` | **Solo cuentas nuevas.** Si el email ya tiene cuenta responde `409` indicando que hay que iniciar sesión y usar el otro endpoint. Nunca toca una cuenta existente |
| `POST /v1/auth/link-invitation` | **Autenticado** | `token` | **Solo cuentas existentes.** No acepta contraseña ni nombre: no hay nada en el cuerpo con lo que modificar credenciales. Consume la invitación, crea la pertenencia y vincula la ficha |

La separación no es estética. Que `link-invitation` **no reciba contraseña en su
contrato** significa que no puede cambiar credenciales ni por error de
programación: no hay dato con el que hacerlo. Eso es una garantía estructural, no
una comprobación que alguien pueda olvidar — el mismo criterio que llevó a RLS en
ADR-0002.

### `link-invitation` exige que el email coincida

La sesión autenticada debe pertenecer a la **misma dirección** que la invitación.
Sin esa comprobación, cualquiera con una cuenta y un token ajeno —un correo
reenviado, por ejemplo— se daría de alta en un gimnasio al que no fue invitado.

## Consecuencias

**Positivas**

Un token de invitación no puede escribir credenciales de nadie. No por
disciplina: por la forma del contrato.

La recuperación tras el fallo no atómico funciona sin intervención. La cuenta
quedó creada con la contraseña que la persona eligió, así que puede iniciar
sesión y usar `link-invitation`. **La operación converge al estado correcto sin
tocar la base de datos a mano.**

Cada endpoint hace una cosa, y los tests de abuso son directos.

**Negativas**

Dos endpoints donde antes había uno, y el cliente debe manejar el `409` para
llevar a la persona a iniciar sesión. Es fricción real en el panel web.

Si alguien tiene cuenta con un email y el gimnasio le invita a **otro**, no puede
vincular: tendrá que pedir que le reinviten a su dirección real. Se acepta —la
alternativa es relajar la comprobación de email, que es la que cierra el
secuestro.

**Lo que sigue sin ser atómico:** la creación de la cuenta. Todo lo posterior sí
lo es. Una cuenta huérfana no filtra nada: sin pertenencia no hay gimnasio
activo, sin gimnasio activo no hay contexto de tenant, y sin contexto RLS
devuelve cero filas en todas partes.

**Coste de revertir:** bajo. Unificar los dos endpoints más adelante sería
posible, pero reintroduciría la bifurcación que este ADR descarta.

**Una restricción que apareció al implementarlo:** quien implemente el punto de
extensión de invitaciones no puede depender de `invitations`. Romper el ciclo de
*módulos* —interfaz en `common`, cableado en la raíz— no basta, porque el
contenedor de dependencias mira los *proveedores*: con `MembersService` como
implementador el grafo seguía siendo circular
(`MembersService → InvitationsService → hook → MembersService`) y la aplicación
se quedaba colgada en el arranque, sin ningún error. Por eso el hook lo
implementa una clase aparte, `MemberAccountLink`, que no depende de nada. La
regla vale para el módulo de entrenadores cuando llegue.

## Cómo se verifica

Tests de abuso, no del camino feliz
(`apps/api/src/__tests__/invitation-link.e2e.test.ts`):

- Un token cuyo email ya tiene cuenta **no** cambia su contraseña: tras intentar
  `accept-invitation`, la contraseña anterior sigue funcionando.
- `link-invitation` sin sesión responde `401`.
- `link-invitation` con una sesión de **otra** dirección responde `403`.
- Tras `link-invitation`, las credenciales **no** han cambiado: la contraseña de
  siempre sigue sirviendo.
- `link-invitation` sí crea la pertenencia y vincula la ficha del socio.
- El token es de un solo uso **entre los dos endpoints**: consumido por uno, el
  otro lo rechaza. Se comprueba el **motivo** del rechazo, no solo el código: al
  falsificar el test quitando las guardas del token seguía pasando, porque quien
  ya pertenece al gimnasio recibe otro `400` que tapaba el fallo.

## Señales para revisarla

- Better Auth admite una transacción externa —como pg-boss admite
  `fromDrizzle(tx, sql)`—. Entonces desaparece la ventana no atómica, aunque la
  separación de endpoints seguiría justificada por sí misma.
- Aparece inicio de sesión con Google o Apple: habrá que decidir si vincular una
  invitación a una identidad federada sigue las mismas reglas.
