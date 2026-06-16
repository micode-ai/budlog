import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AccountContextGuard } from '../common/middleware/account-context.middleware';

@Global()
@Module({
  providers: [PrismaService, AccountContextGuard],
  exports: [PrismaService, AccountContextGuard],
})
export class DatabaseModule {}
