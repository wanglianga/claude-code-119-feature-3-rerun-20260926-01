import axios from 'axios';

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('oc_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg = err?.response?.data?.message || err.message || '请求失败';
    const text = Array.isArray(msg) ? msg.join('；') : msg;
    window.dispatchEvent(new CustomEvent('api-error', { detail: text }));
    return Promise.reject(err);
  },
);

export interface User {
  id: string;
  username: string;
  name: string;
  role: string;
  organization?: string;
  organizerName?: string;
}

export function currentUser(): User | null {
  const raw = localStorage.getItem('oc_user');
  return raw ? JSON.parse(raw) : null;
}

export function setSession(token: string, user: User) {
  localStorage.setItem('oc_token', token);
  localStorage.setItem('oc_user', JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem('oc_token');
  localStorage.removeItem('oc_user');
}

export const ROLE_NAME: Record<string, string> = {
  applicant: '申请方', reviewer: '文化审核员', warehouse: '仓库管理员',
  site_manager: '现场负责人', security: '安保', finance: '财务', street: '街道文体岗',
};

export const STATUS_LABEL: Record<string, string> = {
  draft: '草稿', pending_review: '待文化审核', review_approved: '审核通过/待备设备',
  review_rejected: '已驳回', equipment_prepared: '设备已成套备好',
  equipment_checked_out: '设备已扫码出库', site_confirmed: '现场搭建确认',
  screening: '放映中', completed: '已完成核销', cancelled: '已取消',
};

export const STATUS_COLOR: Record<string, string> = {
  draft: '#9e9e9e', pending_review: '#e6a23c', review_approved: '#409eff',
  review_rejected: '#f56c6c', equipment_prepared: '#7b61ff',
  equipment_checked_out: '#13a8a8', site_confirmed: '#67c23a',
  screening: '#e65100', completed: '#2e7d32', cancelled: '#9e9e9e',
};

export const INCIDENT_TYPES: Record<string, string> = {
  film_corrupt: '影片文件损坏', equipment_missing: '设备缺件',
  noise_complaint: '居民投诉噪声', rain: '临时降雨',
  overcrowd: '观众超员', power_trip: '供电跳闸', extension: '商户要求延长活动',
};

export const INSPECTION_CATEGORIES: Record<string, string> = {
  build_setup: '搭建照片', test_play: '试播截图', noise: '噪声分贝',
  isolation: '观众区域隔离', firelane: '消防通道',
};

export const EQUIPMENT_TYPES: Record<string, string> = {
  projector: '投影机', screen: '幕布', speaker: '音箱',
  cable: '电缆', bulb: '备用灯泡', raincoat: '防雨罩',
};

export const SETTLEMENT_TYPES: Record<string, string> = {
  damage_compensation: '设备损坏赔付', deposit_deduct: '押金扣减',
  deposit_refund: '押金退还', subsidy: '街道补贴发放',
  subsidy_recalc: '提前结束·补贴重新核算', merchant_cost_recalc: '提前结束·商户协办费重新核算',
  complaint_compensation: '投诉赔付', copyright_writeoff: '版权核销',
};

export function fenToYuan(cents: number | string) {
  return (Number(cents || 0) / 100).toFixed(2);
}
