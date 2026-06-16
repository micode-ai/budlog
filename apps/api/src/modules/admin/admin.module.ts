import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';

@Module({
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}
