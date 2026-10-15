import { Module } from '@nestjs/common';

// Repositories (Data Layer)
import { ProductoExternoRepository, VentaRepository } from './repositories';

// Services
import { OutboxHttpPublisherService } from './services/outbox-http-publisher.service';
import { ProductoExternoService, VentaService } from './services';

// Controllers
import {
  SidecarChaosController,
  OutboxController,
  ProductoExternoController,
  VentaController,
} from './controllers';

// Clients Mock
import { TiendaClientMock } from './clients';
import { repositoryProviders } from './repositories/repository.providers';
import { InventarioDisponibilidadClient } from '../../shared/inventario-client/src';
import { LogisticaProductosClient } from '../../shared/logistica-client/src';

@Module({
  controllers: [
    ProductoExternoController,
    VentaController,
    OutboxController,
    SidecarChaosController,
  ],
  providers: [
    // Repositories
    ...repositoryProviders,
    ProductoExternoRepository,
    VentaRepository,
    // Services
    ProductoExternoService,
    VentaService,
    OutboxHttpPublisherService,
    // Mock Clients
    TiendaClientMock,
    LogisticaProductosClient,
    InventarioDisponibilidadClient,
  ],
  exports: [VentaService],
})
export class VentasModule {}
