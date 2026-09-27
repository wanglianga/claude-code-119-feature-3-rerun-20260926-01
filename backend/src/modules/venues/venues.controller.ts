import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { VenuesService } from './venues.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('venues')
export class VenuesController {
  constructor(private readonly service: VenuesService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  @Roles('street', 'reviewer')
  create(@Body() body: any) {
    return this.service.create(body);
  }

  @Post(':id/blacklist')
  @Roles('street')
  toggle(@Param('id') id: string, @Body() body: { blacklisted: boolean; reason?: string }) {
    return this.service.toggleBlacklist(id, body.blacklisted, body.reason || '');
  }

  /** 新一轮场次降噪测试达标、复盘通过后，街道解除噪声限制（黑名单不受影响） */
  @Post(':id/clear-noise-restriction')
  @Roles('street')
  clearNoiseRestriction(@Param('id') id: string) {
    return this.service.clearNoiseRestriction(id);
  }
}
