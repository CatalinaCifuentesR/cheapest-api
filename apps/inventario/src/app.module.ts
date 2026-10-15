import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InventarioModule } from '../../../libs/inventario/src';
import {
  ItemInventario,
  ProcessedCall,
  RegistroCompraProductoTienda,
  RegistroVentaProductoTienda,
} from '../../../libs/inventario/src/repositories/entities';
import { DatabaseModule } from '../../../libs/shared/database/src';
import { ChaosController } from './chaos.controller';
import { HealthController } from './health.controller';

const INVENTARIO_ENTITIES = [
  ItemInventario,
  ProcessedCall,
  RegistroCompraProductoTienda,
  RegistroVentaProductoTienda,
];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule.forRoot(INVENTARIO_ENTITIES),
    InventarioModule,
  ],
  controllers: [HealthController, ChaosController],
})
export class AppModule {}
