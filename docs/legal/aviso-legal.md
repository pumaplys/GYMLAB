# Aviso legal — RINDA

**Adoptado por el responsable el 2026-09-16.** Versión publicada en
`https://gymlabfit.tech/aviso-legal`.

> **La identidad no está escrita aquí, y es deliberado.** `[[PRESTADOR_NOMBRE]]`,
> `[[PRESTADOR_DOMICILIO]]` y `[[PRESTADOR_NIF]]` los aporta la configuración de
> release (`NEXT_PUBLIC_PRESTADOR_*`), no el repositorio: son datos personales de
> quien presta el servicio, y el historial de git es para siempre y se clona
> entero.
>
> **Este texto no está revisado por un abogado y no afirma estarlo.**

---

## Identificación del prestador

RINDA es un servicio prestado por `[[PRESTADOR_NOMBRE]]`, **persona física**,
con domicilio de contacto en `[[PRESTADOR_DOMICILIO]]` e identificador fiscal
`[[PRESTADOR_NIF]]`.

**No existe sociedad constituida**, y este documento no afirma lo contrario.

Contacto: `soporte@gymlabfit.tech` para el servicio, `privacidad@gymlabfit.tech`
para datos personales.

> **Estado del identificador fiscal a 2026-09-16: NO FACILITADO.** Mientras no
> esté, la página publicada lo dice expresamente y el gate de tiendas
> (`listo-para-tiendas`) permanece en rojo con un único mensaje. **No se inventa
> ninguno**, ni se sustituye por un ejemplo.

## Objeto del servicio

RINDA es una aplicación de gestión para gimnasios: el gimnasio lleva sus socios,
cuotas, accesos y rutinas; cada socio lleva su carné, su rutina y su progreso.

- **No hay compras dentro de la aplicación**, ni publicidad, ni pasarela de pago.
  Cuando la aplicación registra un cobro, lo ha hecho el gimnasio por su cuenta y
  RINDA sólo lo anota.
- **El acceso es por invitación del gimnasio.** No hay registro libre.
- RINDA **no presta asesoramiento deportivo ni sanitario**.

## Condiciones de uso

Dirigida a **mayores de 18 años**. Las cuentas son personales y quien comparte
sus credenciales responde del uso que se haga de ellas. No está permitido
intentar acceder a datos de otras personas ni alterar el funcionamiento del
servicio.

## Responsabilidad

El prestador mantiene el servicio con diligencia pero **no garantiza
disponibilidad ininterrumpida**. Los datos que introduce cada gimnasio son su
responsabilidad, incluida su exactitud y el derecho a tratarlos; RINDA los trata
siguiendo sus instrucciones, conforme al
[acuerdo de encargo](acuerdo-encargo-art28.md).

## Propiedad

El software, el nombre RINDA y su imagen pertenecen al prestador. Los datos de
cada gimnasio y de cada socio no: son de quien corresponda y pueden recuperarse
o eliminarse cuando se pidan.

## Legislación

Legislación española.

---

## Dónde vive cada cosa

| | |
| --- | --- |
| Página publicada | `apps/web/src/app/aviso-legal/page.tsx` |
| Identidad | Variables `NEXT_PUBLIC_PRESTADOR_*`, leídas en `apps/web/src/lib/prestador.ts` |
| Buzones | `apps/web/src/lib/contacto.ts` |
| Comprobación | `pnpm --filter @gymlab/web listo-para-tiendas` |
