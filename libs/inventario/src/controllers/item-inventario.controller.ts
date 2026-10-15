import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import {
  CreateItemInventarioDto,
  ItemInventarioResponseDto,
  QueryItemInventarioDto,
  UpdateItemInventarioDto,
} from '../dtos';
import { ItemInventarioService } from '../services';
import {
  applyFault,
  isFaulting,
} from '../../../../apps/inventario/src/fault.middleware';

@Controller('inventory/items')
export class ItemInventarioController {
  constructor(private readonly itemService: ItemInventarioService) {}

  @Get('disponibilidad/:productoId')
  async checkDisponibilidad(
    @Param('productoId') productoId: string,
  ): Promise<{ productoId: string; disponible: boolean; faulting: boolean }> {
    await applyFault();
    const disponible = await this.itemService.getDisponibilidadPorProducto(
      productoId,
    );

    return {
      productoId,
      disponible,
      faulting: isFaulting(),
    };
  }

  @Post()
  async create(
    @Body(new ValidationPipe({ transform: true }))
    dto: CreateItemInventarioDto,
  ): Promise<ItemInventarioResponseDto> {
    return this.itemService.create(dto);
  }

  @Get()
  async findAll(
    @Query(new ValidationPipe({ transform: true }))
    query: QueryItemInventarioDto,
  ): Promise<ItemInventarioResponseDto[]> {
    return this.itemService.findAll(query);
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<ItemInventarioResponseDto> {
    return this.itemService.findById(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true }))
    dto: UpdateItemInventarioDto,
  ): Promise<ItemInventarioResponseDto> {
    return this.itemService.update(id, dto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<void> {
    return this.itemService.delete(id);
  }
}
