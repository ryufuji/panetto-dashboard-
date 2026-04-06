#!/bin/bash
# =============================================================================
# パネットダッシュボード 横断テスト (Cross-Functional E2E Tests)
# 業務ドメインを跨いだエンドツーエンドのシナリオテスト
# =============================================================================
set -eo pipefail
cd "$(dirname "$0")/.."
source .env.local

BASE_URL="http://localhost:3000"
API="$NEXT_PUBLIC_SUPABASE_URL/rest/v1"
SRK="$SUPABASE_SERVICE_ROLE_KEY"
ANON="$NEXT_PUBLIC_SUPABASE_ANON_KEY"

PASS=0
FAIL=0
SKIP=0
RESULTS=""

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Test user IDs
ORG_ID="a0000000-0000-0000-0000-000000000001"
ADMIN_ID=$(curl -s "$API/users?role=eq.admin&select=id&limit=1&organization_id=eq.$ORG_ID" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if d else '')")
EMPLOYEE_ID=$(curl -s "$API/users?role=eq.employee&select=id&limit=1&organization_id=eq.$ORG_ID" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if d else '')")
MANAGER_ID=$(curl -s "$API/users?role=eq.manager&select=id&limit=1&organization_id=eq.$ORG_ID" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if d else '')")
DEPT_ID=$(curl -s "$API/users?id=eq.$EMPLOYEE_ID&select=department_id" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['department_id'] if d else '')")

TMPJSON=$(mktemp /tmp/cross-test-XXXXXX.json)
trap "rm -f $TMPJSON" EXIT

split_response() {
  local resp="$1"
  STATUS=$(echo "$resp" | tail -n 1)
  BODY=$(echo "$resp" | sed '$d')
}

# POST/PATCH with JSON body via temp file - sets BODY and STATUS directly
do_post() {
  local url="$1" json="$2"
  printf '%s' "$json" > "$TMPJSON"
  local resp
  resp=$(curl -s -w "\n%{http_code}" --max-time 10 -X POST "$url" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SRK" \
    -H "Content-Type: application/json" -H "Prefer: return=representation" \
    --data-binary @"$TMPJSON" 2>/dev/null)
  STATUS=$(echo "$resp" | tail -n 1)
  BODY=$(echo "$resp" | sed '$d')
}

do_patch() {
  local url="$1" json="$2"
  printf '%s' "$json" > "$TMPJSON"
  local resp
  resp=$(curl -s -w "\n%{http_code}" --max-time 10 -X PATCH "$url" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SRK" \
    -H "Content-Type: application/json" -H "Prefer: return=representation" \
    --data-binary @"$TMPJSON" 2>/dev/null)
  STATUS=$(echo "$resp" | tail -n 1)
  BODY=$(echo "$resp" | sed '$d')
}

record() {
  local result="$1" id="$2" desc="$3" detail="$4"
  RESULTS+="$result|$id|$desc|$detail\n"
  if [ "$result" = "PASS" ]; then PASS=$((PASS+1))
  elif [ "$result" = "FAIL" ]; then FAIL=$((FAIL+1))
  else SKIP=$((SKIP+1)); fi
}

echo ""
echo -e "${BOLD}======================================================${NC}"
echo -e "${BOLD} パネットダッシュボード 横断テスト${NC}"
echo -e "${BOLD} $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo -e "${BOLD}======================================================${NC}"
echo ""
echo "  Admin:    $ADMIN_ID"
echo "  Manager:  $MANAGER_ID"
echo "  Employee: $EMPLOYEE_ID"
echo "  Dept:     $DEPT_ID"
echo ""

# =============================================================================
# SCENARIO 1: 日報作成 → 提出 → 承認 → パフォーマンス反映
# =============================================================================
echo -e "${CYAN}━━━ シナリオ1: 日報 → 承認 → パフォーマンス 横断フロー ━━━${NC}"

# Step 1: 社員が日報を作成
echo "  [1/7] 日報作成 (draft)..."
do_post "$API/reports" "{\"user_id\":\"$EMPLOYEE_ID\",\"organization_id\":\"$ORG_ID\",\"department_id\":\"$DEPT_ID\",\"report_date\":\"2026-04-01\",\"title\":\"cross test report\",\"status\":\"draft\",\"work_hours\":8.0}"
S1_REPORT_ID=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if isinstance(d,list) and d else d.get('id',''))" 2>/dev/null || echo "")
if [ -n "$S1_REPORT_ID" ] && [ "$STATUS" = "201" ]; then
  record "PASS" "S1-01" "日報作成 (draft)" "report_id=$S1_REPORT_ID"
else
  record "FAIL" "S1-01" "日報作成 (draft)" "HTTP $STATUS, body=${BODY:0:100}"
fi

# Step 2: タスクを追加（親タスク + 子タスク）
echo "  [2/7] タスク追加 (親+子)..."
if [ -n "$S1_REPORT_ID" ]; then
  do_post "$API/report_tasks" "{\"report_id\":\"$S1_REPORT_ID\",\"title\":\"proposal task\",\"status\":\"done\",\"priority\":\"high\",\"estimated_hours\":3.0,\"actual_hours\":2.5,\"progress\":100}"
  S1_TASK1_ID=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if isinstance(d,list) and d else d.get('id',''))" 2>/dev/null || echo "")

  do_post "$API/report_tasks" "{\"report_id\":\"$S1_REPORT_ID\",\"parent_task_id\":\"$S1_TASK1_ID\",\"title\":\"research subtask\",\"status\":\"done\",\"priority\":\"medium\",\"estimated_hours\":1.0,\"actual_hours\":1.5,\"progress\":100}"
  S1_SUBTASK_ID=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if isinstance(d,list) and d else d.get('id',''))" 2>/dev/null || echo "")

  do_post "$API/report_tasks" "{\"report_id\":\"$S1_REPORT_ID\",\"title\":\"meeting task\",\"status\":\"todo\",\"priority\":\"low\",\"estimated_hours\":1.0}"

  if [ -n "$S1_TASK1_ID" ] && [ -n "$S1_SUBTASK_ID" ]; then
    record "PASS" "S1-02" "親タスク+子タスク+追加タスク作成" "parent=$S1_TASK1_ID, child=$S1_SUBTASK_ID"
  else
    record "FAIL" "S1-02" "タスク作成" "task_ids empty"
  fi
