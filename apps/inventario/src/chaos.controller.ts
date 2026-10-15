import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
} from '@nestjs/common';
import { FaultMode, getFault, setFault } from './fault.middleware';

interface ChaosRequest {
  mode?: FaultMode;
  delayMs?: number;
  errorRate?: number;
  durationMs?: number;
}

const MODES: FaultMode[] = ['off', 'latency', 'error'];

// Inyección de fallos en caliente para los experimentos de caos del Lab 5.
// Afecta solo GET /inventory/items/disponibilidad/:productoId, la llamada que hace Ventas.
@Controller('inventory/chaos')
export class ChaosController {
  @Get()
  getChaos() {
    return getFault();
  }

  @Post()
  @HttpCode(200)
  setChaos(@Body() body: ChaosRequest) {
    const mode = body?.mode;
    if (!mode || !MODES.includes(mode)) {
      throw new BadRequestException(
        `mode debe ser uno de: ${MODES.join(', ')}`,
      );
    }
    if (
      body.errorRate !== undefined &&
      (typeof body.errorRate !== 'number' ||
        body.errorRate < 0 ||
        body.errorRate > 1)
    ) {
      throw new BadRequestException('errorRate debe estar entre 0 y 1');
    }
    for (const field of ['delayMs', 'durationMs'] as const) {
      const value = body[field];
      if (value !== undefined && (typeof value !== 'number' || value < 0)) {
        throw new BadRequestException(`${field} debe ser un número >= 0`);
      }
    }

    setFault({
      mode,
      delayMs: body.delayMs,
      errorRate: body.errorRate,
      durationMs: body.durationMs,
    });
    return getFault();
  }
}
