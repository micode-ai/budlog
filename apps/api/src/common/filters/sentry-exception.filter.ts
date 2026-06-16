import { ArgumentsHost, Catch, HttpException, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import * as Sentry from '@sentry/node';

@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= 500) {
      const ctx = host.switchToHttp();
      const req = ctx.getRequest<{ method?: string; url?: string; user?: { id?: string } }>();
      Sentry.withScope((scope) => {
        if (req?.user?.id) {
          scope.setUser({ id: req.user.id });
        }
        if (req?.method && req?.url) {
          scope.setContext('request', { method: req.method, url: req.url });
        }
        Sentry.captureException(exception);
      });
    }

    super.catch(exception, host);
  }
}
