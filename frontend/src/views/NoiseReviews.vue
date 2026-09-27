<template>
  <div>
    <h2 style="font-size:20px">噪声投诉复盘 · 街道关闭确认</h2>
    <div class="notice">
      放映中居民投诉扰民，由现场负责人记录<b>投诉楼栋、分贝读数、调低音量时间、安保沟通结果</b>；
      活动提前结束时平台重新计算补贴与商户协办费用，并形成该点位最晚放映时间。
      投诉关闭前，街道须逐项确认<b>居民沟通、音量调整、提前结束时间</b>；关闭后限制条件自动带到下一次同场地审批，
      被限制场地再次申请时须先完成提前降噪测试。
    </div>

    <div class="layout2">
      <div class="card" style="margin:0">
        <div class="row" style="margin-bottom:10px">
          <select v-model="statusFilter" @change="loadList" style="width:140px">
            <option value="">全部状态</option>
            <option value="open">待街道关闭</option>
            <option value="closed">已关闭</option>
          </select>
          <span class="muted">共 {{ list.length }} 条复盘</span>
        </div>
        <table class="list">
          <thead><tr><th>场次/场地</th><th>投诉楼栋</th><th>分贝</th><th>提前结束</th><th>状态</th><th>登记时间</th></tr></thead>
          <tbody>
            <tr v-for="r in list" :key="r.id" :class="{ active: focusId === r.id }" @click="open(r.id)" style="cursor:pointer">
              <td>
                <b>{{ r.screening?.code }}</b>
                <div class="muted">{{ r.screening?.venue?.name }}</div>
              </td>
              <td>{{ r.complaintBuildings }}</td>
              <td :class="{ hot: r.noiseDb > 60 }">{{ r.noiseDb }} dB</td>
              <td>
                <span v-if="r.endedEarly" class="tag orange">{{ hhmm(r.earlyEndAt) }} 结束</span>
                <span v-else class="muted">否</span>
              </td>
              <td>
                <span class="tag" :class="r.status === 'closed' ? 'green' : 'red'">
                  {{ r.status === 'closed' ? '已关闭' : '待关闭' }}
                </span>
              </td>
              <td class="muted">{{ fmt(r.createdAt) }}</td>
            </tr>
            <tr v-if="!list.length"><td colspan="6" class="muted" style="text-align:center;padding:24px">暂无噪声投诉复盘</td></tr>
          </tbody>
        </table>
      </div>

      <div v-if="detail" class="card" style="margin:0">
        <div class="row" style="justify-content:space-between">
          <h3 style="margin:0">复盘详情 · {{ detail.screening?.code }}</h3>
          <router-link :to="`/screenings/${detail.screeningId}`">进入场次 →</router-link>
        </div>

        <table class="kv" style="margin:12px 0">
          <tbody>
            <tr><td class="k">投诉楼栋</td><td>{{ detail.complaintBuildings }}</td></tr>
            <tr><td class="k">分贝读数</td><td :class="{ hot: detail.noiseDb > 60 }"><b>{{ detail.noiseDb }} dB</b>
              <span v-if="detail.noiseDbAfter != null" class="muted">（调低后复测 {{ detail.noiseDbAfter }} dB）</span></td></tr>
            <tr><td class="k">调低音量时间</td><td>{{ fmt(detail.volumeLoweredAt) }}</td></tr>
            <tr><td class="k">安保沟通结果</td><td>{{ detail.securityResult }}</td></tr>
            <tr><td class="k">登记人</td><td>{{ detail.recordedBy?.name }} · {{ fmt(detail.createdAt) }}</td></tr>
            <tr v-if="detail.endedEarly"><td class="k">实际结束时间</td><td>{{ fmt(detail.earlyEndAt) }}
              <span class="pill">建议最晚放映 {{ detail.proposedLatestShowTime }}</span></td></tr>
          </tbody>
        </table>

        <div v-if="detail.recalcNote" class="notice">
          <b>费用重算（提前结束）：</b>{{ detail.recalcNote }}
          <div style="margin-top:6px">
            核定补贴 <b>¥{{ fen(detail.finalSubsidyCents) }}</b> ｜
            核定商户协办费 <b>¥{{ fen(detail.finalMerchantCostCents) }}</b>
          </div>
        </div>

        <template v-if="detail.status === 'open'">
          <div class="notice danger" style="margin-top:12px">
            投诉关闭前，街道须确认以下三项，全部勾选后才能关闭，关闭后限制条件自动带到该点位下一次审批。
          </div>
          <div class="checks">
            <label><input type="checkbox" v-model="form.residentConfirmed" /> 确认居民沟通已到位（上门解释/回访情况）</label>
            <label><input type="checkbox" v-model="form.volumeConfirmed" /> 确认音量调整已执行（{{ fmt(detail.volumeLoweredAt) }} 已调低）</label>
            <label v-if="detail.endedEarly"><input type="checkbox" v-model="form.earlyEndConfirmed" />
              确认提前结束时间属实（{{ fmt(detail.earlyEndAt) }}）</label>
          </div>
          <div class="form-row"><label>该点位最晚放映开始时间</label>
            <input v-model="form.latestShowTime" type="time" :placeholder="detail.proposedLatestShowTime || '21:00'" />
            <span class="muted">默认采用建议值 {{ detail.proposedLatestShowTime || '—' }}</span>
          </div>
          <div class="form-row" style="grid-template-columns:110px 1fr"><label>街道关闭意见</label>
            <textarea v-model="form.streetNote" placeholder="整改要求 / 对下一场审批的限制说明（将随限制条件带出）" />
          </div>
          <div class="row" style="padding-left:110px">
            <button class="success" @click="doClose">✓ 三项确认无误，关闭投诉并下点点位限制</button>
          </div>
        </template>

        <div v-else class="notice success" style="margin-top:12px">
          <b>已关闭（{{ fmt(detail.closedAt) }} · {{ detail.closedBy?.name }}）</b><br />
          居民沟通 {{ detail.residentConfirmed ? '✓' : '✗' }} ｜
          音量调整 {{ detail.volumeConfirmed ? '✓' : '✗' }} ｜
          提前结束时间 {{ detail.earlyEndConfirmed ? '✓' : '✗' }}<br />
          限制条件已带到点位：下一次同场地申请自动带出，最晚放映时间与提前降噪测试要求生效。
          <span v-if="detail.streetNote">街道意见：{{ detail.streetNote }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api, fenToYuan } from '../api';

