#!/usr/bin/env bash
# 端到端业务流验证：申请→黑名单拦截→审批→成套备料→扫码（错误码拒绝+六件齐出库）
# →五项现场上传→确认→开始放映→志愿者→噪声投诉多角色协同办结（风险/信用联动）
# →归还定损→版权核销→财务流水→关单→街道看板
set -u
BASE="${BASE:-http://localhost:3119/api}"
PASS=0; FAIL=0
ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
check(){ if eval "$2"; then ok "$1"; else bad "$1 ($3)"; fi; }

login(){ curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$1\",\"password\":\"123456\"}" | sed -E 's/.*"token":"([^"]+)".*/\1/'; }

req(){ local method=$1 token=$2 path=$3; shift 3;
  curl -s -X "$method" "$BASE$path" -H "Authorization: Bearer $token" \
  -H 'Content-Type: application/json' "$@"; }

echo "== 0. 健康检查 =="
H=$(curl -s "$BASE/health")
echo "  $H"
echo "$H" | grep -q '"status":"ok"' && ok "health ok" || bad "health"

echo "== 1. 八类角色登录 =="
for u in applicant applicant2 reviewer warehouse site security finance street; do
  T=$(login $u)
  [ "${#T}" -gt 40 ] && ok "$u 登录" || bad "$u 登录"
  eval "TOK_$u=$T"
done

echo "== 2. 申请方：黑名单场地拦截 =="
BLACK=$(req GET "$TOK_street" /venues | python3 -c 'import sys,json;print(next(v["id"] for v in json.load(sys.stdin) if v["blacklisted"]))')
ORG=$(req GET "$TOK_applicant" /organizers | python3 -c 'import sys,json;print(json.load(sys.stdin)[0]["id"])')
BODY="{\"title\":\"黑名单测试\",\"organizerId\":\"$ORG\",\"venueId\":\"$BLACK\",\"showDate\":\"2026-10-01\",\"showTime\":\"19:30\",\"location\":\"中庭\",\"expectedAudience\":100,\"filmName\":\"测试片\",\"copyrightProof\":\"P-1\",\"copyrightOwner\":\"版权方\",\"powerCondition\":\"市电\",\"screenSize\":\"3x2\",\"speakerCount\":1,\"securityStaff\":2,\"rainPlan\":\"无\"}"
R=$(req POST "$TOK_applicant" /screenings -d "$BODY")
echo "$R" | grep -q '黑名单' && ok "黑名单场地申请被拦截" || bad "黑名单拦截: $R"

