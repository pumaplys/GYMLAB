# Política de conservación de datos — RINDA

**Adoptada el 2026-09-16, corregida el 2026-09-17.**

> **Qué es este documento y qué no es.** Describe qué se conserva, cuánto y por
> qué, y que existe una purga que lo ejecuta. **No está certificado, no lo ha
> aprobado un abogado y no afirma cumplir el RGPD.**
>
> **Ningún plazo de aquí viene impuesto literalmente por una ley concreta.** Lo
> que sí impone el RGPD (art. 5.1.e) es que exista un plazo y que se respete.

---

## 0. Dos clases de plazo, y confundirlas es un error jurídico

| | Quién es responsable | Qué es el plazo |
| --- | --- | --- |
| **Finalidades propias de RINDA** | RINDA | Una **decisión suya** |
| **Datos tratados por cuenta del gimnasio** | **El gimnasio** | La **configuración estándar del servicio**, que el gimnasio acepta como **instrucción documentada** en el [anexo del art. 28](acuerdo-encargo-art28.md) |

**La diferencia no es de redacción.** Si RINDA presentara el plazo de `payments`
como decisión jurídica propia, se estaría atribuyendo una base que no tiene
sobre datos de los que no responde — y el gimnasio perdería una facultad que es
suya. Donde la arquitectura lo permite, **la instrucción del gimnasio
prevalece**.

---

## 1. Finalidades propias de RINDA — decide RINDA

| Qué | Cuánto | Por qué |
| --- | --- | --- |
| Cuenta, credenciales y sesiones | Mientras exista la cuenta | Sin ellas no hay servicio |
| `auth_events` — intentos de acceso, con IP y navegador | **90 días** | Interés legítimo en proteger las cuentas. Es finalidad propia: un login fallido ocurre **antes** de saber a qué gimnasio pertenece nadie |

> **Los 90 días subieron a 12 meses un día, y se revirtieron.** La ampliación se
> escribió sobre la premisa equivocada de que estos eventos no se purgaban. Se
> purgaban. **Cuadruplicar la conservación de IP y user-agent sin una necesidad
> demostrada es exactamente lo que el art. 5.1.e no permite**, así que volvió a
> su sitio. Hay un test que se pone rojo si alguien vuelve a subirlo.

## 2. Datos tratados por cuenta del gimnasio — decide el gimnasio

**Todos los plazos de esta tabla son configuración estándar del servicio,
aceptada como instrucción documentada del responsable.** No son una decisión
jurídica unilateral de RINDA.

| Qué | Configuración estándar | Quién puede cambiarla |
| --- | --- | --- |
| `access_events` — entradas al gimnasio | **12 meses** | **El gimnasio ya la configura**, en `gyms.access_events_retention_months`. Su valor prevalece: es literalmente su instrucción |
| `invitations` resueltas (aceptadas, revocadas o caducadas) | **12 meses** | El gimnasio, por instrucción escrita |
| `payments` — cuotas y cobros | **6 años** | El gimnasio. Sigue los criterios habituales de conservación contable y fiscal, **que valora él**: RINDA no decide cuánto debe conservar la contabilidad de otro |
| `body_metrics` — mediciones y notas de salud | Hasta que el interesado retire el consentimiento; entonces **≤ 24 horas** | El interesado la dispara al retirar; el gimnasio no puede alargarla |
| Constancia mínima del consentimiento retirado | **3 años** | Configuración estándar |
| Ficha del socio y datos de contacto | Mientras exista la ficha | El gimnasio, dándola de baja o pidiendo su supresión |

Las invitaciones **pendientes no caducan** por esta política: siguen vivas hasta
que se aceptan, se revocan o expiran por su propia fecha.

### `audit_log`: tiene dos caras, y se dicen las dos

**3 años.** Sirve a la vez a dos cosas, y presentarlo como una sola sería
inexacto:

- **seguridad del propio servicio** — poder investigar un acceso indebido a la
  plataforma, que es finalidad de RINDA;
- **registro de actividad del personal del gimnasio** sobre las fichas de sus
  socios, que es tratamiento por cuenta del gimnasio.

**No se rediseña ahora.** Queda anotado que una separación limpia —dos registros
con dueños y plazos distintos— es trabajo pendiente, no algo ya resuelto.

