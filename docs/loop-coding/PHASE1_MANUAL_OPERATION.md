# Phase 1: 手動ループコーディング運用ガイド

このドキュメントは、**Week 1-3** にわたり Explore + Plan ループを**手動で実行**するためのガイドです。

**参照**: `Memory/loop_coding_design_phase1.md`

---

## 概要

毎週 Monday 朝、以下のフローを実行します：

```
1️⃣ Explore Agent 実行（30分）
   └─ AI Development Framework と Prediction Engine Core を分析

2️⃣ 結果を Obsidian に記録（15分）
   └─ Projects/WeeklyLoopReport_[DATE].md

3️⃣ Plan Agent 実行（30分）
   └─ 改善案を複数提案

4️⃣ GitHub Issues に記録（30分）
   └─ Label: loop-manual, [priority]

5️⃣ Codex が確認（随時）
   └─ 最終マージ判断

合計: 105分/週
```

---

## 詳細フロー

### 1️⃣ Explore Agent の実行

**目的**: 両プロジェクトの品質指標を分析

**実行コマンド**（チャットで手動実行）:

```
Explore Agent として、以下を分析してください：

【対象1: AI Development Framework】
検索項目:
  - ドキュメント品質（README, guides の更新状況）
  - ルール整合性（guidelines/ の一貫性）
  - リンク切れ（docs/ 内のリンク確認）
  - テンプレート実用性（templates/ の有効性）

【対象2: Prediction Engine Core】
検索項目:
  - TypeScript エラー（型定義の完全性）
  - テストカバレッジ（テストファイルの規模・範囲）
  - コード品質（console.log、TODO/FIXME、命名規則）
  - テスト状況（pass/fail 率）

【出力形式】
# Analysis Report - [YYYY-MM-DD]

## AI Development Framework
- [カテゴリ] Issue: [詳細]
- [カテゴリ] Issue: [詳細]

## Prediction Engine Core
- [カテゴリ] Issue: [詳細]
- [カテゴリ] Issue: [詳細]
```

**重要**: Explore Agent の出力は、次のステップ（Obsidian 記録）で使用する

---

### 2️⃣ Obsidian への手動記録

**ファイル**: `Projects/WeeklyLoopReport_[YYYY-MM-DD].md`

**テンプレート**:

```markdown
# Weekly Loop Report - [YYYY-MM-DD]

## Morning Exploration

### AI Development Framework
[Explore Agent の出力をコピペ]

### Prediction Engine Core
[Explore Agent の出力をコピペ]

---

## Evening Synthesis (待機中)

_Plan Agent 実行待ち_
```

**方法**:
1. Explore Agent の出力全体をコピー
2. Obsidian で新ファイル作成（名前: `WeeklyLoopReport_2026-07-29.md` など）
3. 上記テンプレートに Explore 出力をペースト
4. Plan Agent 実行待ち

---

### 3️⃣ Plan Agent の実行

**目的**: Explore 結果に基づき、複数の改善案を検討

**実行コマンド**（チャットで手動実行）:

```
Plan Agent として、上記の Explore 分析結果に基づき、
以下を提案してください：

【入力】
Explore が検出した以下の issues:
[Explore 出力をペースト]

【タスク】
1. 複数の改善案を提案（3-5個）
2. 各案の優先度を付与（Critical/High/Medium）
3. 各案の工数を見積もり（2-4 hours）
4. 実装順序を提案

【出力形式】
# Improvement Proposals - [YYYY-MM-DD]

## Proposal #1
- **Title**: [改善内容]
- **Category**: [コード品質 / ドキュメント / テスト等]
- **Priority**: Critical
- **Effort**: 2-3 hours
- **Reason**: [なぜ必要か、期待される効果]
- **Implementation Approach**: [実装方法の概要]

## Proposal #2
[以下同様]

## Recommended Order
1. Proposal #1（Critical, 即実施）
2. Proposal #2（High, 次週以降）
...

## Summary
全体で [X] 時間の改善が推奨されます。
```

**重要**: Plan Agent の出力は、GitHub Issues 作成で使用する

---

