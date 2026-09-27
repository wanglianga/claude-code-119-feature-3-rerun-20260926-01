import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, OneToOne, JoinColumn, Index,
} from 'typeorm';
import { Screening } from './screening.entity';
import { Incident } from './incident.entity';
import { User } from './user.entity';

/**
 * 噪声投诉复盘（居民放映中投诉扰民的现场闭环记录）。
 *
 * 现场负责人在放映中记录：投诉楼栋、分贝读数、调低音量时间、安保沟通结果；
 * 若活动提前结束，平台据此重新计算补贴、商户协办费用，并形成该点位的最晚放映时间。
 *
 * 投诉关闭前，街道须逐项确认：居民沟通、音量调整、提前结束时间；
 * 关闭后限制条件（最晚放映时间、下次需提前降噪测试）自动带到下一次同场地审批。
 */
@Entity('noise_reviews')
export class NoiseReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Screening, (s) => s.noiseReviews, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'screening_id' })
  screening: Screening;

  @Index()
  @Column({ name: 'screening_id' })
  screeningId: string;

  /** 可由「居民投诉噪声」异常工单转入，也可由现场负责人直接登记 */
  @OneToOne(() => Incident, { eager: true, onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'incident_id' })
  incident: Incident;

  @Column({ name: 'incident_id', nullable: true })
  incidentId: string;

  /** 投诉楼栋（如「3栋2单元、5栋」，可多栋） */
  @Column({ length: 200 })
  complaintBuildings: string;

  /** 现场分贝读数 */
  @Column({ type: 'int' })
  noiseDb: number;

  /** 调低音量时间 */
  @Column({ type: 'timestamptz' })
  volumeLoweredAt: Date;

  /** 调低后复测分贝（可选） */
  @Column({ type: 'int', nullable: true })
  noiseDbAfter: number;

  /** 安保沟通结果（上门解释、居民诉求、现场措施） */
  @Column({ type: 'text' })
  securityResult: string;

  /** 记录人（现场负责人） */
  @ManyToOne(() => User, { eager: true, onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'recorded_by' })
  recordedBy: User;

  @Column({ name: 'recorded_by', nullable: true })
  recordedById: string;

  // ---------- 提前结束与费用重算 ----------
  @Column({ type: 'boolean', default: false })
  endedEarly: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  earlyEndAt: Date;

  /** 提前结束时建议的该点位最晚放映开始时间 HH:mm（街道关闭后生效） */
  @Column({ type: 'varchar', length: 5, nullable: true })
  proposedLatestShowTime: string;

  /** 核定补贴（重算后，分） */
  @Column({ type: 'bigint', nullable: true })
  finalSubsidyCents: string;

  /** 核定商户协办费用（重算后，分） */
  @Column({ type: 'bigint', nullable: true })
  finalMerchantCostCents: string;

  /** 重算说明（折算比例、扣减口径） */
  @Column({ type: 'text', nullable: true })
  recalcNote: string;

  // ---------- 街道关闭确认（三项全部确认才能关闭） ----------
  /** 居民沟通确认 */
  @Column({ type: 'boolean', default: false })
  residentConfirmed: boolean;

  /** 音量调整确认 */
  @Column({ type: 'boolean', default: false })
  volumeConfirmed: boolean;

  /** 提前结束时间确认（未提前结束时随关闭自动置为确认） */
  @Column({ type: 'boolean', default: false })
  earlyEndConfirmed: boolean;

  /** open 待街道确认关闭 / closed 已关闭（限制条件已带到点位） */
  @Index()
  @Column({ length: 16, default: 'open' })
  status: string;

  @ManyToOne(() => User, { eager: true, onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'closed_by' })
  closedBy: User;

  @Column({ name: 'closed_by', nullable: true })
  closedById: string;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt: Date;

  /** 街道关闭意见 / 给下一场审批的限制说明 */
  @Column({ type: 'text', nullable: true })
  streetNote: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
