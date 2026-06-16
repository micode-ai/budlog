import './instrument';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // Increase body size limit for base64 audio/image uploads (Phase 2: voice/photo)
  // verify callback preserves rawBody for future webhook signature verification
  app.use(
    json({
      limit: '50mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(
    urlencoded({
      extended: true,
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  // Global prefix (exclude webhook routes from versioning)
  app.setGlobalPrefix('api/v1', {
    exclude: ['telegram/webhook'],
  });

  // CORS — allow only explicitly configured origins; fall back to localhost for local dev
  const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : ['http://localhost:8081', 'http://localhost:3001'];
  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app.getHttpAdapter().getInstance());
  }

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');

  new Logger('Bootstrap').log(`Application is running on: http://localhost:${port}`);
}

bootstrap();
