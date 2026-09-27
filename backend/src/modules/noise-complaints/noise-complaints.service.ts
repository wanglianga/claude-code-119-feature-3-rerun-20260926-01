import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NoiseComplaint } from '../../entities/noise-complaint.entity';
import { Screening } from '../../entities/screening.entity';
import { Venue } from '../../entities/venue.entity';
import { TimelineEvent } from '../../entities/timeline-event.entity';

/** 标准口径默认值（分）：街道公益放映补贴 / 商户协办费用 */
const DEFAULT_SUBSIDY_CENTS = 80000;
const DEFAULT_MERCHANT_FEE_CENTS = 50000;

@Injectable()
export class NoiseComplaintsService {
  constructor(
    @InjectRepository(NoiseComplaint) private readonly repo: Repository<NoiseComplaint>,
    @InjectRepository(Screening) private readonly screeningRepo: Repository<Screening>,
    @InjectRepository(Venue) private readonly venueRepo: Repository<Venue>,
    @InjectRepository(TimelineEvent) private readonly timelineRepo: Repository<TimelineEvent>,
  ) {}

  list(screeningId?: string) {
    return this.repo.find({
      where: screeningId ? { screeningId } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async detail(id: string) {
    const c = await this.repo.findOne({ where: { id }, relations: ['screening'] });
    if (!c) throw new NotFoundException('噪声投诉复盘单不存在');
    (c as any).allConfirmed =
      c.confirmResidentContact && c.confirmVolumeAdjustment && c.confirmEarlyEndTime;
    return c;
  }

  /** 现场负责人/安保登记居民噪声投诉 */
  async create(screeningId: string, user: any, dto: {
    building: string;
    noiseDb: number;
    volumeLoweredAt: string;
    noiseDbAfter?: number;
    securityCommunication: string;
    actionTaken?: string;
  }) {
    if (!dto.building?.trim()) throw new BadRequestException('必须记录投诉楼栋');
    if (dto.noiseDb == null || dto.noiseDb <= 0) throw new BadRequestException('必须记录分贝读数');
    const lowered = new Date(dto.volumeLoweredAt);
    if (isNaN(+lowered)) throw new BadRequestException('调低音量时间格式不正确');
    if (!dto.securityCommunication?.trim()) throw new BadRequestException('必须记录安保沟通结果');

    const screening = await this.screeningRepo.findOne({ where: { id: screeningId } });
    if (!screening) throw new NotFoundException('场次不存在');

    const c = await this.repo.save(this.repo.create({
      screeningId,
      venueId: screening.venueId,
      building: dto.building.trim(),
      noiseDb: Math.round(dto.noiseDb),
      noiseDbAfter: dto.noiseDbAfter != null ? Math.round(dto.noiseDbAfter) : null,
      volumeLoweredAt: lowered,
      securityCommunication: dto.securityCommunication.trim(),
      actionTaken: dto.actionTaken?.trim() || null,
      createdById: user.sub,
    }));

    await this.timelineRepo.save(this.timelineRepo.create({
      screeningId, kind: 'complaint', actorRole: user.role,
      actorId: user.sub, actorName: user.name,
      title: `噪声投诉登记·${c.building}`,
      detail: `实测 ${c.noiseDb}dB，${fmtTime(lowered)} 调低音量；`
        + `${c.noiseDbAfter != null ? `调低后 ${c.noiseDbAfter}dB；` : ''}`
        + `安保沟通结果：${c.securityCommunication}`,
    }));
    return this.detail(c.id);
  }

  /**
   * 活动因投诉提前结束：按实际放映占计划时长比例，
   * 重新计算街道补贴与商户协办费用，并推导该点位后续最晚放映时间。
   */
  async endEarly(id: string, user: any, dto: {
    earlyEndedAt: string;
    originalSubsidyCents?: number;
    originalMerchantFeeCents?: number;
  }) {
    const c = await this.getOpen(id);
    const s = await this.screeningRepo.findOne({ where: { id: c.screeningId } });
    if (!s) throw new NotFoundException('场次不存在');

    const endedAt = new Date(dto.earlyEndedAt);
    if (isNaN(+endedAt)) throw new BadRequestException('提前结束时间格式不正确');

    const plannedStart = combineDateTime(s.showDate, s.showTime);
    const plannedEnd = new Date(plannedStart.getTime() + s.plannedMinutes * 60000);
    if (endedAt >= plannedEnd) {
      throw new BadRequestException(
        `结束时间不早于计划结束时间 ${fmtTime(plannedEnd)}，不构成提前结束，无需重算`,
      );
    }
    const actualStart = s.startedAt || plannedStart;
    if (endedAt < actualStart) throw new BadRequestException('结束时间早于实际开始放映时间');

    const plannedMinutes = s.plannedMinutes;
    const actualMinutes = Math.max(0, Math.round((+endedAt - +actualStart) / 60000));
    const ratio = Math.min(1, Math.max(0, actualMinutes / plannedMinutes));

    const originalSubsidy = dto.originalSubsidyCents != null
      ? Math.max(0, Math.round(dto.originalSubsidyCents))
      : (Number(s.subsidyAmount) > 0 ? Number(s.subsidyAmount) : DEFAULT_SUBSIDY_CENTS);
    const originalMerchantFee = dto.originalMerchantFeeCents != null
      ? Math.max(0, Math.round(dto.originalMerchantFeeCents))
      : (Number(s.merchantFeeCents) > 0 ? Number(s.merchantFeeCents) : DEFAULT_MERCHANT_FEE_CENTS);

    const recalcSubsidy = Math.round(originalSubsidy * ratio);
    const recalcMerchantFee = Math.round(originalMerchantFee * ratio);
    const latest = this.deriveLatestShowTime(c.noiseDb);

    c.endedEarly = true;
    c.earlyEndedAt = endedAt;
    c.plannedStart = plannedStart;
    c.plannedEnd = plannedEnd;
    c.actualStart = actualStart;
    c.plannedMinutes = plannedMinutes;
    c.actualMinutes = actualMinutes;
    c.originalSubsidyCents = String(originalSubsidy);
    c.recalcSubsidyCents = String(recalcSubsidy);
    c.originalMerchantFeeCents = String(originalMerchantFee);
    c.merchantFeeCents = String(recalcMerchantFee);
    c.derivedLatestShowTime = latest;
    c.recalcNote = `实际放映 ${actualMinutes}/${plannedMinutes} 分钟（比例 ${(ratio * 100).toFixed(0)}%）；`
      + `补贴 ${yuan(originalSubsidy)}→${yuan(recalcSubsidy)} 元，`
      + `商户协办费 ${yuan(originalMerchantFee)}→${yuan(recalcMerchantFee)} 元；`
      + `建议该点位后续最晚放映 ${latest}`;
    await this.repo.save(c);

    // 重算结果回写场次：补贴以重算值为发放口径
    s.earlyEndedAt = endedAt;
    s.actualMinutes = actualMinutes;
    s.subsidyAmount = String(recalcSubsidy);
    s.merchantFeeCents = String(recalcMerchantFee);
    s.subsidyRecalculated = true;
    await this.screeningRepo.save(s);

    await this.timelineRepo.save(this.timelineRepo.create({
      screeningId: s.id, kind: 'complaint', actorRole: user.role,
      actorId: user.sub, actorName: user.name,
      title: '噪声扰民·活动提前结束，平台重算费用',
      detail: `${fmtTime(endedAt)} 提前结束；${c.recalcNote}`,
    }));
    return this.detail(id);
  }

  /** 街道逐项确认（居民沟通 / 音量调整 / 提前结束时间），可多次调用 */
  async review(id: string, user: any, dto: {
    confirmResidentContact?: boolean;
    confirmVolumeAdjustment?: boolean;
    confirmEarlyEndTime?: boolean;
    reviewComment?: string;
  }) {
    const c = await this.getOpen(id);
    if (dto.confirmResidentContact != null) c.confirmResidentContact = !!dto.confirmResidentContact;
    if (dto.confirmVolumeAdjustment != null) c.confirmVolumeAdjustment = !!dto.confirmVolumeAdjustment;
    if (dto.confirmEarlyEndTime != null) c.confirmEarlyEndTime = !!dto.confirmEarlyEndTime;
    if (dto.reviewComment !== undefined) c.reviewComment = dto.reviewComment || null;
    await this.repo.save(c);

    const done = [c.confirmResidentContact, c.confirmVolumeAdjustment, c.confirmEarlyEndTime];
    await this.timelineRepo.save(this.timelineRepo.create({
      screeningId: c.screeningId, kind: 'complaint', actorRole: 'street',
      actorId: user.sub, actorName: user.name,
      title: '街道复盘确认',
      detail: `居民沟通${done[0] ? '✓' : '✗'} / 音量调整${done[1] ? '✓' : '✗'}`
        + ` / 提前结束时间${done[2] ? '✓' : '✗'}`,
    }));
    return this.detail(id);
  }

  /** 街道关闭投诉：三项确认齐备后，限制条件写入场地，下一次同场地申请自动带出 */
  async close(id: string, user: any, dto: { reviewComment?: string; latestShowTime?: string }) {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('噪声投诉复盘单不存在');
    if (c.closedAt) throw new BadRequestException('投诉已关闭');

    const missing: string[] = [];
    if (!c.confirmResidentContact) missing.push('居民沟通');
    if (!c.confirmVolumeAdjustment) missing.push('音量调整');
    if (!c.confirmEarlyEndTime) missing.push('提前结束时间');
    if (missing.length) {
      throw new BadRequestException(`投诉关闭前，街道还需确认：${missing.join('、')}`);
    }

    const latest = dto.latestShowTime?.trim() || c.derivedLatestShowTime || this.deriveLatestShowTime(c.noiseDb);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(latest)) {
      throw new BadRequestException('最晚放映时间格式应为 HH:mm');
    }

    c.closedAt = new Date();
    c.closedById = user.sub;
    c.derivedLatestShowTime = latest;
    if (dto.reviewComment !== undefined) c.reviewComment = dto.reviewComment || c.reviewComment;
    c.venueRestrictionApplied = true;
    await this.repo.save(c);

    const venue = await this.venueRepo.findOne({ where: { id: c.venueId } });
    if (venue) {
      venue.latestShowTime = latest;
      venue.noiseTestRequired = true;
      venue.restrictionReason = `噪声投诉复盘 ${c.id.slice(0, 8)}：${c.building} 实测 ${c.noiseDb}dB`
        + `${c.endedEarly ? '，活动提前结束' : ''}；后续最晚放映 ${latest}，再次申请前须完成提前降噪测试`;
      venue.restrictionAt = new Date();
      await this.venueRepo.save(venue);
    }

    // 风险计数与主办方信用由通用噪声异常工单办结统一联动，复盘单只负责记录、重算与场地限制

    await this.timelineRepo.save(this.timelineRepo.create({
      screeningId: c.screeningId, kind: 'complaint', actorRole: 'street',
      actorId: user.sub, actorName: user.name,
      title: '噪声投诉复盘关闭·限制写入场地',
      detail: `该点位后续最晚放映 ${latest}；下一次同场地申请自动带出限制并要求提前降噪测试`,
    }));
    return this.detail(id);
  }

  /** 分贝分档推导后续最晚放映开始时间 */
  private deriveLatestShowTime(db: number) {
    if (db >= 70) return '20:00';
    if (db >= 60) return '20:30';
    return '21:00';
  }

  private async getOpen(id: string) {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('噪声投诉复盘单不存在');
    if (c.closedAt) throw new BadRequestException('投诉已关闭，不能再修改');
    return c;
  }
}

function combineDateTime(date: string, time: string) {
  return new Date(`${date}T${time || '19:30'}:00`);
}
function fmtTime(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function yuan(cents: number) {
  return (cents / 100).toFixed(2);
}
