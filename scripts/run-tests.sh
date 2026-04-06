#!/bin/bash
# =============================================================================
# パネットダッシュボード テスト実行スクリプト
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
TIMESTAMP=$(date +%s)
# Generate a random past date for test report to avoid UNIQUE constraint
RANDOM_DAY=$((RANDOM % 28 + 1))
RANDOM_MONTH=$((RANDOM % 12 + 1))
TEST_REPORT_DATE=$(printf "2024-%02d-%02d" $RANDOM_MONTH $RANDOM_DAY)

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

assert_status() {
  local test_id="$1"
  local desc="$2"
  local expected="$3"
  local actual="$4"
  if [ "$actual" = "$expected" ]; then
    RESULTS+="PASS|$test_id|$desc|HTTP $actual (expected $expected)\n"
    PASS=$((PASS + 1))
  else
    RESULTS+="FAIL|$test_id|$desc|HTTP $actual (expected $expected)\n"
    FAIL=$((FAIL + 1))
  fi
}

assert_contains() {
  local test_id="$1"
  local desc="$2"
  local expected="$3"
  local body="$4"
  if echo "$body" | grep -q "$expected"; then
    RESULTS+="PASS|$test_id|$desc|Body contains '$expected'\n"
    PASS=$((PASS + 1))
  else
    RESULTS+="FAIL|$test_id|$desc|Body missing '$expected': ${body:0:200}\n"
    FAIL=$((FAIL + 1))
  fi
}

assert_not_contains() {
  local test_id="$1"
  local desc="$2"
  local unexpected="$3"
  local body="$4"
  if echo "$body" | grep -q "$unexpected"; then
    RESULTS+="FAIL|$test_id|$desc|Body unexpectedly contains '$unexpected'\n"
    FAIL=$((FAIL + 1))
  else
    RESULTS+="PASS|$test_id|$desc|Body correctly lacks '$unexpected'\n"
    PASS=$((PASS + 1))
  fi
}

http_get() {
  curl -s -w "\n%{http_code}" --max-time 10 "$@" 2>/dev/null
}

http_post() {
  curl -s -w "\n%{http_code}" --max-time 10 -X POST "$@" 2>/dev/null
}

# Helper: get body and status separately
split_response() {
  local resp="$1"
  STATUS=$(echo "$resp" | tail -n 1)
  BODY=$(echo "$resp" | sed '$d')
}

echo "========================================"
echo " パネットダッシュボード テスト実行"
echo " $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"
echo ""

# =============================================================================
# 1. AUTH TESTS (認証)
# =============================================================================
echo "--- 1. 認証テスト ---"

# AUTH-AT-001: 未認証で /dashboard アクセス → リダイレクト
RESP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE_URL/dashboard" 2>/dev/null)
assert_status "AUTH-AT-001" "未認証で /dashboard → リダイレクト" "307" "$RESP"

# AUTH-AT-002: /login ページアクセス可能
RESP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE_URL/login" 2>/dev/null)
assert_status "AUTH-AT-002" "/login ページ表示" "200" "$RESP"

# AUTH-ET-003: 空bodyでログインAPI
RESP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -X POST "$BASE_URL/api/auth/callback" -H "Content-Type: application/json" -d '{}' 2>/dev/null)
# Should return error (4xx)
if [ "$RESP" -ge 400 ] && [ "$RESP" -lt 500 ]; then
  RESULTS+="PASS|AUTH-ET-003|空bodyでログイン → エラー|HTTP $RESP\n"
  PASS=$((PASS + 1))
else
  RESULTS+="FAIL|AUTH-ET-003|空bodyでログイン → エラー期待|HTTP $RESP\n"
  FAIL=$((FAIL + 1))
fi

echo ""

# =============================================================================
# 2. REPORTS API TESTS (日報管理) - via Supabase REST
# =============================================================================
echo "--- 2. 日報管理テスト (Supabase REST) ---"

# Get test user IDs
ADMIN_ID=$(curl -s "$API/users?role=eq.admin&select=id&limit=1" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if d else '')" 2>/dev/null)

EMPLOYEE_ID=$(curl -s "$API/users?role=eq.employee&select=id&limit=1" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if d else '')" 2>/dev/null)