const route = useRoute();
const list = ref<any[]>([]);
const detail = ref<any>(null);
const focusId = ref('');
const statusFilter = ref('open');
const fen = fenToYuan;
const form = ref({ residentConfirmed: false, volumeConfirmed: false, earlyEndConfirmed: false, streetNote: '', latestShowTime: '' });

function fmt(d?: string) { return d ? new Date(d).toLocaleString('zh-CN', { hour12: false }) : '—'; }
function hhmm(d?: string) { return d ? new Date(d).toTimeString().slice(0, 5) : '—'; }

async function loadList() {
  const { data } = await api.get('/noise-reviews', { params: { status: statusFilter.value || undefined } });
  list.value = data;
  if (focusId.value) await open(focusId.value);
}
async function open(id: string) {
  focusId.value = id;
  const { data } = await api.get(`/noise-reviews/${id}`);
  detail.value = data;
  form.value = {
    residentConfirmed: false, volumeConfirmed: false, earlyEndConfirmed: false,
    streetNote: '', latestShowTime: data.proposedLatestShowTime || '',
  };
}
async function doClose() {
  const { data } = await api.post(`/noise-reviews/${detail.value.id}/close`, {
    residentConfirmed: form.value.residentConfirmed,
    volumeConfirmed: form.value.volumeConfirmed,
    earlyEndConfirmed: form.value.earlyEndConfirmed,
    streetNote: form.value.streetNote || undefined,
    latestShowTime: form.value.latestShowTime || undefined,
  });
  detail.value = data;
  await loadList();
}

watch(() => route.query.focus, (v) => { if (v) open(String(v)); });
onMounted(async () => {
  await loadList();
  if (route.query.focus) await open(String(route.query.focus));
});
</script>

<style scoped>
.layout2 { display: grid; grid-template-columns: 460px 1fr; gap: 16px; align-items: start; }
tr.active td { background: #eaf1fc !important; }
.hot { color: #d9534f; font-weight: 700; }
table.kv { width: 100%; border-collapse: collapse; font-size: 13px; }
table.kv td { padding: 6px 8px; border-bottom: 1px dashed var(--border); vertical-align: top; }
table.kv td.k { width: 110px; color: var(--muted); white-space: nowrap; }
.checks { display: flex; flex-direction: column; gap: 8px; margin: 10px 0 14px; }
.checks input { width: auto; margin-right: 8px; }
</style>
