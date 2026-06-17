import { Module } from '@nestjs/common';
import { RequestsModule } from '../requests/requests.module';
import { DesignController } from './design.controller';
import { DesignService } from './design.service';
import { OpenAiVisionProvider } from './providers/openai-vision.provider';
import { DESIGN_PROVIDER } from './providers/design-provider.interface';

@Module({
  imports: [RequestsModule],
  controllers: [DesignController],
  providers: [
    DesignService,
    OpenAiVisionProvider,
    { provide: DESIGN_PROVIDER, useExisting: OpenAiVisionProvider },
  ],
  exports: [DesignService],
})
export class DesignModule {}
