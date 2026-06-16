import { IsString, IsOptional, IsEnum, IsIn, MaxLength } from 'class-validator';
import { RequestType, ProjectRole, AttachmentKind } from '@prisma/client';

export class CreateRequestDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsString()
  @MaxLength(10000)
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
  // @IsIn (not @IsEnum): action is a string-literal union, not a Prisma enum
  @IsIn(['accept', 'decline', 'start', 'done'])
  action: 'accept' | 'decline' | 'start' | 'done';
}

export class CreateMessageDto {
  @IsString()
  @MaxLength(10000)
  body: string;
}

export class CreateAttachmentDto {
  @IsOptional()
  @IsEnum(AttachmentKind)
  kind?: AttachmentKind;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string;
}
