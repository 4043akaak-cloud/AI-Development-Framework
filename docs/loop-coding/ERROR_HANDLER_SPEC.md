# Error Handler Agent Specification

この仕様書は、**Phase 2**（自動化移行時）に導入される **Error Handler Agent** の設計です。

**現状**: Phase 1 では手動運用のため、このドキュメントは「将来の実装設計書」です。  
**参照**: `Memory/loop_coding_design_phase1.md`

---

## 概要

Loop コーディング環境が完全自動化される際、エラーハンドリングが重要になります。

Error Handler Agent は、Loop 内で発生したエラーを自動検出・分析・修正し、「3回ルール」に基づいて対応します。

---

## 3回ルール

### ルール定義

同じ箇所で3回連続してエラーが発生した場合、Error Handler は修正を中止し、**ユーザーに確認を依頼**します。

```
【エラー発生の流れ】

1回目: Error Handler が修正案A を試行
       結果: ✅ 成功 → Loop 継続
             ❌ 失敗 → 2回目へ

2回目: Error Handler が修正案B を試行（異なるアプローチ）
       結果: ✅ 成功 → Loop 継続
             ❌ 失敗 → 3回目へ

3回目: Error Handler が修正案C を試行
       結果: ✅ 成功 → Loop 継続
             ❌ 失敗 → 処理中止 🛑

【3回目に失敗した場合】
- Error Handler が処理を中止
- 修正履歴を Obsidian に記録
- ユーザーに「手動対応が必要」と通知
- Loop を一時停止
```

### 修正履歴の記録

同じエラーが何度も発生した場合、以下をObsidian に記録：

```markdown
# Error Resolution Log

| 日時 | エラー種別 | 根本原因 | 修正案 | 結果 | retry_count |
|------|-----------|---------|--------|------|-------------|
| 2026-08-07 06:00 | Format Error | JSON Parse | [修正A] | ✅ | 1 |
| 2026-08-14 06:00 | Same Error | Encoding | [修正B] | ✅ | 2 |
| 2026-08-21 06:00 | Same Error | Config | [修正C] | ❌ | 3 |

---

## 状態

**2026-08-21: ⏸️ Loop 一時停止**

問題: GitHub Issues 自動生成が3回連続で失敗
根本原因: .github/workflows の設定不正（パス指定エラー）

## ユーザー対応が必要

確認事項:
- [ ] .github/workflows/daily-loop-report.yml の設定を確認
- [ ] GitHub Token の権限を確認
- [ ] API rate limit に達していないか確認

推奨対応:
1. .github/workflows を手動でレビュー
2. テスト実行で動作確認
3. Error Handler に「修正完了」と通知
```

---

## Error Handler Agent の構成

### 入力インターフェース

```yaml
trigger:
  - type: "error_detected"
    source: "explore_agent"  # Explore Agent からのエラー
    error_type: "format_error"
    error_message: "JSON parse failed"
    context: "analyzed_data_frame"
    
  - type: "error_detected"
    source: "github_issues_auto_create"
    error_type: "api_error"
    error_code: 403
    context: "insufficient_permissions"
```

### 処理フロー

```
エラー検出
  ↓
修正履歴を確認（retry_count を取得）
  ↓
retry_count < 3？
  ├─ Yes：修正を試行
  │   ├─ 修正案を生成（異なるアプローチ）
  │   ├─ 試行実施
  │   └─ 成功？
  │       ├─ Yes：✅ Loop 継続、retry_count をリセット
  │       └─ No：retry_count を +1 して、次回へ
  │
  └─ No：処理中止
      ├─ 🛑 Loop を一時停止
      ├─ 修正履歴を Obsidian に記録
      └─ ユーザーに通知「手動対応が必要」
```

### 出力インターフェース

```yaml
# 修正成功時
status: "resolved"
error_fixed: true
action_taken: "修正案B を適用"
next_step: "loop_continue"

# 修正失敗時（3回目）
status: "unresolved"
retry_count: 3
action_taken: "処理を中止"
next_step: "wait_for_user_action"

notification:
  to: "user"
  type: "manual_action_required"
  message: "[Loop] GitHub Issues 自動生成エラーが3回発生しました。手動確認が必要です。"
  evidence: "obsidian://Projects/LoopCodingErrors.md"
```

---

