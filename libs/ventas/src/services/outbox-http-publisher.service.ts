import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OutboxHttpCall } from '../repositories/entities/outbox-http-call.entity';

// Con polling de 2 s, 600 intentos ≈ 20 min antes de marcar FAILED: cubre una caída
// de Inventario mientras ECS reemplaza la tarea (Lab 5, experimento E3).
const MAX_ATTEMPTS = Number.parseInt(
  process.env.OUTBOX_MAX_ATTEMPTS ?? '600',
  10,
);

@Injectable()
export class OutboxHttpPublisherService implements OnModuleInit {
  private readonly logger = new Logger(OutboxHttpPublisherService.name);
  private readonly inventarioBaseUrl =
    process.env.INVENTARIO_BASE_URL ?? 'http://localhost:3002';

  constructor(@Inject('DATA_SOURCE') private readonly dataSource: DataSource) {}

  onModuleInit() {
    setInterval(() => {
      this.processPending().catch((err) =>
        this.logger.error(`Outbox HTTP error: ${String(err)}`),
      );
    }, 2000);
  }

  private async processPending(): Promise<void> {
    const repo = this.dataSource.getRepository(OutboxHttpCall);
    const pending = await repo.find({
      where: { status: 'PENDING' },
      order: { createdAt: 'ASC' },
      take: 10,
    });

    for (const call of pending) {
      try {
        const response = await fetch(
          `${this.inventarioBaseUrl}/inventory/ventas/desde-outbox`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Idempotency-Key': call.id,
            },
            body: JSON.stringify(call.payload),
            signal: AbortSignal.timeout(5000),
          },
        );

        if (response.ok || response.status === 409) {
          // 409 = ya procesado (idempotencia) — cuenta como entregado
          await repo.update(call.id, {
            status: 'DELIVERED',
            deliveredAt: new Date(),
          });
          this.logger.debug(`Outbox call ${call.id} entregado`);
        } else if (response.status >= 400 && response.status < 500) {
          // 4xx (distinto de 409) = Inventario rechazó la operación por una regla de negocio
          // (p. ej. stock insuficiente: la venta degradada resultó ser una sobreventa).
          // Reintentarla no la arregla y bloquearía las filas siguientes: se marca FAILED
          // para reconciliación manual.
          await repo.update(call.id, {
            status: 'FAILED',
            attempts: call.attempts + 1,
          });
          this.logger.warn(
            `Outbox call ${call.id} rechazado por Inventario (HTTP ${response.status}); marcado como FAILED`,
          );
        } else {
          await this.handleFailure(repo, call);
        }
      } catch {
        await this.handleFailure(repo, call);
      }
    }
  }

  private async handleFailure(
    repo: ReturnType<DataSource['getRepository']>,
    call: OutboxHttpCall,
  ): Promise<void> {
    const newAttempts = call.attempts + 1;
    if (newAttempts >= MAX_ATTEMPTS) {
      await repo.update(call.id, { status: 'FAILED', attempts: newAttempts });
      this.logger.warn(
        `Outbox call ${call.id} marcado como FAILED tras ${newAttempts} intentos`,
      );
    } else {
      await repo.update(call.id, { attempts: newAttempts });
    }
  }
}
