# ADR-0008 — Una transacción por petición, y ningún I/O externo dentro

- **Fecha:** 2026-07-26
- **Estado:** Aceptado

## Contexto

`withTenant()` abre una transacción para fijar `app.gym_id` de forma local a
ella (ADR-002). Queda por decidir **cuánto dura esa transacción**, y la respuesta
condiciona cómo se escribe todo el código de negocio del producto: firmas de los
repositorios, atomicidad disponible y forma de los efectos secundarios.

## Decisión

**El `TenantInterceptor` abre una transacción por petición HTTP.** Todo el
trabajo de negocio de esa petición comparte el mismo contexto de tenant y la
misma atomicidad.

Y como consecuencia obligada, una regla dura:

> **Ningún handler puede hacer I/O externo síncrono.** Ni emails, ni Stripe, ni
> APIs de terceros, ni ninguna llamada de red que no sea a nuestra base de datos.
> Todo efecto externo se encola en pg-boss.

## Alternativas consideradas

| Alternativa | Ventaja | Por qué se descarta |
|---|---|---|
| Transacción por repositorio | Transacciones cortísimas | Se pierde la atomicidad entre repositorios: una invitación puede quedar creada sin su registro de auditoría |
| Híbrida: contexto en ALS + `unitOfWork.run()` explícito donde haga falta | Lo mejor de ambas | Más maquinaria, y obliga a acertar en cada handler dónde hace falta atomicidad. Es una comprobación más que alguien puede olvidar |

## Consecuencias

**Positivas**

Atomicidad por defecto, sin que nadie tenga que acordarse de pedirla.

Y una que no es obvia y es la que decanta la decisión: **pg-boss guarda los
trabajos en Postgres**. Encolar dentro de la transacción de la petición da el
patrón *transactional outbox* **gratis**. El email de invitación solo existe si
la invitación se guardó; y si la transacción falla, el trabajo desaparece con
ella. Nunca un email sobre datos que no llegaron a commitear, ni datos
guardados cuyo email nunca se encoló.

Esto es lo que normalmente cuesta una tabla de outbox, un proceso que la lee y
un montón de casos raros. Aquí sale de la combinación de dos decisiones que ya
habíamos tomado por separado.

**Negativas**

Una llamada externa síncrona dentro de un handler mantendría la transacción
abierta y, con carga, agotaría el pool de conexiones. **La regla de arriba no es
una recomendación de estilo: es lo que hace que esta decisión sea segura.** Si
se incumple, el modo de fallo es una caída bajo carga, no un error visible en
desarrollo.

Las peticiones de solo lectura también abren transacción. En Postgres es
barato; se acepta.

**Coste de revertir:** medio. Pasar a transacciones por repositorio obligaría a
revisar todos los handlers que dependan de la atomicidad implícita.

## Cómo se hace cumplir

La regla se vigila en revisión de código y, cuando exista CI, con una regla de
ESLint que prohíba `fetch` y clientes HTTP dentro de `src/modules/**`.

Mientras pg-boss no exista, **ningún módulo puede enviar emails**. Los flujos
que los necesiten (invitaciones, restablecer contraseña) quedan incompletos y
documentados como tales, en lugar de resolverlos con una llamada síncrona que
después habría que desmontar.

## Señales para revisarla

- Aparece un handler que legítimamente necesita esperar a un tercero antes de
  responder (por ejemplo, un pago con confirmación en línea). Entonces ese
  endpoint concreto sale del interceptor y gestiona sus transacciones a mano.
- El tiempo medio de transacción se acerca al tiempo de espera del pool.
