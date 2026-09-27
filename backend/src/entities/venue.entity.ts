import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

/**
 * 场地（点位）。累计噪声/设备损坏事件数，决定下一轮审批风险等级；
 * 被街道拉黑后进入黑名单，新申请直接拦截。
 */
@Entity('venues')
export class Venue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ length: 128 })
  name: string;

  @Column({ length: 128 })
  address: string;

  @Column({ length: 64, nullable: true })
  district: string;

  /** 场地类型：社区广场 / 物业小区 / 商圈外摆 等 */
  @Column({ length: 32, default: '社区广场' })
  venueType: string;

  @Column({ type: 'int', default: 200 })
  capacity: number;

  @Column({ type: 'boolean', default: false })
  blacklisted: boolean;

  @Column({ type: 'text', nullable: true })
  blacklistReason: string;

  @Column({ type: 'int', default: 0 })
  noiseCount: number;

  @Column({ type: 'int', default: 0 })
  damageCount: number;

  @Column({ type: 'int', default: 0 })
  complaintCount: number;

  /** 噪声投诉复盘关闭后回写：下一次该点位放映的最晚开始时间（如 20:30），null 表示无限制 */
  @Column({ name: 'latest_show_time', type: 'varchar', length: 8, nullable: true })
  latestShowTime: string | null;

  /** 被限制的场地，下一次申请前需完成提前降噪测试 */
  @Column({ name: 'noise_test_required', type: 'boolean', default: false })
  noiseTestRequired: boolean;

  /** 限制来源：最近一次噪声投诉复盘单号与说明 */
  @Column({ name: 'restriction_reason', type: 'text', nullable: true })
  restrictionReason: string | null;

  @Column({ name: 'restriction_at', type: 'timestamptz', nullable: true })
  restrictionAt: Date | null;

  /** 最近一次活动时间，便于街道复盘 */
  @Column({ type: 'timestamptz', nullable: true })
  lastScreeningAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