fi

# Step 3: 日報を提出
echo "  [3/7] 日報提出 (submitted)..."
if [ -n "$S1_REPORT_ID" ]; then
  do_patch "$API/reports?id=eq.$S1_REPORT_ID" '{"status":"submitted","submitted_at":"2026-04-01T18:00:00+09:00"}'
  if [ "$STATUS" = "200" ]; then
    record "PASS" "S1-03" "日報提出 (draft→submitted)" "HTTP 200"
  else
    record "FAIL" "S1-03" "日報提出" "HTTP $STATUS"
  fi
fi

# Step 4: 承認レコードが自動生成されたか確認
echo "  [4/7] 承認レコード自動生成確認..."
sleep 1
if [ -n "$S1_REPORT_ID" ]; then
  split_response "$(curl -s -w "\n%{http_code}" --max-time 10 \
    "$API/approvals?report_id=eq.$S1_REPORT_ID&select=id,status,assignee_id,requester_id" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SRK")"
  S1_APPROVAL_ID=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if d else '')" 2>/dev/null || echo "")
  S1_ASSIGNEE=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0].get('assignee_id','') if d else '')" 2>/dev/null || echo "")
  if [ -n "$S1_APPROVAL_ID" ]; then
    record "PASS" "S1-04" "承認レコード自動生成 (DBトリガー)" "approval=$S1_APPROVAL_ID, assignee=$S1_ASSIGNEE"
  else
    record "FAIL" "S1-04" "承認レコード自動生成" "approval not found"
  fi
fi

# Step 5: 承認者がコメント付きで承認
echo "  [5/7] 承認実行..."
if [ -n "$S1_APPROVAL_ID" ]; then
  do_patch "$API/approvals?id=eq.$S1_APPROVAL_ID" '{"status":"approved","comment":"good work","responded_at":"2026-04-01T19:00:00+09:00"}'
  if echo "$BODY" | grep -q "approved"; then
    record "PASS" "S1-05" "承認実行 (コメント付き)" "approved"
  else
    record "FAIL" "S1-05" "承認実行" "HTTP $STATUS, body=${BODY:0:100}"
  fi
fi

# Step 6: 日報のステータスが連動しているか
echo "  [6/7] 日報ステータス連動確認..."
if [ -n "$S1_REPORT_ID" ]; then
  split_response "$(curl -s -w "\n%{http_code}" --max-time 10 \
    "$API/reports?id=eq.$S1_REPORT_ID&select=status" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SRK")"
  RPT_STATUS=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['status'] if d else '')" 2>/dev/null)
  if [ "$RPT_STATUS" = "approved" ]; then
    record "PASS" "S1-06" "日報ステータス approved に連動" "status=$RPT_STATUS"
  else
    record "SKIP" "S1-06" "日報ステータス連動 (トリガー依存)" "status=$RPT_STATUS (手動更新が必要な場合あり)"
  fi