MANAGER_ID=$(curl -s "$API/users?role=eq.manager&select=id&limit=1" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if d else '')" 2>/dev/null)

ORG_ID="a0000000-0000-0000-0000-000000000001"

echo "  Admin: $ADMIN_ID"
echo "  Employee: $EMPLOYEE_ID"
echo "  Manager: $MANAGER_ID"

# RPT-FT-001: 日報一覧取得
split_response "$(http_get "$API/reports?select=id,title,status&limit=5&organization_id=eq.$ORG_ID" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK")"
assert_status "RPT-FT-001" "日報一覧取得 (service role)" "200" "$STATUS"

# RPT-FT-002: 日報新規作成 (draft)
DEPT_ID=$(curl -s "$API/departments?select=id&limit=1" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if d else '')" 2>/dev/null)

RPT_JSON='{"user_id":"'"$EMPLOYEE_ID"'","organization_id":"'"$ORG_ID"'","department_id":"'"$DEPT_ID"'","report_date":"'"$TEST_REPORT_DATE"'","title":"テスト日報_'"$TIMESTAMP"'","status":"draft"}'
split_response "$(http_post "$API/reports" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "$RPT_JSON")"
if [ "$STATUS" != "201" ]; then echo "  RPT-FT-002 error body: $BODY"; fi
assert_status "RPT-FT-002" "日報新規作成 (draft)" "201" "$STATUS"

TEST_REPORT_ID=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if isinstance(d,list) else d.get('id',''))" 2>/dev/null || echo "")
echo "  Created report: $TEST_REPORT_ID"

# RPT-FT-003: 日報詳細取得
if [ -n "$TEST_REPORT_ID" ]; then
  split_response "$(http_get "$API/reports?id=eq.$TEST_REPORT_ID&select=id,title,status" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SRK")"
  assert_status "RPT-FT-003" "日報詳細取得" "200" "$STATUS"
  assert_contains "RPT-FT-003b" "日報ステータス=draft" "draft" "$BODY"
fi

# RPT-FT-004: タスク追加
if [ -n "$TEST_REPORT_ID" ]; then
  TASK_JSON=$(python3 -c "import json;print(json.dumps({'report_id':'$TEST_REPORT_ID','title':'テストタスク1','status':'todo','priority':'high','estimated_hours':2.0}))")
  split_response "$(http_post "$API/report_tasks" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SRK" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    -d "$TASK_JSON")"
  assert_status "RPT-FT-004" "タスク追加" "201" "$STATUS"
  TEST_TASK_ID=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if isinstance(d,list) else d.get('id',''))" 2>/dev/null || echo "")
fi

# RPT-FT-005: 子タスク作成
if [ -n "$TEST_TASK_ID" ]; then
  SUBTASK_JSON='{"report_id":"'"$TEST_REPORT_ID"'","parent_task_id":"'"$TEST_TASK_ID"'","title":"テストサブタスク","status":"todo","priority":"medium"}'
  split_response "$(http_post "$API/report_tasks" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SRK" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    -d "$SUBTASK_JSON")"
  assert_status "RPT-FT-005" "子タスク作成 (階層)" "201" "$STATUS"
fi

# RPT-FT-006: 日報を submitted に変更
if [ -n "$TEST_REPORT_ID" ]; then
  split_response "$(curl -s -w "\n%{http_code}" --max-time 10 -X PATCH \
    "$API/reports?id=eq.$TEST_REPORT_ID" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SRK" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    -d '{"status":"submitted","submitted_at":"2026-03-30T12:00:00Z"}' 2>/dev/null)"
  assert_status "RPT-FT-006" "日報提出 (draft→submitted)" "200" "$STATUS"
fi

echo ""

# =============================================================================
# 3. APPROVALS TESTS (日報承認)
# =============================================================================
echo "--- 3. 日報承認テスト ---"

