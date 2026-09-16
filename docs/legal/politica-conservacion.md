# Política de conservación de datos — RINDA

**Adoptada por el responsable el 2026-09-16.**

> **Qué es este documento y qué no es.** Es la política que RINDA se impone a sí
> misma y que cumple de forma automática. **No está certificada por nadie, no
> está aprobada por un abogado y no afirma cumplir el RGPD**: afirma qué se
> conserva, cuánto y por qué, y que existe una purga que lo ejecuta.
>
> **Ningún plazo de aquí viene impuesto literalmente por una ley concreta**,
> salvo donde se dice expresamente. Lo que sí impone el RGPD (art. 5.1.e) es que
> exista un plazo y que se respete.

---

## 1. Los plazos

| Qué | Cuánto | Por qué ese plazo | Quién decide |
| --- | --- | --- | --- |
| Cuenta, credenciales y sesiones | Mientras exista la cuenta | Sin ellos no hay servicio | RINDA |
| `auth_events` — intentos de acceso, con IP y navegador | **12 meses** | Poder investigar un patrón de ataque que se extienda en el tiempo | RINDA |
| `access_events` — entradas al gimnasio | **12 meses por defecto** | Permite comparar con el mismo mes del año anterior | **Cada gimnasio**, en `gyms.access_events_retention_months` |
| `audit_log` — quién hizo qué sobre cada ficha | **3 años** | Responsabilidad demostrada | RINDA |
| `invitations` resueltas (aceptadas, revocadas o caducadas) | **12 meses** | Guardan un correo de alguien que puede no haber llegado a ser socio | RINDA |
| `payments` — cuotas y cobros | **6 años** | Conservación contable y fiscal habitual. **Cada gimnasio valora sus propias obligaciones** | Gimnasio |
| `body_metrics` — mediciones y notas de salud | Hasta que se retire el consentimiento; entonces **≤ 30 días** | Sin consentimiento no hay base que ampare conservarlas | Interesado |
| Constancia mínima del consentimiento retirado | **3 años** | Poder demostrar que el tratamiento estuvo amparado y que se retiró | RINDA |
| Copias de seguridad | **≤ 31 días** | Es el máximo de las reglas del bucket | RINDA |

Las invitaciones **pendientes no caducan por esta política**: siguen vivas
hasta que se aceptan, se revocan o expiran por su propia fecha.

## 2. Qué sobrevive a eliminar una cuenta, y sin nombre

El borrado de cuenta (art. 17) elimina la identidad entera. Algunos registros se
conservan **anonimizados**, porque el gimnasio los necesita como hecho:

- `payments` — importe, concepto, fecha y método, sin persona;
- `access_events` — marca de tiempo y decisión, sin persona;
- `audit_log` — acción y entidad, sin actor;
- `auth_events` — tipo de evento, IP y navegador, sin correo ni cuenta;
- `invitations` — rol y fechas, con el correo anonimizado.

Los datos de salud, los consentimientos, las notas y las mediciones **se
eliminan**, no se anonimizan.

## 3. Cómo se ejecuta

Un solo trabajo diario, a las 04:00, sobre la infraestructura de colas que ya
existía (`pg-boss`). No hay un segundo planificador.

```
retention.diaria
  ├── auth_events            12 meses      (borrado directo: la tabla no tiene RLS)
  ├── app_purge_access_data()              tokens consumidos y accesos por gimnasio
  ├── app_purge_audit_log()  3 años
  ├── app_purge_invitations() 12 meses     solo las resueltas
  └── app_purge_health_data()              mediciones sin consentimiento vigente,
                                           minimización de la constancia y
                                           constancias de más de 3 años
```

**Los plazos viven dentro de las funciones SQL, no en el código de la
aplicación.** Es lo que impide que la aplicación elija cuánto borrar: si
`app_purge_audit_log` aceptara un plazo por parámetro, el carácter *append-only*
del registro de auditoría sería decorativo. Lo único que se parametriza es el
límite de filas por pasada, que sólo puede hacer el trabajo más pequeño.

Las funciones son `SECURITY DEFINER` porque una purga recorre **todos** los
gimnasios y el rol de la aplicación, sujeto a RLS, no puede. La alternativa
—darle a la aplicación el rol propietario— metería en el proceso que atiende
peticiones una conexión capaz de borrar cualquier cosa.

El resultado de cada pasada queda como salida del trabajo en `pg-boss`: cuántas
filas se borraron de cada tabla, **sin un solo dato personal**. Ése es el
registro de que la política se aplica.

## 4. Pagos: el plazo está, la purga no

**Deliberado.** Borrar registros económicos es irreversible y puede tener
consecuencias fiscales que no se pueden valorar sin clientes reales. Los seis
años quedan documentados; ejecutarlos será una decisión explícita y anunciada,
no un efecto secundario de desplegar.

## 5. Copias de seguridad

Lo eliminado puede sobrevivir dentro de una copia cifrada hasta que ésa caduca.
Reglas reales del bucket `gymlab-copias` (Backblaze B2, `eu-central-003`):

| Prefijo | Ocultar | Borrar | Vida máxima |
| --- | --- | --- | --- |
| `diario/` | 8 días | +1 | 9 días |
| `semanal/` | 29 días | +1 | 30 días |
| `predeploy/` | 30 días | +1 | **31 días** |
| `postdeploy/` | 30 días | +1 | **31 días** |

De ahí sale el techo de **31 días** que se promete en la política de privacidad
y en el consentimiento de salud. Las copias se cifran con `age` usando la clave
pública: **el servidor puede crearlas y no puede leerlas.**

## 6. Cómo comprobar que esto es verdad

```bash
pnpm --filter @gymlab/api test -- retencion
```

Los tests ejecutan las purgas contra PostgreSQL de verdad, con filas que acaban
de caducar y filas que aún no, y comprueban las dos cosas: que borra lo que debe
y que **no borra lo que no debe**.
