import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { AuthenticatedRequest } from '../../common/types';
import { ProjectsService } from './projects.service';
import { ProjectGuard } from './guards/project.guard';
import { CreateProjectDto, UpdateProjectDto, AddMemberDto } from './dto';

type ProjectRequest = AuthenticatedRequest & { projectRole?: string };

function requireManager(req: ProjectRequest) {
  if (req.projectRole !== 'manager') throw new ForbiddenException('Project manager role required');
}

@Controller('projects')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.projects.listProjects(req.accountId, req.user.id, req.accountRole);
  }

  @Post()
  @UseGuards(ViewerBlockGuard)
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateProjectDto) {
    return this.projects.createProject(req.accountId, req.user.id, dto);
  }

  @Get(':id')
  @UseGuards(ProjectGuard)
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.projects.getProject(req.accountId, id, req.user.id, req.accountRole);
  }

  @Patch(':id')
  @UseGuards(ProjectGuard, ViewerBlockGuard)
  update(@Req() req: ProjectRequest, @Param('id') id: string, @Body() dto: UpdateProjectDto) {
    requireManager(req);
    return this.projects.updateProject(req.accountId, id, dto);
  }

  @Get(':id/members')
  @UseGuards(ProjectGuard)
  members(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.projects.listMembers(req.accountId, id);
  }

  @Post(':id/members')
  @UseGuards(ProjectGuard, ViewerBlockGuard)
  addMember(@Req() req: ProjectRequest, @Param('id') id: string, @Body() dto: AddMemberDto) {
    requireManager(req);
    return this.projects.addMember(req.accountId, id, dto);
  }

  @Delete(':id/members/:memberId')
  @UseGuards(ProjectGuard, ViewerBlockGuard)
  removeMember(@Req() req: ProjectRequest, @Param('id') id: string, @Param('memberId') memberId: string) {
    requireManager(req);
    return this.projects.removeMember(req.accountId, id, memberId);
  }
}
