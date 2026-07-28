# ADR-0001 — Monolito modular, no microservicios

- **Fecha:** 2026-07-26
- **Estado:** Aceptado

## Contexto

GYMLAB lo desarrolla y mantiene **una sola persona** asistida por IA. La escala
prevista son cientos de gimnasios y decenas de miles de socios.

## Decisión

Una sola aplicación desplegable, dividida internamente en módulos con fronteras
explícitas.

## Alternativas consideradas

| Alternativa | Ventaja | Por qué se descarta |
|---|---|---|
| Microservicios | Escalado independiente | Un desarrollador no puede operar un sistema distribuido: cada servicio añade despliegue, observabilidad, versionado de contratos y fallos parciales |
| Serverless puro | Cero operaciones | Arranques en frío, límites de conexiones a Postgres, y dificultad para trabajos y transacciones largas |

El argumento decisivo no es la escala, sino la forma del dominio: **es
fuertemente transaccional**. Dar de alta a un socio toca miembro, suscripción,
credencial de acceso y correo. En un monolito eso es una transacción de base de
datos. En microservicios es una saga con compensaciones.

## Consecuencias

**Positivas:** atomicidad trivial, un solo despliegue, una sola cosa que
observar.

**Negativas:** no se puede escalar una parte sin escalar el todo. A la escala
prevista, irrelevante.

**Coste de revertir:** medio, y por eso la mitigación: los módulos se comunican
**solo** a través de sus servicios de aplicación, nunca importando repositorios
ajenos. La costura para extraer un módulo ya existe.

## Señales para revisarla

- Un módulo consume la mayoría del CPU o tiene un perfil de latencia muy
  distinto al resto — hoy el candidato natural sería la IA.
- Más de tres desarrolladores pisándose.
