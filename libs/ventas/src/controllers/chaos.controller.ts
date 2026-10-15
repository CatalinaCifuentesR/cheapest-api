import {
  Controller,
  HttpCode,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';

// Inyección de fallos para el Lab 5: apaga el sidecar Envoy que corre junto a Ventas.
// Envoy expone /quitquitquit en su puerto de administración, que solo es alcanzable
// desde la misma tarea (ECS) o la misma red (Docker Compose).
@Controller('ventas/chaos')
export class SidecarChaosController {
  private readonly sidecarAdminUrl =
    process.env.SIDECAR_ADMIN_URL ?? 'http://localhost:9901';

  @Post('sidecar')
  @HttpCode(202)
  async terminarSidecar() {
    try {
      const response = await fetch(`${this.sidecarAdminUrl}/quitquitquit`, {
        method: 'POST',
        signal: AbortSignal.timeout(2000),
      });
      return {
        sidecar: this.sidecarAdminUrl,
        respuesta: response.status,
        at: new Date().toISOString(),
      };
    } catch (error) {
      throw new ServiceUnavailableException(
        `No se pudo contactar el sidecar en ${this.sidecarAdminUrl}: ${String(error)}`,
      );
    }
  }
}
