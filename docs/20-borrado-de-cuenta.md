# 20 · Borrado de cuenta (artículo 17)

**Fecha:** 2026-09-14 · rama `release/account-deletion-privacy`

Cómo RINDA elimina la identidad de una persona cuando ella lo pide, qué
sobrevive y por qué.

## 1. Qué significa «eliminar mi cuenta»

**La identidad RINDA entera, en todos los gimnasios.** No es salir de uno.

Una sola operación transaccional: `DELETE /v1/me`. Si algo falla, no se borra
nada.

## 2. No hay dos implementaciones del artículo 17

Ya existía `MembersService.erase`: borra la **ficha** de un socio en **un**
gimnasio, y lo dispara el personal. Es el mismo derecho con otro alcance.

`AccountErasureService` **no lo reimplementa**: recorre cada gimnasio donde la
cuenta pertenece y le pide a cada módulo la operación sobre su propia tabla.

```
AccountErasureService (auth)
  ├─ MembersService.eraseProfileOf(gymId, userId)   → members, y sus cascadas
  ├─ InvitationsService.anonimizarCorreo(email)     → invitations
  └─ lo suyo: memberships, users, auth_events
```

Eso no es ceremonia: **ADR-0006** prohíbe que un módulo lea la tabla de otro, y
el gate `fronteras.test.ts` lo detecta. La primera versión de este servicio leía
`members` e `invitations` directamente y el gate la puso en rojo.

## 3. El aislamiento entre gimnasios se mantiene durante toda la operación

`members`, `body_metrics`, `consents` y compañía tienen RLS de
`gym_id = app_current_gym_id()`. Una transacción con el gimnasio activo de la
sesión **no vería** las fichas de los demás.

Por eso se cambia `app.gym_id` **gimnasio a gimnasio dentro de la misma
transacción**, se hace el trabajo de ese gimnasio, y se restaura el contexto.
En ningún momento hay un contexto que vea dos gimnasios a la vez.

> **La trampa que costó encontrarlo.** La política de lectura de `memberships`
> es `gym_id = app_current_gym_id() OR user_id = app_current_user_id()`, y la
> segunda rama sólo funciona si `app.user_id` está puesto — **no siempre lo
> está**. Sin fijarlo, el borrado recorría **un solo gimnasio**, la cuenta
> quedaba huérfana y se borraba ahí mismo, y la cascada de `users` dejaba la
> ficha del otro gimnasio viva con `user_id` a `NULL`: **con su nombre y su
> correo dentro**. Media identidad viva en otro tenant.
>
> Lo encontró el test de multi-gimnasio. Está falsificado: quitando el arreglo,
> vuelve a fallar con el mismo mensaje.

## 4. El único bloqueo: dueña sin relevo

Si la persona es la **única dueña activa** de uno o más gimnasios, el borrado
**no se completa** y se le dice **qué gimnasio** lo impide, por su nombre.

- **No se borra el gimnasio.** No es suyo para llevárselo: dentro hay datos de
  otras personas.
- **No se le manda a soporte.** Se le dice que invite a otro dueño, que es un
  flujo que ya existe.
- Con **dos dueños activos**, se puede borrar.

Un bloqueo **no es un error**: la respuesta es `200` con
`{ ok: false, bloqueos: [...] }`, para que la pantalla pueda explicarlo con el
nombre delante en vez de traducir un mensaje de error.

Y **no borra nada por el camino**: el test comprueba que tras un bloqueo la
sesión sigue viva y la cuenta intacta.

## 5. Qué se borra y qué sobrevive

Derivado de las reglas `ON DELETE` reales. El mapa completo está en
[18-store-readiness.md](18-store-readiness.md) §5.

**DELETE** — credenciales, sesiones, pertenencias, perfil de entrenador, fichas
de socio en todos los gimnasios, mediciones corporales, consentimientos, notas,
cuotas, rutinas asignadas, entrenador asignado y carnés.

**ANONYMIZE** — pagos y entradas al gimnasio conservan el hecho (importe,
fecha, decisión) sin la persona; la autoría histórica en auditoría, pagos,
notas y rutinas queda a `NULL`.

## 6. La PII que una clave ajena no alcanza

