<template>
  <div v-if="s">
    <div class="row" style="justify-content:space-between;margin-bottom:12px">
      <div>
        <button @click="$router.push('/screenings')">← 返回列表</button>
        <h2 style="margin:10px 0 4px;font-size:19px">{{ s.title }}</h2>
        <div class="muted">{{ s.code }} ｜ {{ s.showDate }} {{ s.showTime }} ｜ {{ s.venue?.name }} ｜ {{ s.organizer?.name }}</div>
      </div>
      <span class="tag" :style="{ background: STATUS_COLOR[s.status], fontSize: '14px', padding: '5px 16px' }">
        {{ s.statusLabel }}
      </span>
    </div>

    <div v-if="s.venue?.blacklisted" class="notice danger">
      ⛔ 该场地已列入黑名单：{{ s.venue.blacklistReason }}
    </div>
    <div v-else-if="s.noiseTestRequired || s.latestShowTimeLimit" class="notice danger">
      ⚠ 本场地为噪声受限点位（上次投诉复盘限制已自动带出）：
      <template v-if="s.latestShowTimeLimit">最晚放映 <b>{{ s.latestShowTimeLimit }}</b>；</template>
      <template v-if="s.noiseTestRequired">申请前须完成<b>提前降噪测试</b>（{{ s.noiseTestProof || '未登记凭证' }}）。</template>
    </div>
    <div v-else-if="s.venueRiskLevel !== '正常'" class="notice">
      ⚠ 点位风险等级：<b>{{ s.venueRiskLevel }}</b>
      （历史噪声 {{ s.venue.noiseCount }} 次 / 设备损坏 {{ s.venue.damageCount }} 次 / 投诉 {{ s.venue.complaintCount }} 次，
      连续噪声或设备损坏将影响下一轮审批）
    </div>

    <div class="tabs">
      <button v-for="t in tabs" :key="t.key" :class="{ active: tab === t.key }" @click="tab = t.key">
        {{ t.label }}
      </button>
    </div>

    <!-- 申请信息 -->
    <div v-show="tab === 'info'">
      <div class="card">
        <h3>放映申请要素</h3>
        <div class="grid3">
          <Info label="放映日期" :value="`${s.showDate} ${s.showTime}`" />
          <Info label="场地位置" :value="s.location" />
          <Info label="预计观众" :value="`${s.expectedAudience} 人（场地容量 ${s.venue?.capacity}）`" />
          <Info label="影片名称" :value="`《${s.filmName}》`" />
          <Info label="版权凭证" :value="s.copyrightProof" />
          <Info label="版权方" :value="s.copyrightOwner" />
          <Info label="供电条件" :value="s.powerCondition" />
          <Info label="银幕尺寸" :value="s.screenSize" />
          <Info label="音响数量" :value="`${s.speakerCount} 只`" />
          <Info label="安保人员" :value="`${s.securityStaff} 人`" />
          <Info label="现场负责人" :value="s.siteManagerName || '未定'" />
          <Info label="安保带队" :value="s.securityLeadName || '未定'" />
        </div>
        <div style="margin-top:10px"><span class="muted">雨天预案：</span>{{ s.rainPlan }}</div>
      </div>
      <div class="card">
        <h3>文化审核（影片授权 + 公共活动备案）</h3>
        <template v-if="s.status === 'pending_review' && is('reviewer')">
          <div class="form-row"><label>备案号</label><input v-model="review.filingNo" :placeholder="`BA-${s.code}`" /></div>
          <div class="form-row"><label>审核意见</label><textarea v-model="review.comment" placeholder="影片授权核验情况、备案意见" /></div>
          <div class="row" style="padding-left:120px">
            <button class="success" @click="doReview(true)">✓ 授权核验通过·同意备案</button>
            <button class="danger" @click="doReview(false)">✗ 驳回补正</button>
          </div>
        </template>
        <template v-else>
          <div v-if="s.copyrightConfirmed" class="notice success">
            审核人 {{ s.reviewerName }} 已于 {{ fmt(s.reviewedAt) }} 确认影片授权；
            公共活动备案号 <b>{{ s.filingNo }}</b>。意见：{{ s.reviewComment }}
          </div>
          <div v-else-if="s.status === 'review_rejected'" class="notice danger">
            已驳回（{{ s.reviewerName }}）：{{ s.reviewComment }}
          </div>
          <div v-else class="muted">审核尚未进行</div>
          <button v-if="s.status === 'review_rejected' && is('applicant')" class="primary" @click="resubmit">
            修改后重新提交审核
          </button>
        </template>
      </div>
    </div>

    <!-- 设备 -->
    <div v-show="tab === 'equipment'">
      <div class="card">
        <h3>仓库备料 · 成套扫码出库 · 归还</h3>
        <div class="notice">
          一套露天放映设备含 6 件：投影机、幕布、音箱、电缆、备用灯泡、防雨罩。
          领取时逐件扫码核对属于本场成套，6 件齐后出库。
        </div>
        <div class="row" style="margin-bottom:12px">
          <button v-if="['review_approved','equipment_prepared'].includes(s.status) && isAny('warehouse','street')"
                  class="primary" @click="prepareKit">📦 按场次自动准备一整套</button>
          <span v-if="s.status === 'equipment_checked_out'" class="muted">
            设备已出库，请由现场负责人在「现场巡检/志愿者」页上传五项材料并确认搭建后开始放映
          </span>
        </div>
        <table class="list">
          <thead><tr><th>资产编码</th><th>设备</th><th>类型</th><th>套号</th><th>状态</th><th>扫码时间</th><th>归还</th><th v-if="canReturn">归还登记</th></tr></thead>
          <tbody>
            <tr v-for="a in s.equipmentAssignments" :key="a.id">
              <td><b>{{ a.equipment.code }}</b></td>
              <td>{{ a.equipment.name }}</td>
              <td>{{ EQUIPMENT_TYPES[a.equipment.type] }}</td>
              <td>{{ a.equipment.kitNo }}</td>
              <td>
                <span class="tag" :class="stateClass(a.state)">{{ stateLabel(a.state) }}</span>
              </td>
              <td class="muted">{{ fmt(a.scannedAt) }}</td>
              <td>
                <div v-if="a.returnNote" class="muted">{{ a.returnNote }}<br>
                  赔付 ¥{{ fen(a.compensation) }}
                </div>
              </td>
              <td v-if="canReturn">
                <select v-model="returnDraft[a.equipmentId].result" style="width:120px;margin-bottom:4px">
                  <option value="returned_ok">完好</option>
                  <option value="returned_damaged">损坏</option>
                  <option value="lost">遗失</option>
                </select>
                <input v-model="returnDraft[a.equipmentId].compensationYuan" type="number" placeholder="赔付(元)" style="width:100px" />
                <input v-model="returnDraft[a.equipmentId].note" placeholder="备注" style="width:130px;margin:0 6px" />
                <button @click="returnItem(a)">登记</button>
              </td>
            </tr>
            <tr v-if="!s.equipmentAssignments?.length">
              <td colspan="8" class="muted" style="text-align:center;padding:20px">尚未备料</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="['equipment_prepared','equipment_checked_out'].includes(s.status)" class="card">
        <h3>设备领取扫码核对</h3>
        <div class="row">
          <input v-model="scanCode" placeholder="扫描/输入资产编码，如 PJ-01xxx" style="width:320px" @keyup.enter="doScan" />
          <button class="primary" @click="doScan">扫码核对</button>
          <span class="muted">本场已核对 {{ scannedCount }}/{{ s.equipmentAssignments?.length || 0 }} 件，剩余 {{ remainCount }} 件</span>
        </div>
        <div v-if="scanMsg" :class="['notice', scanOk ? 'success' : 'danger']" style="margin-top:10px">{{ scanMsg }}</div>
      </div>
    </div>

    <!-- 现场巡检 -->
    <div v-show="tab === 'site'">
      <div class="card">
        <h3>放映当天现场上报（现场负责人 / 安保）</h3>
        <div v-if="isAny('site_manager','security','street')" class="grid2">
          <div>
            <div class="form-row"><label>上报类别</label>
              <select v-model="inspect.category">
                <option v-for="(label, key) in INSPECTION_CATEGORIES" :key="key" :value="key">{{ label }}</option>
              </select>
            </div>
            <div v-if="inspect.category === 'noise'" class="form-row"><label>噪声分贝</label>
              <input v-model.number="inspect.noiseDb" type="number" placeholder="夜间参考阈值 60dB" />
            </div>
            <div class="form-row"><label>照片/截图</label>
              <input v-model="inspect.photoUrl" placeholder="上传后文件名/URL（演示可留空自动占位）" />
            </div>
            <div class="form-row"><label>情况说明</label><textarea v-model="inspect.detail" placeholder="现场情况描述" /></div>
            <div class="row" style="padding-left:120px">
              <label class="muted"><input type="checkbox" style="width:auto" v-model="inspect.passedBool" /> 检查合格</label>
              <button class="primary" @click="uploadInspection">上传现场记录</button>
            </div>
          </div>
          <div class="notice" style="margin:0">
            五项材料齐全且合格后方可确认现场搭建：<b>搭建照片、试播截图、噪声分贝、观众区域隔离、消防通道</b>。
            噪声超过 60dB 自动判不合格，需调小音量后复测。
          </div>
        </div>
        <table class="list" style="margin-top:12px">
          <thead><tr><th>类别</th><th>文件</th><th>分贝</th><th>说明</th><th>结论</th><th>上报人</th><th>时间</th></tr></thead>
          <tbody>
            <tr v-for="i in s.inspections" :key="i.id">
              <td>{{ INSPECTION_CATEGORIES[i.category] }}</td>
              <td class="muted">{{ i.photoUrl }}</td>
              <td>{{ i.noiseDb ?? '—' }}</td>
              <td>{{ i.detail || '—' }}</td>
              <td><span class="tag" :class="i.passed ? 'green' : 'red'">{{ i.passed ? '合格' : '不合格' }}</span></td>
              <td>{{ i.reporter?.name }}</td>
              <td class="muted">{{ fmt(i.createdAt) }}</td>
            </tr>
          </tbody>
        </table>
        <div class="row" style="margin-top:14px">
          <button v-if="s.status === 'equipment_checked_out' && isAny('site_manager','street')"
                  class="success" @click="confirmSite">✓ 五项齐备，确认现场搭建与安全条件</button>
          <button v-if="s.status === 'site_confirmed' && isAny('site_manager','street')"
                  class="primary" @click="startScreening">🎬 开始放映</button>
        </div>
      </div>

      <div class="card">
        <h3>志愿者签到</h3>
        <div v-if="isAny('site_manager','street')" class="row" style="margin-bottom:10px">
          <input v-model="vol.name" placeholder="志愿者姓名" style="width:130px" />
          <input v-model="vol.phone" placeholder="手机号" style="width:140px" />
          <select v-model="vol.duty" style="width:130px">
            <option>秩序维护</option><option>观众引导</option><option>设备协助</option>
          </select>
          <button class="primary" @click="checkinVol">签到</button>
        </div>
        <table class="list">
          <thead><tr><th>姓名</th><th>手机号</th><th>岗位</th><th>状态</th><th>签到</th><th>签退</th><th></th></tr></thead>
          <tbody>
            <tr v-for="v in s.volunteerCheckins" :key="v.id">
              <td>{{ v.volunteerName }}</td><td>{{ v.phone }}</td><td>{{ v.duty }}</td>
              <td><span class="tag" :class="v.state === 'checked_out' ? 'gray' : 'blue'">
                {{ v.state === 'checked_in' ? '服务中' : '已签退' }}
              </span></td>
              <td class="muted">{{ fmt(v.checkedInAt) }}</td>
              <td class="muted">{{ fmt(v.checkedOutAt) }}</td>
              <td>
                <button v-if="v.state === 'checked_in' && isAny('site_manager','street')" @click="checkoutVol(v.id)">签退</button>
              </td>
            </tr>
            <tr v-if="!s.volunteerCheckins?.length"><td colspan="7" class="muted" style="text-align:center">暂无志愿者签到</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 异常协同 -->
    <div v-show="tab === 'incidents'">
      <div class="card">
        <h3>发起现场异常（申请方/审核员/仓库/现场/安保/财务围绕同一场次处理）</h3>
        <div class="grid2">
          <div class="form-row"><label>异常类型</label>
            <select v-model="newInc.type">
              <option v-for="(label, key) in INCIDENT_TYPES" :key="key" :value="key">{{ label }}</option>
            </select>
          </div>
          <div v-if="newInc.type === 'noise_complaint'" class="form-row"><label>现场分贝</label>
            <input v-model.number="newInc.noiseDb" type="number" placeholder="如 68" />
          </div>
        </div>
        <div class="form-row" style="grid-template-columns:110px 1fr">
          <label>情况描述</label><textarea v-model="newInc.description" placeholder="时间、现象、影响范围、已采取的临时措施" />
        </div>
        <div class="row" style="padding-left:120px">
          <button class="primary" @click="createIncident">提交异常工单（自动分派主责角色）</button>
        </div>
      </div>

      <div v-for="inc in s.incidents" :key="inc.id" class="card">
        <div class="row" style="justify-content:space-between">
          <div>
            <span class="tag" :class="inc.status === 'resolved' ? 'green' : inc.status === 'handling' ? 'orange' : 'red'">
              {{ inc.status === 'resolved' ? '已办结' : inc.status === 'handling' ? '处理中' : '待处理' }}
            </span>
            <b style="margin-left:8px">{{ INCIDENT_TYPES[inc.type] || inc.title }}</b>
            <span class="pill">主责：{{ ROLE_NAME[inc.ownerRole] || inc.ownerRole }}</span>
            <span v-if="inc.noiseDb" class="pill">{{ inc.noiseDb }} dB</span>
          </div>
          <button @click="$router.push(`/incidents?focus=${inc.id}`)">进入工单详情协同 →</button>
        </div>
        <div class="muted" style="margin:8px 0">{{ inc.description }}</div>
        <div v-if="inc.resolution" class="notice success">办结结果：{{ inc.resolution }}</div>
      </div>
    </div>

    <!-- 噪声投诉复盘 -->
    <div v-show="tab === 'noise'">
      <div class="card">
        <h3>居民噪声投诉登记（现场负责人 / 安保）</h3>
        <div class="notice">
          放映中居民投诉扰民时，现场负责人记录投诉楼栋、分贝读数、调低音量时间和安保沟通结果。
        </div>
        <div v-if="isAny('site_manager','security','street')" class="grid2">
          <div class="form-row"><label class="req">投诉楼栋</label>
            <input v-model="nc.building" placeholder="如 3栋2单元 / 幸福里3号楼" />
          </div>
          <div class="form-row"><label class="req">分贝读数</label>
            <input v-model.number="nc.noiseDb" type="number" placeholder="如 67" />
          </div>
          <div class="form-row"><label class="req">调低音量时间</label>
            <input v-model="nc.volumeLoweredAt" type="datetime-local" />
          </div>
          <div class="form-row"><label>调低后分贝</label>
            <input v-model.number="nc.noiseDbAfter" type="number" placeholder="如 55（选填）" />
          </div>
        </div>
        <div v-if="isAny('site_manager','security','street')">
          <div class="form-row" style="grid-template-columns:110px 1fr"><label class="req">安保沟通结果</label>
            <textarea v-model="nc.securityCommunication" placeholder="到场沟通经过、居民诉求、是否接受" />
          </div>
          <div class="form-row" style="grid-template-columns:110px 1fr"><label>现场处置</label>
            <textarea v-model="nc.actionTaken" placeholder="调小低音/调整音箱角度/加派疏导等（选填）" />
          </div>
          <div class="row" style="padding-left:120px">
            <button class="primary" @click="createComplaint">登记噪声投诉</button>
          </div>
        </div>
      </div>

      <div v-for="c in s.noiseComplaints" :key="c.id" class="card">
        <div class="row" style="justify-content:space-between">
          <div>
            <span class="tag" :class="c.closedAt ? 'green' : 'red'">{{ c.closedAt ? '已关闭' : '待街道关闭' }}</span>
            <b style="margin-left:8px">{{ c.building }} · {{ c.noiseDb }}dB</b>
            <span v-if="c.endedEarly" class="pill">已提前结束</span>
            <span v-if="c.venueRestrictionApplied" class="pill">限制已写入场地</span>
          </div>
          <span class="muted">登记：{{ c.createdBy?.name }} · {{ fmt(c.createdAt) }}</span>
        </div>

        <div class="grid3" style="margin:10px 0">
          <Info label="投诉楼栋" :value="c.building" />
          <Info label="分贝读数" :value="`${c.noiseDb} dB`" />
          <Info label="调低后分贝" :value="c.noiseDbAfter != null ? `${c.noiseDbAfter} dB` : '—'" />
          <Info label="调低音量时间" :value="fmt(c.volumeLoweredAt)" />
          <Info label="提前结束时间" :value="c.endedEarly ? fmt(c.earlyEndedAt) : '未提前结束'" />
          <Info label="建议最晚放映" :value="c.derivedLatestShowTime || '—'" />
        </div>
        <div><span class="muted">安保沟通结果：</span>{{ c.securityCommunication }}</div>
        <div v-if="c.actionTaken" style="margin-top:6px"><span class="muted">现场处置：</span>{{ c.actionTaken }}</div>

        <!-- 提前结束与费用重算 -->
        <div v-if="c.endedEarly" class="notice" style="margin-top:10px">
          <b>活动提前结束，平台已按实际放映比例重算：</b>
          实际放映 {{ c.actualMinutes }}/{{ c.plannedMinutes }} 分钟；
          街道补贴 ¥{{ fen(c.originalSubsidyCents) }} → <b>¥{{ fen(c.recalcSubsidyCents) }}</b>；
          商户协办费 ¥{{ fen(c.originalMerchantFeeCents) }} → <b>¥{{ fen(c.merchantFeeCents) }}</b>。
          <div class="muted" style="margin-top:4px">{{ c.recalcNote }}</div>
        </div>
        <div v-else-if="!c.closedAt && isAny('site_manager','security','street')" class="row" style="margin-top:10px">
          <label style="font-size:13px">若活动提前结束，登记实际结束时间并重算费用：</label>
          <input v-model="earlyDraft[c.id]" type="datetime-local" />
          <button class="danger" @click="endEarly(c)">确认提前结束并重算</button>
        </div>

        <!-- 街道三项确认 -->
        <div class="card inner" v-if="!c.closedAt" style="margin-top:12px">
          <h3 style="font-size:15px">街道复盘确认（关闭前必须三项全部确认）</h3>
          <div v-if="is('street')" class="row" style="flex-wrap:wrap;gap:18px">
            <label><input type="checkbox" style="width:auto" v-model="reviewDraft[c.id].resident" /> 确认居民沟通</label>
            <label><input type="checkbox" style="width:auto" v-model="reviewDraft[c.id].volume" /> 确认音量调整</label>
            <label><input type="checkbox" style="width:auto" v-model="reviewDraft[c.id].earlyEnd" /> 确认提前结束时间</label>
            <button @click="reviewComplaint(c)">保存确认</button>
          </div>
          <div v-else class="muted">等待街道文体岗逐项确认居民沟通、音量调整、提前结束时间。</div>
          <div class="row" style="margin-top:8px;gap:8px">
            <span class="tag" :class="c.confirmResidentContact ? 'green' : 'gray'">居民沟通 {{ c.confirmResidentContact ? '✓' : '待确认' }}</span>
            <span class="tag" :class="c.confirmVolumeAdjustment ? 'green' : 'gray'">音量调整 {{ c.confirmVolumeAdjustment ? '✓' : '待确认' }}</span>
            <span class="tag" :class="c.confirmEarlyEndTime ? 'green' : 'gray'">提前结束时间 {{ c.confirmEarlyEndTime ? '✓' : '待确认' }}</span>
          </div>
          <div v-if="is('street')" class="row" style="margin-top:10px">
            <input v-model="closeDraft[c.id].latest" placeholder="最晚放映时间 HH:mm，留空取系统推导" style="width:220px" />
            <input v-model="closeDraft[c.id].comment" placeholder="街道复盘意见（选填）" style="flex:1;min-width:200px" />
            <button class="success" @click="closeComplaint(c)">三项齐备·关闭投诉并写入场地限制</button>
          </div>
        </div>

        <div v-else class="notice success" style="margin-top:10px">
          街道已关闭复盘（{{ fmt(c.closedAt) }}）：该点位后续最晚放映 <b>{{ c.derivedLatestShowTime }}</b>，
          下一次同场地申请自动带出本次限制，并要求<b>提前完成降噪测试</b>。
          <span v-if="c.reviewComment">复盘意见：{{ c.reviewComment }}</span>
        </div>
      </div>
      <div v-if="!s.noiseComplaints?.length" class="card"><div class="muted">本场暂无噪声投诉复盘记录</div></div>
    </div>

    <!-- 核销 -->
    <div v-show="tab === 'settlement'">
      <div class="card">
        <h3>活动结束 · 归还/赔付/投诉/版权/补贴（均回到本场次记录）</h3>
        <div class="grid4">
          <div class="kpi"><div class="num">¥{{ fen(s.damageCompensation) }}</div><div class="label">设备损坏赔付</div></div>
          <div class="kpi"><div class="num">¥{{ fen(s.depositDeducted) }}</div><div class="label">押金扣减</div></div>
          <div class="kpi"><div class="num">¥{{ fen(s.subsidyAmount) }}</div><div class="label">{{ s.subsidyRecalculated ? '补贴(投诉重算)' : '补贴发放' }}</div></div>
          <div class="kpi"><div class="num">¥{{ fen(s.merchantFeeCents) }}</div><div class="label">商户协办费用</div></div>
          <div class="kpi"><div class="num">{{ s.copyrightWrittenOff ? '已核销' : '未核销' }}</div><div class="label">版权核销</div></div>
        </div>
        <div v-if="isAny('reviewer','finance','street')" class="row" style="margin-top:14px">
          <button class="primary" :disabled="s.copyrightWrittenOff" @click="writeoff">版权核销</button>
        </div>
      </div>

      <div class="card" v-if="isAny('finance','street')">
        <h3>财务登记</h3>
        <div class="row">
          <select v-model="settle.type" style="width:170px">
            <option v-for="(label, key) in SETTLEMENT_TYPES" :key="key" :value="key">{{ label }}</option>
          </select>
          <input v-model.number="settle.yuan" type="number" placeholder="金额（元）" style="width:140px" />
          <input v-model="settle.note" placeholder="备注" style="flex:1;min-width:180px" />
          <button class="primary" @click="addSettlement">登记流水</button>
        </div>
        <table class="list" style="margin-top:12px">
          <thead><tr><th>类型</th><th>金额</th><th>备注</th><th>经办人</th><th>时间</th></tr></thead>
          <tbody>
            <tr v-for="r in s.settlements" :key="r.id">
              <td>{{ SETTLEMENT_TYPES[r.type] || r.type }}</td>
              <td>¥{{ fen(r.amountCents) }}</td>
              <td class="muted">{{ r.note }}</td>
              <td>{{ r.operator?.name }}</td>
              <td class="muted">{{ fmt(r.createdAt) }}</td>
            </tr>
            <tr v-if="!s.settlements?.length"><td colspan="5" class="muted" style="text-align:center">暂无核销流水</td></tr>
          </tbody>
        </table>
        <div class="row" style="margin-top:14px">
          <input v-model="finalRemark" placeholder="关单复盘备注（哪些场地适合继续安排夜间活动）" style="flex:1;min-width:240px" />
          <button class="success" @click="complete">✓ 关单归档（设备已还+版权已核销）</button>
        </div>
      </div>
    </div>

    <!-- 时间线 -->
    <div v-show="tab === 'timeline'">
      <div class="card">
        <h3>活动时间线（申请 → 审批 → 出库 → 搭建 → 放映 → 投诉 → 核销）</h3>
        <div class="timeline">
          <div v-for="t in sortedTimeline" :key="t.id" class="item">
            <div class="t">{{ t.title }} <span class="pill">{{ ROLE_NAME[t.actorRole] || t.actorRole }} · {{ t.actorName }}</span></div>
            <div v-if="t.detail" class="d">{{ t.detail }}</div>
            <div class="time">{{ fmt(t.createdAt) }}</div>
          </div>
          <div v-if="!s.timeline?.length" class="muted">暂无时间线记录</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import {
  api, currentUser, STATUS_COLOR, ROLE_NAME,
  INCIDENT_TYPES, INSPECTION_CATEGORIES, EQUIPMENT_TYPES, SETTLEMENT_TYPES, fenToYuan,
} from '../api';
import Info from '../components/Info.vue';