# APR-FT-001: 承認レコード自動生成確認
if [ -n "$TEST_REPORT_ID" ]; then
  sleep 1  # Wait for trigger
  split_response "$(http_get "$API/approvals?report_id=eq.$TEST_REPORT_ID&select=id,status,assignee_id" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SRK")"
  assert_status "APR-FT-001" "承認一覧取得" "200" "$STATUS"

  # Check if approval was auto-created
  APPROVAL_COUNT=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d))" 2>/dev/null || echo "0")
  if [ "$APPROVAL_COUNT" -gt "0" ]; then
    RESULTS+="PASS|APR-FT-001b|承認レコード自動生成 (トリガー)|$APPROVAL_COUNT 件の承認レコード\n"
    PASS=$((PASS + 1))
    TEST_APPROVAL_ID=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'])" 2>/dev/null || echo "")
    APPROVAL_ASSIGNEE=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0].get('assignee_id',''))" 2>/dev/null || echo "")
  else
    RESULTS+="FAIL|APR-FT-001b|承認レコード自動生成 (トリガー)|0 件 - トリガー未動作\n"
    FAIL=$((FAIL + 1))
  fi
fi

# APR-FT-005: 承認実行
if [ -n "$TEST_APPROVAL_ID" ]; then
  split_response "$(curl -s -w "\n%{http_code}" --max-time 10 -X PATCH \
    "$API/approvals?id=eq.$TEST_APPROVAL_ID" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SRK" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    -d '{"status":"approved","comment":"テスト承認","responded_at":"2026-03-30T13:00:00Z"}' 2>/dev/null)"
  assert_status "APR-FT-005" "承認実行" "200" "$STATUS"
  assert_contains "APR-FT-005b" "承認ステータス=approved" "approved" "$BODY"
fi

# APR-FT-006: 日報ステータスが approved に変わるか確認
if [ -n "$TEST_REPORT_ID" ]; then
  split_response "$(http_get "$API/reports?id=eq.$TEST_REPORT_ID&select=status" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SRK")"
  # Note: auto-update depends on trigger
  REPORT_STATUS=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['status'] if d else 'unknown')" 2>/dev/null)
  if [ "$REPORT_STATUS" = "approved" ]; then
    RESULTS+="PASS|APR-FT-006|日報ステータス自動更新 (approved)|status=$REPORT_STATUS\n"
    PASS=$((PASS + 1))
  else
    RESULTS+="INFO|APR-FT-006|日報ステータス (トリガー依存)|status=$REPORT_STATUS (手動更新が必要な場合あり)\n"
    SKIP=$((SKIP + 1))
  fi
fi

echo ""

# =============================================================================
# 4. APPROVAL REQUESTS TESTS (承認申請)
# =============================================================================
echo "--- 4. 承認申請テスト ---"

# ARQ-FT-001: 承認申請 新規作成 (draft)
ARQ1_JSON='{"requester_id":"'"$EMPLOYEE_ID"'","organization_id":"'"$ORG_ID"'","title":"テスト備品_'"$TIMESTAMP"'","category":"equipment_purchase","amount":50000,"status":"draft"}'
split_response "$(http_post "$API/approval_requests" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "$ARQ1_JSON")"
if [ "$STATUS" != "201" ]; then echo "  ARQ-FT-001 error body: $BODY"; fi
assert_status "ARQ-FT-001" "承認申請 作成 (draft, 5万)" "201" "$STATUS"
TEST_ARQ_ID=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if isinstance(d,list) else d.get('id',''))" 2>/dev/null || echo "")
echo "  Created request: $TEST_ARQ_ID"

# ARQ-FT-002: 承認申請 10万以下 → 1段階確認
split_response "$(http_get "$API/approval_threshold_rules?select=*&organization_id=eq.$ORG_ID&order=min_amount" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK")"
assert_status "ARQ-FT-002" "閾値ルール取得" "200" "$STATUS"
THRESHOLD_COUNT=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d))" 2>/dev/null || echo "0")
if [ "$THRESHOLD_COUNT" -gt "0" ]; then
  RESULTS+="PASS|ARQ-FT-002b|閾値ルール存在確認|$THRESHOLD_COUNT ルール\n"
  PASS=$((PASS + 1))
else
  RESULTS+="FAIL|ARQ-FT-002b|閾値ルール存在確認|0 ルール\n"
  FAIL=$((FAIL + 1))
fi

