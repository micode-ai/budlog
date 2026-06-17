import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { ProjectGuard } from '../projects/guards/project.guard';
import { AuthenticatedRequest } from '../../common/types';
import { DesignService } from './design.service';
import { RunDesignDto } from './dto';

type ProjectRequest = AuthenticatedRequest & { projectRole?: string };

@Controller('projects/:id')
@UseGuards(JwtAuthGuard, AccountContextGuard, ProjectGuard)
export class DesignController {
  constructor(private readonly design: DesignService) {}

  @Get('designs')
  list(@Req() req: AuthenticatedRequest, @Param('id') projectId: string) {
    return this.design.listDesigns(req.accountId, projectId);
  }

  @Post('requests/:rid/design')
  @UseGuards(ViewerBlockGuard)
  run(
    @Req() req: ProjectRequest,
    @Param('id') projectId: string,
    @Param('rid') rid: string,
    @Body() dto: RunDesignDto,
  ) {
    return this.design.run(req.accountId, projectId, rid, req.user.id, req.projectRole ?? '', dto);
  }
}
