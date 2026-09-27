import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { NoiseReviewsService, CreateNoiseReviewDto } from './noise-reviews.service';

/** 场次维度：登记/查看本场噪声投诉复盘、提前降噪测试 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('screenings/:sid')
export class ScreeningNoiseReviewsController {
  constructor(private readonly service: NoiseReviewsService) {}

  @Get('noise-reviews')
  list(@Param('sid') sid: string) {
    return this.service.listByScreening(sid);
  }

  /** 放映中居民投诉扰民：现场负责人（安保/街道亦可）登记复盘四要素 */
  @Post('noise-reviews')
  @Roles('site_manager', 'security', 'street')
  create(
    @Param('sid') sid: string,
    @Req() req: any,
    @Body() body: CreateNoiseReviewDto,
  ) {
    return this.service.create(sid, req.user, body);
  }

  /** 被限制场地：下一次申请放映前提前做降噪测试 */
  @Post('noise-test')
  @Roles('site_manager', 'warehouse', 'security', 'street')
  noiseTest(
    @Param('sid') sid: string,
    @Req() req: any,
    @Body() body: { noiseDb: number; note?: string; testedAt?: string },
  ) {
    return this.service.recordNoiseTest(sid, req.user, body);
  }
}

/** 全局维度：街道在关闭投诉前逐项确认，并查看全部复盘 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('noise-reviews')
export class NoiseReviewsController {
  constructor(private readonly service: NoiseReviewsService) {}

  @Get()
  @Roles('street', 'reviewer', 'finance', 'security', 'site_manager')
  list(@Query('status') status?: string) {
    return this.service.listAll(status);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  /** 街道关闭投诉：确认居民沟通、音量调整、提前结束时间，限制条件自动带到点位 */
  @Post(':id/close')
  @Roles('street')
  close(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: {
      residentConfirmed: boolean;
      volumeConfirmed: boolean;
      earlyEndConfirmed?: boolean;
      streetNote?: string;
      latestShowTime?: string;
    },
  ) {
    return this.service.close(id, req.user, body);
  }
}
