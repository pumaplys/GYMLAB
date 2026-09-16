# Proveedores y subencargados — RINDA

**Adoptado por el responsable el 2026-09-16.** Inventario derivado del
repositorio, del servidor y del DNS, no de una plantilla.

> **No todos los proveedores son encargados del tratamiento, y llamarlos a todos
> así sería tan incorrecto como omitirlos.** Aquí se separan en tres grupos.
> **La calificación jurídica definitiva de cada uno sigue pendiente de revisión**,
> igual que los contratos que haya que firmar.

---

## A · Proveedores que pueden tratar datos personales de usuarios

| Proveedor | Servicio | Qué puede pasar por él | ¿Almacena? | Dónde | Contrato |
| --- | --- | --- | --- | --- | --- |
| **Hostinger** | VPS | Todo: identidad, credenciales, sesiones con IP, socios, pagos, accesos, rutinas, salud, consentimientos, auditoría | Sí | **Fráncfort, Alemania** (confirmado en panel, 2026-09-16) | DPA del proveedor — **por firmar/verificar** |
| **Hostinger** | Correo de buzón | Las solicitudes de derechos y su contenido, con la identidad de quien reclama | Sí | Sin determinar | Ídem |
| **Hostinger** | DNS autoritativo | Consultas de resolución. Ningún dato de usuario | No | Anycast | Ídem |
| **Backblaze B2** | Copias de seguridad | El volcado completo, **cifrado con `age`**: el proveedor no puede leerlo | Sí | **`eu-central-003`, Ámsterdam** | DPA del proveedor — **por firmar/verificar** |
| **Resend** | Correo transaccional | **La dirección del destinatario y una URL con un token.** Nada más: los cuerpos no llevan nombre ni gimnasio | Metadatos de entrega | Dominio verificado; ruta de rebotes en AWS `eu-west-1`. **Región contractual sujeta a su documentación** | DPA del proveedor — **por verificar** |

### Monarx — el que no pusimos nosotros

`monarx-agent` corre como servicio en el VPS y mantiene una conexión TLS
permanente contra un extremo de Amazon. Es un escáner de *webshells* para PHP;
RINDA no ejecuta PHP.

**Lo instala Hostinger, no RINDA.** Se documenta como **componente de seguridad
proporcionado por Hostinger**, y su **condición contractual —si es subencargado
suyo y si está cubierto por su DPA— está pendiente de confirmar**. No se afirma
que ya esté correctamente declarado. **Se decidió no retirarlo.**

Convive con el sistema de ficheros donde está la base de datos, así que no es un
detalle menor: es exactamente el tipo de cosa que una revisión debe resolver.

## B · Infraestructura y publicación, sin datos de producción

| Proveedor | Servicio | Qué toca |
| --- | --- | --- |
| **healthchecks.io** | Aviso de que la copia diaria se ejecutó | Un identificador y la IP del servidor. Ningún dato de usuario |
| **Let's Encrypt (ISRG)** | Certificados TLS | Dominio e IP. El certificado queda en registros públicos de transparencia |
| **Expo / EAS** | Compilación de los binarios | Código fuente y credenciales de firma |
| **GitHub** | Repositorio y CI | Código y tests con datos sintéticos |

## C · Responsables independientes

**Apple y Google.** Distribuyen la aplicación y tratan los datos de la descarga
y de la cuenta de tienda **por su cuenta y bajo sus propias políticas**. Ahí no
actúan por instrucción de RINDA, así que no son encargados: son responsables de
su propio tratamiento. También reciben las **cuentas de revisión**, que son
sintéticas.

## D · Verificado que NO intervienen

Comprobado sobre todo el código de `apps` y `packages`:

- cero herramientas de analítica o medición;
- sin Firebase, sin Google Services, sin Sentry;
- **sin notificaciones push** — no hay `expo-notifications`, luego no hay APNs ni FCM;
- **sin actualizaciones por aire** — no hay `expo-updates`;
- sin pasarela de pago y sin mapas;
- tipografía **autoalojada** (`@fontsource-variable/inter`): no se llama a Google Fonts.

Fuera de `api.resend.com`, el código de producción no contacta con ningún host
externo.

## E · Flujos internacionales — hechos, sin calificar

| Proveedor | Confirmado | Qué falta por saber |
| --- | --- | --- |
| Hostinger VPS | Fráncfort, Alemania | Su cadena de subencargados |
| Backblaze B2 | Ámsterdam; bucket privado y **sin replicación** a otra región | Si su matriz estadounidense implica acceso |
| Resend | Dominio de envío verificado; rebotes en `eu-west-1` | **La región contractual de tratamiento, según su documentación** |
| Hostinger buzones | Operativos | En qué país se almacena el correo |
| Resto | — | Región de cada uno. Ninguno recibe datos de socios |

> **Que algo esté cifrado no lo convierte automáticamente en «no transferencia».**
> El cifrado de las copias reduce el riesgo —el proveedor no puede leerlas— pero
> la calificación jurídica del flujo es otra cosa, y no se hace aquí.

Los mecanismos contractuales de cada proveedor se incorporarán **cuando se
verifiquen en su documentación**. No se enumeran de memoria.

---

## Cómo se mantiene esto al día

Cuando entre o salga un proveedor:

1. se actualiza este documento;
2. se actualiza el resumen de la política de privacidad pública;
3. se revisa si cambia algo del [RAT](rat.md) o de la [EIPD](eipd-salud.md).

El inventario técnico se puede volver a derivar en cualquier momento: sale de
`docker/compose.produccion.yml`, `docker/backup.sh`, las dependencias de
`apps/*` y el DNS del dominio.
