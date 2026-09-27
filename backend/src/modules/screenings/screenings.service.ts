import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Screening, ScreeningStatus } from '../../entities/screening.entity';
import { TimelineEvent } from '../../entities/timeline-event.entity';
import { Venue } from '../../entities/venue.entity';
import { Organizer } from '../../entities/organizer.entity';
import { CreateScreeningDto } from './dto';

@Injectable()
export class ScreeningsService {
  constructor(
    @InjectRepository(Screening) private readonly repo: Repository<Screening>,
    @InjectRepository(TimelineEvent) private readonly timelineRepo: Repository<TimelineEvent>,
    @InjectRepository(Venue) private readonly venueRepo: Repository<Venue>,
    @InjectRepository(Organizer) private readonly organizerRepo: Repository<Organizer>,
    private readonly dataSource: DataSource,
  ) {}

  private static STATUS_FLOW: Record<ScreeningStatus, string> = {
    draft: '草稿',
    pending_review: '待文化审核',
    review_approved: '审核通过/待备设备',
    review_rejected: '已驳回',
    equipment_prepared: '设备已成套备好',
    equipment_checked_out: '设备已扫码出库',
    site_confirmed: '现场搭建确认',
    screening: '放映中',
    completed: '已完成核销',
    cancelled: '已取消',
  };

  static statusLabel(s: ScreeningStatus) {
    return ScreeningsService.STATUS_FLOW[s] || s;
  }

  async list(user: { sub: string; role: string }, query: { status?: string; venueId?: string }) {
    const qb = this.repo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.venue', 'venue')
      .leftJoinAndSelect('s.organizer', 'organizer')
      .leftJoin('s.applicant', 'applicant')
      .addSelect(['applicant.id', 'applicant.name', 'applicant.organization']);
    if (user.role === 'applicant') {
      qb.andWhere('applicant.id = :uid', { uid: user.sub });
    }
    if (query.status) qb.andWhere('s.status = :st', { st: query.status });
    if (query.venueId) qb.andWhere('s.venue_id = :vid', { vid: query.venueId });
    qb.orderBy('s.showDate', 'DESC').addOrderBy('s.createdAt', 'DESC');
    const rows = await qb.getMany();
    return rows.map((r) => ({ ...r, statusLabel: ScreeningsService.STATUS_FLOW[r.status] }));
  }

  async detail(id: string) {
    const s = await this.repo.findOne({
      where: { id },
      relations: [
        'applicant', 'venue', 'organizer',
        'equipmentAssignments', 'equipmentAssignments.equipment',
        'inspections', 'incidents', 'timeline',
        'volunteerCheckins', 'settlements', 'noiseReviews',
      ],
    });
    if (!s) throw new NotFoundException('场次不存在');
    (s as any).statusLabel = ScreeningsService.STATUS_FLOW[s.status];
    // 风险等级：连续噪声/设备损坏点位影响下一轮审批
    const riskScore = s.venue.noiseCount * 2 + s.venue.damageCount * 3 + s.venue.complaintCount;
    (s as any).venueRiskLevel = riskScore >= 8 ? '高风险' : riskScore >= 3 ? '关注' : '正常';
    // 场地噪声限制：下一次同场地审批自动带出本次限制条件
    (s as any).venueNoiseRestricted = !!s.venue.noiseRestricted;
    return s;
  }

  async create(user: { sub: string; name: string }, dto: CreateScreeningDto) {
    const venue = await this.venueRepo.findOne({ where: { id: dto.venueId } });
    if (!venue) throw new BadRequestException('场地不存在');
    if (venue.blacklisted) {
      throw new BadRequestException(`场地「${venue.name}」已列入黑名单（${venue.blacklistReason || '不适合继续安排夜间活动'}），申请被拦截`);
    }
    const organizer = await this.organizerRepo.findOne({ where: { id: dto.organizerId } });
    if (!organizer) throw new BadRequestException('主办方不存在');

    // 被噪声限制的场地不拦截申请，但自动带出上一次复盘的限制条件：
    // 最晚放映时间 + 下一次申请前须提前降噪测试
    const inheritedLatestShowTime = venue.noiseRestricted ? venue.latestShowTime : null;
    const noiseTestRequired = venue.noiseRestricted && venue.noiseTestRequired;

    const seq = Math.floor(1000 + Math.random() * 9000);
    const code = `OC-${dto.showDate.replace(/-/g, '')}-${seq}`;
    const screening = this.repo.create({
      ...dto,
      code,
      applicantId: user.sub,
      status: 'draft',
      inheritedLatestShowTime,
      noiseTestRequired,
    });
    const saved = await this.repo.save(screening);
    await this.log(saved.id, 'apply', '提交放映申请',
      `${dto.showDate} ${dto.showTime} @ ${venue.name}，影片《${dto.filmName}》，预计观众 ${dto.expectedAudience} 人`
      + (venue.noiseRestricted
        ? `｜该场地为噪声限制点位：最晚放映开始时间 ${venue.latestShowTime || '—'}，`
          + `审批前须提前完成降噪测试${venue.noiseRestrictionNote ? `（${venue.noiseRestrictionNote}）` : ''}`
        : ''),
      user, 'applicant');
    return saved;
  }