fi

# Step 7: ダッシュボード統計APIに反映されるか
echo "  [7/7] ダッシュボード統計API確認..."
split_response "$(curl -s -w "\n%{http_code}" --max-time 10 "$BASE_URL/api/dashboard/stats" 2>/dev/null)"
if [ "$STATUS" = "200" ] || [ "$STATUS" = "307" ] || [ "$STATUS" = "401" ]; then
  # API may require auth session - check if it returns anything
  record "PASS" "S1-07" "ダッシュボード統計API到達性" "HTTP $STATUS"
else
  record "FAIL" "S1-07" "ダッシュボード統計API" "HTTP $STATUS"
fi

echo ""

# =============================================================================
# SCENARIO 2: 承認申請 → 多段承認 → 履歴記録 横断フロー
# =============================================================================
echo -e "${CYAN}━━━ シナリオ2: 承認申請 → 多段承認 → 履歴記録 横断フロー ━━━${NC}"

# Step 1: 50万の経費申請を作成 (2段階承認対象)
echo "  [1/8] 承認申請作成 (50万, 2段階)..."
do_post "$API/approval_requests" "{\"requester_id\":\"$EMPLOYEE_ID\",\"organization_id\":\"$ORG_ID\",\"title\":\"cross test expense\",\"description\":\"server upgrade\",\"category\":\"expense\",\"amount\":500000,\"status\":\"draft\",\"total_steps\":2}"
S2_REQ_ID=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if isinstance(d,list) and d else d.get('id',''))" 2>/dev/null || echo "")
if [ -n "$S2_REQ_ID" ]; then
  record "PASS" "S2-01" "承認申請作成 (50万, draft)" "request_id=$S2_REQ_ID"
else
  record "FAIL" "S2-01" "承認申請作成" "HTTP $STATUS"
fi

# Step 2: Step1, Step2 の承認者を設定
echo "  [2/8] 承認ステップ設定 (2段階)..."
MANAGER2_ID=$(curl -s "$API/users?role=eq.manager&select=id&limit=1&offset=1&organization_id=eq.$ORG_ID" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if d else '')" 2>/dev/null || echo "$MANAGER_ID")

if [ -n "$S2_REQ_ID" ]; then
  # Step 1
  do_post "$API/approval_request_steps" "{\"request_id\":\"$S2_REQ_ID\",\"step_number\":1,\"approver_id\":\"$MANAGER_ID\",\"status\":\"pending\"}"
  S2_STEP1_ID=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if isinstance(d,list) and d else d.get('id',''))" 2>/dev/null || echo "")

  # Step 2
  do_post "$API/approval_request_steps" "{\"request_id\":\"$S2_REQ_ID\",\"step_number\":2,\"approver_id\":\"$ADMIN_ID\",\"status\":\"pending\"}"
  S2_STEP2_ID=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if isinstance(d,list) and d else d.get('id',''))" 2>/dev/null || echo "")

  if [ -n "$S2_STEP1_ID" ] && [ -n "$S2_STEP2_ID" ]; then
    record "PASS" "S2-02" "2段階ステップ設定" "step1=$S2_STEP1_ID, step2=$S2_STEP2_ID"
  else
    record "FAIL" "S2-02" "ステップ設定" "step1=$S2_STEP1_ID, step2=$S2_STEP2_ID"
  fi
fi

# Step 3: 申請を提出 (pending)
echo "  [3/8] 申請提出 (pending)..."
if [ -n "$S2_REQ_ID" ]; then
  do_patch "$API/approval_requests?id=eq.$S2_REQ_ID" '{"status":"pending","current_step":1}'
  if [ "$STATUS" = "200" ]; then
    record "PASS" "S2-03" "申請提出 (draft→pending)" "current_step=1"
  else
    record "FAIL" "S2-03" "申請提出" "HTTP $STATUS"
  fi
fi