const route = useRoute();
const s = ref<any>(null);
const tab = ref('info');
const user = computed(() => currentUser());
const is = (r: string) => user.value?.role === r;
const isAny = (...rs: string[]) => rs.includes(user.value?.role || '');

const tabs = computed(() => [
  { key: 'info', label: '申请与审批' },
  { key: 'equipment', label: `设备出库/归还${s.value?.equipmentAssignments?.length ? `（${s.value.equipmentAssignments.length}）` : ''}` },
  { key: 'site', label: '现场巡检/志愿者' },
  { key: 'incidents', label: `异常协同${s.value?.incidents?.length ? `（${s.value.incidents.filter((i:any)=>i.status!=='resolved').length}）` : ''}` },
  { key: 'noise', label: `噪声投诉复盘${s.value?.noiseComplaints?.length ? `（${s.value.noiseComplaints.length}）` : ''}` },
  { key: 'settlement', label: '归还核销/补贴' },
  { key: 'timeline', label: '街道时间线' },
]);

const review = reactive({ filingNo: '', comment: '' });
const scanCode = ref('');
const scanMsg = ref('');
const scanOk = ref(false);
const inspect = reactive({ category: 'build_setup', noiseDb: 55, photoUrl: '', detail: '', passedBool: true });
const vol = reactive({ name: '', phone: '', duty: '秩序维护' });
const newInc = reactive({ type: 'noise_complaint', description: '', noiseDb: 65 });
const settle = reactive({ type: 'deposit_refund', yuan: 2000, note: '' });
const finalRemark = ref('');
const returnDraft = reactive<Record<string, any>>({});

