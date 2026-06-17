import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RequestsService } from '../requests/requests.service';
import { DESIGN_PROVIDER, DesignProvider, DesignInput } from './providers/design-provider.interface';
import { RunDesignDto } from './dto';

const WRITE_ROLES = new Set(['manager', 'foreman', 'designer']);

@Injectable()
export class DesignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requests: RequestsService,
    @Inject(DESIGN_PROVIDER) private readonly provider: DesignProvider,
  ) {}

  async run(
    accountId: string,
    projectId: string,
    requestId: string,
    userId: string,
    projectRole: string,
    dto: RunDesignDto,
  ) {
    if (!WRITE_ROLES.has(projectRole)) {
      throw new ForbiddenException('Only a foreman, designer, or manager can run a design action');
    }
    if (!dto.planAttachmentId && !dto.requirements) {
      throw new BadRequestException('Provide a planAttachmentId or requirements');
    }

    const request = await this.prisma.request.findFirst({
      where: { id: requestId, accountId, projectId },
      select: { id: true },
    });
    if (!request) throw new NotFoundException('Request not found');

    const input: DesignInput = { requirements: dto.requirements };
    if (dto.planAttachmentId) {
      const attachment = await this.prisma.attachment.findFirst({
        where: { id: dto.planAttachmentId, accountId, projectId, requestId },
        select: { id: true },
      });
      if (!attachment) throw new NotFoundException('Plan attachment not found on this request');
      const { buffer, mimeType } = await this.requests.getAttachmentFile(
        accountId,
        projectId,
        dto.planAttachmentId,
      );
      input.planImageBase64 = buffer.toString('base64');
      input.mimeType = mimeType;
    }

    const results = await this.provider.generate(input);
    const created = [];
    for (const r of results) {
      created.push(
        await this.prisma.designArtifact.create({
          data: {
            accountId,
            projectId,
            requestId,
            createdById: userId,
            kind: r.kind,
            provider: r.provider,
            data: r.data as any,
          },
        }),
      );
    }
    return created;
  }

  listDesigns(accountId: string, projectId: string) {
    return this.prisma.designArtifact.findMany({
      where: { accountId, projectId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
