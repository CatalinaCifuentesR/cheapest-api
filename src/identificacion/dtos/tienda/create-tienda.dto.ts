import {
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateTiendaDto {
  @IsString()
  @MaxLength(255)
  nombreComercial: string;

  @IsString()
  @MaxLength(100)
  rut: string;
}