### 4️⃣ GitHub Issues への手動記録

**作成場所**: AI-Development-Framework リポジトリの Issues タブ

**Issue Template**:

```markdown
Title: [Loop] [Project] [Category] - [Summary]

例: [Loop] Prediction Engine Core [Code Quality] - Increase test coverage

---

## 分析元
**Explore Report**: [Obsidian ファイルへのリンク]
例: ~/Desktop/second\ Brain/obsidian/Projects/WeeklyLoopReport_2026-07-29.md

---

## 改善案

[Plan Agent が提案した改善内容をコピペ]

### Priority
Critical / High / Medium

### Estimated Effort
X - Y hours

### Implementation Approach
[Plan Agent の提案]

---

## Acceptance Criteria
- [ ] 改善内容が実装される
- [ ] テスト/検証が実施される
- [ ] Obsidian に実装ログが記録される
- [ ] Codex が確認・マージ

---

## Related Links
- Loop Design: Memory/loop_coding_design_phase1.md
- Obsidian Report: [WeeklyLoopReport_[DATE].md]

---

## Labels
- `loop-manual`
- `[priority-label]`（Critical, High, Medium）
- `[category]`（code-quality, documentation, test-coverage）
```

**方法**:
1. GitHub Issues の「New Issue」をクリック
2. 上記テンプレートに従い、Issue を作成
3. Labels を設定（loop-manual, priority, category）
4. 「Create Issue」をクリック

---

### 5️⃣ Codex による最終確認

**役割**: GitHub Issues をレビューし、内容が明確で優先度が適切か確認

**Codex の確認項目**:
- [ ] Issue の内容は明確か
- [ ] 優先度は適切か
- [ ] 工数見積もりは現実的か
- [ ] 実装アプローチは妥当か

**Codex の判断**:
- ✅ OK の場合：GitHub Issue に「approved」コメント
- ❌ 修正必要の場合：「needs revision」コメント + 修正内容を指示

**ユーザーのアクション**:
- Codex の指示に従い、Issue を更新
- 再度 Codex に確認依頼

---

## Obsidian への統合記録

Plan Agent 実行後、以下を Obsidian の `WeeklyLoopReport_[DATE].md` に追加：

```markdown
---（前述の Morning Exploration に以下を追加）

## Evening Synthesis

### Proposals
[Plan Agent 出力]

### Issues Created
#[issue-number] - [title]
#[issue-number] - [title]

### Codex Review Status
- [ ] Codex 確認待ち
- [ ] Approved
- [ ] Needs Revision

---

## Lessons Learned
- [学習1]
- [学習2]

---

## Next Week Actions
- [ ] 承認された Issue を実装
- [ ] 実装ログを Obsidian に記録
- [ ] GitHub に実装結果をコミット

---

Next Report: [YYYY-MM-DD]
```

---

## 毎週のスケジュール

| 時刻 | タスク | 所要時間 |
|------|--------|----------|
| Monday 9:00 AM | Explore Agent 実行 | 30分 |
| Monday 9:30 AM | Obsidian に記録 | 15分 |
| Monday 9:45 AM | Plan Agent 実行 | 30分 |
| Monday 10:15 AM | GitHub Issues 作成 | 30分 |
| 随時 | Codex 確認 | - |

---

## トラブルシューティング

### Explore Agent の出力が不正な形式の場合
- コピペ時に改行が失われていないか確認
- Explore Agent に「再度、Markdown 形式で出力してください」と指示

### Plan Agent が提案を返さない場合
- Explore 出力をきちんと Paste できているか確認
- 新しいチャットで再実行

### GitHub Issues 作成時にエラーが出る場合
- ネットワーク接続を確認
- labels が存在するか確認
- Issue Template の形式を確認

---

## 参照リンク

- **全体設計**: `Memory/loop_coding_design_phase1.md`
- **Error Handler 仕様**: `docs/loop-coding/ERROR_HANDLER_SPEC.md`（Phase 2）
- **実装ログ**: `docs/loop-coding/IMPLEMENTATION_LOG.md`

---

**Last Updated**: 2026-07-24
**Next Review**: Week 1 完了後