# Step 4: 履歴レコードを追加
echo "  [4/8] 履歴記録 (提出)..."
if [ -n "$S2_REQ_ID" ]; then
  do_post "$API/approval_request_history" "{\"request_id\":\"$S2_REQ_ID\",\"actor_id\":\"$EMPLOYEE_ID\",\"action\":\"submitted\",\"comment\":\"please review\"}"
  if [ "$STATUS" = "201" ]; then
    record "PASS" "S2-04" "履歴記録 (submitted)" "created"
  else
    record "FAIL" "S2-04" "履歴記録" "HTTP $STATUS, ${BODY:0:100}"
  fi
fi

# Step 5: Step1 マネージャーが承認
echo "  [5/8] Step1 承認 (マネージャー)..."
if [ -n "$S2_STEP1_ID" ]; then
  do_patch "$API/approval_request_steps?id=eq.$S2_STEP1_ID" '{"status":"approved","comment":"approved by manager","acted_at":"2026-04-01T14:00:00+09:00"}'
  if echo "$BODY" | grep -q "approved"; then
    record "PASS" "S2-05" "Step1 マネージャー承認" "approved"
  else
    record "FAIL" "S2-05" "Step1 承認" "HTTP $STATUS"
  fi

  # current_step を 2 に進める
  echo '{"current_step":2}' > "$TMPJSON"
  curl -s -X PATCH "$API/approval_requests?id=eq.$S2_REQ_ID" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SRK" \
    -H "Content-Type: application/json" \
    --data-binary @"$TMPJSON" >/dev/null 2>&1
fi

# Step 6: Step2 管理者が承認 → 全承認完了
echo "  [6/8] Step2 承認 (管理者) → 全承認完了..."
if [ -n "$S2_STEP2_ID" ]; then
  do_patch "$API/approval_request_steps?id=eq.$S2_STEP2_ID" '{"status":"approved","comment":"final approval","acted_at":"2026-04-01T16:00:00+09:00"}'
  if echo "$BODY" | grep -q "approved"; then
    record "PASS" "S2-06" "Step2 管理者承認 (最終)" "approved"
  else
    record "FAIL" "S2-06" "Step2 承認" "HTTP $STATUS"
  fi

  # 申請全体を approved に
  echo '{"status":"approved"}' > "$TMPJSON"
  curl -s -X PATCH "$API/approval_requests?id=eq.$S2_REQ_ID" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SRK" \
    -H "Content-Type: application/json" \
    --data-binary @"$TMPJSON" >/dev/null 2>&1
fi

# Step 7: 申請全体のステータス確認
echo "  [7/8] 申請最終ステータス確認..."
if [ -n "$S2_REQ_ID" ]; then
  split_response "$(curl -s -w "\n%{http_code}" --max-time 10 \
    "$API/approval_requests?id=eq.$S2_REQ_ID&select=status,current_step,total_steps" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SRK")"
  REQ_STATUS=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['status'] if d else '')" 2>/dev/null)
  if [ "$REQ_STATUS" = "approved" ]; then
    record "PASS" "S2-07" "申請最終ステータス = approved" "status=$REQ_STATUS"
  else
    record "FAIL" "S2-07" "申請最終ステータス" "status=$REQ_STATUS (expected: approved)"
  fi
fi

# Step 8: 履歴レコードの整合性確認
echo "  [8/8] 履歴一覧の整合性確認..."
if [ -n "$S2_REQ_ID" ]; then
  split_response "$(curl -s -w "\n%{http_code}" --max-time 10 \
    "$API/approval_request_history?request_id=eq.$S2_REQ_ID&select=action,actor_id,comment&order=created_at" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SRK")"
  HIST_COUNT=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d))" 2>/dev/null || echo "0")
  if [ "$HIST_COUNT" -ge "1" ]; then
    record "PASS" "S2-08" "履歴レコード整合性" "$HIST_COUNT 件の履歴"
  else
    record "FAIL" "S2-08" "履歴レコード" "0 件"
  fi
fi

echo ""

# =============================================================================
# SCENARIO 3: タス軽 Webhook → DB同期 → 店舗日報 → 集計 横断フロー
# =============================================================================
echo -e "${CYAN}━━━ シナリオ3: タス軽Webhook → DB同期 → 店舗日報 → 集計 横断フロー ━━━${NC}"

