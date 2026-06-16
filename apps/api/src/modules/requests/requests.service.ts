import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RequestStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { FileStore } from './file-store.service';
import { CreateRequestDto, TransitionRequestDto, CreateMessageDto, CreateAttachmentDto } from './dto';

const TRANSITIONS: Record<string, { from: string[]; to: RequestStatus }> = {
  accept: { from: ['open'], to: 'accepted' },
  decline: { from: ['open', 'accepted', 'in_progress'], to: 'declined' },
  start: { from: ['accepted'], to: 'in_progress' },
  done: { from: ['accepted', 'in_progress'], to: 'done' },
};

// FIX 2(a): roles that are allowed to act on requests (client is observe-only)
const WRITE_ROLES = new Set(['manager', 'foreman', 'designer']);

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileStore: FileStore,
  ) {}

  // FIX 2(b): reject invalid assigneeRole; FIX 3: validate assigneeUserId is a project member
  async createRequest(accountId: string, projectId: string, userId: string, dto: CreateRequestDto) {
    // FIX 2(b): assigneeRole must be foreman or designer (not manager, not client)
    if (dto.assigneeRole && dto.assigneeRole !== 'foreman' && dto.assigneeRole !== 'designer') {
      throw new BadRequestException('assigneeRole must be foreman or designer');
    }

    // FIX 3: if assigneeUserId is provided, ensure they are a member of this project
    if (dto.assigneeUserId) {
      const member = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: dto.assigneeUserId } },
      });
      if (!member) throw new BadRequestException('assigneeUserId is not a member of this project');
    }

    return this.prisma.request.create({
      data: {
        accountId,
        projectId,
        createdById: userId,
        title: dto.title,
        body: dto.body,
        type: dto.type ?? 'other',
        assigneeRole: dto.assigneeRole,
        assigneeUserId: dto.assigneeUserId,
      },
    });
  }

  listRequests(accountId: string, projectId: string) {
    return this.prisma.request.findMany({
      where: { accountId, projectId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  // FIX 4: select only client-safe fields — never expose fileRef/storage in attachments include
  getRequest(accountId: string, projectId: string, requestId: string) {
    return this.prisma.request
      .findFirst({
        where: { id: requestId, accountId, projectId },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          attachments: {
            orderBy: { createdAt: 'asc' },
            select: { id: true, kind: true, mimeType: true, caption: true, createdById: true, createdAt: true },
          },
        },
      })
      .then((r) => {
        if (!r) throw new NotFoundException('Request not found');
        return r;
      });
  }

  async transition(
    accountId: string,
    projectId: string,
    requestId: string,
    dto: TransitionRequestDto,
    actor: { userId: string; projectRole: string },
  ) {
    const request = await this.assertRequest(accountId, projectId, requestId);

    // FIX 2(a): client role is blocked; non-manager must be the assignee AND hold a write role
    const isManager = actor.projectRole === 'manager';
    const isAssignee =
      WRITE_ROLES.has(actor.projectRole) &&
      ((request.assigneeUserId && request.assigneeUserId === actor.userId) ||
        (request.assigneeRole && request.assigneeRole === actor.projectRole));
    if (!isManager && !isAssignee) {
      throw new ForbiddenException('Only the assignee or a project manager can change this request');
    }

    const rule = TRANSITIONS[dto.action];
    if (!rule || !rule.from.includes(request.status)) {
      throw new BadRequestException(`Cannot ${dto.action} a request in status "${request.status}"`);
    }
    return this.prisma.request.update({ where: { id: requestId }, data: { status: rule.to } });
  }

  async addMessage(accountId: string, projectId: string, requestId: string, userId: string, dto: CreateMessageDto) {
    await this.assertRequest(accountId, projectId, requestId);
    return this.prisma.requestMessage.create({
      data: { requestId, authorUserId: userId, body: dto.body },
    });
  }

  async listMessages(accountId: string, projectId: string, requestId: string) {
    await this.assertRequest(accountId, projectId, requestId);
    return this.prisma.requestMessage.findMany({
      where: { requestId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addAttachment(
    accountId: string,
    projectId: string,
    requestId: string,
    userId: string,
    buffer: Buffer,
    mimeType: string | undefined,
    dto: CreateAttachmentDto,
  ) {
    await this.assertRequest(accountId, projectId, requestId);
    const ext = (mimeType?.split('/')[1] || 'bin').toLowerCase();
    const { fileRef } = await this.fileStore.save(buffer, ext);
    return this.prisma.attachment.create({
      data: {
        accountId,
        projectId,
        requestId,
        createdById: userId,
        kind: dto.kind ?? 'doc',
        storage: 'file',
        fileRef,
        mimeType,
        caption: dto.caption,
      },
    });
  }

  // FIX 4: call assertRequest first; select only client-safe fields (no fileRef/storage)
  async listAttachments(accountId: string, projectId: string, requestId: string) {
    await this.assertRequest(accountId, projectId, requestId);
    return this.prisma.attachment.findMany({
      where: { accountId, projectId, requestId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        kind: true,
        mimeType: true,
        caption: true,
        createdById: true,
        createdAt: true,
      },
    });
  }

  // getAttachmentFile is internal-only and still selects all fields (needs fileRef/storage)
  async getAttachmentFile(accountId: string, projectId: string, attachmentId: string) {
    const att = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, accountId, projectId },
    });
    if (!att) throw new NotFoundException('Attachment not found');
    if (att.storage !== 'file') throw new NotFoundException('File not available');
    const buffer = await this.fileStore.read(att.fileRef);
    return { buffer, mimeType: att.mimeType ?? 'application/octet-stream' };
  }

  /** Loads a request scoped to account+project, or throws 404. */
  private async assertRequest(accountId: string, projectId: string, requestId: string) {
    const req = await this.prisma.request.findFirst({
      where: { id: requestId, accountId, projectId },
    });
    if (!req) throw new NotFoundException('Request not found');
    return req;
  }
}
