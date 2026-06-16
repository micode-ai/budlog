import { IsString, IsOptional, IsEnum } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  clientName?: string;

  @IsOptional()
  @IsString()
  address?: string;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  clientName?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsEnum(['lead', 'design', 'build', 'done', 'archived'])
  status?: 'lead' | 'design' | 'build' | 'done' | 'archived';
}

export class AddMemberDto {
  @IsString()
  userId: string;

  @IsEnum(['foreman', 'designer', 'client', 'manager'])
  role: 'foreman' | 'designer' | 'client' | 'manager';
}
