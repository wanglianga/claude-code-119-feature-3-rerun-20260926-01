<template>
  <div v-if="data">
    <h2 style="font-size:20px">街道文体岗 · 复盘看板</h2>

    <div class="grid4" style="margin-bottom:16px">
      <div class="kpi"><div class="num">{{ data.kpi.totalScreenings }}</div><div class="label">全部场次</div></div>
      <div class="kpi"><div class="num">{{ data.kpi.pendingReview }}</div><div class="label">待审核</div></div>
      <div class="kpi"><div class="num">{{ data.kpi.inProgress }}</div><div class="label">备料/出库/放映中</div></div>
      <div class="kpi"><div class="num">{{ data.kpi.completed }}</div><div class="label">已核销关单</div></div>
      <div class="kpi"><div class="num" style="color:#d9534f">{{ data.kpi.openIncidents }}</div><div class="label">未办结异常</div></div>
      <div class="kpi"><div class="num" style="color:#d9534f">{{ data.kpi.blacklistedVenues }}</div><div class="label">黑名单场地</div></div>
    </div>

    <div class="grid2">
      <div class="card">
        <h3>点位风险榜（连续噪声/设备损坏影响下一轮审批）</h3>
        <table class="list">
          <thead><tr><th>场地</th><th>噪声</th><th>损坏</th><th>投诉</th><th>风险分</th><th>复盘限制</th><th>状态</th></tr></thead>
          <tbody>
            <tr v-for="v in data.riskyVenues" :key="v.id">
              <td><b>{{ v.name }}</b></td>
              <td>{{ v.noiseCount }}</td><td>{{ v.damageCount }}</td><td>{{ v.complaintCount }}</td>
              <td><span class="tag" :class="v.riskScore >= 8 ? 'red' : v.riskScore >= 3 ? 'orange' : 'green'">{{ v.riskScore }}</span></td>
              <td>
                <span v-if="v.latestShowTime" class="tag orange" style="margin-right:4px">≤{{ v.latestShowTime }}</span>
                <span v-if="v.noiseTestRequired" class="tag red">需降噪测试</span>
                <span v-if="!v.latestShowTime && !v.noiseTestRequired" class="muted">—</span>
              </td>
              <td><span v-if="v.blacklisted" class="tag red">黑名单</span><span v-else class="tag green">可安排</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <h3>主办方信用/押金</h3>
        <table class="list">
          <thead><tr><th>主办方</th><th>类型</th><th>场次</th><th>违规</th><th>信用</th><th>押金(元)</th></tr></thead>
          <tbody>
            <tr v-for="o in data.organizers" :key="o.id">
              <td><b>{{ o.name }}</b></td><td>{{ o.organizerType }}</td>
              <td>{{ o.totalScreenings }}</td>
              <td :class="{ hot: o.violationCount >= 3 }">{{ o.violationCount }}</td>
              <td><span class="tag" :class="o.creditScore >= 90 ? 'green' : o.creditScore >= 75 ? 'orange' : 'red'">{{ o.creditScore }}</span></td>
              <td>{{ (o.depositBalance / 100).toFixed(2) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="grid2">
      <div class="card">
        <h3>状态分布</h3>
        <div v-for="(count, key) in data.byStatus" :key="key" class="bar-row">
          <span class="bar-label">{{ STATUS_LABEL[key] || key }}</span>
          <div class="bar"><div :style="{ width: pct(count) + '%', background: STATUS_COLOR[key] || '#999' }" /></div>
          <b>{{ count }}</b>
        </div>
      </div>

      <div class="card">
        <h3>最近场次</h3>
        <table class="list">
          <thead><tr><th>编号</th><th>影片</th><th>场地</th><th>日期</th><th>状态</th></tr></thead>
          <tbody>
            <tr v-for="s in data.recentScreenings" :key="s.id" style="cursor:pointer" @click="$router.push(`/screenings/${s.id}`)">
              <td>{{ s.code }}</td><td>{{ s.title }}</td><td>{{ s.venueName }}</td>
              <td>{{ s.showDate }}</td>
              <td><span class="tag" :style="{ background: STATUS_COLOR[s.status] }">{{ STATUS_LABEL[s.status] }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h3>全区活动时间线（申请/审批/出库/搭建/放映/投诉/核销）</h3>
      <div class="timeline">
        <div v-for="t in data.recentTimeline" :key="t.id" class="item">
          <div class="t">
            {{ t.title }}
            <span class="pill">{{ ROLE_NAME[t.actorRole] || t.actorRole }} · {{ t.actorName }}</span>
          </div>
          <div v-if="t.detail" class="d">{{ t.detail }}</div>
          <div class="time">{{ fmt(t.createdAt) }} · 场次 {{ t.screeningId.slice(0, 8) }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, STATUS_COLOR, STATUS_LABEL, ROLE_NAME } from '../api';

const data = ref<any>(null);
function fmt(d: string) { return new Date(d).toLocaleString('zh-CN', { hour12: false }); }
function pct(n: number) {
  const total = Math.max(1, ...Object.values(data.value.byStatus).map(Number) as number[]);
  return Math.round((n / total) * 100);
}
onMounted(async () => {
  const { data: d } = await api.get('/dashboard/overview');
  data.value = d;
});
</script>
<style scoped>
.hot { color: #d9534f; font-weight: 700; }
.bar-row { display: grid; grid-template-columns: 150px 1fr 40px; gap: 10px; align-items: center; margin-bottom: 8px; font-size: 13px; }
.bar-label { color: var(--muted); }
.bar { height: 14px; background: #edf0f5; border-radius: 7px; overflow: hidden; }
.bar div { height: 100%; min-width: 4px; }
</style>
