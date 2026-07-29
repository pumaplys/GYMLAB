# Correo

Envío transaccional: invitaciones, restablecer contraseña y verificar email.

## Cómo funciona

Nada se envía dentro de una petición HTTP. **ADR-0008 lo prohíbe**: mantendría la
transacción abierta y, con carga, agotaría el pool de conexiones. El correo se
encola en pg-boss dentro de la transacción de la petición —lo que da el
*transactional outbox*— y este módulo lo consume después.

```
handler → jobs.enqueue(cola, {to, token, url})   dentro de la transacción
                    ↓
          pgboss.job                              commitea con los datos
                    ↓
          EmailWorker.procesar()                  fuera de la petición
                    ↓
          Mailer.send()                           Resend o consola
```

## Dos transportes

| | Cuándo | Qué hace |
|---|---|---|
| `ResendMailer` | Hay `RESEND_API_KEY` | Envía de verdad |
| `ConsoleMailer` | No hay clave, fuera de producción | Registra el correo en el log |

**Arrancar en producción sin clave es un error y el proceso muere diciéndolo.**
Caer al transporte de consola en silencio significaría que nadie recibe
invitaciones ni puede recuperar su contraseña, y que el log parece normal. Un
fallo que no se ve es peor que una caída.

En desarrollo no hace falta cuenta de Resend: el log imprime el texto plano, que
es donde están los enlaces en claro.

## Errores y reintentos

La distinción que importa es si reintentar puede ayudar:

| Tipo | Ejemplos | Qué se hace |
|---|---|---|
| **Transitorio** | límite de peticiones, caída del proveedor, red | Se relanza. pg-boss reintenta: 5 veces, desde 60 s y con espera creciente |
| **Definitivo** | email mal formado, remitente sin verificar, clave inválida | Se registra como `ERROR` y el trabajo termina |
| **Desconocido** | cualquier otro | Se reintenta — es el lado seguro |

Un definitivo **no** se relanza a propósito: agotar cinco intentos sobre una
dirección que nunca va a funcionar llena el log de ruido y entierra la causa.

Agotados los reintentos de un transitorio, el trabajo queda en estado `failed` en
`pgboss.job`, que es consultable. No se pierde en silencio.

La política vive en la **cola**, no en cada trabajo (`scripts/install-pgboss.ts`):
así la heredan todos y no depende de que quien encola se acuerde. Los trabajos
caducan a las 12 h — un correo más viejo que eso ya no sirve, porque los tokens
de invitación y recuperación caducan antes o poco después.

## Los enlaces apuntan al panel, no a la API

`WEB_APP_URL`, no `API_URL`. Quien recibe una invitación necesita un formulario
donde elegir su contraseña, y la API no tiene interfaz.

**Cuidado con Better Auth:** genera sus propias URLs con la forma
`{baseURL}/reset-password/{token}`, que son rutas de **su router HTTP** — y
ADR-0009 decidió no montarlo. Esos enlaces estarían muertos. Por eso
`auth.instance.ts` descarta su `url` y arma la nuestra desde el token.

Solo se descubrió al empezar a enviar correos de verdad, porque antes ningún
enlace llegaba a nadie.

## Plantillas

Literales de plantilla en `templates.ts`, sin motor de plantillas: son tres
correos cortos y una dependencia más sería peor que el problema que resuelve.

Cada correo lleva HTML **y texto plano**. No es purismo: hay clientes que
bloquean el HTML, y un correo de recuperación que llega vacío es alguien que no
puede entrar.

## Tests

`src/__tests__/mail.e2e.test.ts` sustituye el transporte por uno que captura los
mensajes, así que comprueba destinatario, asunto y contenido de verdad sin llamar
a Resend. Cubre las tres clases de error, que el enlace apunte al panel, y que
una cola sin plantilla lance en lugar de enviar un correo vacío.