## 3. Qué sobrevive a eliminar una cuenta, y sin nombre

El borrado de cuenta (art. 17) elimina la identidad entera. Algunos registros se
conservan **anonimizados**, porque el gimnasio los necesita como hecho:
`payments` (importe, concepto, fecha y método), `access_events` (marca de tiempo
y decisión), `audit_log` (acción y entidad), `auth_events` (tipo, IP y
navegador) e `invitations` (rol y fechas, con el correo anonimizado).

Los datos de salud, los consentimientos, las notas y las mediciones **se
eliminan**, no se anonimizan.

## 4. Cómo se ejecuta

Un trabajo diario a las 04:00 sobre la infraestructura de colas que ya existía
(`pg-boss`), **más un disparo inmediato para los datos de salud**. No hay un
segundo planificador.

```
retention.diaria                         (todos los días, 04:00)
  ├── auth_events            90 días     borrado directo: la tabla no tiene RLS
  ├── app_purge_access_data()            tokens consumidos y accesos por gimnasio
  ├── app_purge_audit_log()  3 años
  ├── app_purge_invitations() 12 meses   solo las resueltas
  └── app_purge_health_data()            red de seguridad del borrado de salud

retention.salud                          (encolada AL RETIRAR el consentimiento)
  └── app_purge_health_data()            el camino normal: segundos
```

**Una sola implementación del borrado de salud, con dos disparadores.** Dos
implementaciones del art. 17 divergen, y la que se olvide será la que deje datos
de salud sin borrar.

**Los plazos viven dentro de las funciones SQL, no en el código de la
aplicación.** Es lo que impide que la aplicación elija cuánto borrar: si
`app_purge_audit_log` aceptara un plazo por parámetro, el carácter *append-only*
del registro de auditoría sería decorativo. Lo único parametrizable es el límite
de filas por pasada, que sólo puede hacer el trabajo más pequeño.

Las funciones son `SECURITY DEFINER` porque una purga recorre **todos** los
gimnasios y el rol de la aplicación, sujeto a RLS, no puede. La alternativa
—darle a la aplicación el rol propietario— metería en el proceso que atiende
peticiones una conexión capaz de borrar cualquier cosa.

El resultado de cada pasada queda como salida del trabajo en `pg-boss`: cuántas
filas se borraron de cada tabla, **sin un solo dato personal**.

## 5. Pagos: el plazo está, la purga no

**Deliberado.** Borrar registros económicos es irreversible y puede tener
consecuencias fiscales que no se pueden valorar sin clientes reales. Los seis
años quedan como retención estándar contractual; ejecutarlos será una decisión
explícita del responsable, no un efecto secundario de desplegar.

## 6. Copias de seguridad

Lo eliminado puede sobrevivir dentro de una copia cifrada hasta que ésa caduca.
Reglas reales del bucket `gymlab-copias` (Backblaze B2, `eu-central-003`):

| Prefijo | Ocultar | Borrar | Vida máxima |
| --- | --- | --- | --- |
| `diario/` | 8 días | +1 | 9 días |
| `semanal/` | 29 días | +1 | 30 días |
| `predeploy/` | 30 días | +1 | **31 días** |
| `postdeploy/` | 30 días | +1 | **31 días** |

De ahí sale el techo de **31 días**. Las copias se cifran con `age` usando la
clave pública: **el servidor puede crearlas y no puede leerlas.**

> **SI SE RESTAURA UNA COPIA que contenga datos ya suprimidos, LA SUPRESIÓN HAY
> QUE REAPLICARLA.** Para los datos de salud la purga lo hace sola —vuelve a
> encontrar el consentimiento revocado y vuelve a borrar—, pero eso es una
> propiedad que **hay que comprobar después de cada restauración**, no una que
> se pueda dar por hecha: una cuenta eliminada por el art. 17 no deja tras de sí
> ninguna señal que dispare su propio reborrado.

## 7. Cómo comprobar que esto es verdad

```bash
pnpm --filter @gymlab/api exec vitest run src/__tests__/retencion.e2e.test.ts
```

Los tests ejecutan las purgas contra PostgreSQL de verdad, con filas que acaban
de caducar y filas que aún no, y comprueban las dos cosas: que borra lo que debe
y que **no borra lo que no debe**.
