import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  getHealth(): string {
    return 'NestJS Auth Starter API is running';
  }
}
