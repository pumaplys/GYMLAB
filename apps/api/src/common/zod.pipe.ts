import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Valida el cuerpo de la peticion contra un esquema de `@gymlab/contracts`.
 *
 * Se usa el mismo esquema que consumen el panel web y la app movil, asi que la
 * validacion del servidor y la del cliente no pueden separarse (ADR-003).
 * El servidor valida igualmente: el cliente no es de fiar.
 */
export class ZodBody<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const resultado = this.schema.safeParse(value);
    if (!resultado.success) {
      throw new BadRequestException({
        message: 'Datos no validos.',
        issues: resultado.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    return resultado.data;
  }
}
