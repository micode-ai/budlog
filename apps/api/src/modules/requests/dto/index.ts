import { IsString, IsOptional, IsEnum, IsIn } from 'class-validator';
import { RequestType, ProjectRole, AttachmentKind } from '@prisma/client';

export class CreateRequestDto {
  @IsString()
  title: string;

  @IsString()
  body: string;

  @IsOptional()
  @IsEnum(RequestType)
  type?: RequestType;

  @IsOptional()
  @IsEnum(ProjectRole)
  assigneeRole?: ProjectRole;

  @IsOptional()
  @IsString()
  assigneeUserId?: string;
}

export class TransitionRequestDto {
  @IsIn(['accept', 'decline', 'start', 'done'])
  action: 'accept' | 'decline' | 'start' | 'done';
}

export class CreateMessageDto {
  @IsString()
  body: string;
}

export class CreateAttachmentDto {
  @IsOptional()
  @IsEnum(AttachmentKind)
  kind?: AttachmentKind;

  @IsOptional()
  @IsString()
  caption?: string;
}
