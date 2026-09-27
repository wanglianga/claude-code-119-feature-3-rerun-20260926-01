import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { NoiseReview } from '../../entities/noise-review.entity';
import { Screening } from '../../entities/screening.entity';
import { Incident } from '../../entities/incident.entity';
import { Settlement } from '../../entities/settlement.entity';
import { TimelineEvent } from '../../entities/timeline-event.entity';
import { Venue } from '../../entities/venue.entity';
import { VenuesService } from '../venues/venues.service';

/** 单场露天放映标准时长口径（分钟），提前结束按实际放映时长占比折算费用 */
const PLANNED_DURATION_MIN = 120;
/** 费用折算保底比例（即便开场即停，也保留最低筹办成本） */
const MIN_RATIO = 0.25;
/** 默认核定口径（分）：街道补贴 800 元 / 场，商户协办费 300 元 / 场 */
const DEFAULT_PLAN_SUBSIDY = 80000;
const DEFAULT_PLAN_MERCHANT_COST = 30000;

export interface CreateNoiseReviewDto {
  incidentId?: string;
  complaintBuildings: string;
  noiseDb: number;
  /** ISO 时间或当日 HH:mm（服务端按放映日期补齐） */
  volumeLoweredAt: string;
  noiseDbAfter?: number;
  securityResult: string;
  endedEarly?: boolean;
  earlyEndAt?: string;
  proposedLatestShowTime?: string;
  planSubsidyCents?: number;
  planMerchantCostCents?: number;
  remark?: string;
}

@Injectable()
export class NoiseReviewsService {
  constructor(
    @InjectRepository(NoiseReview) private readonly repo: Repository<NoiseReview>,
    @InjectRepository(Screening) private readonly screeningRepo: Repository<Screening>,
    @InjectRepository(Incident) private readonly incidentRepo: Repository<Incident>,
    @InjectRepository(Settlement) private readonly settlementRepo: Repository<Settlement>,
    @InjectRepository(TimelineEvent) private readonly timelineRepo: Repository<TimelineEvent>,
    @InjectRepository(Venue) private readonly venueRepo: Repository<Venue>,
    private readonly venues: VenuesService,
    private readonly dataSource: DataSource,
  ) {}

  listByScreening(screeningId: string) {
    return this.repo.find({ where: { screeningId }, order: { createdAt: 'DESC' } });
  }

