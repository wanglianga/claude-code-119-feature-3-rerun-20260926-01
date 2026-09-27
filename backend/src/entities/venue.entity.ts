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

  // ---------- 噪声投诉复盘形成的点位限制（街道关闭复盘时带出） ----------
  /** 是否因噪声投诉复盘被限制（区别于黑名单：限制场地整改后仍可申请） */
  @Column({ type: 'boolean', default: false })
  noiseRestricted: boolean;

  /** 限制条件：该点位最晚放映结束时间 HH:mm，来源于上次提前结束的实际结束时间 */
  @Column({ type: 'varchar', length: 5, nullable: true })
  latestShowTime: string;

  /** 下一次同场地申请前是否必须提前做降噪测试 */
  @Column({ type: 'boolean', default: false })
  noiseTestRequired: boolean;

  /** 限制说明（来源场次/投诉楼栋/处置经过） */
  @Column({ type: 'text', nullable: true })
  noiseRestrictionNote: string;

  @Column({ type: 'timestamptz', nullable: true })
  restrictedAt: Date;

  /** 最近一次活动时间，便于街道复盘 */
  @Column({ type: 'timestamptz', nullable: true })
  lastScreeningAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