Poner una FK a `NULL` **no es anonimizar**. Dos datos viven en columnas de
texto sueltas y se tratan explícitamente:

| Dato | Qué se hace | Por qué no bastaba la FK |
| --- | --- | --- |
| `auth_events.email_attempted` | Se pone a `NULL` | Guarda el correo **tecleado** en cada intento de entrada. `user_id` caía a `NULL` y el correo seguía en claro |
| `invitations.email` | Se sustituye por `cuenta-eliminada@rinda.invalid` | Una invitación de **personal** no tiene `member_id`, así que no cae con la cascada de la ficha |

La fila se conserva en los dos casos: son registros de seguridad y de «quién
dio acceso a quién». Lo que desaparece es de quién eran.

> `.invalid` está reservado por el RFC 2606 justo para esto: no existe, no se
> puede registrar y no le llega nada a nadie.

## 7. La migración

`0018_borrado_de_cuenta.sql`.

`invitations.invited_by_user_id` era `NOT NULL` + `ON DELETE RESTRICT`:
**PostgreSQL rechazaba borrar la cuenta de cualquiera que hubiera invitado a
alguien** — es decir, de cualquier dueño o recepción en activo. Pasa a admitir
`NULL` y a `ON DELETE SET NULL`.

La intención original —conservar el rastro— se mantiene: la fila sigue ahí con
su rol y su fecha. `NULL` significa «la cuenta que invitó ya no existe», no «no
se sabe quién invitó».

**Rollback:** no es automático. El procedimiento explícito está en §13.

## 8. Sin periodo de gracia

No es una desactivación. Cuando el servidor responde, la cuenta ya no existe y
**todas** las sesiones han caído con ella —en todos los dispositivos—, por la
cascada de `users` sobre `sessions`.

La puerta es **escribir `ELIMINAR`**, no un botón. Un diálogo de confirmación
se acepta por reflejo; escribir una palabra obliga a leer.

## 9. Dónde se inicia

| Sitio | Ruta |
| --- | --- |
| Móvil, socio | Perfil → «Eliminar mi cuenta» |
| Móvil, personal | Panel → «Eliminar mi cuenta» |
| Web, sin la app instalada | `/eliminar-cuenta`, pública |

Los tres llaman al **mismo** `DELETE /v1/me`. La página web funciona sin la app
—que es lo que exige Google— y ofrece entrar o recuperar la contraseña si no
hay sesión.

La carpeta `app/cuenta/` gatea por **sesión**, no por área: es la única así.
Borrar la propia cuenta es un derecho de la persona, no una capacidad de su
puesto, y los cuatro roles tienen que llegar.

## 10. Las dos puertas: intención e identidad

Escribir `ELIMINAR` confirma la **intención** —que no ha sido un dedo torpe—.
**No confirma la identidad.** Un móvil desbloqueado y prestado un momento tiene
la sesión abierta, y con eso bastaba para borrar una identidad entera.

Por eso `DELETE /v1/me` exige además **la contraseña actual**, y la comprueba el
**servidor**: la palabra es una puerta de interfaz que se salta llamando a la
API; ésta no.

### Cómo se verifica, y qué NO se hace

Se usa el verificador de la propia librería, a través de `auth.$context`:

```
ctx.internalAdapter.findAccounts(userId) → la cuenta `credential`
ctx.password.verify({ hash, password })  → el mismo verificador del login
```

- **No se compara ningún hash aquí.** Conocer el algoritmo, el formato y la
  comparación en tiempo constante es cosa de Better Auth; escribir un `compare`
  propio sería inventar criptografía y se separaría de la librería el día que
  cambie de algoritmo.
- **No se usa `signInEmail` para «probar» la contraseña**, que era la otra
  salida evidente: abriría una sesión que nadie ha pedido y gastaría un intento
  del limitador de login, hasta dejar a alguien sin poder borrar su cuenta por
  haberlo intentado dos veces.
- **Falla cerrado.** Si la cuenta no tuviera credencial de contraseña —hoy
  imposible: el único proveedor es `credential`— no se puede borrar por esta
  vía, en lugar de poder borrarse sin comprobar nada.

La comprobación va **antes** que la de bloqueos: con la contraseña equivocada,
la petición no llega a saber siquiera de cuántos gimnasios es dueña la cuenta.

