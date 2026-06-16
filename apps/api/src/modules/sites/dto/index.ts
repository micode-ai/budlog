import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsDateString,
  Min,
} from 'class-validator';

export class CreateSiteDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  clientName?: string;
}

export class UpdateSiteDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  clientName?: string;

  @IsOptional()
  @IsEnum(['active', 'archived'])
  status?: 'active' | 'archived';
}

export class CreateWorkEntryDto {
  @IsString()
  siteId: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsDateString()
  workDate?: string;

  @IsOptional()
  @IsEnum(['voice', 'manual', 'photo'])
  source?: 'voice' | 'manual' | 'photo';
}

export class MaterialItemDto {
  @IsString()
  name: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsOptional()
  @IsString()
  unit?: string;
}

export class CreateMaterialEntryDto {
  @IsString()
  siteId: string;

  @IsString()
  name: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  workEntryId?: string;

  @IsOptional()
  @IsDateString()
  entryDate?: string;
}

export class CreatePhotoDto {
  @IsString()
  siteId: string;

  @IsString()
  telegramFileId: string;

  @IsOptional()
  @IsString()
  caption?: string;
}

export class JournalRangeDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
