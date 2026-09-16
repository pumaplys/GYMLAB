# Política de privacidad — RINDA

**Adoptada por el responsable el 2026-09-16.** Versión publicada en
`https://gymlabfit.tech/privacidad`, enlazada desde la aplicación móvil y desde
`/eliminar-cuenta`.

> **Qué es.** El documento que el responsable adopta y publica. Todo lo que
> describe sale de auditar el producto —el esquema de la base de datos, los
> permisos de los binarios y los endpoints de la API—; los plazos y el reparto de
> papeles son decisiones suyas.
>
> **Qué NO es.** No está certificada, no está aprobada por un abogado y **no
> afirma cumplir el RGPD**. Afirma qué se hace y bajo qué base.
>
> **La identidad del responsable no está en este repositorio:** ver
> [aviso legal](aviso-legal.md).

---

## 1. El reparto de papeles

**RINDA es responsable** de: identidad y cuenta · autenticación · sesiones ·
recuperación de cuenta · seguridad y prevención de abuso · `auth_events` ·
soporte · administración técnica · ejercicio de derechos sobre la cuenta RINDA.

**El gimnasio es responsable y RINDA es encargado** de: ficha del socio y sus
datos de contacto · cuotas · pagos que gestiona el gimnasio · accesos · rutinas y
asignaciones · entrenador · progreso · mediciones · notas de salud y
entrenamiento · consentimiento y documento de salud publicado por ese gimnasio.

**Invitaciones:** antes de que exista cuenta, el correo se trata **por cuenta del
gimnasio**. Cuando la persona acepta y crea su identidad RINDA, esa identidad
pasa al ámbito propio de RINDA.

**No se crea corresponsabilidad**, porque el modelo actual no la necesita: cada
tratamiento tiene un responsable identificable.

## 2. Bases jurídicas

| Tratamiento | Base |
| --- | --- |
| Cuenta, autenticación y prestación técnica | Ejecución del servicio; relación contractual o precontractual |
| Seguridad, `auth_events`, prevención de abuso | **Interés legítimo** |
| Obligaciones legales y atención de derechos | **Obligación legal**, cuando corresponda |
| Datos que gestiona el gimnasio | **La determina el gimnasio** como responsable; RINDA sigue sus instrucciones |
| **Datos de salud** | **Consentimiento explícito** (art. 9.2.a), separado, informado y revocable |

**El consentimiento no se usa como base para todo.** Sólo ampara los datos de
salud, que es donde la ley lo exige; usarlo para lo demás lo debilitaría
exactamente donde hace falta que sea fuerte.

## 3. Conservación

Los plazos completos están en la
[política de conservación](politica-conservacion.md), **separados en dos
clases**, que es lo que importa aquí:

**Decide RINDA**, porque son finalidad propia: `auth_events` **90 días**.

**Decide el gimnasio**, porque es el responsable y RINDA sólo es encargado — los
plazos de abajo son la **configuración estándar del servicio, aceptada como
instrucción documentada** en el [anexo del art. 28](acuerdo-encargo-art28.md):
accesos 12 meses (**ya configurable por el gimnasio**, y su valor prevalece) ·
invitaciones resueltas 12 meses · pagos 6 años · datos de salud hasta retirar el
consentimiento y entonces **≤ 24 horas** · constancia mínima 3 años.

`audit_log` 3 años, con las dos caras que explica la política. Copias de
seguridad ≤ 31 días.

**Ninguno viene impuesto literalmente por una ley concreta.**

## 4. Datos de salud

Peso · porcentaje de grasa · perímetros de pecho, cintura, cadera, brazo y muslo
· fecha · **notas del entrenador sobre el estado físico**.

- Sólo con **consentimiento explícito**, pedido aparte, que **no condiciona la
  pertenencia al gimnasio**;
- **cada gimnasio por separado**: aceptar en uno no dice nada del otro;
- acceden el socio, su entrenador asignado y la dirección. **Recepción no**;
- al retirarlo: bloqueo inmediato de nuevas mediciones y notas, y la supresión de
  las existentes **en ese gimnasio** se pone en marcha en el acto y se completa
  en **≤ 24 horas**;
- queda sólo la constancia del hecho —versión, fecha de aceptación, fecha de
  retirada— durante 3 años, **sin métricas ni notas y sin IP**.

## 5. Proveedores y transferencias

El inventario completo está en
[proveedores y subencargados](proveedores-subencargados.md). Los que pueden
tratar datos personales: **Hostinger** (servidor en Fráncfort, buzones, DNS, y su
componente de seguridad Monarx), **Backblaze B2** (copias cifradas en Ámsterdam)
y **Resend** (envío de correos: recibe la dirección de destino y una URL con un
token, nada más).

**Apple y Google** tratan los datos de la descarga por su cuenta, como
responsables independientes.

**No se concluye aquí nada sobre la validez de las transferencias.**

## 6. Derechos

Acceso, rectificación, supresión, limitación, oposición y portabilidad, en
`privacidad@gymlabfit.tech`. También cabe reclamar ante la autoridad de control.

Si la petición se refiere a lo que gestiona el gimnasio, se le traslada a él y se
le comunica al interesado.

**La cuenta se puede eliminar en autoservicio**, desde la aplicación o desde
`/eliminar-cuenta`, con reautenticación. Elimina la identidad entera, no sólo la
relación con un gimnasio. Lo que sobrevive, sobrevive **anonimizado**; los datos
de salud **se eliminan**.

## 7. Edad

RINDA está **dirigida a mayores de 18 años**. Cuando se conoce la fecha de
nacimiento, el producto impide dar de alta o editar a un menor —en el contrato
compartido y en una restricción de la base de datos—. Pero **la fecha es
opcional**: no se afirma que todas las personas usuarias estén verificadas.

## 8. Cambios

Los cambios relevantes se avisan dentro de la aplicación. Cambiar el texto del
**consentimiento de salud obliga a pedirlo otra vez**: el anterior deja de
amparar nada.

---

| | |
| --- | --- |
| Página publicada | `apps/web/src/app/privacidad/page.tsx` |
| Consentimiento de salud | Plantilla `2026-09-16`, migración `0020` |
| Comprobación | `pnpm --filter @gymlab/web listo-para-tiendas` |
