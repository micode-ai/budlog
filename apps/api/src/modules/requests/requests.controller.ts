import {
  Controller, Get, Post, Patch, Body, Param, UseGuards, Req, Res,
  UploadedFile, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { ProjectGuard } from '../projects/guards/project.guard';
import { AuthenticatedRequest } from '../../common/types';
import { RequestsService } from './requests.service';
import { CreateRequestDto, TransitionRequestDto, CreateMessageDto, CreateAttachmentDto } from './dto';

type ProjectRequest = AuthenticatedRequest & { projectRole?: string };

@Controller('projects/:id/requests')
@UseGuards(JwtAuthGuard, AccountContextGuard, ProjectGuard)
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest, @Param('id') projectId: string) {
    return this.requests.listRequests(req.accountId, projectId);
  }

  @Post()
  @UseGuards(ViewerBlockGuard)
  create(@Req() req: AuthenticatedRequest, @Param('id') projectId: string, @Body() dto: CreateRequestDto) {
    return this.requests.createRequest(req.accountId, projectId, req.user.id, dto);
  }

  @Get(':rid')
  get(@Req() req: AuthenticatedRequest, @Param('id') projectId: string, @Param('rid') rid: string) {
    return this.requests.getRequest(req.accountId, projectId, rid);
  }

  @Patch(':rid')
  @UseGuards(ViewerBlockGuard)
  transition(@Req() req: ProjectRequest, @Param('id') projectId: string, @Param('rid') rid: string, @Body() dto: TransitionRequestDto) {
    return this.requests.transition(req.accountId, projectId, rid, dto, {
      userId: req.user.id,
      projectRole: req.projectRole ?? '',
    });
  }

  @Get(':rid/messages')
  messages(@Req() req: AuthenticatedRequest, @Param('id') projectId: string, @Param('rid') rid: string) {
    return this.requests.listMessages(req.accountId, projectId, rid);
  }

  @Post(':rid/messages')
  @UseGuards(ViewerBlockGuard)
  addMessage(@Req() req: AuthenticatedRequest, @Param('id') projectId: string, @Param('rid') rid: string, @Body() dto: CreateMessageDto) {
    return this.requests.addMessage(req.accountId, projectId, rid, req.user.id, dto);
  }

  @Get(':rid/attachments')
  attachments(@Req() req: AuthenticatedRequest, @Param('id') projectId: string, @Param('rid') rid: string) {
    return this.requests.listAttachments(req.accountId, projectId, rid);
  }

  @Post(':rid/attachments')
  @UseGuards(ViewerBlockGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  addAttachment(
    @Req() req: AuthenticatedRequest,
    @Param('id') projectId: string,
    @Param('rid') rid: string,
    @UploadedFile() file: { buffer: Buffer; mimetype: string } | undefined,
    @Body() dto: CreateAttachmentDto,
  ) {
    if (!file) throw new BadRequestException('file is required');
    return this.requests.addAttachment(req.accountId, projectId, rid, req.user.id, file.buffer, file.mimetype, dto);
  }

  @Get('attachments/:aid/file')
  async getFile(@Req() req: AuthenticatedRequest, @Param('id') projectId: string, @Param('aid') aid: string, @Res() res: Response) {
    const { buffer, mimeType } = await this.requests.getAttachmentFile(req.accountId, projectId, aid);
    res.setHeader('Content-Type', mimeType);
    res.send(buffer);
  }
}
