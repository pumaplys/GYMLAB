import { BadRequestException, Controller, Get } from '@nestjs/common';
import type { PrivacyDocumentStatus } from '@gymlab/contracts';
import { Roles } from '../common/decorators/roles.decorator';
import { requireRequestContext } from '../common/request-context';
import { ConsentDocumentsService } from './consent-documents.service';

/**
 * Estado del documento de privacidad, para el dueno.
 *
 * Vive en el modulo de progreso y no en `legal` porque las tablas de documentos
 * son de aqui. Al reves —que `legal` las leyera— cerraria un ciclo:
 * `progress -> legal` ya existe para pedir la identidad del responsable.
 *
 * Solo LEE. La publicacion sigue ocurriendo cuando un socio la necesita, que es
 * idempotente y no depende de que nadie se acuerde de pulsar un boton.
 */
@Controller('gyms/:gymId/privacy-document')
@Roles('owner')
export class PrivacyDocumentController {
  constructor(private readonly documentos: ConsentDocumentsService) {}

  @Get()
  async estado(): Promise<PrivacyDocumentStatus> {
    const { gymId } = requireRequestContext();
    if (!gymId) throw new BadRequestException('No hay gimnasio activo en la sesion');
    return this.documentos.estado(gymId);
  }
}
