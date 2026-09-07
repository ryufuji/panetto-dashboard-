# 業務日報ダッシュボード 外部連携API 仕様書

最終更新: 2026-09-07
対象バージョン: 2026-09-07 デプロイ版（`POST /api/external/draft` の 409 応答、暦日検証の修正を含む）

この文書は実装（`src/app/api/external/` および `src/lib/external-api.ts`）から起こしています。挙動に疑問がある場合はこの文書ではなく実装が正です。

---

## 1. 概要

GAS・スクリプト・BI ツールなどの外部システムから、日報の**下書き**を自動投入し、**提出済み**日報を一括取得するための API です。

| 用途 | エンドポイント |
|---|---|
| 提出済み日報の一括取得（BigQuery 取り込み等） | `GET /api/external/reports` |
| 自分の下書き一覧 | `GET /api/external/draft` |
| 下書きの作成・上書き | `POST /api/external/draft` |
| 下書きの部分更新 | `PATCH /api/external/draft/{id}` |
| 下書きの削除 | `DELETE /api/external/draft/{id}` |
| API トークンの取得・再生成（ブラウザから） | `GET / POST /api/external/token` |

ベース URL: `https://panetto-dashboard.vercel.app`

**API から操作できるのは下書き（status = draft）だけです。** 提出済み・承認済みの日報は読み取りのみで、作成・更新・削除はできません。

---

## 2. 認証

### 2.1 API トークン

```
Authorization: Bearer <api_token>
```

- トークンはユーザーごとに1つ。ダッシュボードの **設定 → プロフィール → API連携トークン** で確認・再生成できます。
- 再生成すると旧トークンは即時無効になります。
- トークンが無い・一致しない場合は `401` を返します。

### 2.2 トークン管理 API（ブラウザセッション認証）

`/api/external/token` だけは Bearer ではなく、ダッシュボードにログイン済みのブラウザセッション（Cookie）で認証します。外部システムから呼ぶ想定ではありません。

| メソッド | 動作 | レスポンス |
|---|---|---|
| `GET` | 自分のトークンを返す | `{ "api_token": "…" \| null }` |
| `POST` | トークンを再生成し、新しい値を返す | `{ "api_token": "…" }` |

---

## 3. 共通仕様

### 3.1 リクエスト・レスポンス形式

- リクエストボディは `application/json`。
- レスポンスは常に JSON。エラー時は `{ "error": "<日本語メッセージ>" }` 形式。

### 3.2 未知のキーの扱い

**この仕様書に記載のないキーは、エラーにならず黙って無視されます。** キー名の綴り間違い（例: `estimated_hour`）は検出されないので、送信後に `GET /api/external/reports?include=tasks` で保存結果を確認することを推奨します。

### 3.3 日付・時刻の形式

| 項目 | 形式 | 例 |
|---|---|---|
| 日付（`report_date`, `due_date`, `from`, `to`） | `YYYY-MM-DD` | `2026-09-07` |
| 時刻（`start_time`, `end_time`） | `HH:MM` | `09:30` |

`report_date` は形式に加えて暦日として実在するかも検証されます（`2026-02-30` は 400）。`GET /reports` の `from` / `to` も同様です。

### 3.4 値の正規化（サーバー側で自動補正されるもの）

| 項目 | 補正内容 |
|---|---|
| `priority` | `high` / `medium` / `low` 以外はすべて `medium` に置換。**日本語（高・中・低）は無効。** |
| `progress_rate` | 0〜100 に丸め込み（-5 → 0、150 → 100）。未指定は 0 |
| `title`（タスク・翌日予定） | 空文字・空白のみ・未指定は `(無題)` に置換 |
| `task_status` | 未指定は `未着手`。それ以外は任意の文字列をそのまま保存（検証なし） |
| `recurrence_pattern` | `is_recurring` が `true` のときのみ保存（未指定は `daily`）。`false` なら常に `null` |
| 数値項目（`work_hours`, `estimated_hours` 等） | `Number()` で変換。数値にできない文字列は `NaN` として保存される可能性があるため、数値型で送ってください |

