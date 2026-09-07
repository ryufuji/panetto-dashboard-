#!/usr/bin/env python3
"""docs/外部連携API仕様書.md の各記述を実際の API に対して検証する。
使い方: python3 scripts/verify-external-api.py [BASE_URL]  （省略時は本番。ローカルは http://localhost:3000）
テストデータは 2099 年日付で作成し、終了時に必ず削除する。"""
import json, os, sys, urllib.request, urllib.error

# ---- env ----
env = {}
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env.local')) as f:
    for line in f:
        line = line.strip()
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            env[k] = v.strip().strip('"').strip("'")
REST = env['NEXT_PUBLIC_SUPABASE_URL'] + '/rest/v1'
SRK = env['SUPABASE_SERVICE_ROLE_KEY']
ANON = env['NEXT_PUBLIC_SUPABASE_ANON_KEY']
BASE = sys.argv[1] if len(sys.argv) > 1 else 'https://panetto-dashboard.vercel.app'

def rest(method, path, body=None, prefer=None):
    req = urllib.request.Request(REST + path, method=method,
        headers={'apikey': ANON, 'Authorization': 'Bearer ' + SRK, 'Content-Type': 'application/json',
                 **({'Prefer': prefer} if prefer else {})},
        data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            t = r.read().decode(); return r.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        t = e.read().decode(); return e.code, (json.loads(t) if t else None)

def api(method, path, body=None, token=None, raw=None):
    headers = {'Content-Type': 'application/json'}
    if token: headers['Authorization'] = 'Bearer ' + token
    data = raw.encode() if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(BASE + path, method=method, headers=headers, data=data)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            t = r.read().decode(); return r.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        t = e.read().decode()
        try: return e.code, json.loads(t)
        except Exception: return e.code, t[:200]

results = []
def check(sec, claim, ok, detail=''):
    results.append((sec, claim, bool(ok), detail))

created_ids = []
try:
    # ---- pick a user with api_token ----
    s, users = rest('GET', '/users?api_token=not.is.null&select=id,api_token,organization_id,name&limit=1')
    assert users, 'api_token を持つユーザーがいない'
    U = users[0]; TOKEN = U['api_token']; UID = U['id']; ORG = U['organization_id']
    D1, D2, D3 = '2099-12-31', '2099-12-30', '2099-12-29'

    # ===== 2. 認証 =====
    s, b = api('POST', '/api/external/draft', {'report_date': D1})
    check('2', 'Bearer なし → 401', s == 401, f'{s}')
    s, b = api('POST', '/api/external/draft', {'report_date': D1}, token='00000000-0000-0000-0000-000000000000')
    check('2', '不正トークン → 401', s == 401, f'{s}')
    s, b = api('GET', '/api/external/token')
    check('2', 'GET /token セッションなし → 401', s == 401, f'{s}')

    # ===== 3. 共通 =====
    s, b = api('POST', '/api/external/draft', raw='{not json', token=TOKEN)
    check('3', 'JSON でないボディ → 400', s == 400, f'{s} {b}')
    s, b = api('POST', '/api/external/draft', {'title': 'x'}, token=TOKEN)
    check('3', 'report_date なし → 400', s == 400, f'{s}')
    s, b = api('POST', '/api/external/draft', {'report_date': '2026/09/07'}, token=TOKEN)
    check('3', 'report_date 形式不正 (2026/09/07) → 400', s == 400, f'{s}')
    s, b = api('POST', '/api/external/draft', {'report_date': '2026-02-30'}, token=TOKEN)
    check('3', 'report_date 暦日不正 (2026-02-30) → 400', s == 400, f'{s} {b}')
    if s in (200, 201): created_ids.append(b.get('report_id'))

    # ===== 4. GET /reports =====
    s, b = api('GET', '/api/external/reports?from=2026-1-1', token=TOKEN)
    check('4', 'from 形式不正 → 400', s == 400, f'{s}')
    s, b = api('GET', '/api/external/reports?to=2026-02-30', token=TOKEN)
    check('4', 'to 暦日不正 (2026-02-30) → 400', s == 400, f'{s} {b}')
    s, b = api('GET', '/api/external/reports?limit=999&offset=-5', token=TOKEN)
    check('4', 'limit=999 → 200 に丸め込み', s == 200 and b.get('limit') == 200, f'{s} limit={b.get("limit") if isinstance(b, dict) else b}')
    check('4', 'offset=-5 → 0 に丸め込み', s == 200 and b.get('offset') == 0, f'offset={b.get("offset") if isinstance(b, dict) else b}')
    s, b = api('GET', '/api/external/reports?limit=0', token=TOKEN)
    check('4', 'limit=0 → 1 に丸め込み', s == 200 and b.get('limit') == 1, f'limit={b.get("limit") if isinstance(b, dict) else b}')
    s, b = api('GET', '/api/external/reports?from=2026-01-01&limit=200&include=tasks', token=TOKEN)
    rows = b.get('data', []) if isinstance(b, dict) else []
    check('4', 'レスポンス形状 {data,total,limit,offset}', s == 200 and all(k in b for k in ('data', 'total', 'limit', 'offset')), f'{s} keys={list(b.keys()) if isinstance(b, dict) else b}')
    if rows:
        check('4', '返却は submitted/approved のみ', all(r['status'] in ('submitted', 'approved') for r in rows), f'{sorted(set(r["status"] for r in rows))} n={len(rows)}')
        check('4', 'user:{name,email} 埋め込み', all(isinstance(r.get('user'), dict) and 'name' in r['user'] and 'email' in r['user'] for r in rows), '')
        check('4', 'include=tasks で tasks/planned_tasks 配列', all(isinstance(r.get('tasks'), list) and isinstance(r.get('planned_tasks'), list) for r in rows), '')
        check('4', '自組織の全ユーザー分（複数 user_id）', len(set(r['user_id'] for r in rows)) > 1, f'distinct users={len(set(r["user_id"] for r in rows))}')
        check('4', '日付降順', all(rows[i]['report_date'] >= rows[i+1]['report_date'] for i in range(len(rows)-1)), '')
        EXPECTED_COLS = {'created_at','department_id','end_time','id','lineworks_notified_at','next_day_plan','organization_id','progress_rate','report_date','start_time','status','submitted_at','template_id','title','updated_at','user_id','work_hours'}
        got = set(rows[0].keys()) - {'user', 'tasks', 'planned_tasks'}
        check('4', 'reports の 17 列がそのまま返る（summary/issues 等は列自体が無い）', got == EXPECTED_COLS, f'diff={sorted(got ^ EXPECTED_COLS)}')
    else:
        check('4', '（データなしのため返却内容の検証スキップ）', True, 'rows=0')

    # ===== 6. POST /draft: 新規作成 + 正規化 =====
    body = {
        'report_date': D1, 'title': '検証', 'start_time': '09:00', 'end_time': '18:30', 'work_hours': '8',
        'next_day_plan': 'plan', 'summary': 'SHOULD_BE_IGNORED', 'issues': 'SHOULD_BE_IGNORED',
        'work_location': 'office', 'condition': 'good', 'foo': 1, 'estimated_hour': 99,
        'tasks': [
            {'title': '  ', 'progress_rate': 150, 'priority': '高', 'estimated_hour': 5},
            {'title': 'T2', 'progress_rate': -5, 'priority': 'high', 'task_status': 'カスタム状態',
             'is_recurring': False, 'recurrence_pattern': 'weekly', 'due_date': None, 'memo': 'm2', 'purpose': 'p2',
             'children': [
                 {'title': 'C1', 'due_date': '2099-12-31', 'actual_hours': 3, 'purpose': 'cp', 'memo': 'cm', 'progress_rate': 50, 'priority': 'low', 'task_status': '完了'},
                 {'title': ''},
             ]},
            {'title': 'T3', 'is_recurring': True},
        ],
        'planned_tasks': [{'title': '', 'estimated_hours': '1.5'}, {'title': 'P2'}],
    }
    s, b = api('POST', '/api/external/draft', body, token=TOKEN)
    check('6', '新規作成 → 201, created=true', s == 201 and b.get('created') is True, f'{s} {b}')
    RID = b.get('report_id') if isinstance(b, dict) else None
    if RID: created_ids.append(RID)
    check('3', '未知キー (foo, estimated_hour) を含んでもエラーにならない', s == 201, f'{s}')

    s, rep = rest('GET', f'/reports?id=eq.{RID}&select=*')
    rep = rep[0] if rep else {}
    check('6', 'work_hours 文字列 "8" → 数値 8', rep.get('work_hours') == 8, f'{rep.get("work_hours")!r}')
    check('6', 'start_time "09:00" 保存', str(rep.get('start_time', '')).startswith('09:00'), f'{rep.get("start_time")}')
    check('6', 'summary/issues は無視される', rep.get('summary') is None and rep.get('issues') is None, f'summary={rep.get("summary")!r} issues={rep.get("issues")!r}')
    check('6', 'work_location/condition は無視される', rep.get('work_location') is None and rep.get('condition') is None, f'{rep.get("work_location")!r} {rep.get("condition")!r}')
    check('6', 'status は draft', rep.get('status') == 'draft', f'{rep.get("status")}')

    s, tasks = rest('GET', f'/report_tasks?report_id=eq.{RID}&select=*&order=parent_task_id.nullsfirst,order_index')
    parents = [t for t in tasks if not t['parent_task_id']]
    children = [t for t in tasks if t['parent_task_id']]
    parents.sort(key=lambda t: t['order_index']); children.sort(key=lambda t: t['order_index'])
    p1, p2, p3 = (parents + [{}]*3)[:3]
    check('3', 'title 空白のみ → (無題)', p1.get('title') == '(無題)', f'{p1.get("title")!r}')
    check('3', 'progress_rate 150 → 100', p1.get('progress_rate') == 100, f'{p1.get("progress_rate")}')
    check('3', 'progress_rate -5 → 0', p2.get('progress_rate') == 0, f'{p2.get("progress_rate")}')
    check('3', 'priority 「高」→ medium', p1.get('priority') == 'medium', f'{p1.get("priority")}')
    check('3', 'priority "high" はそのまま', p2.get('priority') == 'high', f'{p2.get("priority")}')
    check('3', 'task_status 未指定 → 未着手', p1.get('task_status') == '未着手', f'{p1.get("task_status")!r}')
    check('3', 'task_status 任意文字列はそのまま保存', p2.get('task_status') == 'カスタム状態', f'{p2.get("task_status")!r}')
    check('3', 'is_recurring=false なら recurrence_pattern は null（weekly を送っても）', p2.get('is_recurring') is False and p2.get('recurrence_pattern') is None, f'{p2.get("recurrence_pattern")!r}')
    check('3', 'is_recurring=true で pattern 未指定 → daily', p3.get('is_recurring') is True and p3.get('recurrence_pattern') == 'daily', f'{p3.get("recurrence_pattern")!r}')
    check('3', '未知キー estimated_hour は無視 (estimated_hours=null)', p1.get('estimated_hours') is None, f'{p1.get("estimated_hours")!r}')
    check('6', 'due_date 省略 → null', p1.get('due_date') is None, f'{p1.get("due_date")!r}')
    check('6', 'order_index は配列順 (0,1,2)', [p.get('order_index') for p in parents] == [0, 1, 2], f'{[p.get("order_index") for p in parents]}')
    check('6', 'memo/purpose 保存', p2.get('memo') == 'm2' and p2.get('purpose') == 'p2', f'{p2.get("memo")!r} {p2.get("purpose")!r}')
    c1 = next((c for c in children if c['title'] == 'C1'), {})
    c2 = next((c for c in children if c['title'] == '(無題)'), {})
    check('6', '子タスク: parent_task_id が T2 に紐づく', c1.get('parent_task_id') == p2.get('id'), '')
    check('6', '子タスク: title/memo/progress/priority/task_status 保存', c1.get('memo') == 'cm' and c1.get('progress_rate') == 50 and c1.get('priority') == 'low' and c1.get('task_status') == '完了', f'{c1.get("memo")!r} {c1.get("progress_rate")} {c1.get("priority")} {c1.get("task_status")!r}')
    check('6', '子タスク: due_date は無視 (null)', c1.get('due_date') is None, f'{c1.get("due_date")!r}')
    check('6', '子タスク: actual_hours は無視 (null)', c1.get('actual_hours') is None, f'{c1.get("actual_hours")!r}')
    check('6', '子タスク: purpose は無視 (null)', c1.get('purpose') is None, f'{c1.get("purpose")!r}')
    check('6', '子タスク: title 空 → (無題)', bool(c2), f'{[c["title"] for c in children]}')

    s, pl = rest('GET', f'/report_planned_tasks?report_id=eq.{RID}&select=*&order=order_index')
    check('6', 'planned_tasks: title 空 → (無題), estimated_hours "1.5" → 1.5', pl and pl[0]['title'] == '(無題)' and pl[0]['estimated_hours'] == 1.5, f'{[(p["title"], p["estimated_hours"]) for p in pl]}')
    check('6', 'planned_tasks: order_index 配列順', [p['order_index'] for p in pl] == [0, 1], f'{[p["order_index"] for p in pl]}')

    # ===== 6.3 上書き =====
    s, b = api('POST', '/api/external/draft', {'report_date': D1, 'start_time': '10:00'}, token=TOKEN)
    check('6.3', '同日再POST → 200, created=false', s == 200 and b.get('created') is False, f'{s} {b}')
    check('6.3', '再POSTで同じ report_id', b.get('report_id') == RID, '')
    s, rep = rest('GET', f'/reports?id=eq.{RID}&select=title,start_time,work_hours,next_day_plan'); rep = rep[0]
    check('6.3', '本体項目: 省略した title/work_hours/next_day_plan は null になる', rep['title'] is None and rep['work_hours'] is None and rep['next_day_plan'] is None, f'{rep}')
    check('6.3', '本体項目: 送った start_time は上書き', str(rep['start_time']).startswith('10:00'), f'{rep["start_time"]}')
    s, tasks = rest('GET', f'/report_tasks?report_id=eq.{RID}&select=id')
    check('6.3', 'tasks キー省略 → 既存タスク 5 件はそのまま', len(tasks) == 5, f'n={len(tasks)}')
    s, pl = rest('GET', f'/report_planned_tasks?report_id=eq.{RID}&select=id')
    check('6.3', 'planned_tasks キー省略 → 既存 2 件そのまま', len(pl) == 2, f'n={len(pl)}')

    s, b = api('POST', '/api/external/draft', {'report_date': D1, 'tasks': [{'title': 'ONLY'}], 'planned_tasks': []}, token=TOKEN)
    s, tasks = rest('GET', f'/report_tasks?report_id=eq.{RID}&select=title')
    check('6.3', 'tasks 配列送信 → 全置換（子含め削除、ONLY のみ）', [t['title'] for t in tasks] == ['ONLY'], f'{[t["title"] for t in tasks]}')
    s, pl = rest('GET', f'/report_planned_tasks?report_id=eq.{RID}&select=id')
    check('6.3', 'planned_tasks [] → 全削除', len(pl) == 0, f'n={len(pl)}')

    # ===== 6.1 409 =====
    s, locked = rest('POST', '/reports', {'user_id': UID, 'organization_id': ORG, 'report_date': D2, 'status': 'submitted', 'title': 'LOCKED'}, prefer='return=representation')
    LID = locked[0]['id']; created_ids.append(LID)
    s, b = api('POST', '/api/external/draft', {'report_date': D2, 'title': 'try'}, token=TOKEN)
    check('6.1', '提出済み日付へPOST → 409', s == 409, f'{s}')
    check('6.1', '409 本文に error と report_id', isinstance(b, dict) and 'error' in b and b.get('report_id') == LID, f'{b}')
    check('6.1', '409 error 文言に「提出済み」と「編集画面」', isinstance(b, dict) and '提出済み' in b.get('error', '') and '編集画面' in b.get('error', ''), '')
    s, rows = rest('GET', f'/reports?user_id=eq.{UID}&report_date=eq.{D2}&select=id,status,title')
    check('6.1', '409 時に draft は作られず、提出済みは無傷', len(rows) == 1 and rows[0]['title'] == 'LOCKED' and rows[0]['status'] == 'submitted', f'{rows}')
    # approved も同様
    rest('PATCH', f'/reports?id=eq.{LID}', {'status': 'approved'})
    s, b = api('POST', '/api/external/draft', {'report_date': D2}, token=TOKEN)
    check('6.1', '承認済み日付へPOST → 409', s == 409, f'{s}')

    # ===== 5. GET /draft =====
    s, b = api('GET', '/api/external/draft', token=TOKEN)
    drafts = b.get('data', []) if isinstance(b, dict) else []
    mine = next((d for d in drafts if d['id'] == RID), None)
    check('5', '自分の下書き一覧に作成した draft が含まれる', mine is not None, f'{s} n={len(drafts)}')
    check('5', '一覧の項目は id,report_date,title,start_time,end_time,work_hours,next_day_plan,updated_at', mine is not None and set(mine.keys()) == {'id','report_date','title','start_time','end_time','work_hours','next_day_plan','updated_at'}, f'{sorted(mine.keys()) if mine else None}')
    check('5', '提出済み (LOCKED) は一覧に含まれない', all(d['id'] != LID for d in drafts), '')
    check('5', '最大 20 件', len(drafts) <= 20, f'n={len(drafts)}')

    # ===== 7. PATCH =====
    s, b = api('PATCH', f'/api/external/draft/{LID}', {'title': 'x'}, token=TOKEN)
    check('7', '提出済み/承認済み ID へ PATCH → 404', s == 404, f'{s}')
    s, b = api('PATCH', '/api/external/draft/00000000-0000-0000-0000-000000000000', {'title': 'x'}, token=TOKEN)
    check('7', '存在しない ID へ PATCH → 404', s == 404, f'{s}')
    s, b = api('PATCH', f'/api/external/draft/{RID}', raw='{bad', token=TOKEN)
    check('7', 'JSON でないボディ → 400', s == 400, f'{s}')
    # 直前の POST（tasks 全置換）で本体項目が null になっているため、PATCH の部分更新検証用に start_time を先に入れ直す
    api('PATCH', f'/api/external/draft/{RID}', {'start_time': '10:00'}, token=TOKEN)
    s, b = api('PATCH', f'/api/external/draft/{RID}', {'title': 'PATCHED', 'report_date': '2000-01-01'}, token=TOKEN)
    check('7', 'PATCH → 200 {ok, report_id}', s == 200 and b.get('ok') is True and b.get('report_id') == RID, f'{s} {b}')
    s, rep = rest('GET', f'/reports?id=eq.{RID}&select=title,start_time,report_date'); rep = rep[0]
    check('7', '送ったキー (title) だけ更新、省略した start_time は保持', rep['title'] == 'PATCHED' and str(rep['start_time']).startswith('10:00'), f'{rep}')
    check('7', 'report_date は変更されない', rep['report_date'] == D1, f'{rep["report_date"]}')
    s, tasks = rest('GET', f'/report_tasks?report_id=eq.{RID}&select=title')
    check('7', 'tasks 省略 → タスク不変 (ONLY)', [t['title'] for t in tasks] == ['ONLY'], f'{[t["title"] for t in tasks]}')
    s, b = api('PATCH', f'/api/external/draft/{RID}', {'tasks': [{'title': 'A'}, {'title': 'B'}], 'planned_tasks': [{'title': 'PP'}]}, token=TOKEN)
    s, tasks = rest('GET', f'/report_tasks?report_id=eq.{RID}&select=title&order=order_index')
    check('7', 'tasks 配列 → 全置換 (A,B)', [t['title'] for t in tasks] == ['A', 'B'], f'{[t["title"] for t in tasks]}')
    s, pl = rest('GET', f'/report_planned_tasks?report_id=eq.{RID}&select=title')
    check('7', 'planned_tasks 配列 → 全置換 (PP)', [p['title'] for p in pl] == ['PP'], f'{[p["title"] for p in pl]}')
    s, b = api('PATCH', f'/api/external/draft/{RID}', {'title': 'z'})
    check('7', 'Bearer なし → 401', s == 401, f'{s}')

    # ===== 8. DELETE =====
    s, b = api('DELETE', f'/api/external/draft/{LID}', token=TOKEN)
    check('8', '提出済み/承認済み ID へ DELETE → 404', s == 404, f'{s}')
    s, b = api('DELETE', f'/api/external/draft/{RID}', token=TOKEN)
    check('8', '自分の下書き DELETE → 200 {ok:true}', s == 200 and b == {'ok': True}, f'{s} {b}')
    s, rows = rest('GET', f'/reports?id=eq.{RID}&select=id')
    check('8', 'DELETE 後に reports 行が消えている', rows == [], f'{rows}')
    s, tasks = rest('GET', f'/report_tasks?report_id=eq.{RID}&select=id')
    s2, pl = rest('GET', f'/report_planned_tasks?report_id=eq.{RID}&select=id')
    check('8', '紐づく tasks/planned_tasks もカスケード削除', tasks == [] and pl == [], f'tasks={len(tasks)} planned={len(pl)}')
    if rows == []: created_ids.remove(RID)
    s, b = api('DELETE', f'/api/external/draft/{RID}', token=TOKEN)
    check('8', '削除済み ID へ再 DELETE → 404', s == 404, f'{s}')
    s, b = api('DELETE', f'/api/external/draft/{RID}')
    check('8', 'Bearer なし → 401', s == 401, f'{s}')

finally:
    # ---- cleanup ----
    for rid in created_ids:
        if rid:
            rest('DELETE', f'/report_tasks?report_id=eq.{rid}')
            rest('DELETE', f'/report_planned_tasks?report_id=eq.{rid}')
            rest('DELETE', f'/reports?id=eq.{rid}')
    s, left = rest('GET', '/reports?report_date=gte.2099-01-01&select=id')
    leftover = left if isinstance(left, list) else ['?']

# ---- report ----
npass = sum(1 for r in results if r[2]); nfail = len(results) - npass
print(f'BASE={BASE}')
print(f'PASS={npass} FAIL={nfail} TOTAL={len(results)}  leftover_2099={len(leftover)}')
print()
for sec, claim, ok, detail in results:
    mark = 'PASS' if ok else 'FAIL'
    print(f'{mark}  [{sec}] {claim}' + (f'   -- {detail}' if (not ok and detail) else ''))