echo "== 3. 申请方新建申请并提交 → 审核员审批 =="
VENUE_OK=$(req GET "$TOK_street" /venues | python3 -c 'import sys,json;print(next(v["id"] for v in json.load(sys.stdin) if not v["blacklisted"] and not v["noiseRestricted"]))')
BODY="{\"title\":\"端到端验证专场\",\"organizerId\":\"$ORG\",\"venueId\":\"$VENUE_OK\",\"showDate\":\"2026-10-05\",\"showTime\":\"19:30\",\"location\":\"广场北侧\",\"expectedAudience\":220,\"filmName\":\"我和我的祖国\",\"copyrightProof\":\"ZS-E2E-0001\",\"copyrightOwner\":\"中影\",\"powerCondition\":\"市政配电箱220V/16A 40米\",\"screenSize\":\"6m x 3.4m\",\"speakerCount\":2,\"securityStaff\":4,\"rainPlan\":\"防雨罩+转多功能厅\",\"siteManagerName\":\"周强\",\"securityLeadName\":\"孙队\"}"
SID=$(req POST "$TOK_applicant" /screenings -d "$BODY" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
[ -n "$SID" ] && ok "申请创建 $SID" || bad "申请创建"
R=$(req POST "$TOK_applicant" "/screenings/$SID/submit" -d '{}')
echo "$R" | grep -q 'pending_review' && ok "提交送审→pending_review" || bad "送审: $R"
R=$(req POST "$TOK_reviewer" "/screenings/$SID/review" -d '{"approved":true,"filingNo":"BA-E2E-001","comment":"端到端验证：授权与备案通过"}')
echo "$R" | grep -q 'review_approved' && ok "审核通过" || bad "审核: $R"
echo "== 4. 仓库成套备料 =="
R=$(req POST "$TOK_warehouse" "/equipment/screening/$SID/prepare" -d '{}')
echo "$R" | grep -q 'equipment_prepared' && ok "备料完成、状态→equipment_prepared" || bad "备料: $R"
ASSIGN=$(req GET "$TOK_warehouse" "/equipment/screening/$SID/assignments")
COUNT=$(echo "$ASSIGN" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')
[ "$COUNT" = "6" ] && ok "成套6件 ($COUNT)" || bad "成套件数=$COUNT"

echo "== 5. 扫码核对：错误编码先拒绝，六件正确编码出库 =="
WRONG=$(echo "$ASSIGN" | python3 -c 'import sys,json;a=json.load(sys.stdin);print(a[0]["equipment"]["code"][:-2]+"00")')
R=$(req POST "$TOK_warehouse" "/equipment/screening/$SID/scan" -d "{\"code\":\"$WRONG\"}")
echo "$R" | grep -q '扫码失败' && ok "不存在编码拒绝" || bad "错误编码: $R"
# 取另一场次无关设备编码（KIT-02 的一件）——先备第二场会占用，这里直接用库存接口找未分配的
OTHER=$(req GET "$TOK_warehouse" '/equipment?status=in_stock' | python3 -c 'import sys,json;print(json.load(sys.stdin)[0]["code"])')
R=$(req POST "$TOK_warehouse" "/equipment/screening/$SID/scan" -d "{\"code\":\"$OTHER\"}")
echo "$R" | grep -q '不属于本场次' && ok "非本场成套编码拒绝" || bad "非成套拒绝: $R"
for CODE in $(echo "$ASSIGN" | python3 -c 'import sys,json;[print(x["equipment"]["code"]) for x in json.load(sys.stdin)]'); do
  req POST "$TOK_warehouse" "/equipment/screening/$SID/scan" -d "{\"code\":\"$CODE\"}" >/dev/null
done
S=$(req GET "$TOK_warehouse" "/screenings/$SID")
echo "$S" | grep -q 'equipment_checked_out' && ok "六件齐→自动出库" || bad "出库状态: $(echo "$S" | python3 -c 'import sys,json;print(json.load(sys.stdin)["status"])')"

echo "== 6. 现场五项上报（含噪声68dB首次不合格）+ 缺项拒绝确认 =="
req POST "$TOK_site" "/screenings/$SID/inspections" -d '{"category":"build_setup","detail":"银幕与投影搭建完成"}' >/dev/null
req POST "$TOK_site" "/screenings/$SID/inspections" -d '{"category":"test_play","detail":"试播10分钟画面声音正常"}' >/dev/null
N1=$(req POST "$TOK_security" "/screenings/$SID/inspections" -d '{"category":"noise","noiseDb":68,"detail":"开场前试音偏大"}')
echo "$N1" | grep -q '"passed":false' && ok "68dB 自动判不合格" || bad "噪声判定: $N1"
req POST "$TOK_security" "/screenings/$SID/inspections" -d '{"category":"noise","noiseDb":56,"detail":"调小音量后复测"}' >/dev/null
req POST "$TOK_security" "/screenings/$SID/inspections" -d '{"category":"isolation","detail":"观众区护栏隔离完成"}' >/dev/null
R=$(req POST "$TOK_site" "/screenings/$SID/confirm-site" -d '{}')
echo "$R" | grep -q '消防通道' && ok "五项缺消防通道时拒绝确认" || bad "缺项拦截: $R"
req POST "$TOK_security" "/screenings/$SID/inspections" -d '{"category":"firelane","detail":"消防通道4米畅通"}' >/dev/null
R=$(req POST "$TOK_site" "/screenings/$SID/confirm-site" -d '{}')
echo "$R" | grep -q 'site_confirmed' && ok "五项齐→现场确认" || bad "现场确认: $R"

echo "== 7. 志愿者签到/签退 + 开始放映 =="
R=$(req POST "$TOK_site" "/screenings/$SID/volunteers" -d '{"volunteerName":"志愿小张","phone":"13900001111","duty":"秩序维护"}')
VID=$(echo "$R" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
req POST "$TOK_site" "/screenings/$SID/volunteers/$VID/checkout" -d '{}' >/dev/null
R=$(req POST "$TOK_site" "/screenings/$SID/start" -d '{}')
echo "$R" | grep -q '"status":"screening"' && ok "放映开始" || bad "放映开始: $R"

echo "== 8. 噪声投诉工单：多角色协同 + 办结联动风险/信用 =="
ORG_ID=$(echo "$S" | python3 -c 'import sys,json;print(json.load(sys.stdin)["organizerId"])')
VENUE_ID=$(echo "$S" | python3 -c 'import sys,json;print(json.load(sys.stdin)["venueId"])')
CREDIT_BEFORE=$(req GET "$TOK_street" /organizers | python3 -c "import sys,json;print(next(o['creditScore'] for o in json.load(sys.stdin) if o['id']=='$ORG_ID'))")
NOISE_BEFORE=$(req GET "$TOK_street" /venues | python3 -c "import sys,json;print(next(v['noiseCount'] for v in json.load(sys.stdin) if v['id']=='$VENUE_ID'))")
R=$(req POST "$TOK_applicant" "/incidents/screening/$SID" -d '{"type":"noise_complaint","description":"3栋居民反映音响低音共振明显","noiseDb":67}')
INC=$(echo "$R" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
echo "$R" | grep -q '"ownerRole":"security"' && ok "噪声工单自动分派安保" || bad "分派: $R"
req POST "$TOK_security" "/incidents/$INC/replies" -d '{"content":"已到场要求调低低音，音箱外摆角度调整","status":"handling"}' >/dev/null
req POST "$TOK_warehouse" "/incidents/$INC/replies" -d '{"content":"仓库建议备用小功率音箱替换一只主音箱"}' >/dev/null
req POST "$TOK_finance" "/incidents/$INC/replies" -d '{"content":"如居民有损失诉求财务跟进赔付口径"}' >/dev/null
R=$(req POST "$TOK_security" "/incidents/$INC/resolve" -d '{"resolution":"音量降至55dB，居民表示接受，投诉办结","confirmed":true}')
echo "$R" | grep -q '"status":"resolved"' && ok "工单办结" || bad "办结: $R"
REPLIES=$(req GET "$TOK_street" "/incidents/$INC" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["replies"]))')
[ "$REPLIES" -ge 4 ] && ok "多角色协同留言 $REPLIES 条" || bad "协同留言数=$REPLIES"
NOISE_AFTER=$(req GET "$TOK_street" /venues | python3 -c "import sys,json;print(next(v['noiseCount'] for v in json.load(sys.stdin) if v['id']=='$VENUE_ID'))")
CREDIT_AFTER=$(req GET "$TOK_street" /organizers | python3 -c "import sys,json;print(next(o['creditScore'] for o in json.load(sys.stdin) if o['id']=='$ORG_ID'))")
[ "$NOISE_AFTER" = $((NOISE_BEFORE+1)) ] && ok "点位噪声计数 $NOISE_BEFORE→$NOISE_AFTER" || bad "噪声计数 $NOISE_BEFORE→$NOISE_AFTER"
[ "$CREDIT_AFTER" = $((CREDIT_BEFORE-8)) ] && ok "主办方信用 $CREDIT_BEFORE→$CREDIT_AFTER (-8)" || bad "信用 $CREDIT_BEFORE→$CREDIT_AFTER"

echo "== 8b. 现场负责人登记噪声投诉复盘（楼栋/分贝/调低音量时间/安保结果），活动提前结束→费用重算 =="
R=$(req POST "$TOK_site" "/screenings/$SID/noise-reviews" -d "{\"incidentId\":\"$INC\",\"complaintBuildings\":\"3栋2单元、5栋\",\"noiseDb\":67,\"volumeLoweredAt\":\"20:02\",\"noiseDbAfter\":55,\"securityResult\":\"安保孙队上门向3栋2单元601、5栋302住户解释，调低主音箱功率2档、音箱角度内收，居民仍坚持要求收场\",\"endedEarly\":true,\"earlyEndAt\":\"20:15\",\"planSubsidyCents\":80000,\"planMerchantCostCents\":30000}")
NR=$(echo "$R" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
[ -n "$NR" ] && ok "复盘已登记（待街道关闭） $NR" || bad "复盘登记: $R"
echo "$R" | grep -q '"status":"open"' && ok "复盘初始状态 open" || bad "复盘状态: $R"
echo "$R" | python3 -c 'import sys,json;r=json.load(sys.stdin);assert r["finalSubsidyCents"]=="30000",r["finalSubsidyCents"];assert r["finalMerchantCostCents"]=="11300",r["finalMerchantCostCents"];assert r["proposedLatestShowTime"]=="20:15",r["proposedLatestShowTime"]' \
  && ok "提前结束费用重算：补贴800→300元、商户协办费300→113元（45/120=37.5%），建议最晚放映20:15" \
  || bad "重算金额: $(echo "$R" | python3 -c 'import sys,json;r=json.load(sys.stdin);print(r["finalSubsidyCents"],r["finalMerchantCostCents"],r["proposedLatestShowTime"])')"
S=$(req GET "$TOK_warehouse" "/screenings/$SID")
echo "$S" | python3 -c 'import sys,json;s=json.load(sys.stdin);assert s["subsidyAmount"]=="30000" and s["merchantCostCents"]=="11300" and s["endedEarlyAt"], "bad"' \
  && ok "场次回写：核定补贴/商户协办费/提前结束时间" || bad "场次回写"

echo "== 8c. 街道关闭投诉：三项未确认时拦截，全部确认后关闭并对点位下限制 =="
R=$(req POST "$TOK_street" "/noise-reviews/$NR/close" -d '{"residentConfirmed":false,"volumeConfirmed":false}')
echo "$R" | grep -q '居民沟通' && ok "未确认居民沟通→拒绝关闭" || bad "关闭校验缺失: $R"
R=$(req POST "$TOK_street" "/noise-reviews/$NR/close" -d '{"residentConfirmed":true,"volumeConfirmed":true,"earlyEndConfirmed":false}')
echo "$R" | grep -q '提前结束时间' && ok "未确认提前结束时间→拒绝关闭" || bad "提前结束校验缺失: $R"
R=$(req POST "$TOK_street" "/noise-reviews/$NR/close" -d '{"residentConfirmed":true,"volumeConfirmed":true,"earlyEndConfirmed":true,"streetNote":"回访居民已接受，20:15收场情况属实"}')
echo "$R" | grep -q '"status":"closed"' && ok "三项确认→投诉关闭" || bad "关闭: $R"
V=$(req GET "$TOK_street" /venues)
echo "$V" | python3 -c "import sys,json;v=next(x for x in json.load(sys.stdin) if x['id']=='$VENUE_ID');assert v['noiseRestricted'] and v['latestShowTime']=='20:15' and v['noiseTestRequired'], v" \
  && ok "点位限制生效：最晚放映20:15 + 下次须提前降噪测试" || bad "点位限制未落库"
NOISE_NOW=$(echo "$V" | python3 -c "import sys,json;print(next(v['noiseCount'] for v in json.load(sys.stdin) if v['id']=='$VENUE_ID'))")
[ "$NOISE_NOW" = "$NOISE_AFTER" ] && ok "复盘关联工单不重复计噪声（仍为 $NOISE_NOW）" || bad "噪声重复计数 $NOISE_NOW vs $NOISE_AFTER"

echo "== 8d. 下一次同场地申请自动带出限制：未降噪测试审批被拦→测试达标→最晚时间拦截 =="
BODY2="{\"title\":\"限制点位复验专场\",\"organizerId\":\"$ORG_ID\",\"venueId\":\"$VENUE_ID\",\"showDate\":\"2026-10-09\",\"showTime\":\"19:30\",\"location\":\"广场北侧\",\"expectedAudience\":200,\"filmName\":\"我和我的祖国\",\"copyrightProof\":\"ZS-E2E-0002\",\"copyrightOwner\":\"中影\",\"powerCondition\":\"市政配电箱220V\",\"screenSize\":\"6m x 3.4m\",\"speakerCount\":2,\"securityStaff\":4,\"rainPlan\":\"防雨罩+转多功能厅\"}"
SID2=$(req POST "$TOK_applicant" /screenings -d "$BODY2" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
req POST "$TOK_applicant" "/screenings/$SID2/submit" -d '{}' >/dev/null
D2=$(req GET "$TOK_applicant" "/screenings/$SID2")
echo "$D2" | python3 -c 'import sys,json;s=json.load(sys.stdin);assert s["inheritedLatestShowTime"]=="20:15" and s["noiseTestRequired"] and not s["noiseTestDone"], s' \
  && ok "新申请自动带出限制：最晚20:15 + 须降噪测试" || bad "限制带出失败"
R=$(req POST "$TOK_reviewer" "/screenings/$SID2/review" -d '{"approved":true}')
echo "$R" | grep -q '降噪测试' && ok "未做降噪测试→审批拦截" || bad "降噪测试前置校验: $R"
req POST "$TOK_site" "/screenings/$SID2/noise-test" -d '{"noiseDb":64,"note":"首次测试仍偏高"}' >/dev/null
R=$(req POST "$TOK_reviewer" "/screenings/$SID2/review" -d '{"approved":true}')
echo "$R" | grep -q '60dB' && ok "降噪测试64dB超标→审批拦截" || bad "超标审批校验: $R"
req POST "$TOK_site" "/screenings/$SID2/noise-test" -d '{"noiseDb":55,"note":"音箱角度内收后边界复测"}' >/dev/null
R=$(req POST "$TOK_reviewer" "/screenings/$SID2/review" -d '{"approved":true,"filingNo":"BA-E2E-002"}')
echo "$R" | grep -q 'review_approved' && ok "降噪测试达标(55dB)+19:30≤20:15→审批通过" || bad "限制点位审批: $R"
BODY3="{\"title\":\"超时放映拦截专场\",\"organizerId\":\"$ORG_ID\",\"venueId\":\"$VENUE_ID\",\"showDate\":\"2026-10-10\",\"showTime\":\"20:30\",\"location\":\"广场北侧\",\"expectedAudience\":200,\"filmName\":\"我和我的祖国\",\"copyrightProof\":\"ZS-E2E-0003\",\"copyrightOwner\":\"中影\",\"powerCondition\":\"市电\",\"screenSize\":\"6m x 3.4m\",\"speakerCount\":2,\"securityStaff\":4,\"rainPlan\":\"转多功能厅\"}"
SID3=$(req POST "$TOK_applicant" /screenings -d "$BODY3" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
req POST "$TOK_applicant" "/screenings/$SID3/submit" -d '{}' >/dev/null
req POST "$TOK_site" "/screenings/$SID3/noise-test" -d '{"noiseDb":54}' >/dev/null
R=$(req POST "$TOK_reviewer" "/screenings/$SID3/review" -d '{"approved":true}')
echo "$R" | grep -q '最晚放映' && ok "20:30晚于限制20:15→审批拦截" || bad "最晚放映时间校验: $R"

echo "== 9. 归还：5件完好 + 1件损坏赔付 300 元 =="
i=0
for row in $(echo "$ASSIGN" | python3 -c 'import sys,json;[print("%s,%s"%(x["id"],x["equipmentId"])) for x in json.load(sys.stdin)]'); do
  EID=${row#*,}
  i=$((i+1))
  if [ $i -eq 3 ]; then
    req POST "$TOK_warehouse" "/equipment/screening/$SID/return/$EID" -d '{"result":"returned_damaged","note":"音箱面罩磕碰变形","compensationCents":30000}' >/dev/null
  else
    req POST "$TOK_warehouse" "/equipment/screening/$SID/return/$EID" -d '{"result":"returned_ok"}' >/dev/null
  fi
done
S=$(req GET "$TOK_warehouse" "/screenings/$SID")
echo "$S" | python3 -c 'import sys,json;s=json.load(sys.stdin);assert s["damageCompensation"]=="30000" and s["returnedAt"], "bad"' \
  && ok "6件归还完成、赔付300元、归还时间已记录" || bad "归还/赔付: $(echo "$S" | python3 -c 'import sys,json;s=json.load(sys.stdin);print(s["damageCompensation"],s["returnedAt"])')"

echo "== 10. 未版权核销时关单被拒 =="
R=$(req POST "$TOK_finance" "/screenings/$SID/settlements/complete" -d '{}')
echo "$R" | grep -q '版权尚未核销' && ok "关单前置校验生效" || bad "关单校验: $R"

echo "== 11. 版权核销 + 财务流水（押金退还/补贴）+ 关单 =="
req POST "$TOK_reviewer" "/screenings/$SID/settlements/copyright-writeoff" -d '{}' >/dev/null
req POST "$TOK_finance" "/screenings/$SID/settlements" -d '{"type":"deposit_refund","amountCents":200000,"note":"设备归还无损部分退还押金"}' >/dev/null
req POST "$TOK_finance" "/screenings/$SID/settlements" -d '{"type":"subsidy","amountCents":80000,"note":"街道公益放映补贴"}' >/dev/null
req POST "$TOK_finance" "/screenings/$SID/settlements" -d '{"type":"damage_compensation","amountCents":30000,"note":"音箱面罩赔偿"}' >/dev/null
R=$(req POST "$TOK_finance" "/screenings/$SID/settlements/complete" -d '{"finalRemark":"组织有序，该点位可继续安排夜间活动"}')
echo "$R" | grep -q '"status":"completed"' && ok "关单归档→completed" || bad "关单: $R"

echo "== 12. 时间线节点完整性 =="
TL=$(req GET "$TOK_street" "/screenings/$SID" | python3 -c '
import sys,json
s=json.load(sys.stdin)
kinds={t["kind"] for t in s["timeline"]}
need={"apply","review","prepare","checkout","build","screening","complaint","settlement"}
print("OK" if need<=kinds else "MISS:"+",".join(sorted(need-kinds)))')
[ "$TL" = "OK" ] && ok "时间线覆盖 申请/审批/备料/出库/搭建/放映/投诉/核销" || bad "时间线: $TL"

echo "== 13. 街道看板 =="
R=$(req GET "$TOK_street" /dashboard/overview)
echo "$R" | grep -q '"riskyVenues"' && echo "$R" | grep -q '"recentTimeline"' && ok "看板KPI/风险榜/时间线返回" || bad "看板: $R"
echo "$R" | python3 -c 'import sys,json;d=json.load(sys.stdin);assert d["kpi"]["completed"]>=1 and d["kpi"]["blacklistedVenues"]>=1' \
  && ok "看板统计：已完成场次≥1、黑名单场地≥1" || bad "看板统计值"

echo
echo "RESULT: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
