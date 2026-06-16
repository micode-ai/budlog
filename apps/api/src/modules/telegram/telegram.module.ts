import { Global, Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramBotController } from './telegram-bot.controller';
import { TelegramLinkService } from './telegram-link.service';
import { AiModule } from '../ai/ai.module';
import { SitesModule } from '../sites/sites.module';
import { ReportsModule } from '../reports/reports.module';

@Global()
@Module({
  imports: [AiModule, SitesModule, ReportsModule],
  controllers: [TelegramBotController],
  providers: [TelegramService, TelegramBotService, TelegramLinkService],
  exports: [TelegramService, TelegramLinkService, TelegramBotService],
})
export class TelegramModule {}
