# `docs/legal/` — los documentos que adopta el responsable

**Adoptados el 2026-09-16.**

> **Ninguno de estos documentos está certificado, revisado por un abogado ni
> aprobado por ninguna autoridad, y ninguno lo afirma.** Son los documentos que
> el responsable de RINDA adopta para su propio producto, escritos sobre lo que
> el producto hace de verdad. Adoptar no es lo mismo que haber revisado.

| Documento | Qué es |
| --- | --- |
| [politica-privacidad.md](politica-privacidad.md) | La política que se publica en `/privacidad` |
| [aviso-legal.md](aviso-legal.md) | Quién presta el servicio, en `/aviso-legal` |
| [acuerdo-encargo-art28.md](acuerdo-encargo-art28.md) | Modelo de contrato con gimnasios **y** su anexo de encargo (art. 28) |
| [rat.md](rat.md) | Registro de actividades de tratamiento (art. 30), separado en responsable y encargado |
| [eipd-salud.md](eipd-salud.md) | Evaluación de impacto del módulo de salud (art. 35) |
| [proveedores-subencargados.md](proveedores-subencargados.md) | Quién trata qué, dónde, y qué falta por verificar |
| [politica-conservacion.md](politica-conservacion.md) | Los plazos, quién los decide y cómo se ejecutan |

## Dos cosas que conviene saber antes de leerlos

**La identidad del prestador no está aquí.** Donde los modelos dicen
`[[PRESTADOR_NOMBRE]]`, `[[PRESTADOR_DOMICILIO]]` o `[[PRESTADOR_NIF]]`, el
valor vive en la configuración de release (`NEXT_PUBLIC_PRESTADOR_*`) y no en el
repositorio: son datos personales, y el historial de git es para siempre.

**Los plazos se cumplen solos.** No son un párrafo: hay una purga diaria que los
ejecuta, y tests que comprueban tanto lo que borra como lo que **no** borra.

```bash
pnpm --filter @gymlab/web listo-para-tiendas   # ¿queda algún bloqueo?
```
