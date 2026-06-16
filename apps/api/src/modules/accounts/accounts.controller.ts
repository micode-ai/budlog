import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateAccountDto,
  UpdateAccountDto,
  CreateInvitationDto,
  AcceptInvitationDto,
  UpdateMemberRoleDto,
} from './dto';
import { AuthenticatedRequest } from '../../common/types';

@Controller('accounts')
@UseGuards(JwtAuthGuard)
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateAccountDto) {
    return this.accountsService.create(req.user.id, dto);
  }

  @Get()
  async findAll(@Req() req: AuthenticatedRequest) {
    return this.accountsService.findAllForUser(req.user.id);
  }

  @Get(':id')
  async findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.accountsService.findOne(id, req.user.id);
  }

  @Patch(':id')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accountsService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.accountsService.remove(id, req.user.id);
  }

  // ---- Invitations ----

  @Post(':id/invitations')
  async createInvitation(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.accountsService.createInvitation(id, req.user.id, dto);
  }

  @Get(':id/invitations')
  async getInvitations(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.accountsService.getInvitations(id, req.user.id);
  }

  @Delete(':id/invitations/:invitationId')
  async cancelInvitation(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('invitationId') invitationId: string,
  ) {
    return this.accountsService.cancelInvitation(id, invitationId, req.user.id);
  }

  @Post('invitations/accept')
  async acceptInvitation(
    @Req() req: AuthenticatedRequest,
    @Body() dto: AcceptInvitationDto,
  ) {
    return this.accountsService.acceptInvitation(req.user.id, dto.inviteCode);
  }

  @Post('invitations/decline')
  async declineInvitation(
    @Req() req: AuthenticatedRequest,
    @Body() dto: AcceptInvitationDto,
  ) {
    return this.accountsService.declineInvitation(req.user.id, dto.inviteCode);
  }

  // ---- Members ----

  @Get(':id/members')
  async getMembers(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.accountsService.getMembers(id, req.user.id);
  }

  @Patch(':id/members/:memberId')
  async updateMemberRole(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.accountsService.updateMemberRole(id, memberId, req.user.id, dto);
  }

  @Delete(':id/members/:memberId')
  async removeMember(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
  ) {
    return this.accountsService.removeMember(id, memberId, req.user.id);
  }

  @Post(':id/leave')
  async leaveAccount(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.accountsService.leaveAccount(id, req.user.id);
  }
}