## エラータイプ別の修正戦略

### 1. Format Error（データフォーマットエラー）

```
エラー例: "JSON Parse Failed"

修正案A: JSON エンコーディングを確認・修正
修正案B: Markdown から JSON への変換ロジックを修正
修正案C: 入力データのバリデーションを追加

記録: Obsidian に「どの修正案で解決したか」を記録
```

### 2. API Error（GitHub/外部 API エラー）

```
エラー例: 403 Forbidden, 429 Rate Limit

修正案A: API 呼び出し間隔を調整
修正案B: Token の権限を確認・更新
修正案C: バッチ処理のサイズを縮小

記録: "API 呼び出し失敗" として検出・記録
```

### 3. File System Error（Obsidian/ファイル操作エラー）

```
エラー例: "File Lock Error", "Permission Denied"

修正案A: ファイルロック解放を待機
修正案B: ファイルパスの権限を確認
修正案C: 一時ファイルを使用してから上書き

記録: ファイルパスと操作内容を記録
```

---

## 修正履歴の管理

### 記録対象

Obsidian に以下を自動記録：

```markdown
# Error Resolution Log - [YYYY-MM-DD]

| エラー | 原因 | 修正案A | 修正案B | 修正案C | 最終結果 |
|--------|------|---------|---------|---------|----------|
| Format Error | JSON Parse | ✅ | - | - | 修正A で解決 |
| API Error | Rate Limit | ❌ | ✅ | - | 修正B で解決 |
| File Lock | Concurrent Access | ❌ | ❌ | ❌ | 🛑 ユーザー対応待ち |
```

### 参照方法

次回 Loop 実行時、Error Handler は修正履歴を参照：

```
「この症状、前に見たことある...」
└─ Obsidian から修正履歴を検索
└─ 前回成功した修正案を優先的に試行
```

---

## ユーザーへの通知

### 通知タイミング

3回目の修正が失敗した場合、**直ちに通知**：

```
📧 Email Notification:
Subject: [Loop] Manual Action Required - Error Resolution Failed

Body:
エラー: GitHub Issues 自動生成が3回連続で失敗しました

詳細: ~/Desktop/second\ Brain/obsidian/Projects/LoopCodingErrors.md

推奨対応:
1. Obsidian で修正履歴を確認
2. 根本原因を特定
3. 修正完了後、Loop を再開してください

Reference: docs/loop-coding/ERROR_HANDLER_SPEC.md
```

### ユーザーのアクション

ユーザーが手動対応を完了したら：

```
チャットで私に報告：
「GitHub Issues の permissions を修正しました。Loop を再開してください。」

→ 私が Error Handler に「修正完了」と通知
→ 次回 Loop 実行時、retry_count をリセット
→ Loop が再開される
```

---

## Phase 2 での実装タイムライン

| Week | タスク | 詳細 |
|------|--------|------|
| Week 4 | Explore 自動化 | スケジューリング機構追加 |
| Week 5 | Plan → Issues 自動化 | GitHub API 統合 |
| **Week 6** | **Error Handler 導入** | エラー検出・修正ロジック実装 |
| Week 7-8 | 統合テスト・最適化 | 3回ルールの動作確認 |

---

## Phase 1 での準備

Phase 1（手動運用）中に、以下を準備：

```
□ Error Handler Agent の Profile を作成（チャット1 完了時）
□ 修正履歴ログテンプレートを Obsidian に作成
□ ユーザー通知テンプレートを設計
□ エラータイプ別の修正戦略を文書化

→ これらが Phase 2 での実装の基盤になる
```

---

## 制限事項と今後の拡張

### 現在の制限

- ✅ 同じ箇所で3回まで自動修正を試行
- ✅ 3回目失敗時はユーザーに通知
- ❌ 「別の箇所で同じエラー」は検出しない（Phase 3）
- ❌ 機械学習による予測的修正（Phase 3）

### Phase 3 での拡張予定

```
□ 複数エラー間の関連性を検出（「実は同じ根本原因」）
□ 過去のエラーから機械学習で修正戦略を最適化
□ エラーパターンの自動分類
□ 予測的な修正（「この条件ならエラーが出そう」）
```

---

**Last Updated**: 2026-07-24  
**Status**: Draft（Phase 2 実装前）  
**Next Review**: Week 1 完了後
