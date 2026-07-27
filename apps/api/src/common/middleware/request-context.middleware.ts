import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { runWithRequestContext } from '../request-context';

/**
 * Abre el almacen de contexto para toda la peticion.
 *
 * Tiene que ser middleware y no guard: en NestJS el orden es
 * middleware -> guards -> interceptores -> handler, y solo el middleware puede
 * envolver la ejecucion de todo lo que viene despues dentro de un
 * `AsyncLocalStorage.run()`.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(_req: Request, _res: Response, next: NextFunction): void {
    runWithRequestContext(() => next());
  }
}