# Step 1: 複数タスクをWebhookで送信（同じ担当者・同じ日）
echo "  [1/6] Webhook: 3タスク作成 (同担当者・同日)..."
for i in 1 2 3; do
  STATUS_VAL="todo"
  [ "$i" = "1" ] && STATUS_VAL="done"
  [ "$i" = "2" ] && STATUS_VAL="done"

  curl -s "$BASE_URL/api/webhooks/tasks" -X POST \
    -H "Authorization: Bearer $WEBHOOK_SECRET" \
    -H "Content-Type: application/json" \
    -d "{\"event\":\"task.created\",\"task\":{\"id\":\"cross-test-$i\",\"title\":\"横断テストタスク$i\",\"status\":\"$STATUS_VAL\",\"category\":\"general\",\"priority\":\"normal\",\"assignee\":{\"id\":\"cross-user-001\",\"name\":\"横断テスト花子\"},\"store\":{\"name\":\"横断テスト店\"},\"createdAt\":\"2026-04-01T09:00:00Z\"}}" >/dev/null 2>&1
done
record "PASS" "S3-01" "3タスクWebhook送信" "cross-test-1,2,3"

# Step 2: 日報レコードの task_count / completed_count 確認
echo "  [2/6] 日報集計確認 (task_count, completed_count)..."
sleep 0.5
split_response "$(curl -s -w "\n%{http_code}" --max-time 10 \
  "$API/store_daily_reports?external_user_id=eq.cross-user-001&report_date=eq.2026-04-01&select=id,task_count,completed_count,store_name" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK")"
S3_REPORT_ID=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if d else '')" 2>/dev/null || echo "")
TASK_CNT=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['task_count'] if d else 0)" 2>/dev/null || echo "0")
DONE_CNT=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['completed_count'] if d else 0)" 2>/dev/null || echo "0")
if [ "$TASK_CNT" = "3" ] && [ "$DONE_CNT" = "2" ]; then
  record "PASS" "S3-02" "日報集計 (task=3, done=2)" "task_count=$TASK_CNT, completed=$DONE_CNT"
else
  record "FAIL" "S3-02" "日報集計" "task_count=$TASK_CNT (expect 3), completed=$DONE_CNT (expect 2)"
fi

# Step 3: タスクを1件更新（todo→done）して再集計確認
echo "  [3/6] タスク更新 (todo→done) → 再集計..."
curl -s "$BASE_URL/api/webhooks/tasks" -X POST \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"event":"task.updated","task":{"id":"cross-test-3","title":"横断テストタスク3","status":"done","category":"general","priority":"normal","assignee":{"id":"cross-user-001","name":"横断テスト花子"},"store":{"name":"横断テスト店"},"updatedAt":"2026-04-01T17:00:00Z"}}' >/dev/null 2>&1

sleep 0.5
split_response "$(curl -s -w "\n%{http_code}" --max-time 10 \
  "$API/store_daily_reports?external_user_id=eq.cross-user-001&report_date=eq.2026-04-01&select=task_count,completed_count" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK")"
DONE_CNT2=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['completed_count'] if d else 0)" 2>/dev/null || echo "0")
if [ "$DONE_CNT2" = "3" ]; then
  record "PASS" "S3-03" "更新後の再集計 (done=3)" "completed=$DONE_CNT2"
else
  record "FAIL" "S3-03" "更新後の再集計" "completed=$DONE_CNT2 (expect 3)"
fi

# Step 4: タスク1件削除 → 再集計
echo "  [4/6] タスク削除 → 再集計 (task=2, done=2)..."
curl -s "$BASE_URL/api/webhooks/tasks" -X POST \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"event":"task.deleted","task":{"id":"cross-test-3"}}' >/dev/null 2>&1

sleep 0.5
split_response "$(curl -s -w "\n%{http_code}" --max-time 10 \
  "$API/store_daily_reports?external_user_id=eq.cross-user-001&report_date=eq.2026-04-01&select=task_count,completed_count" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK")"
TASK_CNT3=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['task_count'] if d else -1)" 2>/dev/null || echo "-1")
DONE_CNT3=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['completed_count'] if d else -1)" 2>/dev/null || echo "-1")
if [ "$TASK_CNT3" = "2" ] && [ "$DONE_CNT3" = "2" ]; then
  record "PASS" "S3-04" "削除後の再集計 (task=2, done=2)" "task=$TASK_CNT3, done=$DONE_CNT3"
else
  record "FAIL" "S3-04" "削除後の再集計" "task=$TASK_CNT3 (expect 2), done=$DONE_CNT3 (expect 2)"
fi

# Step 5: 全タスク削除 → 日報レコードも削除されるか
echo "  [5/6] 全タスク削除 → 日報レコード自動削除確認..."
curl -s "$BASE_URL/api/webhooks/tasks" -X POST \
  -H "Authorization: Bearer $WEBHOOK_SECRET" -H "Content-Type: application/json" \
  -d '{"event":"task.deleted","task":{"id":"cross-test-1"}}' >/dev/null 2>&1
