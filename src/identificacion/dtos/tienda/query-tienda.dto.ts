import {
  IsOptional,
  IsString,
} from 'class-validator';

export class QueryTiendaDto {
  @IsOptional()
  @IsString()
  nombreComercial?: string;

  @IsOptional()
  @IsString()
  rut?: string;
}
