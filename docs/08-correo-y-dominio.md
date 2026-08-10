# Correo y dominio (B2)

> Guía para dejar el envío real funcionando con **Resend** y un dominio de
> **Hostinger**. Está escrita para hacerse **junto**, en este orden, y sin
> ejecutar nada por adelantado.
>
> Lo que hay del lado del código está cerrado y verificado. Ver
> [`00-estado.md`](00-estado.md).

---

## Antes de tocar nada

Dos decisiones y una comprobación.

**El dominio de envío será un subdominio**, `envios.TUDOMINIO`. No el dominio
principal, y el motivo es concreto: la reputación de envío se gana y se pierde
por dominio. Si algún día un correo transaccional acaba marcado como spam de
forma masiva, **el daño queda contenido en `envios.` y no arrastra al correo
normal** ni a la web. Separarlo después, cuando ya hay historial, es mucho más
caro que empezar así.

**La comprobación:** el dominio tiene que estar usando los servidores de nombres
de Hostinger para poder gestionar los registros desde su panel. En hPanel:

```
Dominios → [tu dominio] → DNS / Servidores de nombres
```

Si ahí aparecen los de Hostinger (`ns1.dns-parking.com` y similares), los
registros se crean en esa misma sección. Si el dominio apunta a los servidores
de otro proveedor, los registros hay que crearlos **allí**, no en Hostinger.

---

## 1. Añadir el dominio en Resend

En Resend: **Domains → Add Domain**, y escribir `envios.TUDOMINIO`.

Resend responde con **una lista de registros concretos**. Esos valores son
únicos de tu cuenta y de tu dominio: la clave DKIM se genera en ese momento y
**no se puede adivinar ni copiar de ninguna guía**. Por eso este documento
describe qué son y cómo introducirlos, pero los valores exactos salen de esa
pantalla.

Serán de tres tipos:

| Tipo | Nombre (relativo) | Para qué sirve |
|---|---|---|
| **TXT (DKIM)** | `resend._domainkey.envios` | Firma criptográficamente cada correo. Es lo que prueba que salió de verdad de tu dominio |
| **TXT (SPF)** | `send.envios` | Autoriza a los servidores de Resend a enviar en tu nombre |
| **MX** | `send.envios`, prioridad `10` | Recibe los rebotes, para que Resend sepa qué direcciones no existen |

> ### El SPF y el MX NO van en el dominio de envío
>
> Van en **`send.envios`**, no en `envios`. Los correos salen de
> `envios.TUDOMINIO`, pero los rebotes vuelven a `send.envios.TUDOMINIO`: Resend
> usa un subdominio aparte para la **ruta de retorno**.
>
> Es fácil no darse cuenta y ponerlos un nivel más arriba. Entonces la
> verificación no pasa y los registros «están puestos».

**Y una buena noticia sobre la trampa de Hostinger:** Resend da los nombres ya
recortados, en la forma relativa que Hostinger espera. **Se pegan tal cual.**

**Cópialos tal cual a un sitio antes de salir de esa pantalla.** La clave DKIM
es larga y se puede volver a consultar, pero tenerla a mano ahorra idas y
venidas al crear los registros.

## 2. Crearlos en Hostinger

```
Dominios → [tu dominio] → DNS / Servidores de nombres → Gestionar registros DNS
```

> ### ⚠️ La trampa que se come a todo el mundo
>
> **Hostinger añade el dominio automáticamente al campo «Nombre».**
>
> Si Resend te dice que el host es `resend._domainkey.envios.TUDOMINIO` y lo
> pegas entero, Hostinger crea
> `resend._domainkey.envios.TUDOMINIO.TUDOMINIO` — y la verificación no pasa
> nunca, sin decir por qué.
>
> **Lo que hay que escribir es la parte de la izquierda, sin tu dominio.** Para
> ese ejemplo: `resend._domainkey.envios`.
>
> Regla: coge el host que da Resend y **quita `.TUDOMINIO` del final**.

Con `TTL` se puede dejar el valor por defecto. Si el panel ofrece 300 segundos,
mejor: acelera los reintentos mientras se verifica.

**Un aviso sobre SPF:** solo puede existir **un** registro TXT de SPF por
nombre. Si `envios.TUDOMINIO` ya tuviera uno, no se añade un segundo — se
combinan en una sola línea. Como es un subdominio nuevo, lo normal es que no
haya ninguno.

## 3. Verificar en Resend