const nowLocalInput = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const nc = reactive({
  building: '', noiseDb: 65, volumeLoweredAt: nowLocalInput(),
  noiseDbAfter: undefined as number | undefined,
  securityCommunication: '', actionTaken: '',
});
const earlyDraft = reactive<Record<string, string>>({});
const reviewDraft = reactive<Record<string, { resident: boolean; volume: boolean; earlyEnd: boolean }>>({});
const closeDraft = reactive<Record<string, { latest: string; comment: string }>>({});

const fen = fenToYuan;
function fmt(d?: string) { return d ? new Date(d).toLocaleString('zh-CN', { hour12: false }) : '—'; }

const sortedTimeline = computed(() =>
  [...(s.value?.timeline || [])].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)));
const scannedCount = computed(() => s.value?.equipmentAssignments?.filter((a: any) => a.state === 'checked_out' || a.state.startsWith('returned')).length || 0);
const remainCount = computed(() => (s.value?.equipmentAssignments?.length || 0) - scannedCount.value);
const canReturn = computed(() =>
  isAny('warehouse', 'site_manager', 'street') &&
  ['equipment_checked_out', 'site_confirmed', 'screening'].includes(s.value?.status));

function stateLabel(st: string) {
  return ({ prepared: '已备料待领', checked_out: '已扫码出库', returned_ok: '完好归还', returned_damaged: '损坏归还', lost: '遗失' } as any)[st] || st;
}
function stateClass(st: string) {
  if (st === 'returned_ok') return 'green';
  if (st === 'returned_damaged' || st === 'lost') return 'red';
  if (st === 'checked_out') return 'blue';
  return 'orange';
}