## 11. Un gimnasio nunca se queda sin dueña

Dos caminos pueden quitarle el puesto a una dueña, y **cada uno tiene su
guarda**. No es el mismo gate duplicado:

| Camino | Quién lo hace | Guarda | Por qué esa |
| --- | --- | --- | --- |
| Retirar el acceso | **otra** persona | «nadie puede retirárselo a sí mismo» | Con ella, la última que quede no puede irse. No hace falta contar |
| Borrar la cuenta | **una misma** | contar si queda relevo activo | La anterior no sirve: precisamente se está yendo |

Y un tercer camino que **parece** peligroso y no lo es: borrar la **ficha de
socia** de una dueña. `IdentityErasure` retira sólo la pertenencia de rol
`member`, y sólo borra la cuenta si no le queda **ninguna** pertenencia. Está
probado.

> **Una pertenencia terminada no es un relevo.** El gate cuenta sólo dueñas con
> `ended_at IS NULL`. Probado en las dos direcciones: con relevo vivo se puede;
> tras retirarle el acceso, ya no.

## 12. La trampa de RLS, otra vez, en el gate de bloqueos

La primera versión de `bloqueos()` contaba las otras dueñas y leía el nombre del
gimnasio **con el contexto de la sesión**. Para cualquier gimnasio que no fuera
el activo:

- la otra dueña era **invisible** —la única rama de RLS que sobrevive es
  `user_id = yo`, y esa fila no es mía—, así que el gate anunciaba un bloqueo
  **falso** y no dejaba borrarse a quien sí tenía relevo;
- y `gyms` no devolvía fila, así que el nombre caía al uuid y la pantalla decía
  «el gimnasio 7ee59ad5-… se quedaría sin dueña».

Lo encontró el caso de la dueña de dos gimnasios con relevo en los dos.

## 13. Rollback de la migración 0018

**No es automático, y por eso hay procedimiento.**

Volver a `RESTRICT` exige que **no haya ninguna fila con
`invited_by_user_id IS NULL`**. Si ya se ha borrado alguna cuenta, esas filas
existen y el `ALTER` fallaría.

```sql
-- 1. ¿Cuántas filas lo impiden?
SELECT count(*) FROM invitations WHERE invited_by_user_id IS NULL;

-- 2. Si son 0, el camino de vuelta es limpio:
ALTER TABLE invitations DROP CONSTRAINT invitations_invited_by_user_id_users_id_fk;
ALTER TABLE invitations ADD CONSTRAINT invitations_invited_by_user_id_users_id_fk
  FOREIGN KEY (invited_by_user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE invitations ALTER COLUMN invited_by_user_id SET NOT NULL;

-- 3. Si NO son 0, hay que decidir qué hacer con ellas ANTES: son invitaciones
--    cuya autora ejerció su derecho de supresión. Borrarlas destruye el rastro
--    de «quién dio acceso a quién»; reasignarlas atribuye a alguien algo que no
--    hizo. Es una decisión de producto, no técnica.
```

**Restaurar desde copia** es la otra vía, y la preferible si ya hay cuentas
borradas: `docs/09-copias-de-seguridad.md`. Volver atrás en el esquema **no
devuelve** las identidades eliminadas — el borrado es irreversible por diseño.

## 14. El gate de «listo para tiendas»

```
pnpm --filter @gymlab/web listo-para-tiendas
```

**Hoy está rojo, y eso es lo correcto.** Impide declararse listo para tienda, no
desarrollar: por eso **no** va en el `pnpm test` de cada commit.

Comprueba, sobre lo que de verdad se sirve y sobre la base de datos:

- que `/privacidad` no se sirva marcada **BORRADOR**;
- que no declare campos jurídicos pendientes;
- que `/soporte` no siga en borrador;
- que ninguna plantilla de consentimiento de salud tenga `is_draft`;
- que el pack de revisión legal no tenga huecos.

> La primera versión comparaba el booleano con `'t'` y psql lo imprime como
> `'true'`: **daba por bueno el consentimiento sin haberlo mirado, y no se
> quejaba**. Ahora, si el formato vuelve a cambiar, grita en vez de callarse.
>
> La forma de ponerlo verde es **aprobar los textos**, no inventar valores.
