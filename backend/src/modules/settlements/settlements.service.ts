import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Settlement } from '../../entities/settlement.entity';
import { Screening } from '../../entities/screening.entity';
import { TimelineEvent } from '../../entities/timeline-event.entity';
import { Venue } from '../../entities/venue.entity';
import { Organizer } from '../../entities/organizer.entity';
import { OrganizersService } from '../organizers/organizers.service';

const TYPE_NAME: Record<string, string> = {
  damage_compensation: '设备损坏赔付',
  deposit_deduct: '押金扣减',
  deposit_refund: '押金退还',
  subsidy: '街道补贴发放',
  subsidy_recalc: '提前结束·补贴重新核算',
  merchant_cost_recalc: '提前结束·商户协办费重新核算',
  complaint_compensation: '投诉赔付',
  copyright_writeoff: '版权核销',
};

@Injectable()
export class SettlementsService {
  constructor(
    @InjectRepository(Settlement) private readonly repo: Repository<Settlement>,
    @InjectRepository(Screening) private readonly screeningRepo: Repository<Screening>,
    @InjectRepository(TimelineEvent) private readonly timelineRepo: Repository<TimelineEvent>,
    @InjectRepository(Venue) private readonly venueRepo: Repository<Venue>,
    @InjectRepository(Organizer) private readonly organizerRepo: Repository<Organizer>,
    private readonly organizersService: OrganizersService,
    private readonly dataSource: DataSource,
  ) {}

  list(screeningId: string) {
    return this.repo.find({ where: { screeningId }, order: { createdAt: 'ASC' } });
  }

  /** 财务登记一笔核销流水（赔付/押金/补贴/投诉赔付），版权核销单独走 writeoff */
  async addEntry(screeningId: string, user: any, dto: { type: string; amountCents: number; note?: string }) {
    if (!TYPE_NAME[dto.type]) throw new BadRequestException('未知的核销类型');
    const screening = await this.screeningRepo.findOne({ where: { id: screeningId } });
    if (!screening) throw new NotFoundException('场次不存在');

    const entry = await this.repo.save(this.repo.create({
      screeningId,
      type: dto.type,
      amountCents: String(Math.max(0, Math.round(dto.amountCents))),
      note: dto.note || null,
      operatorId: user.sub,
    }));

    // 押金与主办方账户联动
    if (dto.type === 'deposit_deduct') {
      await this.organizersService.adjustDeposit(screening.organizerId, -Math.abs(dto.amountCents));
      screening.depositDeducted = String(Number(screening.depositDeducted) + Math.abs(dto.amountCents));
      await this.screeningRepo.save(screening);
    }
    if (dto.type === 'deposit_refund') {
      await this.organizersService.adjustDeposit(screening.organizerId, Math.abs(dto.amountCents));
    }
    if (dto.type === 'subsidy') {
      screening.subsidyAmount = String(Math.abs(dto.amountCents));
      await this.screeningRepo.save(screening);
    }

    await this.timelineRepo.save(this.timelineRepo.create({
      screeningId, kind: 'settlement', actorRole: 'finance',
      actorId: user.sub, actorName: user.name,
      title: `财务核销·${TYPE_NAME[dto.type]}`,
      detail: `金额 ${(Math.abs(dto.amountCents) / 100).toFixed(2)} 元${dto.note ? `；${dto.note}` : ''}`,
    }));
    return entry;
  }

  /** 版权核销（审核员/财务确认影片授权已按场次核销） */
  async copyrightWriteoff(screeningId: string, user: any, note?: string) {
    const screening = await this.screeningRepo.findOne({ where: { id: screeningId } });
    if (!screening) throw new NotFoundException('场次不存在');
    if (screening.copyrightWrittenOff) throw new BadRequestException('该场次版权已核销');
    screening.copyrightWrittenOff = true;
    await this.screeningRepo.save(screening);
    await this.repo.save(this.repo.create({
      screeningId, type: 'copyright_writeoff', amountCents: '0',
      note: note || `影片《${screening.filmName}》按场次核销，凭证 ${screening.copyrightProof}`,
      operatorId: user.sub,
    }));
    await this.timelineRepo.save(this.timelineRepo.create({
      screeningId, kind: 'settlement', actorRole: user.role,
      actorId: user.sub, actorName: user.name,
      title: '版权核销完成',
      detail: note || `影片《${screening.filmName}》版权凭证按本场次核销`,
    }));
    return screening;
  }

  /**
   * 活动结束关单：要求设备已全部归还、版权已核销。
   * 归还、损坏赔付、投诉处理、版权核销、补贴发放都回到该场次记录，
   * 并把场地最近活动时间、主办方场次计数回写，供街道复盘。
   */
  async complete(screeningId: string, user: any, finalRemark?: string) {
    const s = await this.screeningRepo.findOne({
      where: { id: screeningId },
      relations: ['equipmentAssignments', 'venue'],
    });
    if (!s) throw new NotFoundException('场次不存在');
    if (s.status === 'completed') throw new BadRequestException('场次已关单');

    const pendingReturn = s.equipmentAssignments
      .filter((a) => !a.state.startsWith('returned') && a.state !== 'lost');
    if (pendingReturn.length) {
      throw new BadRequestException(`还有 ${pendingReturn.length} 件设备未归还登记，不能关单`);
    }
    if (!s.copyrightWrittenOff) throw new BadRequestException('版权尚未核销，不能关单');

    return this.dataSource.transaction(async (mgr) => {
      s.status = 'completed';
      s.finalRemark = finalRemark || s.finalRemark;
      await mgr.save(s);

      s.venue.lastScreeningAt = new Date();
      await mgr.save(s.venue);

      const organizer = await mgr.findOne(Organizer, { where: { id: s.organizerId } });
      if (organizer) {
        organizer.totalScreenings += 1;
        await mgr.save(organizer);
      }

      await mgr.save(mgr.create(TimelineEvent, {
        screeningId, kind: 'settlement', actorRole: user.role,
        actorId: user.sub, actorName: user.name,
        title: '场次关单·复盘归档',
        detail: `设备归还、损坏赔付 ${(Number(s.damageCompensation) / 100).toFixed(2)} 元、`
          + `押金扣减 ${(Number(s.depositDeducted) / 100).toFixed(2)} 元、`
          + `补贴 ${(Number(s.subsidyAmount) / 100).toFixed(2)} 元、版权核销均已回到本场次记录`,
      }));
      return s;
    });
  }
}
