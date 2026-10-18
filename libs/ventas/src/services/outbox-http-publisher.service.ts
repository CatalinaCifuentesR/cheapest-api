import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OutboxHttpCall } from '../repositories/entities/outbox-http-call.entity';

// Con polling de 2 s, 600 intentos ≈ 20 min antes de marcar FAILED: cubre una caída
// de Inventario mientras ECS reemplaza la tarea (Lab 5, experimento E2).
const MAX_ATTEMPTS = Number.parseInt(
  process.env.OUTBOX_MAX_ATTEMPTS ?? '600',
  10,
);

// Filas que el publicador toma por ciclo (cada 2 s). Con 100 entrega hasta ~50 filas/s:
// suficiente para reconciliar una caída de Inventario de varios minutos en segundos (ASR-3)
// y para vaciar las ventas duplicadas que deja la tormenta de reintentos (E1).
const BATCH_SIZE = Number.parseInt(
  process.env.OUTBOX_BATCH_SIZE ?? '100',
  10,
);

@Injectable()
export class OutboxHttpPublisherService implements OnModuleInit {
  private readonly logger = new Logger(OutboxHttpPublisherService.name);
  // Evita que dos ciclos se solapen si un lote tarda más de 2 s (por ejemplo, con
  // Inventario lento): el ciclo siguiente espera a que termine el anterior.
  private running = false;
  private readonly inventarioBaseUrl =
    process.env.INVENTARIO_BASE_URL ?? 'http://localhost:3002';

  constructor(@Inject('DATA_SOURCE') private readonly dataSource: DataSource) {}

  onModuleInit() {
    setInterval(() => {
      if (this.running) return;
      this.running = true;
      this.processPending()
        .catch((err) => this.logger.error(`Outbox HTTP error: ${String(err)}`))
        .finally(() => {
          this.running = false;
        });
    }, 2000);
  }

  private async processPending(): Promise<void> {
    const repo = this.dataSource.getRepository(OutboxHttpCall);
    const pending = await repo.find({
      where: { status: 'PENDING' },
      order: { createdAt: 'ASC' },
      take: BATCH_SIZE,
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
