import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../entities/user.entity';
import { Venue } from '../entities/venue.entity';
import { Organizer } from '../entities/organizer.entity';
import { Screening } from '../entities/screening.entity';
import { Equipment } from '../entities/equipment.entity';
import { NoiseReview } from '../entities/noise-review.entity';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger('Seed');

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Venue) private readonly venueRepo: Repository<Venue>,
    @InjectRepository(Organizer) private readonly organizerRepo: Repository<Organizer>,
    @InjectRepository(Screening) private readonly screeningRepo: Repository<Screening>,
    @InjectRepository(Equipment) private readonly equipmentRepo: Repository<Equipment>,
    @InjectRepository(NoiseReview) private readonly noiseReviewRepo: Repository<NoiseReview>,
  ) {}

  async onModuleInit() {
    await this.waitForDb();
    if ((await this.userRepo.count()) > 0) {
      this.logger.log('seed skipped: data already exists');
      return;
    }
    await this.run();
  }

  private async waitForDb(retries = 30) {
    for (let i = 0; i < retries; i++) {
      try {
        await this.userRepo.query('SELECT 1');
        return;
      } catch {
        this.logger.warn(`waiting for database... (${i + 1}/${retries})`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    throw new Error('database not reachable');
  }

  private async run() {
    const pwd = await bcrypt.hash('123456', 10);
    const mkUser = (u: Partial<User>) => this.userRepo.save(this.userRepo.create({ password: pwd, ...u }));

    const applicant = await mkUser({
      username: 'applicant', name: '王磊', role: 'applicant',
      organization: '幸福里社区居委会', organizerName: '幸福里社区居委会',
    });
    await mkUser({
      username: 'applicant2', name: '陈静', role: 'applicant',
      organization: '星光商圈运营公司', organizerName: '星光商圈运营公司',
    });
    await mkUser({
      username: 'reviewer', name: '李文（文化审核）', role: 'reviewer',
      organization: '区文旅局',
    });
    await mkUser({
      username: 'warehouse', name: '老赵（仓库）', role: 'warehouse',
      organization: '街道文体设备仓',
    });
    const site = await mkUser({
      username: 'site', name: '周强（现场负责人）', role: 'site_manager',
      organization: '幸福里社区',
    });
    await mkUser({
      username: 'security', name: '孙队（安保）', role: 'security',
      organization: '街道安保中队',
    });
    await mkUser({
      username: 'finance', name: '吴会计（财务）', role: 'finance',
      organization: '街道财务室',
    });
    const street = await mkUser({
      username: 'street', name: '郑岗（街道文体岗）', role: 'street',
      organization: '阳光街道办事处文体岗',
    });

    const org1 = await this.organizerRepo.save(this.organizerRepo.create({
      name: '幸福里社区居委会', organizerType: '社区',
      contactName: '王磊', contactPhone: '13800000001',
      creditScore: 96, depositBalance: '200000', totalScreenings: 12, violationCount: 1,
      remark: '去年一次噪声投诉，已整改',
    }));
    const org2 = await this.organizerRepo.save(this.organizerRepo.create({
      name: '星光商圈运营公司', organizerType: '商圈',
      contactName: '陈静', contactPhone: '13800000002',
      creditScore: 88, depositBalance: '500000', totalScreenings: 20, violationCount: 3,
    }));
    await this.organizerRepo.save(this.organizerRepo.create({
      name: '江景苑物业服务中心', organizerType: '物业',
      contactName: '马丽', contactPhone: '13800000003',
      creditScore: 72, depositBalance: '200000', totalScreenings: 8, violationCount: 4,
      remark: '多次设备损坏+噪声，押金已上浮',
    }));

    const v1 = await this.venueRepo.save(this.venueRepo.create({
      name: '幸福里社区中心广场', address: '阳光路88号', district: '阳光街道',
      venueType: '社区广场', capacity: 300,
      noiseCount: 1, damageCount: 0, complaintCount: 1,
    }));
    const v2 = await this.venueRepo.save(this.venueRepo.create({
      name: '星光时代广场外摆区', address: '星光大道200号', district: '阳光街道',
      venueType: '商圈外摆', capacity: 500,
      noiseCount: 2, damageCount: 1, complaintCount: 3,
      // 上一场噪声投诉复盘关闭后带出的点位限制：最晚 20:30 开映，下次申请前须提前降噪测试
      noiseRestricted: true,
      latestShowTime: '20:30',
      noiseTestRequired: true,
      noiseRestrictionNote: '来源于场次 OC-20260912-1860 噪声投诉复盘（投诉楼栋：星光公寓A座/B座，实测 68dB，21:05 提前结束）；最晚放映开始时间限定 20:30；下一次申请前须提前完成降噪测试',
      restrictedAt: new Date(Date.now() - 6 * 86400000),
    }));
    await this.venueRepo.save(this.venueRepo.create({
      name: '江景苑小区中庭（暂停）', address: '江景路12号', district: '阳光街道',
      venueType: '物业小区', capacity: 150,
      blacklisted: true, blacklistReason: '连续3次夜间噪声投诉+音箱损坏，列入场地黑名单，暂停夜间放映',
      noiseCount: 4, damageCount: 2, complaintCount: 5,
    }));

    // 两套完整设备，每套六件
    const typeDefs: Array<[Equipment['type'], string, string]> = [
      ['projector', '投影机', 'PJ'],
      ['screen', '折叠幕布', 'SC'],
      ['speaker', '专业音箱', 'SP'],
      ['cable', '供电电缆盘', 'CA'],
      ['bulb', '备用灯泡', 'BL'],
      ['raincoat', '设备防雨罩', 'RC'],
    ];
    for (const kit of ['KIT-01', 'KIT-02']) {
      for (const [type, name, prefix] of typeDefs) {
        const seq = Math.floor(1000 + Math.random() * 9000);
        await this.equipmentRepo.save(this.equipmentRepo.create({
          code: `${prefix}-${kit.slice(-2)}${String(seq).slice(-3)}`,
          name, type, kitNo: kit, status: 'in_stock', condition: type === 'bulb' ? 100 : 90,
        }));
      }
    }

    // 演示场次：一条待审核，一条审核通过待备设备
    const future = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    await this.screeningRepo.save(this.screeningRepo.create({
      code: `OC-${future.replace(/-/g, '')}-1001`,
      title: '国庆公益露天电影《我和我的祖国》',
      applicantId: applicant.id, organizerId: org1.id, venueId: v1.id,
      showDate: future, showTime: '19:30', location: '幸福里社区中心广场北侧（靠近配电箱）',
      expectedAudience: 260,
      filmName: '我和我的祖国', copyrightProof: '中影授权书 ZS-2026-0886',
      copyrightOwner: '中国电影股份有限公司',
      powerCondition: '广场东侧市政配电箱，220V/16A，接线约40米',
      screenSize: '6m x 3.4m', speakerCount: 2, securityStaff: 4,
      rainPlan: '如遇降雨，启用防雨罩保护设备，观众转移至社区活动中心二层多功能厅续映',
      siteManagerName: '周强', securityLeadName: '孙队',
      status: 'pending_review',
    }));

    const future2 = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    await this.screeningRepo.save(this.screeningRepo.create({
      code: `OC-${future2.replace(/-/g, '')}-2002`,
      title: '星光商圈周末露天放映《流浪地球2》',
      applicantId: applicant.id, organizerId: org2.id, venueId: v2.id,
      showDate: future2, showTime: '20:00', location: '星光时代广场外摆区B区',
      expectedAudience: 420,
      filmName: '流浪地球2', copyrightProof: '中影数字院线放映许可 XK-2026-1120',
      copyrightOwner: '中影数字电影发展（北京）有限公司',
      powerCondition: '商户外接电源 220V/32A，电缆25米',
      screenSize: '8m x 4.5m', speakerCount: 4, securityStaff: 6,
      rainPlan: '降雨时设备加盖防雨罩并撤入商场一层卸货区，观众凭票次日补映',
      siteManagerName: '周强', securityLeadName: '孙队',
      status: 'review_approved',
      copyrightConfirmed: true, publicEventFiled: true, filingNo: 'BA-20260920-22',
      reviewerName: '李文（文化审核）', reviewedAt: new Date(),
      reviewComment: '影片授权与备案材料齐全；已按噪声限制完成提前降噪测试 56dB，20:00 开映不晚于 20:30 限制，同意放映',
      // 自动带出上一次复盘限制，且已提前完成降噪测试达标
      inheritedLatestShowTime: '20:30',
      noiseTestRequired: true, noiseTestDone: true, noiseTestDb: 56,
      noiseTestAt: new Date(Date.now() - 86400000),
      noiseTestNote: '外摆区B区边界实测 56dB，音箱角度内收并加装声屏障后达标',
    }));

    // 历史场次：星光时代广场上一场因噪声投诉提前结束，复盘已由街道关闭并对点位下限制
    const past = new Date(Date.now() - 9 * 86400000).toISOString().slice(0, 10);
    const hist = await this.screeningRepo.save(this.screeningRepo.create({
      code: 'OC-20260912-1860',
      title: '星光商圈周末露天放映《悬崖之上》',
      applicantId: applicant.id, organizerId: org2.id, venueId: v2.id,
      showDate: past, showTime: '19:40', location: '星光时代广场外摆区B区',
      expectedAudience: 430,
      filmName: '悬崖之上', copyrightProof: '中影数字院线放映许可 XK-2026-0988',
      copyrightOwner: '中影数字电影发展（北京）有限公司',
      powerCondition: '商户外接电源 220V/32A，电缆25米',
      screenSize: '8m x 4.5m', speakerCount: 4, securityStaff: 6,
      rainPlan: '降雨时设备加盖防雨罩并撤入商场一层卸货区',
      siteManagerName: '周强', securityLeadName: '孙队',
      status: 'completed',
      copyrightConfirmed: true, publicEventFiled: true, filingNo: 'BA-20260912-07',
      reviewerName: '李文（文化审核）', reviewedAt: new Date(Date.now() - 12 * 86400000),
      copyrightWrittenOff: true, returnedAt: new Date(Date.now() - 9 * 86400000 + 2 * 3600000),
      planSubsidyCents: '80000', planMerchantCostCents: '30000',
      subsidyAmount: '64000', merchantCostCents: '24000',
      endedEarlyAt: new Date(`${past}T21:05:00`),
      endedEarlyReason: '噪声投诉致提前结束（投诉楼栋：星光公寓A座、B座）',
      finalRemark: '噪声扰民提前收场，点位限制 20:30 前开映并要求下次提前降噪测试',
    }));
    await this.noiseReviewRepo.save(this.noiseReviewRepo.create({
      screeningId: hist.id,
      complaintBuildings: '星光公寓A座、B座',
      noiseDb: 68,
      volumeLoweredAt: new Date(`${past}T20:40:00`),
      noiseDbAfter: 58,
      securityResult: '安保上门向A座1202、B座0803住户解释，调低主音箱功率2档并将音箱外摆角度内收15度，居民仍要求提前结束',
      recordedById: site.id,
      endedEarly: true,
      earlyEndAt: new Date(`${past}T21:05:00`),
      proposedLatestShowTime: '20:30',
      finalSubsidyCents: '64000',
      finalMerchantCostCents: '24000',
      recalcNote: '按实际放映时长折算（计划 120 分钟，折算比例 80%，保底 25%）：补贴 800.00→640.00 元；商户协办费 300.00→240.00 元；建议该点位后续最晚放映开始时间 20:30',
      residentConfirmed: true, volumeConfirmed: true, earlyEndConfirmed: true,
      status: 'closed',
      closedById: street.id,
      closedAt: new Date(Date.now() - 6 * 86400000),
      streetNote: '已回访投诉住户，音量整改到位；该点位后续 20:30 前开映，下一轮申请先做降噪测试',
    }));

    this.logger.log('seed completed: 8 users / 3 organizers / 3 venues(1黑名单1噪声限制) / 12 equipment / 3 screenings / 1 noise review');
  }
}
