import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { AuthenticatedRequest } from '../../common/types';
import { SitesService } from './sites.service';
import {
  CreateSiteDto,
  UpdateSiteDto,
  CreateWorkEntryDto,
  CreateMaterialEntryDto,
  CreatePhotoDto,
  JournalRangeDto,
} from './dto';

@Controller('sites')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.sites.listSites(req.accountId);
  }

  @Post()
  @UseGuards(ViewerBlockGuard)
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateSiteDto) {
    return this.sites.createSite(req.accountId, req.user.id, dto);
  }

  @Patch(':id')
  @UseGuards(ViewerBlockGuard)
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateSiteDto,
  ) {
    return this.sites.updateSite(req.accountId, req.user.id, id, dto);
  }

  @Post(':id/archive')
  @UseGuards(ViewerBlockGuard)
  archive(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.sites.archiveSite(req.accountId, req.user.id, id);
  }

  @Get(':id/journal')
  journal(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() range: JournalRangeDto,
  ) {
    return this.sites.getSiteJournal(req.accountId, id, {
      from: range.from ? new Date(range.from) : undefined,
      to: range.to ? new Date(range.to) : undefined,
    });
  }

  @Post('work')
  @UseGuards(ViewerBlockGuard)
  addWork(@Req() req: AuthenticatedRequest, @Body() dto: CreateWorkEntryDto) {
    return this.sites.addWorkEntry(req.accountId, req.user.id, dto);
  }

  @Post('materials')
  @UseGuards(ViewerBlockGuard)
  addMaterial(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateMaterialEntryDto,
  ) {
    return this.sites.addMaterialEntry(req.accountId, req.user.id, dto);
  }

  @Post('photos')
  @UseGuards(ViewerBlockGuard)
  addPhoto(@Req() req: AuthenticatedRequest, @Body() dto: CreatePhotoDto) {
    return this.sites.addPhoto(req.accountId, req.user.id, dto);
  }
}