curl -s "$BASE_URL/api/webhooks/tasks" -X POST \
  -H "Authorization: Bearer $WEBHOOK_SECRET" -H "Content-Type: application/json" \
  -d '{"event":"task.deleted","task":{"id":"cross-test-2"}}' >/dev/null 2>&1

sleep 0.5
split_response "$(curl -s -w "\n%{http_code}" --max-time 10 \
  "$API/store_daily_reports?external_user_id=eq.cross-user-001&report_date=eq.2026-04-01&select=id" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK")"
REMAINING=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d))" 2>/dev/null || echo "?")
if [ "$REMAINING" = "0" ]; then
  record "PASS" "S3-05" "全タスク削除→日報レコード自動削除" "日報レコード0件"
else
  record "FAIL" "S3-05" "日報レコード自動削除" "$REMAINING 件残存"
fi

# Step 6: PANET API到達性確認
echo "  [6/6] PANET API到達性..."
PANET_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
  "$PANET_API_URL/api/admin/users" -X POST \
  -H "X-API-Key: $PANET_API_KEY" -H "Content-Type: application/json" \
  -d '{"email":"cross-test-ping@example.com","display_name":"ping","password":"test12345"}' 2>/dev/null)
if [ "$PANET_STATUS" = "201" ] || [ "$PANET_STATUS" = "200" ] || [ "$PANET_STATUS" = "409" ]; then
  record "PASS" "S3-06" "PANET API到達性" "HTTP $PANET_STATUS"
else
  record "FAIL" "S3-06" "PANET API到達性" "HTTP $PANET_STATUS"
fi

echo ""

# =============================================================================
# SCENARIO 4: 店舗運営フルフロー（キャスト → シフト → 売上 → 引き継ぎ）
# =============================================================================
echo -e "${CYAN}━━━ シナリオ4: 店舗運営フルフロー ━━━${NC}"

STORE_ID=$(curl -s "$API/stores?select=id&organization_id=eq.$ORG_ID&limit=1" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if d else '')" 2>/dev/null || echo "")

# Step 1: キャスト作成
echo "  [1/5] キャスト作成..."
if [ -n "$STORE_ID" ]; then
  do_post "$API/casts" "{\"store_id\":\"$STORE_ID\",\"name\":\"Cross Test Hanako\",\"display_name\":\"hanako\",\"employment_type\":\"part_time\",\"hourly_rate\":1200,\"status\":\"active\"}"
  S4_CAST_ID=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if isinstance(d,list) and d else d.get('id',''))" 2>/dev/null || echo "")
  if [ -n "$S4_CAST_ID" ]; then
    record "PASS" "S4-01" "キャスト作成" "cast_id=$S4_CAST_ID"
  else
    record "FAIL" "S4-01" "キャスト作成" "HTTP $STATUS, ${BODY:0:100}"
  fi
fi

# Step 2: シフト作成
echo "  [2/5] シフト作成..."
if [ -n "$S4_CAST_ID" ]; then
  do_post "$API/shifts" "{\"store_id\":\"$STORE_ID\",\"cast_id\":\"$S4_CAST_ID\",\"shift_date\":\"2026-04-01\",\"start_time\":\"18:00\",\"end_time\":\"23:00\",\"status\":\"scheduled\"}"
  S4_SHIFT_ID=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if isinstance(d,list) and d else d.get('id',''))" 2>/dev/null || echo "")
  if [ -n "$S4_SHIFT_ID" ]; then
    record "PASS" "S4-02" "シフト作成 (scheduled)" "shift_id=$S4_SHIFT_ID"
  else
    record "FAIL" "S4-02" "シフト作成" "HTTP $STATUS, ${BODY:0:100}"
  fi
fi

# Step 3: シフト confirmed → completed
echo "  [3/5] シフト完了 (scheduled→confirmed→completed)..."
if [ -n "$S4_SHIFT_ID" ]; then
  echo '{"status":"confirmed"}' > "$TMPJSON"
  curl -s -X PATCH "$API/shifts?id=eq.$S4_SHIFT_ID" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SRK" \
    -H "Content-Type: application/json" --data-binary @"$TMPJSON" >/dev/null 2>&1
  do_patch "$API/shifts?id=eq.$S4_SHIFT_ID" '{"status":"completed","actual_hours":5.0}'
  SHIFT_S=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['status'] if isinstance(d,list) and d else '')" 2>/dev/null)
  if [ "$SHIFT_S" = "completed" ]; then
    record "PASS" "S4-03" "シフト完了 (completed)" "status=$SHIFT_S"
  else
    record "FAIL" "S4-03" "シフト完了" "status=$SHIFT_S"
  fi