Botón **Verify** en la misma pantalla. Suele tardar minutos, aunque el DNS
puede llegar a la hora.

**Antes de pulsarlo**, conviene comprobar desde fuera que los registros ya se
ven. Hay un script para eso:

```bash
.\scripts\comprobar-dns.ps1 -Dominio envios.TUDOMINIO
```

Comprueba los cuatro registros y **busca explícitamente la trampa del recuadro
de arriba**: si encuentra el DKIM con el dominio repetido, lo dice con nombre y
apellidos en lugar de limitarse a informar de que falta.

> Usa `Resolve-DnsName` y no `dig` **porque `dig` no viene con Windows** —
> comprobado en el equipo desde el que se despliega. Una guía con `dig` falla en
> el primer comando.

Si un registro sale como `[FALTA]`, o no ha propagado todavía —de minutos a una
hora— o el nombre quedó mal escrito.

## 4. DMARC

Este registro **no lo da Resend: lo decides tú**, y por eso aquí sí va el valor
exacto. Le dice al mundo qué hacer con un correo que dice venir de tu dominio y
no supera las comprobaciones.

| Campo | Valor |
|---|---|
| Tipo | `TXT` |
| Nombre | `_dmarc.envios` |
| Valor | `v=DMARC1; p=none; rua=mailto:TU_CORREO@TUDOMINIO` |

Se empieza con **`p=none`** a propósito: no rechaza nada, solo pide informes.
Poner `p=reject` desde el primer día, antes de saber si todo firma bien, es la
forma más rápida de que tus propios correos dejen de llegar. Cuando los informes
confirmen que todo sale firmado, se sube a `p=quarantine` y después a
`p=reject`.

---

## 5. Las variables del servidor

En el `.env` del VPS, junto al compose. **La clave no pasa por ningún sitio más
que ese fichero.**

```bash
RESEND_API_KEY=re_...
EMAIL_FROM=GYMLAB <no-reply@envios.TUDOMINIO>
```

Dos cosas que el proceso ya comprueba solo, y por las que **no arrancará** si
están mal:

- Sin `RESEND_API_KEY` en producción, muere al arrancar. Caer al transporte de
  consola en silencio significaría que nadie recibe nada y que el log parece
  normal.
- Con la clave puesta, `EMAIL_FROM` **tiene que llevar una dirección con un
  dominio real**. Antes se podía arrancar con el valor por defecto
  —`no-reply@localhost`— y Resend descartaba cada envío sin reintento, dejando
  solo una línea de `ERROR`.

Y el dominio de `EMAIL_FROM` tiene que ser **el mismo que se verificó**. Enviar
desde uno sin verificar acaba en spam, que es peor que no enviar: nadie se
entera.

---

## 6. La prueba controlada

En este orden, y parando en el primero que falle.

> **Hasta que el dominio esté verificado, Resend solo permite enviar a la
> dirección de la propia cuenta.** Encaja con el paso 1: es a ti mismo.

| # | Qué se hace | Qué demuestra |
|---|---|---|
| 1 | `forgot-password` con **tu propia dirección** | Que sale de verdad |
| 2 | Mirar las cabeceras del correo recibido | `spf=pass` y `dkim=pass` |
| 3 | Abrir el enlace y **completar el restablecimiento** | El recorrido entero desde el dominio real |
| 4 | Invitar a un miembro del personal a otra dirección | El alta, que es lo que hoy bloquea el piloto |
| 5 | Aceptar esa invitación y entrar | Que quien recibe el correo acaba dentro |

El paso 3 es el que importa. Hay una clase de fallo que **solo aparece
enviando**: Better Auth genera sus propias URLs contra un router que no
montamos, y si no se descartaran, todos los enlaces estarían muertos. Ya está
resuelto, pero es el tipo de cosa que este paso destapa.

En el paso 2, en Gmail: abrir el correo → menú de tres puntos → **Mostrar
original**. Ahí salen `spf`, `dkim` y `dmarc`.

### Y una comprobación que se olvida

Mirar la **carpeta de spam** aunque el correo llegue. Un correo que llega a spam
cuenta como no entregado: en un gimnasio, nadie va a buscarlo ahí.

---

## Lo que NO hace falta contratar

- **Plan de pago de Resend**, de momento. El gratuito da 3.000 correos al mes y
  100 al día, de sobra para un piloto.
- **Correo de buzón** (recibir en `@TUDOMINIO`). Esto es solo envío
  transaccional. `no-reply@` no necesita bandeja de entrada.
