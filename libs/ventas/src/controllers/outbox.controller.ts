import { Controller, Get, Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OutboxHttpCall } from '../repositories/entities/outbox-http-call.entity';

// Observabilidad del Outbox para los experimentos de caos del Lab 5:
// permite seguir PENDING → DELIVERED desde AWS sin abrir la RDS.
@Controller('ventas/outbox')
export class OutboxController {
  constructor(@Inject('DATA_SOURCE') private readonly dataSource: DataSource) {}

  @Get('resumen')
  async getResumen() {
    const repo = this.dataSource.getRepository(OutboxHttpCall);

    const porStatus: { status: string; total: string }[] = await repo
      .createQueryBuilder('o')
      .select('o.status', 'status')
      .addSelect('COUNT(*)', 'total')
      .groupBy('o.status')
      .getRawMany();

    const pendienteMasAntigua = await repo.findOne({
      where: { status: 'PENDING' },
      order: { createdAt: 'ASC' },
    });
    const ultimaEntregada = await repo.findOne({
      where: { status: 'DELIVERED' },
      order: { deliveredAt: 'DESC' },
    });

    const conteo = { PENDING: 0, DELIVERED: 0, FAILED: 0 };
    for (const fila of porStatus) {
      conteo[fila.status as keyof typeof conteo] = Number(fila.total);
    }

    return {
      ...conteo,
      pendienteMasAntiguaCreatedAt: pendienteMasAntigua?.createdAt ?? null,
      ultimoDeliveredAt: ultimaEntregada?.deliveredAt ?? null,
      now: new Date().toISOString(),
    };
  }
}