  async listAll(status?: string) {
    const rows = await this.repo.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
    });
    if (!rows.length) return [];
    const screenings = await this.screeningRepo.find({
      where: { id: In(rows.map((r) => r.screeningId)) },
      relations: ['venue', 'organizer'],
    });
    const map = new Map(screenings.map((s) => [s.id, s]));
    return rows.map((r) => ({ ...r, screening: map.get(r.screeningId) }));
  }

  async detail(id: string) {
    const r = await this.repo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('噪声投诉复盘不存在');
    (r as any).screening = await this.screeningRepo.findOne({
      where: { id: r.screeningId },
      relations: ['venue', 'organizer'],
    });
    return r;
  }

  /**
   * 现场负责人记录噪声投诉复盘：投诉楼栋、分贝读数、调低音量时间、安保沟通结果。
   * 若活动提前结束：重新计算补贴、商户协办费用，并形成建议的该点位最晚放映时间。
   */
  async create(screeningId: string, user: any, dto: CreateNoiseReviewDto) {
    if (!dto.complaintBuildings?.trim()) throw new BadRequestException('必须记录投诉楼栋');
    if (dto.noiseDb == null || dto.noiseDb <= 0) throw new BadRequestException('必须记录现场分贝读数');
    if (!dto.volumeLoweredAt) throw new BadRequestException('必须记录调低音量时间');
    if (!dto.securityResult?.trim()) throw new BadRequestException('必须记录安保沟通结果');

    const screening = await this.screeningRepo.findOne({
      where: { id: screeningId },
      relations: ['venue'],
    });
    if (!screening) throw new NotFoundException('场次不存在');
    if (!['screening', 'completed'].includes(screening.status)) {
      throw new BadRequestException('仅放映中（或已结束待复盘）的场次可登记噪声投诉复盘');
    }

    let incident: Incident | null = null;
    if (dto.incidentId) {
      incident = await this.incidentRepo.findOne({ where: { id: dto.incidentId, screeningId } });
      if (!incident) throw new BadRequestException('关联异常工单不存在或不属于本场次');
      if (incident.type !== 'noise_complaint') throw new BadRequestException('仅可关联「居民投诉噪声」工单');
    }

    const loweredAt = this.resolveTime(dto.volumeLoweredAt, screening.showDate);
    const endedEarly = !!dto.endedEarly;
    let earlyEndAt: Date | null = null;
    let proposedLatestShowTime: string | null = null;
    let finalSubsidy: number | null = null;
    let finalMerchantCost: number | null = null;
    let recalcNote: string | null = null;

    const planSubsidy = Math.max(0, Math.round(
      dto.planSubsidyCents || Number(screening.planSubsidyCents) || DEFAULT_PLAN_SUBSIDY));
    const planMerchantCost = Math.max(0, Math.round(
      dto.planMerchantCostCents || Number(screening.planMerchantCostCents) || DEFAULT_PLAN_MERCHANT_COST));

    if (endedEarly) {
      if (!dto.earlyEndAt) throw new BadRequestException('活动提前结束必须填写实际结束时间');
      earlyEndAt = this.resolveTime(dto.earlyEndAt, screening.showDate);
      const plannedStart = new Date(`${screening.showDate}T${screening.showTime}:00`);
      const ratio = Math.max(MIN_RATIO, Math.min(1,
        (earlyEndAt.getTime() - plannedStart.getTime()) / (PLANNED_DURATION_MIN * 60000)));
      finalSubsidy = Math.round((planSubsidy * ratio) / 100) * 100;
      finalMerchantCost = Math.round((planMerchantCost * ratio) / 100) * 100;
      proposedLatestShowTime = dto.proposedLatestShowTime || this.hhmm(earlyEndAt);
      recalcNote = `按实际放映时长折算（计划 ${PLANNED_DURATION_MIN} 分钟，折算比例 ${(ratio * 100).toFixed(0)}%，保底 ${MIN_RATIO * 100}%）：`
        + `补贴 ${this.yuan(planSubsidy)}→${this.yuan(finalSubsidy)} 元；`
        + `商户协办费 ${this.yuan(planMerchantCost)}→${this.yuan(finalMerchantCost)} 元；`
        + `建议该点位后续最晚放映开始时间 ${proposedLatestShowTime}`;
    }

    return this.dataSource.transaction(async (mgr) => {
      const review = await mgr.save(mgr.create(NoiseReview, {
        screeningId,
        incidentId: incident?.id || null,
        complaintBuildings: dto.complaintBuildings.trim(),
        noiseDb: Math.round(dto.noiseDb),
        volumeLoweredAt: loweredAt,
        noiseDbAfter: dto.noiseDbAfter != null ? Math.round(dto.noiseDbAfter) : null,
        securityResult: dto.securityResult.trim(),
        recordedById: user.sub,
        endedEarly,
        earlyEndAt,
        proposedLatestShowTime,
        finalSubsidyCents: endedEarly ? String(finalSubsidy) : null,
        finalMerchantCostCents: endedEarly ? String(finalMerchantCost) : null,
        recalcNote,
        status: 'open',
      }));

      // 回写场次：核定口径 + 提前结束标记 + 重算后的费用
      screening.planSubsidyCents = String(planSubsidy);
      screening.planMerchantCostCents = String(planMerchantCost);
      if (endedEarly) {
        screening.endedEarlyAt = earlyEndAt;
        screening.endedEarlyReason = `噪声投诉致提前结束（投诉楼栋：${dto.complaintBuildings.trim()}）`;
        screening.subsidyAmount = String(finalSubsidy);
        screening.merchantCostCents = String(finalMerchantCost);
        await mgr.save(screening);

        await mgr.save(mgr.create(Settlement, {
          screeningId, type: 'subsidy_recalc', amountCents: String(finalSubsidy),
          note: recalcNote, operatorId: user.sub,
        }));
        await mgr.save(mgr.create(Settlement, {
          screeningId, type: 'merchant_cost_recalc', amountCents: String(finalMerchantCost),
          note: recalcNote, operatorId: user.sub,
        }));
      } else {
        await mgr.save(screening);
      }

      await mgr.save(mgr.create(TimelineEvent, {
        screeningId, kind: 'complaint', actorRole: user.role,
        actorId: user.sub, actorName: user.name,
        title: endedEarly ? '噪声投诉复盘登记·活动提前结束' : '噪声投诉复盘登记',
        detail: `投诉楼栋：${dto.complaintBuildings.trim()}；实测 ${dto.noiseDb}dB`
          + `${dto.noiseDbAfter != null ? `，调低后复测 ${dto.noiseDbAfter}dB` : ''}；`
          + `于 ${this.fmt(loweredAt)} 调低音量；安保沟通：${dto.securityResult.trim()}`
          + (endedEarly ? `；实际结束 ${this.fmt(earlyEndAt!)}。${recalcNote}` : '')
          + '；待街道确认居民沟通/音量调整/提前结束时间后关闭',
      }));
      return mgr.findOne(NoiseReview, { where: { id: review.id } });
    });
  }

  /**
   * 街道关闭投诉：必须确认居民沟通、音量调整、提前结束时间三项。
   * 关闭后把限制条件（最晚放映时间、需提前降噪测试）落到场地，
   * 下一次同场地审批自动带出。
   */
  async close(id: string, user: any, dto: {
    residentConfirmed: boolean;
    volumeConfirmed: boolean;
    earlyEndConfirmed?: boolean;
    streetNote?: string;
    latestShowTime?: string;
  }) {
    const review = await this.repo.findOne({ where: { id } });
    if (!review) throw new NotFoundException('噪声投诉复盘不存在');
    if (review.status === 'closed') throw new BadRequestException('该投诉已关闭');
    if (!dto.residentConfirmed) throw new BadRequestException('须先确认居民沟通情况');
    if (!dto.volumeConfirmed) throw new BadRequestException('须先确认音量调整情况');
    if (review.endedEarly && !dto.earlyEndConfirmed) {
      throw new BadRequestException('须先确认提前结束时间');
    }

    const screening = await this.screeningRepo.findOne({
      where: { id: review.screeningId },
      relations: ['venue'],
    });
    if (!screening) throw new NotFoundException('场次不存在');

    const latest = review.endedEarly
      ? (dto.latestShowTime || review.proposedLatestShowTime)
      : null;

    review.residentConfirmed = true;
    review.volumeConfirmed = true;
    review.earlyEndConfirmed = review.endedEarly ? !!dto.earlyEndConfirmed : true;
    review.status = 'closed';
    review.closedById = user.sub;
    review.closedAt = new Date();
    review.streetNote = dto.streetNote || null;
    await this.repo.save(review);

    // 限制条件落到场地：最晚放映时间（提前结束场）+ 下次申请需提前降噪测试
    const noteParts = [
      `来源于场次 ${screening.code} 噪声投诉复盘（投诉楼栋：${review.complaintBuildings}，实测 ${review.noiseDb}dB）`,
    ];
    if (latest) noteParts.push(`最晚放映开始时间限定 ${latest}`);
    noteParts.push('下一次申请前须提前完成降噪测试');
    if (dto.streetNote) noteParts.push(dto.streetNote);
    await this.venues.applyNoiseRestriction(screening.venueId, {
      restricted: true,
      latestShowTime: latest,
      noiseTestRequired: true,
      note: noteParts.join('；'),
    });

    // 独立登记（未走异常工单）的噪声投诉，关闭时补计点位风险，避免漏统
    if (!review.incidentId) {
      await this.venues.addRiskCounters(screening.venueId, { noise: true, complaint: true });
    }

    await this.timelineRepo.save(this.timelineRepo.create({
      screeningId: review.screeningId, kind: 'complaint', actorRole: 'street',
      actorId: user.sub, actorName: user.name,
      title: '街道关闭噪声投诉复盘·点位限制生效',
      detail: `已确认居民沟通、音量调整${review.endedEarly ? '、提前结束时间' : ''}三项；`
        + `${latest ? `该点位后续最晚放映开始时间 ${latest}；` : ''}`
        + '下一次同场地申请自动带出限制条件并要求提前降噪测试'
        + (dto.streetNote ? `；街道意见：${dto.streetNote}` : ''),
    }));
    return this.detail(id);
  }

  /** 被限制场地：下一次申请放映前提前做降噪测试并记录，测试达标方可通过审批 */
  async recordNoiseTest(screeningId: string, user: any, dto: { noiseDb: number; note?: string; testedAt?: string }) {
    if (dto.noiseDb == null || dto.noiseDb <= 0) throw new BadRequestException('降噪测试必须填写分贝读数');
    const s = await this.screeningRepo.findOne({ where: { id: screeningId }, relations: ['venue'] });
    if (!s) throw new NotFoundException('场次不存在');
    s.noiseTestDone = true;
    s.noiseTestDb = Math.round(dto.noiseDb);
    s.noiseTestAt = dto.testedAt ? this.resolveTime(dto.testedAt, s.showDate) : new Date();
    s.noiseTestNote = dto.note || null;
    await this.screeningRepo.save(s);
    await this.timelineRepo.save(this.timelineRepo.create({
      screeningId, kind: 'noise_test', actorRole: user.role,
      actorId: user.sub, actorName: user.name,
      title: '限制场地·提前降噪测试',
      detail: `放映前降噪测试实测 ${dto.noiseDb}dB（夜间参考阈值 60dB，${dto.noiseDb <= 60 ? '达标' : '超标需继续整改'}）`
        + (dto.note ? `；${dto.note}` : ''),
    }));
    return s;
  }

  /** "HH:mm" 或 ISO → Date；HH:mm 按放映日期补齐为当地时间 */
  private resolveTime(v: string, showDate: string) {
    if (/^\d{2}:\d{2}$/.test(v)) return new Date(`${showDate}T${v}:00`);
    const d = new Date(v);
    if (Number.isNaN(+d)) throw new BadRequestException('时间格式不正确（支持 HH:mm 或完整时间）');
    return d;
  }

  private hhmm(d: Date) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  private fmt(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${this.hhmm(d)}`;
  }
  private yuan(cents: number) { return (cents / 100).toFixed(2); }
}
