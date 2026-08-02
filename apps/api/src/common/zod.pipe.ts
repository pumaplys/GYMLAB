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
    return validar(this.schema, value, 'Datos no validos.');
  }
}

/**
 * Lo mismo para los parametros de consulta.
 *
 * EXISTE PORQUE FALTABA. Los listados llamaban a `schema.parse(query)` dentro
 * del controlador, y `parse` lanza un `ZodError` crudo que NestJS no sabe
 * traducir: `?pageSize=999` devolvia un 500 en lugar de un 400. Estaba asi en
 * socios y en accesos, y se descubrio escribiendo el panel.
 *
 * Un 500 por un parametro mal escrito no es solo feo: dice "fallo del servidor"
 * cuando el fallo es del cliente, y esconde el error real entre el ruido de
 * incidencias.
 */
export class ZodQuery<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    return validar(this.schema, value, 'Parametros de consulta no validos.');
  }
}

function validar<T>(schema: ZodType<T>, value: unknown, mensaje: string): T {
  const resultado = schema.safeParse(value);
  if (!resultado.success) {
    throw new BadRequestException({
      message: mensaje,
      issues: resultado.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
  }
  return resultado.data;
}
