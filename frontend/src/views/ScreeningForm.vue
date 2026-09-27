<template>
  <div>
    <h2 style="font-size:20px">提交露天电影放映申请</h2>
    <div class="notice">
      请如实填写放映日期、场地、观众规模、影片版权凭证、供电条件、银幕/音响配置、安保与雨天预案；
      场地若已列入黑名单，申请将被系统拦截。
    </div>

    <div class="card">
      <h3>基本信息</h3>
      <div class="grid2">
        <div class="form-row"><label class="req">活动名称</label><input v-model="form.title" placeholder="如：国庆公益露天电影" /></div>
        <div class="form-row"><label class="req">主办方</label>
          <select v-model="form.organizerId">
            <option value="">请选择</option>
            <option v-for="o in organizers" :key="o.id" :value="o.id">
              {{ o.name }}（信用 {{ o.creditScore }}）
            </option>
          </select>
        </div>
        <div class="form-row"><label class="req">放映场地</label>
          <select v-model="form.venueId" @change="onVenue">
            <option value="">请选择</option>
            <option v-for="v in venues" :key="v.id" :value="v.id" :disabled="v.blacklisted">
              {{ v.name }}{{ v.blacklisted ? '（黑名单·禁选）' : v.noiseTestRequired ? '（噪声限制·需降噪测试）' : '' }}
            </option>
          </select>
        </div>
        <div class="form-row"><label class="req">具体位置</label><input v-model="form.location" placeholder="广场北侧/外摆B区" /></div>
        <div class="form-row"><label class="req">放映日期</label><input v-model="form.showDate" type="date" /></div>
        <div class="form-row">
          <label class="req">放映时间</label>
          <input v-model="form.showTime" type="time" />
          <span v-if="selectedVenue?.latestShowTime" class="muted" style="margin-left:8px">
            该场地最晚放映 {{ selectedVenue.latestShowTime }}
          </span>
        </div>
        <div class="form-row"><label class="req">预计观众</label><input v-model.number="form.expectedAudience" type="number" min="1" /></div>
      </div>

      <div v-if="selectedVenue && (selectedVenue.noiseTestRequired || selectedVenue.latestShowTime)" class="notice danger" style="margin:0 16px 16px">
        ⚠ 场地「{{ selectedVenue.name }}」因上一次噪声投诉复盘被限制：
        <ul style="margin:6px 0 0 18px;padding:0">
          <li v-if="selectedVenue.latestShowTime">本次放映开始时间不得晚于 <b>{{ selectedVenue.latestShowTime }}</b>（自动带出的审批限制）。</li>
          <li v-if="selectedVenue.noiseTestRequired">申请前需完成<b>提前降噪测试</b>，请在下方填写测试时间、分贝结果与整改措施，否则申请会被拦截。</li>
        </ul>
        <div class="muted" style="margin-top:6px">{{ selectedVenue.restrictionReason }}</div>
      </div>
      <div v-if="selectedVenue?.noiseTestRequired" class="card" style="margin:0 16px 16px">
        <h3>提前降噪测试（受限场地必填）</h3>
        <div class="form-row" style="grid-template-columns:110px 1fr">
          <label class="req">降噪测试结果</label>
          <textarea v-model="form.noiseTestProof" placeholder="测试日期、测点（楼栋/距离）、整改前后分贝、采用的降噪措施（音箱角度/限功率/声屏障等）" />
        </div>
      </div>
    </div>

    <div class="card">
      <h3>影片与版权</h3>
      <div class="grid2">
        <div class="form-row"><label class="req">影片名称</label><input v-model="form.filmName" /></div>
        <div class="form-row"><label class="req">版权方</label><input v-model="form.copyrightOwner" /></div>
      </div>
      <div class="form-row" style="grid-template-columns:110px 1fr">
        <label class="req">版权凭证</label>
        <input v-model="form.copyrightProof" placeholder="授权书/放映许可编号，如：中影授权书 ZS-2026-0886" />
      </div>
    </div>

    <div class="card">
      <h3>设备与保障条件</h3>
      <div class="grid2">
        <div class="form-row"><label class="req">供电条件</label>
          <input v-model="form.powerCondition" placeholder="配电箱位置/电压电流/接线长度" />
        </div>
        <div class="form-row"><label class="req">银幕尺寸</label><input v-model="form.screenSize" placeholder="如 6m x 3.4m" /></div>
        <div class="form-row"><label class="req">音响数量</label><input v-model.number="form.speakerCount" type="number" min="0" /></div>
        <div class="form-row"><label class="req">安保人员</label><input v-model.number="form.securityStaff" type="number" min="0" /></div>
      </div>
      <div class="form-row" style="grid-template-columns:110px 1fr">
        <label class="req">雨天预案</label>
        <textarea v-model="form.rainPlan" placeholder="防雨罩、转移场地、补映安排等" />
      </div>
      <div class="grid2">
        <div class="form-row"><label>现场负责人</label><input v-model="form.siteManagerName" /></div>
        <div class="form-row"><label>安保带队</label><input v-model="form.securityLeadName" /></div>
      </div>
    </div>

    <div class="row" style="justify-content:flex-end">
      <button @click="$router.back()">取消</button>
      <button class="primary" :disabled="saving" @click="submit">提交申请并送审</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

const router = useRouter();
const saving = ref(false);
const venues = ref<any[]>([]);
const organizers = ref<any[]>([]);

const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const form = ref({
  title: '', organizerId: '', venueId: '', location: '',
  showDate: future, showTime: '19:30', expectedAudience: 200,
  filmName: '', copyrightOwner: '', copyrightProof: '',
  powerCondition: '', screenSize: '6m x 3.4m', speakerCount: 2, securityStaff: 4,
  rainPlan: '', siteManagerName: '周强', securityLeadName: '孙队',
  noiseTestProof: '',
});

const selectedVenue = computed(() => venues.value.find((v) => v.id === form.value.venueId));
function onVenue() {
  // 切换场地后，若受限场地给出更晚默认时间则不动；测试凭证需重新填写
  form.value.noiseTestProof = '';
}

onMounted(async () => {
  const [v, o] = await Promise.all([api.get('/venues'), api.get('/organizers')]);
  venues.value = v.data;
  organizers.value = o.data;
});

async function submit() {
  saving.value = true;
  try {
    const { data } = await api.post('/screenings', form.value);
    await api.post(`/screenings/${data.id}/submit`);
    router.push(`/screenings/${data.id}`);
  } finally {
    saving.value = false;
  }
}
</script>
