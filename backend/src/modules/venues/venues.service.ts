import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Venue } from '../../entities/venue.entity';

@Injectable()
export class VenuesService {
  constructor(@InjectRepository(Venue) private readonly repo: Repository<Venue>) {}

  list() {
    return this.repo.find({ order: { blacklisted: 'DESC', noiseCount: 'DESC' } });
  }

  create(data: Partial<Venue>) {
    return this.repo.save(this.repo.create(data));
  }

  async toggleBlacklist(id: string, blacklisted: boolean, reason: string) {
    const v = await this.repo.findOne({ where: { id } });
    if (!v) throw new NotFoundException('场地不存在');
    v.blacklisted = blacklisted;
    v.blacklistReason = blacklisted ? reason || null : null;
    return this.repo.save(v);
  }

  /** 活动结束后累加风险计数，连续噪声/设备损坏影响下一轮审批 */
  async addRiskCounters(venueId: string, opts: { noise?: boolean; damage?: boolean; complaint?: boolean }) {
    const v = await this.repo.findOne({ where: { id: venueId } });
    if (!v) return;
    if (opts.noise) v.noiseCount += 1;
    if (opts.complaint) v.complaintCount += 1;
    if (opts.damage) v.damageCount += 1;
    await this.repo.save(v);
  }

  /**
   * 噪声投诉复盘关闭后，街道把限制条件落到点位：
   * 最晚放映时间 + 下一次申请前须提前降噪测试。
   * 下一次同场地审批会自动带出这些限制条件。
   */
  async applyNoiseRestriction(
    venueId: string,
    opts: { restricted: boolean; latestShowTime?: string | null; noiseTestRequired: boolean; note?: string },
  ) {
    const v = await this.repo.findOne({ where: { id: venueId } });
    if (!v) return;
    v.noiseRestricted = opts.restricted;
    v.latestShowTime = opts.restricted ? (opts.latestShowTime || v.latestShowTime) : null;
    v.noiseTestRequired = opts.restricted ? opts.noiseTestRequired : false;
    v.noiseRestrictionNote = opts.restricted ? (opts.note || v.noiseRestrictionNote) : null;
    v.restrictedAt = opts.restricted ? new Date() : null;
    await this.repo.save(v);
    return v;
  }

  /** 新一轮场次完成且降噪达标后，街道可解除噪声限制（黑名单不受影响） */
  async clearNoiseRestriction(venueId: string) {
    const v = await this.repo.findOne({ where: { id: venueId } });
    if (!v) return;
    v.noiseRestricted = false;
    v.noiseTestRequired = false;
    v.latestShowTime = null;
    v.noiseRestrictionNote = null;
    v.restrictedAt = null;
    await this.repo.save(v);
    return v;
  }
}