async function load() {
  const { data } = await api.get(`/screenings/${route.params.id}`);
  s.value = data;
  for (const a of data.equipmentAssignments || []) {
    if (!returnDraft[a.equipmentId]) {
      returnDraft[a.equipmentId] = { result: 'returned_ok', compensationYuan: 0, note: '' };
    }
  }
  for (const c of data.noiseComplaints || []) {
    if (!reviewDraft[c.id]) {
      reviewDraft[c.id] = {
        resident: !!c.confirmResidentContact,
        volume: !!c.confirmVolumeAdjustment,
        earlyEnd: !!c.confirmEarlyEndTime,
      };
    }
    if (!closeDraft[c.id]) {
      closeDraft[c.id] = { latest: c.derivedLatestShowTime || '', comment: '' };
    }
    if (earlyDraft[c.id] === undefined) earlyDraft[c.id] = nowLocalInput();
  }
}

async function doReview(approved: boolean) {
  await api.post(`/screenings/${s.value.id}/review`, {
    approved, comment: review.comment || (approved ? '影片授权核验通过，公共活动备案完成' : '材料不全或版权存疑，请补正'),
    filingNo: review.filingNo || undefined,
  });
  await load();
}
async function resubmit() {
  await api.post(`/screenings/${s.value.id}/submit`);
  await load();
}
async function prepareKit() {
  const { data } = await api.post(`/equipment/screening/${s.value.id}/prepare`, {});
  scanMsg.value = data.reused ? '该场次此前已备料，无需重复备料' : `成套 ${data.kitNo} 已备好，等待领取扫码`;
  scanOk.value = true;
  await load();
}
async function doScan() {
  try {
    const { data } = await api.post(`/equipment/screening/${s.value.id}/scan`, { code: scanCode.value.trim() });
    scanOk.value = true;
    scanMsg.value = data.kitComplete
      ? '✅ 成套6件全部核对无误，设备已出库，可进入现场搭建'
      : data.alreadyScanned
        ? `该件此前已扫码，还剩 ${data.remaining} 件待核对`
        : `核对成功，还剩 ${data.remaining} 件待扫码`;
    scanCode.value = '';
    await load();
  } catch { /* 拦截器已提示 */ }
}
async function returnItem(a: any) {
  const d = returnDraft[a.equipmentId];
  await api.post(`/equipment/screening/${s.value.id}/return/${a.equipmentId}`, {
    result: d.result,
    compensationCents: Math.round(Number(d.compensationYuan || 0) * 100),
    note: d.note || undefined,
  });
  await load();
}
async function uploadInspection() {
  await api.post(`/screenings/${s.value.id}/inspections`, {
    category: inspect.category,
    photoUrl: inspect.photoUrl || undefined,
    noiseDb: inspect.category === 'noise' ? inspect.noiseDb : undefined,
    detail: inspect.detail || undefined,
    passed: inspect.passedBool,
  });
  inspect.detail = '';
  await load();
}
async function confirmSite() {
  await api.post(`/screenings/${s.value.id}/confirm-site`);
  await load();
}
async function startScreening() {
  await api.post(`/screenings/${s.value.id}/start`);
  await load();
}
async function checkinVol() {
  await api.post(`/screenings/${s.value.id}/volunteers`, { ...vol });
  vol.name = ''; vol.phone = '';
  await load();
}
async function checkoutVol(id: string) {
  await api.post(`/screenings/${s.value.id}/volunteers/${id}/checkout`);
  await load();
}
async function createIncident() {
  await api.post(`/incidents/screening/${s.value.id}`, { ...newInc });
  newInc.description = '';
  await load();
}
async function createComplaint() {
  await api.post(`/screenings/${s.value.id}/noise-complaints`, {
    building: nc.building,
    noiseDb: nc.noiseDb,
    volumeLoweredAt: nc.volumeLoweredAt,
    noiseDbAfter: nc.noiseDbAfter ?? undefined,
    securityCommunication: nc.securityCommunication,
    actionTaken: nc.actionTaken || undefined,
  });
  nc.building = ''; nc.securityCommunication = ''; nc.actionTaken = ''; nc.noiseDbAfter = undefined;
  await load();
}
async function endEarly(c: any) {
  const t = earlyDraft[c.id];
  if (!t) return;
  await api.post(`/noise-complaints/${c.id}/end-early`, { earlyEndedAt: t });
  await load();
}
async function reviewComplaint(c: any) {
  const d = reviewDraft[c.id];
  await api.post(`/noise-complaints/${c.id}/review`, {
    confirmResidentContact: d.resident,
    confirmVolumeAdjustment: d.volume,
    confirmEarlyEndTime: d.earlyEnd,
  });
  await load();
}
async function closeComplaint(c: any) {
  const d = closeDraft[c.id];
  await api.post(`/noise-complaints/${c.id}/close`, {
    latestShowTime: d.latest || undefined,
    reviewComment: d.comment || undefined,
  });
  d.comment = '';
  await load();
}
async function writeoff() {
  await api.post(`/screenings/${s.value.id}/settlements/copyright-writeoff`, {});
  await load();
}
async function addSettlement() {
  await api.post(`/screenings/${s.value.id}/settlements`, {
    type: settle.type, amountCents: Math.round(Number(settle.yuan || 0) * 100), note: settle.note || undefined,
  });
  settle.note = '';
  await load();
}
async function complete() {
  await api.post(`/screenings/${s.value.id}/settlements/complete`, { finalRemark: finalRemark.value || undefined });
  await load();
}

onMounted(load);
</script>

<style scoped>
.card.inner { background: #f7f9fc; border: 1px dashed var(--border); box-shadow: none; padding: 14px 16px; }
.tag.gray { background: #e0e0e0; color: #666; }
</style>