---

## 4. `GET /api/external/reports` — 提出済み日報の一括取得

**自組織の全ユーザー**の提出済み・承認済み日報を、日付降順で返します。自分の日報だけではない点に注意してください。下書きは含まれません。

### クエリパラメータ

| パラメータ | 型 | 必須 | 既定値 | 説明 |
|---|---|---|---|---|
| `from` | `YYYY-MM-DD` | — | 30日前 | 取得開始日（含む） |
| `to` | `YYYY-MM-DD` | — | 今日 | 取得終了日（含む） |
| `limit` | 整数 | — | 100 | 1〜200。範囲外は丸め込み |
| `offset` | 整数 | — | 0 | ページング用オフセット |
| `include` | `tasks` | — | — | 指定するとタスクと翌日予定を埋め込む |

### レスポンス

```json
{
  "data": [
    {
      "id": "…", "user_id": "…", "organization_id": "…", "department_id": "…",
      "report_date": "2026-09-07", "status": "submitted",
      "title": "…", "start_time": "09:00:00", "end_time": "18:00:00", "work_hours": 8,
      "progress_rate": 60, "next_day_plan": "…", "template_id": null, "lineworks_notified_at": "…",
      "submitted_at": "…", "created_at": "…", "updated_at": "…",
      "user": { "name": "氏名", "email": "…" },
      "tasks": [ … ],            // include=tasks 時のみ
      "planned_tasks": [ … ]     // include=tasks 時のみ
    }
  ],
  "total": 123,
  "limit": 100,
  "offset": 0
}
```

`reports` テーブルの全カラム（上記 17 項目）がそのまま返ります。画面にある「本日の成果」「課題」「勤務場所」「体調」は `reports` テーブルに列が無いため含まれません。

### エラー

| 状態 | 条件 |
|---|---|
| 400 | `from` / `to` が `YYYY-MM-DD` 形式でない、または実在しない日付（`2026-02-30` 等） |
| 401 | トークン不正 |
| 500 | DB エラー |

---

## 5. `GET /api/external/draft` — 自分の下書き一覧

自分（トークン所有者）の下書きを更新日時の降順で最大 20 件返します。タスクは含まれません。

```json
{
  "data": [
    { "id": "…", "report_date": "2026-09-07", "title": "…",
      "start_time": "09:00:00", "end_time": null, "work_hours": null,
      "next_day_plan": null, "updated_at": "…" }
  ]
}
```

---

## 6. `POST /api/external/draft` — 下書きの作成・上書き

### 6.1 同じ日付の日報が既にある場合の挙動（重要）

| 同日の既存日報 | 挙動 | 状態コード |
|---|---|---|
| なし | 新規作成 | `201` |
| 下書き（draft） | **既存の下書きを上書き**（詳細は 6.3） | `200` |
| 提出済み（submitted）または承認済み（approved） | **作成せず拒否**。既存日報は変更されない | `409` |

409 のレスポンスには既存日報の ID が含まれます。

```json
{
  "error": "2026-09-07 には提出済みの日報が既にあります。提出済みの日報はAPIから変更できません。修正する場合はダッシュボードの日報編集画面から行ってください",
  "report_id": "…"
}
```

### 6.2 リクエストボディ

#### 日報本体

| キー | 型 | 必須 | 未指定時 | 説明 |
|---|---|---|---|---|
| `report_date` | `YYYY-MM-DD` | **必須** | — | 日報の日付 |
| `title` | 文字列 | — | `null` | タイトル |
| `start_time` | `HH:MM` | — | `null` | 開始時刻 |
| `end_time` | `HH:MM` | — | `null` | 終了時刻 |
| `work_hours` | 数値 | — | `null` | 稼働時間（時間） |
| `next_day_plan` | 文字列 | — | `null` | 翌日の予定（フリーテキスト） |
| `tasks` | 配列 | — | （6.3 参照） | 親タスクの配列 |
| `planned_tasks` | 配列 | — | （6.3 参照） | 翌日予定タスクの配列 |

