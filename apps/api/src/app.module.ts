import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { RedisThrottlerStorage } from './common/cache/redis-throttler-storage';
import { SentryExceptionFilter } from './common/filters/sentry-exception.filter';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { DatabaseModule } from './database/database.module';
import { MailModule } from './modules/mail/mail.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { HealthModule } from './modules/health/health.module';
import { SitesModule } from './modules/sites/sites.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AdminModule } from './modules/admin/admin.module';
import { CacheModule } from './common/cache/cache.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Rate limiting — Redis-backed so limits survive restarts
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [{ ttl: 60000, limit: 100 }],
        storage: new RedisThrottlerStorage(config),
      }),
    }),

    // Scheduling
    ScheduleModule.forRoot(),

    // Database
    DatabaseModule,

    // Caching (global)
    CacheModule,

    // Infrastructure
    MailModule,
    TelegramModule,

    // Feature modules
    AuthModule,
    UsersModule,
    AccountsModule,
    SitesModule,
    ReportsModule,
    AdminModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryExceptionFilter,
    },
  ],
})
export class AppModule {}