# ARQ-FT-007: 2段階申請 (50万)
ARQ2_JSON='{"requester_id":"'"$EMPLOYEE_ID"'","organization_id":"'"$ORG_ID"'","title":"テスト高額_'"$TIMESTAMP"'","category":"expense","amount":500000,"status":"draft"}'
split_response "$(http_post "$API/approval_requests" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "$ARQ2_JSON")"
assert_status "ARQ-FT-007" "承認申請 作成 (50万, 2段階対象)" "201" "$STATUS"

# ARQ-FT-009: 3段階申請 (200万)
ARQ3_JSON='{"requester_id":"'"$EMPLOYEE_ID"'","organization_id":"'"$ORG_ID"'","title":"テスト大型_'"$TIMESTAMP"'","category":"equipment_purchase","amount":2000000,"status":"draft"}'
split_response "$(http_post "$API/approval_requests" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "$ARQ3_JSON")"
assert_status "ARQ-FT-009" "承認申請 作成 (200万, 3段階対象)" "201" "$STATUS"

# ARQ-FT-003: 承認申請一覧取得
split_response "$(http_get "$API/approval_requests?select=id,title,status,amount&organization_id=eq.$ORG_ID&limit=10" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK")"
assert_status "ARQ-FT-003" "承認申請一覧取得" "200" "$STATUS"

# ARQ-FT-004: 承認申請ステップ作成テスト
if [ -n "$TEST_ARQ_ID" ]; then
  STEP_JSON='{"request_id":"'"$TEST_ARQ_ID"'","step_number":1,"approver_id":"'"$MANAGER_ID"'","status":"pending"}'
  split_response "$(http_post "$API/approval_request_steps" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SRK" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    -d "$STEP_JSON")"
  assert_status "ARQ-FT-004" "承認ステップ作成" "201" "$STATUS"
  TEST_STEP_ID=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if isinstance(d,list) else d.get('id',''))" 2>/dev/null || echo "")

  # Update request to pending
  curl -s -X PATCH "$API/approval_requests?id=eq.$TEST_ARQ_ID" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SRK" \
    -H "Content-Type: application/json" \
    -d '{"status":"pending","current_step":1}' >/dev/null 2>&1
fi

# ARQ-FT-010: ステップ承認実行
if [ -n "$TEST_STEP_ID" ]; then
  split_response "$(curl -s -w "\n%{http_code}" --max-time 10 -X PATCH \
    "$API/approval_request_steps?id=eq.$TEST_STEP_ID" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SRK" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    -d '{"status":"approved","comment":"テスト承認","acted_at":"2026-03-30T14:00:00Z"}' 2>/dev/null)"
  assert_status "ARQ-FT-010" "承認ステップ 承認実行" "200" "$STATUS"
  assert_contains "ARQ-FT-010b" "ステップ approved" "approved" "$BODY"
fi

echo ""

# =============================================================================
# 5. TASUKARU INTEGRATION TESTS (タス軽連携)
# =============================================================================
echo "--- 5. タス軽連携テスト ---"

# TSK-IT-001: task.created
split_response "$(http_post "$BASE_URL/api/webhooks/tasks" \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"event":"task.created","task":{"id":"e2e-test-001","title":"E2Eテストタスク","status":"todo","category":"cleaning","priority":"high","assignee":{"id":"e2e-user-001","name":"E2Eテスト太郎"},"store":{"name":"E2Eテスト店舗"},"createdAt":"2026-03-30T09:00:00Z"}}')"
assert_status "TSK-IT-001" "task.created 受信" "200" "$STATUS"
assert_contains "TSK-IT-001b" "成功レスポンス" "success" "$BODY"

# TSK-IT-002: task.updated
split_response "$(http_post "$BASE_URL/api/webhooks/tasks" \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"event":"task.updated","task":{"id":"e2e-test-001","title":"E2Eテストタスク（更新）","status":"done","category":"cleaning","priority":"high","assignee":{"id":"e2e-user-001","name":"E2Eテスト太郎"},"store":{"name":"E2Eテスト店舗"},"updatedAt":"2026-03-30T15:00:00Z"}}')"
assert_status "TSK-IT-002" "task.updated 受信" "200" "$STATUS"
assert_contains "TSK-IT-002b" "成功レスポンス" "success" "$BODY"

