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

**Rollback:** revertir la FK a `RESTRICT` exige que no haya ninguna fila con
`invited_by_user_id IS NULL`; si ya se ha borrado alguna cuenta, esas filas hay
que reasignarlas o eliminarlas antes. Por eso el camino de vuelta no es
automático y no se ofrece como migración inversa.

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
