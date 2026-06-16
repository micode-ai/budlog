import { Controller, Get, Post, Delete, Param, Query, UseGuards, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { AuthenticatedRequest } from '../../common/types';
import { ReportsService } from './reports.service';

@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post('sites/:id/report-link')
  @UseGuards(JwtAuthGuard, AccountContextGuard, ViewerBlockGuard)
  create(@Req() req: AuthenticatedRequest, @Param('id') siteId: string) {
    return this.reports.createReportLink(req.accountId, req.user.id, siteId);
  }

  @Delete('sites/:id/report-link/:token')
  @UseGuards(JwtAuthGuard, AccountContextGuard, ViewerBlockGuard)
  revoke(
    @Req() req: AuthenticatedRequest,
    @Param('id') siteId: string,
    @Param('token') token: string,
  ) {
    return this.reports.revokeReportLink(req.accountId, siteId, token);
  }

  // Public — no auth. The token IS the credential.
  @Get('public/report/:token')
  getPublic(@Param('token') token: string) {
    return this.reports.getPublicReport(token);
  }

  // Public photo proxy — streams Telegram-stored bytes.
  @Get('public/report/:token/photo/:photoId')
  async getPhoto(
    @Param('token') token: string,
    @Param('photoId') photoId: string,
    @Res() res: Response,
  ) {
    const { buffer, contentType } = await this.reports.getPhotoBytes(token, photoId);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  }

  // Public PDF export of the site journal.
  @Get('public/report/:token/pdf')
  async getPdf(
    @Param('token') token: string,
    @Query('lang') lang: string,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="report-${token.slice(0, 8)}.pdf"`);
    await this.reports.streamReportPdf(token, lang || 'en', res);
  }
}
