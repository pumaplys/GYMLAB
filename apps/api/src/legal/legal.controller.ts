import { BadRequestException, Body, Controller, Get, NotFoundException, Put } from '@nestjs/common';
import { updateLegalDataSchema, type LegalData, type UpdateLegalDataInput } from '@gymlab/contracts';
import { Roles } from '../common/decorators/roles.decorator';
import { requireRequestContext } from '../common/request-context';
import { ZodBody } from '../common/zod.pipe';
import { LegalService } from './legal.service';

/**
 * Datos legales del responsable. **Solo el dueno.**
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ RECEPCION NO TOCA ESTO, Y NO ES UNA CUESTION DE CONFIANZA.               │
 * │                                                                          │
 * │ Cambiar la razon social o el NIF cambia QUIEN FIGURA COMO RESPONSABLE en │
 * │ el proximo documento que se publique. No es un dato de contacto mas: es  │
 * │ la identidad ante la que un socio reclama. Quien esta en el mostrador    │
 * │ atendiendo a la cola no tiene por que poder cambiarla, ni que le pidan   │
 * │ que lo haga.                                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * El gimnasio NO se toma de la URL: sale de la sesion. `:gymId` sigue la
 * convencion del resto de rutas, pero quien decide el tenant es `activeGymId`
 * (ADR-0007).
 */
@Controller('gyms/:gymId/legal')
@Roles('owner')
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  @Get()
  async ver(): Promise<LegalData> {
    const datos = await this.legal.porGimnasio(this.gimnasioActivo());
    if (!datos) throw new NotFoundException('No encontrado');
    return datos;
  }

  @Put()
  async guardar(
    @Body(new ZodBody(updateLegalDataSchema)) body: UpdateLegalDataInput,
  ): Promise<LegalData> {
    const datos = await this.legal.actualizar(this.gimnasioActivo(), body);
    if (!datos) throw new NotFoundException('No encontrado');
    return datos;
  }

  /** El gimnasio de la sesion. Sin uno activo no hay nada que configurar. */
  private gimnasioActivo(): string {
    const { gymId } = requireRequestContext();
    if (!gymId) throw new BadRequestException('No hay gimnasio activo en la sesion');
    return gymId;
  }
}