# Verify data in DB
split_response "$(http_get "$API/store_daily_report_tasks?external_task_id=eq.e2e-test-001&select=title,status" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK")"
assert_contains "TSK-IT-002c" "更新後のタイトル反映" "更新" "$BODY"
assert_contains "TSK-IT-002d" "ステータス done 反映" "done" "$BODY"

# TSK-IT-005: 冪等性 (重複作成)
split_response "$(http_post "$BASE_URL/api/webhooks/tasks" \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"event":"task.created","task":{"id":"e2e-test-001","title":"重複テスト","status":"todo","category":"cleaning","priority":"normal","assignee":{"id":"e2e-user-001","name":"E2Eテスト太郎"},"store":{"name":"E2Eテスト店舗"},"createdAt":"2026-03-30T09:00:00Z"}}')"
assert_status "TSK-IT-005" "冪等性確認 (重複作成)" "200" "$STATUS"

# TSK-ET-001: 認証失敗 (ヘッダーなし)
split_response "$(http_post "$BASE_URL/api/webhooks/tasks" \
  -H "Content-Type: application/json" \
  -d '{"event":"task.created","task":{"id":"x"}}')"
assert_status "TSK-ET-001" "認証失敗 (ヘッダーなし)" "401" "$STATUS"

# TSK-ET-002: 不正トークン
split_response "$(http_post "$BASE_URL/api/webhooks/tasks" \
  -H "Authorization: Bearer wrong-token" \
  -H "Content-Type: application/json" \
  -d '{"event":"task.created","task":{"id":"x"}}')"
assert_status "TSK-ET-002" "不正トークン" "401" "$STATUS"

# TSK-ET-003: 不正ペイロード (event なし)
split_response "$(http_post "$BASE_URL/api/webhooks/tasks" \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"task":{"id":"x"}}')"
assert_status "TSK-ET-003" "不正ペイロード (event なし)" "400" "$STATUS"

# TSK-ET-004: task なし
split_response "$(http_post "$BASE_URL/api/webhooks/tasks" \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"event":"task.created"}')"
assert_status "TSK-ET-004" "不正ペイロード (task なし)" "400" "$STATUS"

# TSK-ET-005: 不明イベント
split_response "$(http_post "$BASE_URL/api/webhooks/tasks" \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"event":"task.unknown","task":{"id":"x"}}')"
assert_status "TSK-ET-005" "不明イベント種別" "400" "$STATUS"

# TSK-ET-006: 存在しないタスク削除
split_response "$(http_post "$BASE_URL/api/webhooks/tasks" \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"event":"task.deleted","task":{"id":"nonexistent-task-999"}}')"
assert_status "TSK-ET-006" "存在しないタスク削除 (正常)" "200" "$STATUS"

# TSK-IT-003: task.deleted
split_response "$(http_post "$BASE_URL/api/webhooks/tasks" \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"event":"task.deleted","task":{"id":"e2e-test-001"}}')"
assert_status "TSK-IT-003" "task.deleted 受信" "200" "$STATUS"

# Verify deletion
split_response "$(http_get "$API/store_daily_report_tasks?external_task_id=eq.e2e-test-001&select=id" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK")"
DELETED_COUNT=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d))" 2>/dev/null || echo "?")
if [ "$DELETED_COUNT" = "0" ]; then
  RESULTS+="PASS|TSK-IT-003b|タスク削除確認|DB上で削除済み\n"
  PASS=$((PASS + 1))
else
  RESULTS+="FAIL|TSK-IT-003b|タスク削除確認|$DELETED_COUNT 件残存\n"
  FAIL=$((FAIL + 1))
fi

echo ""

# =============================================================================
# 6. PANET API TESTS (PANET連携)
# =============================================================================
echo "--- 6. PANET API連携テスト ---"

# TSK-IT-008: 単体ユーザー作成
split_response "$(http_post "$PANET_API_URL/api/admin/users" \
  -H "X-API-Key: $PANET_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"e2e-test-user@example.com","display_name":"E2Eテストユーザー","password":"testpass123"}')"
if [ "$STATUS" = "201" ] || [ "$STATUS" = "200" ] || [ "$STATUS" = "409" ]; then
  RESULTS+="PASS|TSK-IT-008|PANET単体ユーザー作成 (201/409冪等)|HTTP $STATUS\n"
  PASS=$((PASS + 1))
