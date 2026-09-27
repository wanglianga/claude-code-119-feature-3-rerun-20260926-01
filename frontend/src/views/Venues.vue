<template>
  <div>
    <h2 style="font-size:20px">场地台账与黑名单</h2>
    <div class="notice">
      连续出现噪声投诉或设备损坏的点位风险分升高；街道可将不适合夜间活动的点位列入黑名单，新申请将被直接拦截。
    </div>
    <div class="card">
      <table class="list">
        <thead>
          <tr><th>场地</th><th>类型</th><th>地址</th><th>容量</th>
            <th>噪声次数</th><th>设备损坏</th><th>投诉</th><th>风险分</th><th>噪声限制</th><th>最近活动</th><th>状态</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="v in list" :key="v.id">
            <td><b>{{ v.name }}</b></td>
            <td>{{ v.venueType }}</td><td>{{ v.address }}</td><td>{{ v.capacity }}</td>
            <td :class="{ hot: v.noiseCount >= 2 }">{{ v.noiseCount }}</td>
            <td :class="{ hot: v.damageCount >= 1 }">{{ v.damageCount }}</td>
            <td :class="{ hot: v.complaintCount >= 2 }">{{ v.complaintCount }}</td>
            <td>
              <span class="tag" :class="risk(v).cls">{{ risk(v).score }} · {{ risk(v).label }}</span>
            </td>
            <td>
              <template v-if="v.noiseRestricted">
                <span class="tag orange">限制中</span>
                <div class="muted" style="margin-top:3px">
                  最晚放映 {{ v.latestShowTime || '—' }}<br>
                  {{ v.noiseTestRequired ? '须提前降噪测试' : '' }}
                </div>
              </template>
              <span v-else class="muted">—</span>
            </td>
            <td class="muted">{{ v.lastScreeningAt ? fmt(v.lastScreeningAt) : '—' }}</td>
            <td>
              <span v-if="v.blacklisted" class="tag red">黑名单</span>
              <span v-else class="tag green">可安排</span>
            </td>
            <td>
              <button v-if="!v.blacklisted" class="danger" @click="toggle(v, true)">列入黑名单</button>
              <button v-else class="success" @click="toggle(v, false)">解除黑名单</button>
              <button v-if="v.noiseRestricted" class="primary" style="margin-top:6px" @click="clearNoise(v)">
                解除噪声限制
              </button>
              <div v-if="v.blacklisted" class="muted" style="margin-top:4px;max-width:220px">{{ v.blacklistReason }}</div>
              <div v-if="v.noiseRestricted" class="muted" style="margin-top:4px;max-width:220px">{{ v.noiseRestrictionNote }}</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api';

const list = ref<any[]>([]);
function fmt(d: string) { return new Date(d).toLocaleDateString('zh-CN'); }
function risk(v: any) {
  const score = v.noiseCount * 2 + v.damageCount * 3 + v.complaintCount;
  return {
    score,
    label: score >= 8 ? '高风险' : score >= 3 ? '关注' : '正常',
    cls: score >= 8 ? 'red' : score >= 3 ? 'orange' : 'green',
  };
}
async function load() {
  const { data } = await api.get('/venues');
  list.value = data;
}
async function toggle(v: any, blacklisted: boolean) {
  let reason = '';
  if (blacklisted) {
    reason = window.prompt('列入黑名单原因（将拦截该点位所有新申请）', '连续噪声/设备损坏，暂停夜间放映') || '';
    if (!reason) return;
  }
  await api.post(`/venues/${v.id}/blacklist`, { blacklisted, reason });
  await load();
}
async function clearNoise(v: any) {
  if (!window.confirm(`确认解除「${v.name}」的噪声限制（最晚放映时间/降噪测试要求将一并取消）？`)) return;
  await api.post(`/venues/${v.id}/clear-noise-restriction`, {});
  await load();
}
onMounted(load);
</script>
<style scoped>
.hot { color: #d9534f; font-weight: 700; }
</style>