  async submit(id: string, user: any) {
    const s = await this.getOwnedOrStaff(id, user);
    if (!['draft', 'review_rejected'].includes(s.status)) throw new BadRequestException('当前状态不可提交审核');
    s.status = 'pending_review';
    await this.repo.save(s);
    await this.log(id, 'apply', '申请进入待审核', '等待文化审核确认影片授权与公共活动备案', user, user.role);
    return s;
  }

  async review(id: string, user: any, dto: { approved: boolean; comment?: string; filingNo?: string }) {
    const s = await this.repo.findOne({ where: { id }, relations: ['venue'] });
    if (!s) throw new NotFoundException('场次不存在');
    if (s.status !== 'pending_review') throw new BadRequestException('仅待审核场次可审批');
    if (dto.approved) {
      // 噪声限制点位：审批自动带出上一次复盘限制条件，未完成提前降噪测试不得通过
      if (s.noiseTestRequired && !s.noiseTestDone) {
        throw new BadRequestException(
          `该场地为噪声限制点位，须在放映前提前完成降噪测试并达标（≤60dB）后方可审批通过；`
          + `限制说明：${s.venue.noiseRestrictionNote || '见上一次噪声投诉复盘'}`,
        );
      }
      if (s.noiseTestRequired && s.noiseTestDone && (s.noiseTestDb ?? 999) > 60) {
        throw new BadRequestException(`提前降噪测试实测 ${s.noiseTestDb}dB 仍超过夜间阈值 60dB，整改复测达标后再审`);
      }
      if (s.inheritedLatestShowTime && s.showTime > s.inheritedLatestShowTime) {
        throw new BadRequestException(
          `申请放映开始时间 ${s.showTime} 晚于该点位限制的最晚放映开始时间 ${s.inheritedLatestShowTime}，请调整时间后再审`,
        );
      }
      s.status = 'review_approved';
      s.copyrightConfirmed = true;
      s.publicEventFiled = true;
      s.filingNo = dto.filingNo || `BA-${s.code}`;
      s.reviewerName = user.name;
      s.reviewedAt = new Date();
      s.reviewComment = dto.comment || '影片授权核验通过，公共活动备案完成';
      await this.repo.save(s);
      await this.log(id, 'review', '文化审核通过',
        `审核员 ${user.name}：${s.reviewComment}；备案号 ${s.filingNo}`, user, 'reviewer');
    } else {
      s.status = 'review_rejected';
      s.reviewerName = user.name;
      s.reviewedAt = new Date();
      s.reviewComment = dto.comment || '材料不全或版权存疑';
      await this.repo.save(s);
      await this.log(id, 'review', '审核驳回', s.reviewComment, user, 'reviewer');
    }
    return s;
  }

  /** 仓库备好设备 -> prepared；扫码出库 -> checked_out（设备模块调用） */
  async setStatus(id: string, status: ScreeningStatus, user: any, kind: string, title: string, detail?: string) {
    const s = await this.repo.findOne({ where: { id } });
    if (!s) throw new NotFoundException('场次不存在');
    s.status = status;
    await this.repo.save(s);
    await this.log(id, kind, title, detail, user, user?.role);
    return s;
  }

  async confirmSite(id: string, user: any) {
    const s = await this.repo.findOne({ where: { id }, relations: ['inspections'] });
    if (!s) throw new NotFoundException('场次不存在');
    if (s.status !== 'equipment_checked_out') throw new BadRequestException('设备出库后方可确认现场搭建');
    const cats = new Set(s.inspections.filter((i) => i.passed).map((i) => i.category));
    const required = ['build_setup', 'test_play', 'noise', 'isolation', 'firelane'];
    const missing = required.filter((c) => !cats.has(c));
    if (missing.length) {
      const names: Record<string, string> = {
        build_setup: '搭建照片', test_play: '试播截图', noise: '噪声分贝',
        isolation: '观众区域隔离', firelane: '消防通道',
      };
      throw new BadRequestException(`现场材料不完整，还缺：${missing.map((m) => names[m]).join('、')}`);
    }
    s.status = 'site_confirmed';
    s.siteManagerName = s.siteManagerName || user.name;
    await this.repo.save(s);
    await this.log(id, 'build', '现场搭建与安全确认完成', '搭建照片/试播截图/噪声/隔离/消防通道五项均已上传并合格', user, 'site_manager');
    return s;
  }

  async startScreening(id: string, user: any) {
    const s = await this.repo.findOne({ where: { id } });
    if (!s) throw new NotFoundException('场次不存在');
    if (s.status !== 'site_confirmed') throw new BadRequestException('现场搭建与安全五项确认完成后才能开始放映');
    return this.setStatus(id, 'screening', user, 'screening', '放映开始', '现场负责人宣布放映开始');
  }

  async log(screeningId: string, kind: string, title: string, detail: string, user?: any, role?: string) {
    await this.timelineRepo.save(this.timelineRepo.create({
      screeningId,
      kind,
      title,
      detail,
      actorId: user?.sub || user?.id || null,
      actorName: user?.name || '系统',
      actorRole: role || user?.role || 'system',
    }));
  }

  private async getOwnedOrStaff(id: string, user: any) {
    const s = await this.repo.findOne({ where: { id }, relations: ['applicant'] });
    if (!s) throw new NotFoundException('场次不存在');
    return s;
  }
}