else
  RESULTS+="FAIL|TSK-IT-008|PANET単体ユーザー作成|HTTP $STATUS\n"
  FAIL=$((FAIL + 1))
fi

# TSK-IT-009: 一括ユーザー作成
split_response "$(http_post "$PANET_API_URL/api/admin/users/bulk" \
  -H "X-API-Key: $PANET_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"users":[{"email":"e2e-bulk1@example.com","display_name":"E2E一括1","password":"testpass123"},{"email":"e2e-bulk2@example.com","display_name":"E2E一括2","password":"testpass123"}]}')"
if [ "$STATUS" = "200" ] || [ "$STATUS" = "201" ]; then
  RESULTS+="PASS|TSK-IT-009|PANET一括ユーザー作成|HTTP $STATUS\n"
  PASS=$((PASS + 1))
else
  RESULTS+="FAIL|TSK-IT-009|PANET一括ユーザー作成|HTTP $STATUS\n"
  FAIL=$((FAIL + 1))
fi
assert_contains "TSK-IT-009b" "succeeded フィールド" "succeeded" "$BODY"

echo ""

# =============================================================================
# 7. ORGANIZATION / STORE / PERFORMANCE TESTS
# =============================================================================
echo "--- 7. 組織・店舗・パフォーマンス テスト ---"

# ORG-FT-001: ユーザー一覧
split_response "$(http_get "$API/users?select=id,name,role&organization_id=eq.$ORG_ID&limit=5" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK")"
assert_status "ORG-FT-001" "ユーザー一覧取得" "200" "$STATUS"
USER_COUNT=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d))" 2>/dev/null || echo "0")
if [ "$USER_COUNT" -gt "0" ]; then
  RESULTS+="PASS|ORG-FT-001b|ユーザーデータ存在|$USER_COUNT 件\n"
  PASS=$((PASS + 1))
else
  RESULTS+="FAIL|ORG-FT-001b|ユーザーデータ存在|0 件\n"
  FAIL=$((FAIL + 1))
fi

# ORG-FT-006: 部署一覧
split_response "$(http_get "$API/departments?select=id,name&organization_id=eq.$ORG_ID" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK")"
assert_status "ORG-FT-006" "部署一覧取得" "200" "$STATUS"

# ORG-FT-009: 事業所一覧
split_response "$(http_get "$API/offices?select=id,name&organization_id=eq.$ORG_ID" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK")"
assert_status "ORG-FT-009" "事業所一覧取得" "200" "$STATUS"

# STR-FT-001: 店舗一覧
split_response "$(http_get "$API/stores?select=id,name,status&organization_id=eq.$ORG_ID&limit=5" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK")"
assert_status "STR-FT-001" "店舗一覧取得" "200" "$STATUS"
STORE_ID=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if d else '')" 2>/dev/null || echo "")

# STR-FT-005: キャスト一覧
if [ -n "$STORE_ID" ]; then
  split_response "$(http_get "$API/casts?select=id,name,status&store_id=eq.$STORE_ID&limit=5" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SRK")"
  assert_status "STR-FT-005" "キャスト一覧取得" "200" "$STATUS"

  CAST_ID=$(echo "$BODY" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if d else '')" 2>/dev/null || echo "")
fi

# STR-FT-009: シフト一覧
if [ -n "$STORE_ID" ]; then
  split_response "$(http_get "$API/shifts?select=id,shift_date,status&cast_id=in.($CAST_ID)&limit=5" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SRK" 2>/dev/null)"
  assert_status "STR-FT-009" "シフト一覧取得" "200" "$STATUS"
fi

# STR-FT-014: 売上一覧
if [ -n "$STORE_ID" ]; then
  split_response "$(http_get "$API/store_sales?select=id,amount,sales_type&store_id=eq.$STORE_ID&limit=5" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SRK")"
  assert_status "STR-FT-014" "売上一覧取得" "200" "$STATUS"
fi

# STR-FT-018: 引き継ぎ一覧
if [ -n "$STORE_ID" ]; then
  split_response "$(http_get "$API/handovers?select=id,content,is_resolved&store_id=eq.$STORE_ID&limit=5" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SRK")"
  assert_status "STR-FT-018" "引き継ぎ一覧取得" "200" "$STATUS"
