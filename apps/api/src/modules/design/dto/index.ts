import { IsString, IsOptional, MaxLength } from 'class-validator';

export class RunDesignDto {
  /** Attachment id of the uploaded plan image (optional — requirements-only is allowed). */
  @IsOptional()
  @IsString()
  planAttachmentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  requirements?: string;
}
