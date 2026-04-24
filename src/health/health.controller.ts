import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { Public } from '../common/decorators/public.decorator';
import { HealthService } from './health.service';

@ApiExcludeController()
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  getHealth(): string {
    return this.healthService.getHealth();
  }
}
