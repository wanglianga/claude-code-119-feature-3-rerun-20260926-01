import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Screening } from './screening.entity';
import { Venue } from './venue.entity';
import { User } from './user.entity';

/**
 * 噪声投诉复盘单。居民在放映中投诉扰民时，由现场负责人/安保登记：
 * 投诉楼栋、分贝读数、调低音量时间、安保沟通结果。
 * 若活动提前结束，平台按实际放映比例重新计算补贴与商户协办费用，
 * 并推导该点位后续的最晚放映时间。
 * 投诉关闭前，街道必须逐项确认居民沟通、音量调整、提前结束时间；
 * 关闭后本次限制条件写入场地，下一次同场地申请自动带出，并要求提前做降噪测试。
 */
@Entity('noise_complaints')
export class NoiseComplaint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => Screening, (s) => s.noiseComplaints, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'screening_id' })
  screening: Screening;

  @Column({ name: 'screening_id' })
  screeningId: string;

  /** 投诉来源场地（冗余记录，便于按点位复盘） */
  @ManyToOne(() => Venue, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'venue_id' })
  venue: Venue;

  @Column({ name: 'venue_id' })
  venueId: string;

  /** 投诉楼栋，如 3栋2单元 / 幸福里3号楼 */
  @Column({ length: 128 })
  building: string;

  /** 投诉时现场分贝读数 */
  @Column({ name: 'noise_db', type: 'int' })
  noiseDb: number;

  /** 调低音量（降噪）完成时间 */
  @Column({ name: 'volume_lowered_at', type: 'timestamptz' })
  volumeLoweredAt: Date;

  /** 调低后的分贝，选填，用于复盘整改效果 */
  @Column({ name: 'noise_db_after', type: 'int', nullable: true })
  noiseDbAfter: number;

  /** 安保与居民沟通结果 */
  @Column({ name: 'security_communication', type: 'text' })
  securityCommunication: string;

  /** 现场处置说明 */
  @Column({ name: 'action_taken', type: 'text', nullable: true })
  actionTaken: string;

  // ---------- 提前结束与费用重算 ----------
  /** 是否因投诉提前结束活动 */
  @Column({ name: 'ended_early', type: 'boolean', default: false })
  endedEarly: boolean;

  /** 实际提前结束时间 */
  @Column({ name: 'early_ended_at', type: 'timestamptz', nullable: true })
  earlyEndedAt: Date;

  /** 计划开始时间快照，便于解释重算口径 */
  @Column({ name: 'planned_start', type: 'timestamptz', nullable: true })
  plannedStart: Date;

  /** 计划结束时间快照 */
  @Column({ name: 'planned_end', type: 'timestamptz', nullable: true })
  plannedEnd: Date;

  /** 实际开始时间（取场次开始放映时间） */
  @Column({ name: 'actual_start', type: 'timestamptz', nullable: true })
  actualStart: Date;

  /** 实际放映时长（分钟） */
  @Column({ name: 'actual_minutes', type: 'int', nullable: true })
  actualMinutes: number;

  /** 计划时长（分钟） */
  @Column({ name: 'planned_minutes', type: 'int', nullable: true })
  plannedMinutes: number;

  /** 重算后街道补贴（分） */
  @Column({ name: 'recalc_subsidy_cents', type: 'bigint', nullable: true })
  recalcSubsidyCents: string;

  /** 原补贴口径（分） */
  @Column({ name: 'original_subsidy_cents', type: 'bigint', nullable: true })
  originalSubsidyCents: string;

  /** 重算后商户协办费用（分） */
  @Column({ name: 'merchant_fee_cents', type: 'bigint', nullable: true })
  merchantFeeCents: string;

  /** 商户协办费原口径（分） */
  @Column({ name: 'original_merchant_fee_cents', type: 'bigint', nullable: true })
  originalMerchantFeeCents: string;

  /** 重算说明（比例、扣减口径） */
  @Column({ name: 'recalc_note', type: 'text', nullable: true })
  recalcNote: string;

  /** 推导/确认的后续该点位最晚放映时间，如 20:30 */
  @Column({ name: 'derived_latest_show_time', type: 'varchar', length: 8, nullable: true })
  derivedLatestShowTime: string;

  // ---------- 街道三项确认与关闭 ----------
  /** 街道是否已确认居民沟通 */
  @Column({ name: 'confirm_resident_contact', type: 'boolean', default: false })
  confirmResidentContact: boolean;

  /** 街道是否已确认音量调整 */
  @Column({ name: 'confirm_volume_adjustment', type: 'boolean', default: false })
  confirmVolumeAdjustment: boolean;

  /** 街道是否已确认提前结束时间 */
  @Column({ name: 'confirm_early_end_time', type: 'boolean', default: false })
  confirmEarlyEndTime: boolean;

  /** 关闭时间（三项全部确认后街道可关闭） */
  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date;

  @ManyToOne(() => User, { eager: true, onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'closed_by' })
  closedBy: User;

  @Column({ name: 'closed_by', nullable: true })
  closedById: string;

  @Column({ name: 'review_comment', type: 'text', nullable: true })
  reviewComment: string;

  /** 限制是否已回写场地并生效于下一次申请 */
  @Column({ name: 'venue_restriction_applied', type: 'boolean', default: false })
  venueRestrictionApplied: boolean;

  @ManyToOne(() => User, { eager: true, onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @Column({ name: 'created_by', nullable: true })
  createdById: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
