import { Module } from '@nestjs/common';
import { SitesModule } from '../sites/sites.module';
import { WhisperService } from './services/whisper.service';
import { OcrService } from './services/ocr.service';
import { SiteToolsService } from './services/site-tools.service';
import { ChatService } from './services/chat.service';

@Module({
  imports: [SitesModule],
  providers: [WhisperService, OcrService, SiteToolsService, ChatService],
  exports: [WhisperService, OcrService, SiteToolsService, ChatService],
})
export class AiModule {}