`summary`（本日の成果）、`issues`（課題）、`work_location`（勤務場所）、`condition`（体調）は **API から設定できません**（送っても無視されます）。これらは画面上に入力欄がありますが `reports` テーブルに列が存在せず、画面からも保存されていません。

#### `tasks[]` — 親タスク

| キー | 型 | 未指定時 | 備考 |
|---|---|---|---|
| `title` | 文字列 | `(無題)` | |
| `description` | 文字列 | `null` | |
| `estimated_hours` | 数値 | `null` | 画面上の「工数(h)」 |
| `actual_hours` | 数値 | `null` | 画面上の「実績(h)」 |
| `progress_rate` | 数値 | `0` | 0〜100 に丸め込み |
| `priority` | `high` / `medium` / `low` | `medium` | それ以外は `medium` |
| `task_status` | 文字列 | `未着手` | 画面では 未着手 / 進行中 / 完了 / 保留 を使用 |
| `purpose` | 文字列 | `null` | 目的 |
| `memo` | 文字列 | `null` | 備考 |
| `is_recurring` | 真偽値 | `false` | 定期タスク |
| `recurrence_pattern` | 文字列 | `daily`（`is_recurring` 時のみ） | `daily` / `weekly` / `monthly` 等 |
| `no_norma` | 真偽値 | `false` | ノルマなし |
| `no_due_date` | 真偽値 | `false` | 期限なし |
| `due_date` | `YYYY-MM-DD` | `null` | 期限。**未指定だと画面上で期限なしになります。** 画面から作成した場合の既定値（当日）とは異なります |
| `target_norma_count` | 数値 | `null` | 目標件数 |
| `target_norma_amount` | 数値 | `null` | 目標金額 |
| `children` | 配列 | なし | 子タスク（下表） |

`order_index` は配列の並び順で自動採番されます。

#### `tasks[].children[]` — 子タスク

子タスクで受け付けるキーは親より少ない点に注意してください。

| キー | 型 | 未指定時 |
|---|---|---|
| `title` | 文字列 | `(無題)` |
| `description` | 文字列 | `null` |
| `estimated_hours` | 数値 | `null` |
| `progress_rate` | 数値 | `0` |
| `priority` | `high` / `medium` / `low` | `medium` |
| `task_status` | 文字列 | `未着手` |
| `memo` | 文字列 | `null` |

`actual_hours`、`due_date`、`purpose`、`is_recurring`、ノルマ関連は子タスクでは**無視されます**。

#### `planned_tasks[]` — 翌日予定タスク

| キー | 型 | 未指定時 |
|---|---|---|
| `title` | 文字列 | `(無題)` |
| `estimated_hours` | 数値 | `null` |

### 6.3 上書き時（既存下書きあり）の置換ルール

- 日報本体の項目（`title`, `start_time`, `end_time`, `work_hours`, `next_day_plan`）は**送った値で常に上書き**されます。キーを省略すると `null` になります（「省略＝変更なし」ではありません）。
- `tasks` を**配列として送った場合**、既存のタスク（子タスク含む）は**すべて削除され、送った内容に置き換わります**。空配列 `[]` を送ると全削除です。
- `tasks` キー自体を**省略した場合**、既存のタスクはそのまま残ります。
- `planned_tasks` も同じ扱いです。

「一部のタスクだけ差し替える」操作はできません。差し替える場合は全件を送ってください。

### 6.4 レスポンス

```json
{ "ok": true, "report_id": "<UUID>", "created": true }
```

`created` は新規作成なら `true`、上書きなら `false`。

### 6.5 エラー

| 状態 | 条件 |
|---|---|
| 400 | ボディが JSON でない / `report_date` が無い・形式不正・暦日として不正 |
| 401 | トークン不正 |
| 409 | 同日に提出済み・承認済み日報がある |
| 500 | DB エラー（タスク保存失敗時は `タスクの保存に失敗しました: …`） |

