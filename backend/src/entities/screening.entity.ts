import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, OneToMany, Index, JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Venue } from './venue.entity';
import { Organizer } from './organizer.entity';
import { EquipmentAssignment } from './equipment-assignment.entity';
import { Inspection } from './inspection.entity';
import { Incident } from './incident.entity';
import { TimelineEvent } from './timeline-event.entity';
import { VolunteerCheckin } from './volunteer-checkin.entity';
import { Settlement } from './settlement.entity';
import { NoiseReview } from './noise-review.entity';

/**
 * 场次生命周期：
 * draft -> pending_review（提交）
 *  -> review_approved（文化审核通过：影片授权+公共活动备案）
 *  -> review_rejected（驳回，可修改重提）
 *  -> equipment_prepared（仓库按场次备好成套设备）
 *  -> equipment_checked_out（扫码核对、出库领取）
 *  -> site_confirmed（现场搭建/试播/噪声/隔离/消防通道上传确认）
 *  -> screening（放映中/已放映）
 *  -> completed（设备归还、核销完成）
 * 申请延期等走 incidents 协同，不改主状态。
 */
export type ScreeningStatus =
  | 'draft'
  | 'pending_review'
  | 'review_approved'
  | 'review_rejected'
  | 'equipment_prepared'
  | 'equipment_checked_out'
  | 'site_confirmed'
  | 'screening'
  | 'completed'
  | 'cancelled';

@Entity('screenings')
export class Screening {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 场次编号，便于现场口头沟通 */
  @Index({ unique: true })
  @Column({ length: 32 })
  code: string;

  @Column({ length: 200 })
  title: string;

  /** 申请方 */
  @ManyToOne(() => User, { eager: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'applicant_id' })
  applicant: User;

  @Column({ name: 'applicant_id' })
  applicantId: string;

  @ManyToOne(() => Organizer, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'organizer_id' })
  organizer: Organizer;

  @Column({ name: 'organizer_id' })
  organizerId: string;

  @ManyToOne(() => Venue, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'venue_id' })
  venue: Venue;

  @Column({ name: 'venue_id' })
  venueId: string;

  // ---------- 申请表单字段 ----------
  @Column({ type: 'date' })
  showDate: string;

  @Column({ type: 'varchar', length: 16, default: '19:30' })
  showTime: string;

  @Column({ length: 200 })
  location: string;

  @Column({ type: 'int' })
  expectedAudience: number;

  /** 影片名称 + 版权凭证（授权书编号/文件名/版权方） */
  @Column({ length: 200 })
  filmName: string;

  @Column({ length: 128 })
  copyrightProof: string;

  @Column({ length: 128 })
  copyrightOwner: string;

  /** 供电条件：市电点位/功率/接线长度 */
  @Column({ length: 256 })
  powerCondition: string;

  /** 银幕尺寸，如 6m x 3.4m */
  @Column({ length: 32 })
  screenSize: string;

  @Column({ type: 'int' })
  speakerCount: number;

  @Column({ type: 'int' })
  securityStaff: number;

  @Column({ type: 'text' })
  rainPlan: string;

  // ---------- 文化审核 ----------
  @Column({ type: 'boolean', default: false })
  copyrightConfirmed: boolean;

  @Column({ type: 'boolean', default: false })
  publicEventFiled: boolean;

  @Column({ length: 128, nullable: true })
  filingNo: string;

  @Column({ length: 64, nullable: true })
  reviewerName: string;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt: Date;

  @Column({ type: 'text', nullable: true })
  reviewComment: string;

  // ---------- 现场负责人 / 安保 ----------
  @Column({ length: 64, nullable: true })
  siteManagerName: string;

  @Column({ length: 64, nullable: true })
  securityLeadName: string;

  // ---------- 归还 / 核销 ----------
  @Column({ type: 'timestamptz', nullable: true })
  returnedAt: Date;

  /** 设备损坏赔付（分） */
  @Column({ type: 'bigint', default: 0 })
  damageCompensation: string;

  /** 押金扣减（分） */
  @Column({ type: 'bigint', default: 0 })
  depositDeducted: string;

  /** 补贴金额（分） */
  @Column({ type: 'bigint', default: 0 })
  subsidyAmount: string;

  /** 原计划/核定补贴（分），提前结束重算前的口径，留痕便于复盘 */
  @Column({ type: 'bigint', default: 0 })
  planSubsidyCents: string;

  /** 商户协办费用（分）：商圈/物业协办场地、保洁、用电等费用，提前结束按比例重新核算 */
  @Column({ type: 'bigint', default: 0 })
  merchantCostCents: string;

  /** 原计划商户协办费用（分） */
  @Column({ type: 'bigint', default: 0 })
  planMerchantCostCents: string;

  /** 因噪声投诉提前结束放映的实际结束时间；为空表示正常放映 */
  @Column({ type: 'timestamptz', nullable: true })
  endedEarlyAt: Date;

  /** 提前结束原因（与噪声复盘联动） */
  @Column({ type: 'text', nullable: true })
  endedEarlyReason: string;

  // ---------- 上一次同场地噪声复盘带出的审批限制 ----------
  /** 自动带出的该点位最晚放映（开始）时间 HH:mm */
  @Column({ type: 'varchar', length: 5, nullable: true })
  inheritedLatestShowTime: string;

  /** 被限制场地：下一次申请前必须提前做降噪测试 */
  @Column({ type: 'boolean', default: false })
  noiseTestRequired: boolean;

  @Column({ type: 'boolean', default: false })
  noiseTestDone: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  noiseTestAt: Date;

  @Column({ type: 'int', nullable: true })
  noiseTestDb: number;

  @Column({ type: 'text', nullable: true })
  noiseTestNote: string;

  /** 版权核销状态 */
  @Column({ type: 'boolean', default: false })
  copyrightWrittenOff: boolean;

  @Column({ type: 'text', nullable: true })
  finalRemark: string;

  @Index()
  @Column({ type: 'varchar', length: 32, default: 'draft' })
  status: ScreeningStatus;

  @OneToMany(() => EquipmentAssignment, (e) => e.screening)
  equipmentAssignments: EquipmentAssignment[];

  @OneToMany(() => Inspection, (i) => i.screening)
  inspections: Inspection[];

  @OneToMany(() => Incident, (i) => i.screening)
  incidents: Incident[];

  @OneToMany(() => TimelineEvent, (t) => t.screening)
  timeline: TimelineEvent[];

  @OneToMany(() => VolunteerCheckin, (v) => v.screening)
  volunteerCheckins: VolunteerCheckin[];

  @OneToMany(() => Settlement, (s) => s.screening)
  settlements: Settlement[];

  @OneToMany(() => NoiseReview, (n) => n.screening)
  noiseReviews: NoiseReview[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
