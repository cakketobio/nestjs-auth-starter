import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const errorResponse = isHttpException ? exception.getResponse() : null;
    const message =
      typeof errorResponse === 'object' &&
      errorResponse !== null &&
      'message' in errorResponse
        ? (errorResponse as { message: string | string[] }).message
        : isHttpException
          ? exception.message
          : 'Internal server error';

    this.logger.warn(
      `${request.ip} ${request.method} ${request.url} -> ${status}`,
    );

    response.status(status).json({
      statusCode: status,
      message,
      error: isHttpException
        ? exception.name.replace('Exception', '')
        : 'Error',
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