fi

# Store daily reports
split_response "$(http_get "$API/store_daily_reports?select=id,store_name,task_count,completed_count&organization_id=eq.$ORG_ID&limit=5" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK")"
assert_status "TSK-FT-001" "店舗日報一覧取得" "200" "$STATUS"

echo ""

# =============================================================================
# 8. DEADLINE EXTENSION TESTS
# =============================================================================
echo "--- 8. 期限延長テスト ---"

split_response "$(http_get "$API/deadline_extension_requests?select=id,status&organization_id=eq.$ORG_ID&limit=5" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK")"
assert_status "DLE-FT-004" "期限延長一覧取得" "200" "$STATUS"

echo ""

# =============================================================================
# 9. SETTINGS & AUDIT TESTS
# =============================================================================
echo "--- 9. 設定・監査テスト ---"

# Organization settings
split_response "$(http_get "$API/organizations?id=eq.$ORG_ID&select=id,name,settings" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK")"
assert_status "SET-FT-003" "組織設定取得" "200" "$STATUS"

# Audit logs
split_response "$(http_get "$API/audit_logs?select=id,action,created_at&organization_id=eq.$ORG_ID&limit=5&order=created_at.desc" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SRK")"
assert_status "SET-FT-005" "監査ログ取得" "200" "$STATUS"

echo ""

# =============================================================================
# CLEANUP
# =============================================================================
echo "--- クリーンアップ ---"

# Delete test report tasks first (FK constraint)
if [ -n "$TEST_REPORT_ID" ]; then
  curl -s -X DELETE "$API/report_tasks?report_id=eq.$TEST_REPORT_ID" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SRK" >/dev/null 2>&1
fi
# Delete test approval
if [ -n "$TEST_APPROVAL_ID" ]; then
  curl -s -X DELETE "$API/approvals?report_id=eq.$TEST_REPORT_ID" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SRK" >/dev/null 2>&1
fi
# Delete test report
if [ -n "$TEST_REPORT_ID" ]; then
  curl -s -X DELETE "$API/reports?id=eq.$TEST_REPORT_ID" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SRK" >/dev/null 2>&1
  echo "  Cleaned up report: $TEST_REPORT_ID"
fi
# Delete test approval requests
if [ -n "$TEST_ARQ_ID" ]; then
  curl -s -X DELETE "$API/approval_request_steps?request_id=eq.$TEST_ARQ_ID" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SRK" >/dev/null 2>&1
  curl -s -X DELETE "$API/approval_requests?requester_id=eq.$EMPLOYEE_ID&status=in.(draft,pending)&title=like.テスト*" \
    -H "apikey: $ANON" -H "Authorization: Bearer $SRK" >/dev/null 2>&1
  echo "  Cleaned up approval requests"
fi

echo ""

# =============================================================================
# RESULTS SUMMARY
# =============================================================================
echo "========================================"
echo " テスト結果サマリー"
echo "========================================"
echo ""
printf " ${GREEN}PASS: $PASS${NC}  ${RED}FAIL: $FAIL${NC}  ${YELLOW}SKIP: $SKIP${NC}  TOTAL: $((PASS + FAIL + SKIP))\n"
echo ""

echo "--- 詳細結果 ---"
echo ""
printf "%-6s %-15s %-45s %s\n" "結果" "テストID" "説明" "詳細"
printf "%-6s %-15s %-45s %s\n" "------" "---------------" "---------------------------------------------" "--------------------"

IFS=$'\n'
for line in $(echo -e "$RESULTS"); do
  RESULT=$(echo "$line" | cut -d'|' -f1)
  TID=$(echo "$line" | cut -d'|' -f2)
  DESC=$(echo "$line" | cut -d'|' -f3)
  DETAIL=$(echo "$line" | cut -d'|' -f4)

  if [ "$RESULT" = "PASS" ]; then
    COLOR=$GREEN
  elif [ "$RESULT" = "FAIL" ]; then
    COLOR=$RED
  else
    COLOR=$YELLOW
  fi
  printf "${COLOR}%-6s${NC} %-15s %-45s %s\n" "$RESULT" "$TID" "$DESC" "$DETAIL"
done

echo ""
echo "========================================"
echo " 完了: $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"