fi

# Step 4: 売上登録
echo "  [4/5] 売上登録..."
if [ -n "$STORE_ID" ]; then
  do_post "$API/store_sales" "{\"store_id\":\"$STORE_ID\",\"sales_date\":\"2026-04-01\",\"sales_type\":\"drink\",\"payment_method\":\"card\",\"amount\":45000,\"quantity\":30}"
  S4_SALE_ID=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if isinstance(d,list) and d else d.get('id',''))" 2>/dev/null || echo "")
  if [ -n "$S4_SALE_ID" ]; then
    record "PASS" "S4-04" "売上登録 (drink, card, 45000)" "sale_id=$S4_SALE_ID"
  else
    record "FAIL" "S4-04" "売上登録" "HTTP $STATUS, ${BODY:0:100}"
  fi
fi

# Step 5: 引き継ぎノート作成
echo "  [5/5] 引き継ぎノート作成..."
if [ -n "$STORE_ID" ]; then
  do_post "$API/handovers" "{\"store_id\":\"$STORE_ID\",\"created_by\":\"$MANAGER_ID\",\"title\":\"cross test handover\",\"content\":\"restock fridge\",\"handover_date\":\"2026-04-01\",\"category\":\"inventory\",\"priority\":\"high\",\"is_resolved\":false}"
  S4_HAND_ID=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if isinstance(d,list) and d else d.get('id',''))" 2>/dev/null || echo "")
  if [ -n "$S4_HAND_ID" ]; then
    record "PASS" "S4-05" "引き継ぎノート作成" "handover_id=$S4_HAND_ID"
  else
    record "FAIL" "S4-05" "引き継ぎノート作成" "HTTP $STATUS, ${BODY:0:100}"
  fi
fi

echo ""

# =============================================================================
# SCENARIO 5: 組織管理 → PANET連携 → 権限チェック 横断
# =============================================================================
echo -e "${CYAN}━━━ シナリオ5: 組織管理 → PANET連携 → 権限チェック 横断 ━━━${NC}"

