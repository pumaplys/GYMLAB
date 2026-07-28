# ADR-0006 — Módulos del dominio y su frontera

- **Fecha:** 2026-07-26
- **Estado:** Aceptado

## Contexto

ADR-0001 eligió un monolito **modular**. Sin fronteras reales, "modular" es solo
una palabra: el monolito se convierte en una bola de barro y la opción de
extraer un módulo desaparece.

## Decisión

Cada módulo posee sus tablas. **Un módulo nunca importa el repositorio de otro:
pide a su servicio de aplicación.**

| Módulo | Responsabilidad | Tablas |
|---|---|---|
| `identity` | Usuarios, sesiones, credenciales, roles, invitaciones | `users`, `accounts`, `sessions`, `verifications`, `memberships`, `invitations` |
| `organization` | Organización y sedes | `organizations`, `gyms` |
| `members` | Socios | `members` |
| `staff` | Entrenadores y recepción | `staff_profiles`, `trainer_assignments` |
| `billing` | Planes, suscripciones, cobros registrados | `plans`, `member_subscriptions`, `payments` |
| `training` | Ejercicios y rutinas | `exercises`, `routines`, `workout_logs` |
| `progress` | Peso y medidas — **datos de salud, art. 9 RGPD** | `body_metrics` |
| `access` | Tokens QR y entradas | `access_tokens`, `access_events` |
| `compliance` | Consentimientos versionados | `consents` |
| `audit` | Registro de actividad | `auth_events`, `audit_log` |
| `platform` | Facturación GYMLAB, superadmin | `gym_subscriptions` |

## La regla, en concreto

`training` **no** importa el repositorio de `members`. Llama a
`membersService.getById()`.

Es la única disciplina que mantiene viva la posibilidad de extraer un módulo. Y
es fácil de violar sin darse cuenta, porque en un monolito el import siempre
compila.

## Consecuencias

**Positivas:** la costura existe desde el día uno y el coste de mantenerla es
casi nulo si se respeta desde el principio.

**Negativas:** a veces obliga a un salto indirecto donde un `JOIN` habría sido
más corto. Cuando el `JOIN` sea imprescindible por rendimiento, se documenta
como excepción en lugar de disolver la regla en silencio.

**Coste de revertir:** bajo — es una convención, no una estructura.

## Señales para revisarla

- Una consulta crítica exige atravesar tres módulos y el coste de los saltos
  aparece en el perfil de latencia.
