import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { NoiseComplaintsService } from './noise-complaints.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class NoiseComplaintsController {
  constructor(private readonly service: NoiseComplaintsService) {}

  @Get('noise-complaints')
  list(@Query('screeningId') screeningId?: string) {
    return this.service.list(screeningId);
  }

  @Get('screenings/:sid/noise-complaints')
  listByScreening(@Param('sid') sid: string) {
    return this.service.list(sid);
  }

  @Get('noise-complaints/:id')
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  /** 居民放映中投诉扰民：现场负责人/安保登记楼栋、分贝、调低音量时间、安保沟通结果 */
  @Post('screenings/:sid/noise-complaints')
  @Roles('site_manager', 'security', 'street')
  create(
    @Param('sid') sid: string,
    @Req() req: any,
    @Body() body: {
      building: string; noiseDb: number; volumeLoweredAt: string;
      noiseDbAfter?: number; securityCommunication: string; actionTaken?: string;
    },
  ) {
    return this.service.create(sid, req.user, body);
  }

  /** 活动提前结束：重算补贴、商户协办费用，推导最晚放映时间 */
  @Post('noise-complaints/:id/end-early')
  @Roles('site_manager', 'security', 'street')
  endEarly(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: {
      earlyEndedAt: string; originalSubsidyCents?: number; originalMerchantFeeCents?: number;
    },
  ) {
    return this.service.endEarly(id, req.user, body);
  }

  /** 街道逐项确认：居民沟通 / 音量调整 / 提前结束时间 */
  @Post('noise-complaints/:id/review')
  @Roles('street')
  review(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: {
      confirmResidentContact?: boolean; confirmVolumeAdjustment?: boolean;
      confirmEarlyEndTime?: boolean; reviewComment?: string;
    },
  ) {
    return this.service.review(id, req.user, body);
  }

  /** 街道关闭投诉：三项确认齐备，限制条件回写场地，下一次同场地申请自动带出 */
  @Post('noise-complaints/:id/close')
  @Roles('street')
  close(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { reviewComment?: string; latestShowTime?: string },
  ) {
    return this.service.close(id, req.user, body);
  }
}