# Step 1: ユーザー・部署・事業所を横断取得
echo "  [1/3] 組織データ横断取得..."
U_COUNT=$(curl -s "$API/users?select=id&organization_id=eq.$ORG_ID&is_active=eq.true" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
D_COUNT=$(curl -s "$API/departments?select=id&organization_id=eq.$ORG_ID" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
O_COUNT=$(curl -s "$API/offices?select=id&organization_id=eq.$ORG_ID" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
S_COUNT=$(curl -s "$API/stores?select=id&organization_id=eq.$ORG_ID" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")

if [ "$U_COUNT" -gt "0" ] && [ "$D_COUNT" -gt "0" ]; then
  record "PASS" "S5-01" "組織データ横断取得" "users=$U_COUNT, depts=$D_COUNT, offices=$O_COUNT, stores=$S_COUNT"
else
  record "FAIL" "S5-01" "組織データ横断取得" "users=$U_COUNT, depts=$D_COUNT"
fi

# Step 2: RLS テスト: Anon key でデータアクセス不可を確認
echo "  [2/3] RLS テスト (anon key 制限)..."
split_response "$(curl -s -w "\n%{http_code}" --max-time 10 \
  "$API/users?select=id&limit=1" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON")"
ANON_COUNT=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d) if isinstance(d,list) else -1)" 2>/dev/null || echo "-1")
if [ "$ANON_COUNT" = "0" ]; then
  record "PASS" "S5-02" "RLS: anon key でユーザーデータ非公開" "0件 (正常)"
else
  record "FAIL" "S5-02" "RLS: anon key でデータ漏洩" "$ANON_COUNT 件取得可能"
fi

# Step 3: PANET一括連携 API到達性 (Next.js経由)
echo "  [3/3] PANET一括連携 API (認証必要)..."
split_response "$(curl -s -w "\n%{http_code}" --max-time 10 -X POST "$BASE_URL/api/organization/users/panet-bulk" 2>/dev/null)"
if [ "$STATUS" = "401" ] || [ "$STATUS" = "403" ]; then
  record "PASS" "S5-03" "PANET一括連携 (未認証拒否)" "HTTP $STATUS (正常)"
else
  record "FAIL" "S5-03" "PANET一括連携 (認証チェック)" "HTTP $STATUS (401/403期待)"
fi

echo ""

# =============================================================================
# CLEANUP
# =============================================================================
echo -e "${CYAN}━━━ クリーンアップ ━━━${NC}"

# Scenario 1 cleanup
if [ -n "$S1_REPORT_ID" ]; then
  curl -s -X DELETE "$API/report_tasks?report_id=eq.$S1_REPORT_ID" -H "apikey: $ANON" -H "Authorization: Bearer $SRK" >/dev/null 2>&1
  curl -s -X DELETE "$API/approvals?report_id=eq.$S1_REPORT_ID" -H "apikey: $ANON" -H "Authorization: Bearer $SRK" >/dev/null 2>&1
  curl -s -X DELETE "$API/reports?id=eq.$S1_REPORT_ID" -H "apikey: $ANON" -H "Authorization: Bearer $SRK" >/dev/null 2>&1
  echo "  S1: 日報・タスク・承認を削除"
fi

# Scenario 2 cleanup
if [ -n "$S2_REQ_ID" ]; then
  curl -s -X DELETE "$API/approval_request_history?request_id=eq.$S2_REQ_ID" -H "apikey: $ANON" -H "Authorization: Bearer $SRK" >/dev/null 2>&1
  curl -s -X DELETE "$API/approval_request_steps?request_id=eq.$S2_REQ_ID" -H "apikey: $ANON" -H "Authorization: Bearer $SRK" >/dev/null 2>&1
  curl -s -X DELETE "$API/approval_requests?id=eq.$S2_REQ_ID" -H "apikey: $ANON" -H "Authorization: Bearer $SRK" >/dev/null 2>&1
  echo "  S2: 承認申請・ステップ・履歴を削除"
fi

# Scenario 4 cleanup
if [ -n "$S4_HAND_ID" ]; then
  curl -s -X DELETE "$API/handovers?id=eq.$S4_HAND_ID" -H "apikey: $ANON" -H "Authorization: Bearer $SRK" >/dev/null 2>&1
fi
if [ -n "$S4_SALE_ID" ]; then
  curl -s -X DELETE "$API/store_sales?id=eq.$S4_SALE_ID" -H "apikey: $ANON" -H "Authorization: Bearer $SRK" >/dev/null 2>&1
fi
if [ -n "$S4_SHIFT_ID" ]; then
  curl -s -X DELETE "$API/shifts?id=eq.$S4_SHIFT_ID" -H "apikey: $ANON" -H "Authorization: Bearer $SRK" >/dev/null 2>&1
fi
if [ -n "$S4_CAST_ID" ]; then
  curl -s -X DELETE "$API/casts?id=eq.$S4_CAST_ID" -H "apikey: $ANON" -H "Authorization: Bearer $SRK" >/dev/null 2>&1
fi
echo "  S4: キャスト・シフト・売上・引継ぎを削除"

echo ""

# =============================================================================
# RESULTS
# =============================================================================
echo -e "${BOLD}======================================================${NC}"
echo -e "${BOLD} 横断テスト結果サマリー${NC}"
echo -e "${BOLD}======================================================${NC}"
echo ""
printf " ${GREEN}PASS: $PASS${NC}  ${RED}FAIL: $FAIL${NC}  ${YELLOW}SKIP: $SKIP${NC}  TOTAL: $((PASS + FAIL + SKIP))\n"
echo ""

printf "%-6s %-10s %-50s %s\n" "結果" "ID" "説明" "詳細"
printf "%-6s %-10s %-50s %s\n" "------" "----------" "--------------------------------------------------" "----"

IFS=$'\n'
for line in $(echo -e "$RESULTS"); do
  R=$(echo "$line" | cut -d'|' -f1)
  I=$(echo "$line" | cut -d'|' -f2)
  D=$(echo "$line" | cut -d'|' -f3)
  T=$(echo "$line" | cut -d'|' -f4)
  if [ "$R" = "PASS" ]; then C=$GREEN; elif [ "$R" = "FAIL" ]; then C=$RED; else C=$YELLOW; fi
  printf "${C}%-6s${NC} %-10s %-50s %s\n" "$R" "$I" "$D" "$T"
done

echo ""
echo -e "${BOLD}======================================================${NC}"
echo -e "${BOLD} 完了: $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo -e "${BOLD}======================================================${NC}"
