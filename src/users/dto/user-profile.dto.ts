import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAdminNoteDto {
  @IsNotEmpty()
  @IsString()
  noteType: string;

  @IsNotEmpty()
  @IsString()
  body: string;
}

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  search?: string;
}

export class InstructorHistoryQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  category?: string;
}

export class PurchaseHistoryQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  type?: string; // e.g., 'PRODUCT', 'WORKSHOP'
}