### 6.6 リクエスト例

```bash
curl -X POST https://panetto-dashboard.vercel.app/api/external/draft \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "report_date": "2026-09-07",
    "title": "9/7 業務日報",
    "start_time": "09:00",
    "end_time": "18:00",
    "work_hours": 8,
    "tasks": [
      {
        "title": "顧客A 提案書作成",
        "estimated_hours": 3,
        "progress_rate": 50,
        "priority": "high",
        "task_status": "進行中",
        "due_date": "2026-09-08",
        "memo": "レビュー待ち",
        "children": [
          { "title": "構成案", "progress_rate": 100, "task_status": "完了" },
          { "title": "見積計算", "progress_rate": 0 }
        ]
      }
    ],
    "planned_tasks": [
      { "title": "顧客A 提案書レビュー対応", "estimated_hours": 1 }
    ]
  }'
```

---

## 7. `PATCH /api/external/draft/{id}` — 下書きの部分更新

自分の**下書き**のみ更新できます。提出済み・他人の日報・存在しない ID はすべて `404` です。

### リクエストボディ

| キー | 挙動 |
|---|---|
| `title`, `start_time`, `end_time`, `work_hours`, `next_day_plan` | **送ったキーだけ**更新。省略したキーは変更されない（POST と異なる） |
| `tasks` | 配列を送ると全置換（省略で変更なし）。6.3 と同じ |
| `planned_tasks` | 同上 |

`report_date` は変更できません。

### レスポンス

```json
{ "ok": true, "report_id": "<UUID>" }
```

### エラー

| 状態 | 条件 |
|---|---|
| 400 | ボディが JSON でない |
| 401 | トークン不正 |
| 404 | 自分の下書きでない（提出済み・他人・存在しない） |
| 500 | DB エラー |

---

## 8. `DELETE /api/external/draft/{id}` — 下書きの削除

自分の下書きのみ削除できます。紐づくタスク・翌日予定も削除されます。

```json
{ "ok": true }
```

| 状態 | 条件 |
|---|---|
| 401 | トークン不正 |
| 404 | 自分の下書きでない（既に削除済み・提出済みを含む） |
| 500 | DB エラー |

---

## 9. 状態コード一覧

| コード | 意味 |
|---|---|
| 200 | 成功（取得・上書き・更新・削除） |
| 201 | 新規作成成功（`POST /draft` で `created: true`） |
| 400 | リクエスト形式不正 |
| 401 | 認証失敗 |
| 404 | 対象が見つからない（自分の下書き以外を操作しようとした） |
| 409 | 同日に提出済み日報があり作成できない |
| 500 | サーバー内部エラー |

---

## 10. 運用上の注意

1. **提出済みの日報は API から一切変更できません。** 修正はダッシュボードの日報編集画面で行ってください。
2. **`POST /draft` に `tasks` を渡すと既存タスクは全削除されます。** 追記ではありません。
3. **未知のキーはエラーになりません。** 投入後に `GET /reports?include=tasks`（提出後）または画面で確認してください。
4. **`priority` は英語の 3 値のみ。** 日本語を送ると `medium` になります。
5. **`due_date` を省略すると期限なしになります。** 画面から作成した場合の既定値（当日）とは違います。
6. **`summary` / `issues` / `work_location` / `condition` は API から設定できず、`GET /reports` にも含まれません**（`reports` テーブルに列がありません）。
7. `GET /reports` は**自組織全員**の日報を返します。特定ユーザーに絞る場合は `user_id` でクライアント側フィルタしてください。
8. トークンはユーザーの権限で動作します。トークンが漏れた場合はプロフィール画面から即時再生成してください。

---

## 11. 変更履歴

| 日付 | 内容 |
|---|---|
| 2026-09-07 | 初版作成。`POST /draft` で同日に提出済み日報がある場合 409 を返す挙動を追加 |
