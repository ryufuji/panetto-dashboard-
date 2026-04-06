# パネットダッシュボード テスト設計書

> 最終更新: 2026-03-30
> 対応する業務フロー: [docs/business-flows.md](./business-flows.md)

---

## 目次

1. [テスト方針](#テスト方針)
2. [認証テスト](#1-認証テスト)
3. [日報管理テスト](#2-日報管理テスト)
4. [日報承認テスト](#3-日報承認テスト)
5. [承認申請テスト](#4-承認申請テスト)
6. [期限延長テスト](#5-期限延長テスト)
7. [組織管理テスト](#6-組織管理テスト)
8. [店舗運営テスト](#7-店舗運営テスト)
9. [タス軽連携テスト](#8-タス軽連携テスト)
10. [パフォーマンステスト](#9-パフォーマンステスト)
11. [設定・監査テスト](#10-設定監査テスト)
12. [権限テストマトリクス](#11-権限テストマトリクス)
13. [APIテスト一覧](#12-apiテスト一覧)

---

## テスト方針

### 優先度定義

| 優先度 | 説明 | 基準 |
|--------|------|------|
| **P0** | 最重要 | ビジネスクリティカル。これが壊れるとサービス停止 |
| **P1** | 重要 | 主要業務フローに影響。日常業務に支障 |
| **P2** | 中 | 特定条件下で発生。回避策あり |
| **P3** | 低 | 軽微な問題。UX改善レベル |

### テストカテゴリ

- **FT**: 機能テスト（正常系）
- **ET**: 異常系テスト（エラーハンドリング）
- **AT**: 権限テスト（ロール別アクセス制御）
- **IT**: 連携テスト（外部API・Webhook）
- **API**: APIエンドポイントテスト

---

## 1. 認証テスト

### 1.1 ログイン

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| AUTH-FT-001 | 正常ログイン | 有効アカウント存在 | メール・パスワードを入力し送信 | /dashboard へ遷移、セッション発行 | P0 |
| AUTH-ET-001 | 未登録メール | - | 存在しないメールでログイン | エラーメッセージ表示、遷移なし | P0 |
| AUTH-ET-002 | パスワード不一致 | 有効アカウント存在 | 誤ったパスワードでログイン | エラーメッセージ表示 | P0 |
| AUTH-ET-003 | 空入力 | - | メール・パスワード未入力で送信 | バリデーションエラー | P1 |
| AUTH-ET-004 | 無効ユーザー | is_active=false のアカウント | ログイン試行 | ログイン拒否 or 制限表示 | P1 |

### 1.2 新規登録

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| AUTH-FT-002 | 正常登録 | - | 名前・メール・パスワードを入力 | アカウント作成、users テーブルに保存 | P0 |
| AUTH-ET-005 | メール重複 | 同メールのアカウント存在 | 同じメールで登録 | 重複エラー | P1 |
| AUTH-ET-006 | パスワード短すぎ | - | 2文字のパスワードで登録 | バリデーションエラー | P1 |

### 1.3 パスワードリセット

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| AUTH-FT-003 | リセットメール送信 | 有効アカウント存在 | メール入力してリセット要求 | リセットメール送信 | P1 |
| AUTH-FT-004 | パスワード更新 | リセットリンク有効 | 新パスワード入力 | パスワード更新完了 | P1 |

### 1.4 ミドルウェア

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| AUTH-AT-001 | 未認証で /dashboard アクセス | セッションなし | /dashboard に直接アクセス | /login へリダイレクト | P0 |
| AUTH-AT-002 | 認証済みで /login アクセス | セッションあり | /login にアクセス | /dashboard へリダイレクト | P2 |

---

## 2. 日報管理テスト

### 2.1 日報CRUD

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| RPT-FT-001 | 日報新規作成 | ログイン済み | 日報フォームで必須項目入力・保存 | 下書き（draft）として保存 | P0 |
| RPT-FT-002 | 日報提出 | 下書き存在 | 下書き日報を提出 | status=submitted、承認レコード自動生成 | P0 |
| RPT-FT-003 | 下書き編集 | 下書き存在 | 内容を修正・保存 | 内容が更新される | P0 |
| RPT-FT-004 | 差戻し後の再編集 | status=rejected | 内容を修正 | 編集可能、再提出可 | P1 |
| RPT-FT-005 | 下書き削除 | 下書き存在 | 下書きを削除 | レコード削除 | P1 |
| RPT-FT-006 | 日報一覧表示 | 複数日報存在 | 一覧画面を表示 | ページネーション・フィルタ動作 | P1 |
| RPT-FT-007 | 日報詳細表示 | 日報存在 | 詳細画面を表示 | タスク・コメント・閲覧履歴表示 | P1 |
| RPT-ET-001 | 提出済み日報の編集 | status=submitted | 編集を試行 | 編集不可 or エラー | P1 |
| RPT-ET-002 | 承認済み日報の編集 | status=approved | 編集を試行 | 編集不可 or エラー | P1 |
| RPT-ET-003 | 他人の日報を削除 | 他ユーザーの下書き | DELETE API呼び出し | 403 Forbidden | P1 |
| RPT-ET-004 | 必須フィールド未入力 | - | タイトルなしで保存 | バリデーションエラー | P2 |

### 2.2 タスク管理

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| RPT-FT-008 | タスク追加 | 日報存在（draft） | タスクを追加 | report_tasks にレコード追加 | P0 |
| RPT-FT-009 | 子タスク作成 | 親タスク存在 | parent_task_id を指定してタスク作成 | 階層構造で表示 | P1 |
| RPT-FT-010 | タスク進捗更新 | タスク存在 | progress を 50 に更新 | 進捗率が更新される | P1 |
| RPT-FT-011 | タスクステータス変更 | タスク存在 | status を done に変更 | ステータス更新 | P1 |
| RPT-FT-012 | タスク優先度設定 | タスク存在 | priority を high に設定 | 優先度が反映 | P2 |

### 2.3 コメント

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| RPT-FT-013 | コメント追加 | 日報存在 | コメントを投稿 | report_comments にレコード追加 | P1 |
| RPT-FT-014 | プライベートコメント | 日報存在 | is_private=true でコメント | 承認者のみ閲覧可 | P2 |
| RPT-FT-015 | コメント削除 | 自分のコメント存在 | コメントを削除 | レコード削除 | P2 |

### 2.4 閲覧追跡

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| RPT-FT-016 | 閲覧記録 | 日報存在 | 日報詳細を表示 | report_views にレコード追加 | P2 |
| RPT-FT-017 | 重複閲覧 | 既に閲覧済み | 同じ日報を再度表示 | 閲覧日時が更新（重複レコードなし） | P3 |

### 2.5 テンプレート

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| RPT-FT-018 | テンプレート一覧 | テンプレート存在 | テンプレート一覧を表示 | テンプレート一覧が表示 | P2 |
| RPT-FT-019 | テンプレートから日報作成 | テンプレート存在 | テンプレート選択して新規作成 | テンプレート内容が日報にコピー | P2 |

### 2.6 タスク引き継ぎ

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| RPT-FT-020 | 未完了タスク一覧取得 | 前日の未完了タスク存在 | carry-over-tasks API呼び出し | 未完了タスクリスト返却 | P1 |
| RPT-FT-021 | タスク引き継ぎ実行 | 引き継ぎタスク選択済み | 新規日報にタスクコピー | 新日報にタスクが追加される | P1 |

---

## 3. 日報承認テスト

### 3.1 承認フロー

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| APR-FT-001 | 自動承認レコード生成 | 日報を提出 | 日報 status を submitted に変更 | approvals テーブルにレコード自動生成 | P0 |
| APR-FT-002 | カスタム承認者割当 | report_reviewer_id 設定済み | 日報提出 | 指定の承認者が割当 | P0 |
| APR-FT-003 | 部署マネージャー割当 | report_reviewer_id 未設定、部署マネージャー存在 | 日報提出 | 部署マネージャーが割当 | P1 |
| APR-FT-004 | フォールバック承認者 | reviewer_id未設定、部署マネージャー未設定 | 日報提出 | 同部署のmanager/adminが割当 | P2 |
| APR-FT-005 | 承認実行 | 承認保留の日報存在 | 承認ボタンクリック | approval.status=approved、report.status=approved | P0 |
| APR-FT-006 | 差戻し実行 | 承認保留の日報存在 | 差戻しボタンクリック・コメント入力 | approval.status=rejected、report.status=rejected | P0 |
| APR-FT-007 | 承認一覧（pending） | 承認保留案件存在 | /dashboard/approvals/pending を表示 | 自分が承認者の案件のみ表示 | P1 |
| APR-FT-008 | 承認履歴一覧 | 承認済み案件存在 | /dashboard/approvals/approved を表示 | 過去の承認履歴表示 | P2 |
| APR-ET-001 | 非承認者による承認 | 他の承認者の案件 | 承認APIを呼び出し | 403 Forbidden | P1 |
| APR-ET-002 | 既に承認済みを再承認 | status=approved | 承認APIを呼び出し | エラー or 冪等 | P2 |

### 3.2 統計

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| APR-FT-009 | 承認統計表示 | 承認データ存在 | /dashboard/approvals/statistics を表示 | 承認率・部署別提出率が表示 | P2 |

---

## 4. 承認申請テスト

### 4.1 申請CRUD

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| ARQ-FT-001 | 申請新規作成（下書き） | ログイン済み | カテゴリ・タイトル・金額入力・保存 | status=draft で保存 | P0 |
| ARQ-FT-002 | 申請提出 | 下書き存在 | 承認者選択して提出 | status=pending、承認ステップ自動生成 | P0 |
| ARQ-FT-003 | 下書き編集 | 下書き存在 | 内容を修正 | 更新される | P1 |
| ARQ-FT-004 | 下書き削除 | 下書き存在 | 削除実行 | レコード削除 | P1 |
| ARQ-FT-005 | 申請一覧表示 | 複数申請存在 | 一覧画面表示（mine/pending/all タブ） | タブ別にフィルタ表示 | P1 |
| ARQ-FT-006 | 申請詳細表示 | 申請存在 | 詳細画面表示 | ステップ・添付・履歴表示 | P1 |
| ARQ-ET-001 | 提出済み申請の編集 | status=pending | 編集API呼び出し | エラー（編集不可） | P1 |
| ARQ-ET-002 | 他人の下書き削除 | 他ユーザーの下書き | DELETE API呼び出し | 403 Forbidden | P1 |

### 4.2 多段承認

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| ARQ-FT-007 | 1段階承認（10万以下） | 金額=50,000 | 申請提出 | 承認ステップ1つ生成 | P0 |
| ARQ-FT-008 | 2段階承認（10万-100万） | 金額=500,000 | 申請提出 | 承認ステップ2つ生成 | P0 |
| ARQ-FT-009 | 3段階承認（100万超） | 金額=2,000,000 | 申請提出 | 承認ステップ3つ生成 | P0 |
| ARQ-FT-010 | Step1承認→Step2へ | 2段階申請、Step1保留 | Step1承認者が承認 | current_step=2、Step2承認者に通知 | P0 |
| ARQ-FT-011 | 最終ステップ承認 | 全ステップ承認済み | 最終承認者が承認 | request.status=approved | P0 |
| ARQ-FT-012 | 途中ステップで却下 | Step2保留 | Step2承認者が却下 | request.status=rejected | P1 |
| ARQ-FT-013 | 承認委任 | Step1保留 | 承認者が別ユーザーに委任 | step.status=delegated、新承認者に移譲 | P1 |
| ARQ-FT-014 | 申請キャンセル | status=pending | 申請者がキャンセル | status=cancelled | P1 |
| ARQ-ET-003 | 非承認者による承認 | 他の承認者のステップ | approve API呼び出し | 403 Forbidden | P1 |
| ARQ-ET-004 | 閾値ルール未設定時 | threshold_rules テーブル空 | 申請提出 | 適切なエラー or デフォルト動作 | P2 |

### 4.3 添付ファイル

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| ARQ-FT-015 | ファイル添付 | 申請存在 | 添付API呼び出し | attachments にレコード追加 | P2 |
| ARQ-FT-016 | 添付削除 | 自分の添付存在 | 削除実行 | レコード削除 | P2 |
| ARQ-ET-005 | 他人の添付削除 | 他ユーザーの添付 | 削除API呼び出し | 403 Forbidden | P2 |

### 4.4 閾値ルール管理

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| ARQ-FT-017 | 閾値ルール一覧 | ルール存在 | 設定画面表示 | ルール一覧表示 | P2 |
| ARQ-FT-018 | 閾値ルール変更 | admin権限 | ルールを編集・保存 | ルール更新 | P2 |

---

## 5. 期限延長テスト

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| DLE-FT-001 | 延長申請作成 | タスクに期限設定済み | 理由・新期限・承認者入力 | status=pending で保存 | P1 |
| DLE-FT-002 | 延長承認 | 延長申請保留 | 承認者が承認 | タスクの due_date 更新 | P1 |
| DLE-FT-003 | 延長却下 | 延長申請保留 | 承認者が却下 | due_date 変更なし | P1 |
| DLE-FT-004 | 延長一覧取得 | 複数申請存在 | 一覧API呼び出し | 保留中の延長申請リスト | P2 |
| DLE-ET-001 | 非承認者による承認 | 他の承認者の案件 | approve API呼び出し | 403 Forbidden | P2 |

---

## 6. 組織管理テスト

### 6.1 ユーザー管理

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| ORG-FT-001 | ユーザー一覧表示 | 複数ユーザー存在 | 一覧画面表示 | フィルタ・検索動作 | P1 |
| ORG-FT-002 | ユーザー追加 | admin権限 | ユーザー情報入力・保存 | users テーブルにレコード追加 | P1 |
| ORG-FT-003 | ユーザー編集 | admin権限、ユーザー存在 | プロフィール変更 | 更新される | P1 |
| ORG-FT-004 | ユーザー無効化 | admin権限 | is_active=false に変更 | ユーザーが無効化される | P1 |
| ORG-FT-005 | 承認者カスタム設定 | admin権限 | report_reviewer_id を設定 | 承認者が変更される | P1 |
| ORG-AT-001 | 非admin がユーザー追加 | employee権限 | ユーザー追加API呼び出し | 403 Forbidden | P1 |

### 6.2 PANET連携

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| ORG-IT-001 | PANET一括連携 | admin権限、PANET API稼働 | /api/organization/users/panet-bulk POST | 全ユーザーがPANETに登録 | P1 |
| ORG-IT-002 | PANET API接続失敗 | PANET API停止 | 一括連携実行 | 502エラー返却 | P2 |
| ORG-IT-003 | PANET環境変数未設定 | PANET_API_URL未設定 | 一括連携実行 | スキップ（null返却） | P2 |
| ORG-IT-004 | 既存ユーザーの冪等性 | ユーザー既にPANETに存在 | 一括連携実行 | created=false、エラーなし | P2 |

### 6.3 部署管理

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| ORG-FT-006 | 部署一覧表示 | 部署存在 | 一覧取得 | 部署リスト返却 | P2 |
| ORG-FT-007 | 部署作成 | admin権限 | 部署名・マネージャー入力 | departments にレコード追加 | P2 |
| ORG-FT-008 | 組織図表示 | 部署・ユーザー存在 | /dashboard/organization/chart 表示 | 階層組織図が描画 | P3 |

### 6.4 事業所管理

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| ORG-FT-009 | 事業所一覧表示 | 事業所存在 | 一覧取得 | 事業所リスト返却 | P2 |
| ORG-FT-010 | 事業所作成 | admin権限 | 事業所情報入力 | offices にレコード追加 | P2 |

### 6.5 権限管理

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| ORG-FT-011 | 権限付与 | admin権限 | ユーザーに権限を付与 | user_permissions にレコード追加 | P2 |
| ORG-FT-012 | 権限一覧取得 | 権限レコード存在 | ユーザーの権限取得 | 権限リスト返却 | P2 |

---

## 7. 店舗運営テスト

### 7.1 店舗CRUD

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| STR-FT-001 | 店舗一覧表示 | 店舗存在 | 一覧画面表示 | 店舗リスト表示 | P1 |
| STR-FT-002 | 店舗作成 | admin/manager権限 | 店舗情報入力・保存 | stores にレコード追加 | P1 |
| STR-FT-003 | 店舗詳細表示 | 店舗存在 | 詳細画面表示 | キャスト・シフト・売上タブ表示 | P1 |
| STR-FT-004 | 店舗ステータス変更 | 店舗存在 | status を suspended に変更 | ステータス更新 | P2 |

### 7.2 キャスト管理

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| STR-FT-005 | キャスト一覧表示 | キャスト存在 | 一覧取得 | キャストリスト返却 | P1 |
| STR-FT-006 | キャスト追加 | 店舗存在 | キャスト情報入力・保存 | casts にレコード追加 | P1 |
| STR-FT-007 | キャスト編集 | キャスト存在 | 情報変更・保存 | 更新される | P2 |
| STR-FT-008 | キャスト削除 | キャスト存在 | 削除実行 | レコード削除 | P2 |
| STR-ET-001 | 存在しない店舗のキャスト取得 | 店舗ID不正 | API呼び出し | 404 or 空配列 | P2 |

### 7.3 シフト管理

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| STR-FT-009 | シフト作成 | キャスト存在 | 日付・時間帯入力・保存 | shifts にレコード追加（scheduled） | P1 |
| STR-FT-010 | シフト確認 | シフト存在 | status を confirmed に変更 | ステータス更新 | P1 |
| STR-FT-011 | シフト完了 | シフト確認済み | status を completed に変更 | ステータス更新 | P2 |
| STR-FT-012 | シフト欠勤 | シフト存在 | status を absent に変更 | ステータス更新 | P2 |
| STR-FT-013 | シフト削除 | シフト存在 | 削除実行 | レコード削除 | P2 |

### 7.4 売上記録

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| STR-FT-014 | 売上登録 | 店舗存在 | 種別・金額・決済方法入力 | store_sales にレコード追加 | P1 |
| STR-FT-015 | 売上一覧表示 | 売上データ存在 | 一覧取得 | 売上リスト返却 | P1 |
| STR-FT-016 | 売上編集 | 売上存在 | 金額変更 | 更新される | P2 |
| STR-FT-017 | 売上削除 | 売上存在 | 削除実行 | レコード削除 | P2 |

### 7.5 引き継ぎノート

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| STR-FT-018 | 引き継ぎ作成 | 店舗存在 | 内容入力・保存 | handovers にレコード追加 | P1 |
| STR-FT-019 | 引き継ぎ解決 | 引き継ぎ存在 | resolved=true に更新 | ステータス更新 | P2 |
| STR-FT-020 | 引き継ぎ一覧 | 引き継ぎ存在 | 一覧取得 | 引き継ぎリスト返却 | P2 |

---

## 8. タス軽連携テスト

### 8.1 Webhook受信

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| TSK-IT-001 | task.created 受信 | Webhook設定済み | task.created イベント送信 | store_daily_reports + tasks upsert | P0 |
| TSK-IT-002 | task.updated 受信 | タスクが既にDB存在 | task.updated イベント送信 | タスク情報更新、件数再集計 | P0 |
| TSK-IT-003 | task.deleted 受信 | タスクが既にDB存在 | task.deleted イベント送信 | タスク削除、件数再集計 | P1 |
| TSK-IT-004 | task.deleted で最後のタスク | 日報に1タスクのみ | task.deleted 送信 | タスク+日報レコード両方削除 | P1 |
| TSK-IT-005 | 冪等性確認（重複作成） | 同task.id で既にレコード存在 | 同じ task.created 再送信 | エラーなし、upsert成功 | P1 |
| TSK-ET-001 | 認証失敗 | - | Authorization ヘッダーなし | 401 Unauthorized | P0 |
| TSK-ET-002 | 不正なBearerトークン | - | 誤ったトークンで送信 | 401 Unauthorized | P0 |
| TSK-ET-003 | 不正なペイロード | - | event フィールド未設定 | 400 Bad Request | P1 |
| TSK-ET-004 | task フィールド未設定 | - | task オブジェクトなし | 400 Bad Request | P1 |
| TSK-ET-005 | 不明なイベント種別 | - | event="task.unknown" | 400 Bad Request | P1 |
| TSK-ET-006 | 存在しないタスク削除 | task.id がDBに未存在 | task.deleted 送信 | 成功（何もしない） | P2 |
| TSK-ET-007 | DB接続エラー | Supabase停止 | Webhook送信 | 500 Internal Server Error | P2 |

### 8.2 日報表示

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| TSK-FT-001 | 店舗日報一覧表示 | 外部連携データ存在 | /dashboard/reports/store/[id] 表示 | タス軽バッジ付きで日報表示 | P1 |
| TSK-FT-002 | タスク完了率表示 | 完了・未完了タスク混在 | 日報詳細表示 | 正しい完了率計算 | P2 |

### 8.3 PANET API連携（ユーザー管理）

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| TSK-IT-008 | 単体ユーザー作成 | PANET API稼働 | createPanetUser() 呼び出し | ユーザー作成、ID返却 | P1 |
| TSK-IT-009 | 一括ユーザー作成 | PANET API稼働 | createPanetUsersBulk() 呼び出し | succeeded/failed件数返却 | P1 |
| TSK-IT-010 | API未設定時のスキップ | 環境変数未設定 | createPanetUser() 呼び出し | null返却（エラーなし） | P2 |

---

## 9. パフォーマンステスト

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| PRF-FT-001 | 全体パフォーマンス表示 | レポートデータ存在 | /dashboard/performance 表示 | 各メトリクス表示 | P2 |
| PRF-FT-002 | 部署別パフォーマンス | 部署データ存在 | /dashboard/performance/departments 表示 | 部署別比較表示 | P2 |
| PRF-FT-003 | 個人パフォーマンス | ユーザーデータ存在 | /api/performance/[userId] 呼び出し | 個人メトリクス返却 | P2 |
| PRF-AT-001 | employee は自分のみ | employee権限 | 他ユーザーのパフォーマンス取得 | 403 or 自分のデータのみ | P2 |
| PRF-AT-002 | manager は自部署のみ | manager権限 | 他部署のパフォーマンス取得 | 自部署データのみ返却 | P2 |

---

## 10. 設定・監査テスト

### 10.1 プロフィール設定

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| SET-FT-001 | プロフィール表示 | ログイン済み | /dashboard/settings/profile 表示 | 自分の情報表示 | P2 |
| SET-FT-002 | プロフィール更新 | ログイン済み | 名前・電話変更・保存 | 更新される | P2 |

### 10.2 システム設定

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| SET-FT-003 | システム設定表示 | admin権限 | /dashboard/settings/system 表示 | 各設定項目表示 | P2 |
| SET-FT-004 | システム設定更新 | admin権限 | 設定値変更・保存 | 設定更新 | P2 |
| SET-AT-001 | 非admin がシステム設定 | employee権限 | システム設定API呼び出し | 403 Forbidden | P1 |

### 10.3 監査ログ

| ID | テスト対象 | 前提条件 | 手順 | 期待結果 | 優先度 |
|----|-----------|---------|------|---------|--------|
| SET-FT-005 | 監査ログ表示 | admin権限、ログ存在 | /dashboard/settings/audit-logs 表示 | ログ一覧表示 | P2 |
| SET-FT-006 | 監査ログフィルタ | ログ存在 | ユーザー・アクション・日時でフィルタ | フィルタ結果表示 | P3 |
| SET-AT-002 | 非admin が監査ログ閲覧 | employee権限 | 監査ログ画面アクセス | アクセス拒否 | P1 |

---

## 11. 権限テストマトリクス

### ロール × 機能 アクセス制御

| 機能 / エンドポイント | employee | manager | admin | テストID |
|----------------------|----------|---------|-------|---------|
| **日報** | | | | |
| GET /api/reports（自分） | OK | OK | OK | RPT-AT-001 |
| GET /api/reports（部署） | NG | OK | OK | RPT-AT-002 |
| GET /api/reports（全件） | NG | NG | OK | RPT-AT-003 |
| POST /api/reports | OK | OK | OK | RPT-AT-004 |
| PUT /api/reports/[id]（自分） | OK | OK | OK | RPT-AT-005 |
| PUT /api/reports/[id]（他人） | NG | NG | NG | RPT-AT-006 |
| DELETE /api/reports/[id]（自分のdraft） | OK | OK | OK | RPT-AT-007 |
| **承認** | | | | |
| GET /api/approvals | OK | OK | OK | APR-AT-001 |
| PUT /api/approvals/[id]（自分が承認者） | - | OK | OK | APR-AT-002 |
| PUT /api/approvals/[id]（他者の承認） | NG | NG | NG | APR-AT-003 |
| **承認申請** | | | | |
| POST /api/approval-requests | OK | OK | OK | ARQ-AT-001 |
| POST .../approve（承認者として） | - | OK | OK | ARQ-AT-002 |
| POST .../approve（非承認者） | NG | NG | NG | ARQ-AT-003 |
| DELETE（自分のdraft） | OK | OK | OK | ARQ-AT-004 |
| DELETE（他人のdraft） | NG | NG | NG | ARQ-AT-005 |
| **組織管理** | | | | |
| GET /api/organization/users | OK | OK | OK | ORG-AT-001 |
| PATCH /api/organization/users（他人） | NG | NG | OK | ORG-AT-002 |
| POST /api/organization/users/panet-bulk | NG | NG | OK | ORG-AT-003 |
| POST /api/organization/departments | NG | NG | OK | ORG-AT-004 |
| **店舗** | | | | |
| GET /api/stores/[id]/casts | OK | OK | OK | STR-AT-001 |
| POST /api/stores/[id]/casts | NG | OK | OK | STR-AT-002 |
| POST /api/stores/[id]/sales | NG | OK | OK | STR-AT-003 |
| **パフォーマンス** | | | | |
| GET /api/performance（自分） | OK | OK | OK | PRF-AT-003 |
| GET /api/performance（部署） | NG | OK | OK | PRF-AT-004 |
| GET /api/performance（全件） | NG | NG | OK | PRF-AT-005 |
| **設定** | | | | |
| GET /api/organization/settings | NG | NG | OK | SET-AT-003 |
| PUT /api/organization/settings | NG | NG | OK | SET-AT-004 |

---

## 12. APIテスト一覧

### 12.1 認証API

| エンドポイント | メソッド | 正常系 | 異常系 |
|--------------|---------|--------|--------|
| /api/auth/callback | POST | 200 (認証成功) | 401 (認証失敗) |

### 12.2 日報API

| エンドポイント | メソッド | 正常系 | 異常系 |
|--------------|---------|--------|--------|
| /api/reports | GET | 200 (日報一覧) | 401 (未認証) |
| /api/reports | POST | 201 (作成成功) | 400 (バリデーション), 401 |
| /api/reports/[id] | GET | 200 (詳細) | 404 (未存在), 401 |
| /api/reports/[id] | PUT | 200 (更新成功) | 400, 403 (権限なし), 404 |
| /api/reports/[id] | DELETE | 200 (削除成功) | 403 (他人/非draft), 404 |
| /api/reports/[id]/tasks | POST | 201 (タスク追加) | 400, 404 |
| /api/reports/[id]/comments | POST | 201 (コメント追加) | 400, 404 |
| /api/reports/[id]/comments/[cId] | DELETE | 200 (削除成功) | 403, 404 |
| /api/reports/[id]/views | POST | 200 (閲覧記録) | 404 |
| /api/reports/carry-over-tasks | GET | 200 (引き継ぎタスク) | 401 |
| /api/reports/export | POST | 200 (エクスポート) | 401 |
| /api/reports/templates | GET | 200 (テンプレート一覧) | 401 |

### 12.3 承認API

| エンドポイント | メソッド | 正常系 | 異常系 |
|--------------|---------|--------|--------|
| /api/approvals | GET | 200 (承認一覧) | 401 |
| /api/approvals | POST | 201 (作成成功) | 400, 401 |
| /api/approvals/[id] | GET | 200 (詳細) | 404 |
| /api/approvals/[id] | PUT | 200 (承認/差戻し) | 400, 403, 404 |

### 12.4 承認申請API

| エンドポイント | メソッド | 正常系 | 異常系 |
|--------------|---------|--------|--------|
| /api/approval-requests | GET | 200 (一覧) | 401 |
| /api/approval-requests | POST | 201 (作成) | 400, 401 |
| /api/approval-requests/[id] | GET | 200 (詳細) | 404 |
| /api/approval-requests/[id] | PUT | 200 (更新) | 400, 403, 404 |
| /api/approval-requests/[id] | DELETE | 200 (削除) | 403, 404 |
| /api/approval-requests/[id]/submit | POST | 200 (提出) | 400, 403 |
| /api/approval-requests/[id]/approve | POST | 200 (承認) | 403, 404 |
| /api/approval-requests/[id]/reject | POST | 200 (却下) | 403, 404 |
| /api/approval-requests/[id]/delegate | POST | 200 (委任) | 403, 404 |
| /api/approval-requests/[id]/cancel | POST | 200 (キャンセル) | 403, 404 |
| /api/approval-requests/[id]/attachments | POST | 201 (添付) | 400, 403 |

### 12.5 期限延長API

| エンドポイント | メソッド | 正常系 | 異常系 |
|--------------|---------|--------|--------|
| /api/deadline-extensions | POST | 201 (申請作成) | 400, 401 |
| /api/deadline-extensions | GET | 200 (一覧) | 401 |
| /api/deadline-extensions/[id]/approve | POST | 200 (承認) | 403, 404 |
| /api/deadline-extensions/[id]/reject | POST | 200 (却下) | 403, 404 |

### 12.6 組織管理API

| エンドポイント | メソッド | 正常系 | 異常系 |
|--------------|---------|--------|--------|
| /api/organization/users | GET | 200 (一覧) | 401 |
| /api/organization/users | PATCH | 200 (更新) | 400, 403 |
| /api/organization/users/panet-bulk | POST | 200 (一括連携) | 403, 502 |
| /api/organization/departments | GET | 200 (一覧) | 401 |
| /api/organization/departments | POST | 201 (作成) | 400, 403 |
| /api/organization/offices | GET | 200 (一覧) | 401 |
| /api/organization/offices | POST | 201 (作成) | 400, 403 |
| /api/organization/permissions | GET | 200 (一覧) | 401 |
| /api/organization/permissions/[userId] | GET | 200 (権限) | 404 |
| /api/organization/permissions | POST | 201 (付与) | 400, 403 |
| /api/organization/settings | GET | 200 (設定) | 403 |
| /api/organization/settings | PUT | 200 (更新) | 403, 400 |

### 12.7 店舗API

| エンドポイント | メソッド | 正常系 | 異常系 |
|--------------|---------|--------|--------|
| /api/stores/[id]/casts | GET | 200 | 404 |
| /api/stores/[id]/casts | POST | 201 | 400, 403 |
| /api/stores/[id]/casts/[cId] | GET | 200 | 404 |
| /api/stores/[id]/casts/[cId] | PUT | 200 | 400, 403, 404 |
| /api/stores/[id]/casts/[cId] | DELETE | 200 | 403, 404 |
| /api/stores/[id]/shifts | GET | 200 | 404 |
| /api/stores/[id]/shifts | POST | 201 | 400, 403 |
| /api/stores/[id]/shifts/[sId] | GET | 200 | 404 |
| /api/stores/[id]/shifts/[sId] | PUT | 200 | 400, 403, 404 |
| /api/stores/[id]/shifts/[sId] | DELETE | 200 | 403, 404 |
| /api/stores/[id]/sales | GET | 200 | 404 |
| /api/stores/[id]/sales | POST | 201 | 400, 403 |
| /api/stores/[id]/sales/[sId] | GET | 200 | 404 |
| /api/stores/[id]/sales/[sId] | PUT | 200 | 400, 403, 404 |
| /api/stores/[id]/sales/[sId] | DELETE | 200 | 403, 404 |
| /api/stores/[id]/handovers | GET | 200 | 404 |
| /api/stores/[id]/handovers | POST | 201 | 400, 403 |
| /api/stores/[id]/handovers/[hId] | GET | 200 | 404 |
| /api/stores/[id]/handovers/[hId] | PUT | 200 | 400, 403, 404 |

### 12.8 パフォーマンスAPI

| エンドポイント | メソッド | 正常系 | 異常系 |
|--------------|---------|--------|--------|
| /api/performance | GET | 200 (メトリクス) | 401, 403 |
| /api/performance/[userId] | GET | 200 (個人) | 403, 404 |

### 12.9 ダッシュボードAPI

| エンドポイント | メソッド | 正常系 | 異常系 |
|--------------|---------|--------|--------|
| /api/dashboard/stats | GET | 200 (KPI) | 401 |

### 12.10 WebhookAPI

| エンドポイント | メソッド | 正常系 | 異常系 |
|--------------|---------|--------|--------|
| /api/webhooks/tasks | POST | 200 (同期成功) | 400, 401, 500 |

---

## テストケース集計

| カテゴリ | P0 | P1 | P2 | P3 | 合計 |
|---------|----|----|----|----|------|
| 認証 (AUTH) | 4 | 4 | 1 | 0 | 9 |
| 日報管理 (RPT) | 3 | 8 | 8 | 2 | 21 |
| 日報承認 (APR) | 4 | 3 | 3 | 0 | 10 |
| 承認申請 (ARQ) | 5 | 5 | 5 | 0 | 15 |
| 期限延長 (DLE) | 0 | 3 | 2 | 0 | 5 |
| 組織管理 (ORG) | 0 | 5 | 7 | 1 | 13 |
| 店舗運営 (STR) | 0 | 8 | 10 | 0 | 18 |
| タス軽連携 (TSK) | 3 | 7 | 4 | 0 | 14 |
| パフォーマンス (PRF) | 0 | 0 | 5 | 0 | 5 |
| 設定・監査 (SET) | 0 | 2 | 4 | 1 | 7 |
| **合計** | **19** | **45** | **49** | **4** | **117** |

---

## テスト実行コマンド例（curlベース）

### Webhook テスト

```bash
# 環境変数読み込み
source .env.local

# task.created テスト
curl -s http://localhost:3000/api/webhooks/tasks \
  -X POST \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "task.created",
    "task": {
      "id": "test-001",
      "title": "テストタスク",
      "status": "todo",
      "category": "general",
      "priority": "normal",
      "assignee": {"id": "user-001", "name": "テスト太郎"},
      "store": {"name": "テスト店舗"},
      "createdAt": "2026-03-30T10:00:00Z"
    }
  }'

# 認証失敗テスト
curl -s http://localhost:3000/api/webhooks/tasks \
  -X POST \
  -H "Authorization: Bearer wrong-token" \
  -H "Content-Type: application/json" \
  -d '{"event": "task.created", "task": {"id": "test"}}'

# PANET API テスト
curl -s "$PANET_API_URL/api/admin/users" \
  -H "X-API-Key: $PANET_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "display_name": "テスト", "password": "test12345"}'
```
