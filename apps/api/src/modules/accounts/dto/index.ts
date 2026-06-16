import {
  IsString,
  IsOptional,
  IsEnum,
  IsEmail,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

export class CreateAccountDto {
  @IsString()
  name: string;

  @IsEnum(['personal', 'business', 'shared', 'investment'])
  type: 'personal' | 'business' | 'shared' | 'investment';

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsString()
  icon?: string;
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsString()
  icon?: string;
}

export class CreateInvitationDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(['editor', 'viewer'])
  role?: 'editor' | 'viewer';

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(30)
  expiresInDays?: number;
}

export class AcceptInvitationDto {
  @IsString()
  inviteCode: string;
}

export class UpdateMemberRoleDto {
  @IsEnum(['editor', 'viewer'])
  role: 'editor' | 'viewer';
}
