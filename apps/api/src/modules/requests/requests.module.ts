import { Module } from '@nestjs/common';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { FileStore } from './file-store.service';

@Module({
  controllers: [RequestsController],
  providers: [RequestsService, FileStore],
  exports: [RequestsService],
})
export class RequestsModule {}
