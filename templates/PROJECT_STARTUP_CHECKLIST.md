# プロジェクト開始チェックリスト

新しいプロジェクトを開始する際、このチェックリストに従ってください。

このリストは、**AI Development Framework** の基本原則（Documentation First、Obsidian Integration、GitHub Operations）に従い、
知識を活用しながら確実に進めるためのものです。

---

## フェーズ 0: 準備段階（プロジェクト開始前）

### ■ Step 1: Obsidian で過去プロジェクトから学ぶ

**実施者**: Lead AI Engineer（Claude Code）

```
作業を始める前に、必ず以下を確認してください。

- [ ] ~/Desktop/second Brain/obsidian/_INDEX.md を読む
- [ ] 関連する Projects/ フォルダの過去プロジェクトを確認
  - [ ] 類似プロジェクトの WorkReport を読む
  - [ ] 類似プロジェクトの FailureAnalysis を確認
- [ ] Technical/ フォルダで技術的なリスク・ハマった点を確認
  - [ ] 同じ技術を使った過去の失敗パターン
  - [ ] ErrorAnalysis（特に型設計・アーキテクチャ）
- [ ] 「このプロジェクトで避けるべきこと」をメモ

【記録】
Issue のコメント or 計画書に「参考にした Obsidian ファイル」を記載
```

### ■ Step 2: プロジェクト計画書を作成

**実施者**: Lead AI Engineer（Claude Code）or 人間

```
以下の項目を明確にします。既存テンプレートがあれば、それに従います。

【プロジェクト概要】
- [ ] プロジェクト名
- [ ] 目的（何を解決するのか）
- [ ] 完了条件（いつ完了と判断するか）
- [ ] 優先度（Critical / High / Medium）

【技術スタック】
- [ ] 言語・フレームワーク
- [ ] データベース（該当する場合）
- [ ] 外部サービス依存（該当する場合）
- [ ] 既存プロジェクトとの関係

【スケジュール概案】
- [ ] Phase 分け（Phase 1, 2, 3...）
- [ ] 各 Phase の概要と期限（概算）
- [ ] 依存関係（このフェーズが終わらないと次が始まらない）

【既知のリスク・制約】
- [ ] Obsidian で見つけた「ハマりやすい点」
- [ ] 過去の失敗パターンで該当するもの
- [ ] 技術的な制約（外部 API 利用不可 など）

【記録方法】
- [ ] GitHub の docs/project/ に計画書を作成
- [ ] Obsidian に Projects/[ProjectName]_Plan.md を作成
```

### ■ Step 3: 計画書を人間が確認

**実施者**: 人間

```
- [ ] 計画書の内容を確認
- [ ] 修正・追加が必要な場合は指示
- [ ] 承認（「OK」とコメント）後、実装開始
```

### ■ Step 4: GitHub の基礎準備

**実施者**: 人間 or AI

```
- [ ] リポジトリが存在し、フレームワークが配置されている
- [ ] main ブランチが保護されている（マージ時に最終確認が必須）
- [ ] GitHub Project ボード作成
  - [ ] Project 名: [プロジェクト名]
  - [ ] ステータス列: Backlog, In Progress, In Review, Done
- [ ] Issue テンプレートが設定されている（template/GITHUB_OPERATIONS.md を参考）
```

---

## フェーズ 1: 設計・基盤実装

### ■ Step 5: アーキテクチャ設計

**実施者**: Lead AI Engineer（Claude Code）

```
【設計内容】
- [ ] 全体アーキテクチャ図（簡単でOK）
- [ ] コンポーネント/モジュール分け
- [ ] データフロー
- [ ] 重要な技術判断（なぜこうしたのか）

【記録】
- [ ] GitHub: docs/architecture/DESIGN.md に記録
- [ ] Obsidian: Projects/[ProjectName]_Architecture.md に記録

【人間の確認】
- [ ] Lead Engineer が設計を提案
- [ ] 人間が「OK」とコメント
```

### ■ Step 6: Phase 1 タスク分割

**実施者**: Lead AI Engineer（Claude Code）

```
設計に基づいて、Phase 1 の作業を Issue に分割します。

【例】
- [Feature] Database schema 定義
- [Feature] Core API endpoint 実装
- [Docs] API specification 作成
- [Test] Unit test setup

各 Issue は REQUEST_TO_AI.md テンプレートに従って記載します。

- [ ] Issue 作成（Project に自動追加）
- [ ] 各 Issue に GitHub Project ラベル・優先度を設定
```

### ■ Step 7: Phase 1 実装開始

**実施者**: AI（Claude Code）

```
【実装ルール】（DEVELOPMENT_FLOW.md, AI_COLLABORATION.md を参照）

- [ ] Issue の完了条件を確認
- [ ] 依頼テンプレート（REQUEST_TO_AI.md）に沿った情報を確認
- [ ] Obsidian の参考資料をチェック
- [ ] 実装開始

【各 Issue 完了時】
- [ ] 自己テスト実施
- [ ] TypeScript/Lint チェック
- [ ] テストコード追加
- [ ] GitHub PR 作成
- [ ] 作業完了報告（PROJECT_STARTUP_CHECKLIST に「実装報告」セクションを参照）
- [ ] Obsidian に実装記録を作成
```

### ■ Step 8: Phase 1 レビュー・マージ

**実施者**: 人間（Codex）

```
- [ ] GitHub PR をレビュー
  - [ ] 完了条件を満たしているか
  - [ ] 受け入れ基準を満たしているか
  - [ ] テストは十分か
  - [ ] ドキュメント更新は完了しているか
- [ ] 問題があれば、コメントで指示
- [ ] OK の場合、マージ
- [ ] Issue をクローズ
```

---

## フェーズ 2: 継続的な実装

### ■ Step 9: 都度修正・改善

**実施者**: 人間

```
プロジェクト進行中に、要件変更や改善が必要になった場合：

- [ ] Issue を新規作成（または既存 Issue を更新）
- [ ] Issue のコメントで AI に通知
- [ ] Issue のステータスを更新
- [ ] AI が対応

【AI 側の対応】
- [ ] Issue のコメントから要件変更を確認
- [ ] 影響範囲を判断
- [ ] 必要に応じて人間に確認
- [ ] 修正実装
- [ ] PR 作成・報告
```

### ■ Step 10: 進捗確認（定期的）

**実施者**: 人間 + AI

```
【毎週 or Phase 完了時】

- [ ] GitHub Project ボードを確認
  - [ ] 予定より遅延している Issue がないか
  - [ ] ブロッキング Issue がないか
- [ ] Obsidian を確認
  - [ ] その週の実装記録が記載されているか
  - [ ] ハマった点・失敗分析が記録されているか
- [ ] 問題があれば Issue 作成

【Lead Engineer による確認】
- [ ] 複数 Phase が並行している場合、依存関係に問題がないか
- [ ] 同じような失敗が繰り返されていないか
- [ ] ルール・ガイドラインの改善が必要か
```

---

## フェーズ 3: 最終確認・リリース

### ■ Step 11: 完了条件の最終チェック

**実施者**: AI（Lead Engineer）

```
計画書で定義した「完了条件」をすべて満たしているか確認します。

- [ ] 全 Issue が Done 状態
- [ ] すべてのテストが成功
- [ ] TypeScript エラー 0
- [ ] ドキュメント更新完了
- [ ] Obsidian に最終分析を記録

【最終チェックリスト】
- [ ] コード品質: Lint, 型チェック, テストカバレッジ
- [ ] ドキュメント: README, API 仕様, 設計書が最新
- [ ] 決定記録: 重要な判断が docs/decisions/ に記録されている
- [ ] Obsidian: プロジェクト完了レポートが作成されている
```

### ■ Step 12: 人間による最終確認

**実施者**: 人間（Codex）

```
- [ ] 計画書の完了条件をすべて確認
- [ ] GitHub PR で最後の変更をレビュー
- [ ] ドキュメントの最終チェック
- [ ] Obsidian レポートを確認
- [ ] 「リリース OK」または「追加修正が必要」を判断
```

### ■ Step 13: リリース/完了

**実施者**: 人間

```
- [ ] main ブランチにマージ
- [ ] リリースノート作成（必要な場合）
- [ ] 該当 Issue をすべてクローズ
- [ ] Project を完了状態に
```

---

## 完了後の知識蓄積

### ■ Step 14: Obsidian 最終レポート作成

**実施者**: Lead AI Engineer（Claude Code）

```
プロジェクト完了後、Obsidian に以下を記録：

【ファイル名】
Projects/[ProjectName]_CompletionReport.md

【内容】
- プロジェクト概要と目的
- 実装結果（何ができたか、何ができなかったか）
- 技術的な判断・工夫
- 発生した問題と解決方法
- 失敗パターン（あれば）
- 今後のプロジェクトへのアドバイス
- 参考資料・リンク

【記録例】
# [Project] 完了レポート

## プロジェクト概要
[目的、期間、チーム]

## 成果
- 実装した機能
- テストカバレッジ
- パフォーマンス（該当する場合）

## ハマった点・解決策
- 問題1: [原因] → [解決]
- 問題2: [原因] → [解決]

## 設計判断
なぜこの技術を選んだか、代替案との比較

## 今後のプロジェクトへのアドバイス
- 同じ課題に直面したときの注意点
- これからやるプロジェクトで使えるパターン

## 参考資料
- GitHub リポジトリ: [URL]
- 関連決定記録: docs/decisions/...
```
```

### ■ Step 15: フレームワーク改善の検討

**実施者**: Lead AI Engineer（Claude Code）

```
【改善点の検討】

このプロジェクトで、フレームワーク自体に改善が必要だったか？

- [ ] ガイドラインに不明確な部分があったか
  → docs/workflow/ や guidelines/ を改善
- [ ] テンプレートが不十分だったか
  → templates/ を改善
- [ ] Obsidian との連携で問題があったか
  → docs/obsidian/OBSIDIAN_INTEGRATION.md を改善
- [ ] GitHub 運用で問題があったか
  → docs/workflow/GITHUB_OPERATIONS.md を改善

改善が必要な場合は Issue を作成し、フレームワーク自体を更新します。
```

---

## トラブルシューティング

### よくあるシナリオ

**シナリオ 1: 要件が途中で変わった**

```
→ Issue を新規作成 or 既存 Issue を更新
→ 計画書（GitHub + Obsidian）を更新
→ AI に新しい完了条件を明示
→ 影響を受けるテストなども更新
```

**シナリオ 2: 同じような失敗が繰り返される**

```
→ Obsidian で「何度も発生」と記録
→ ガイドライン or テンプレートを改善
→ 複数 AI に通知（Issue コメント）
→ フレームワーク Issue を作成
```

**シナリオ 3: 複数 AI 間で理解が異なった**

```
→ AI_COLLABORATION.md の「情報源の優先順位」を確認
→ GitHub Issue のコメント欄で確認
→ 不明点があれば人間に判断を仰ぐ
→ 決定を docs/decisions/ に記録
```

**シナリオ 4: テストに時間がかかりすぎた**

```
→ 実装記録に「テスト戦略」を記録
→ 次のプロジェクトで改善
→ フレームワーク Issue 作成（テスト方針の改善）
```

---

## チェックリストの使用方法

1. **プロジェクト開始時**: この全体をコピーして GitHub Issue に作成
2. **各 Step 完了時**: チェックボックスを埋める
3. **プロジェクト終了時**: 完了状況をレビュー
4. **改善検討**: 難しかった項目を記録し、フレームワーク改善に反映

---

## 他のプロジェクトとの共有

このチェックリストと、関連するガイドラインを、すべての AI と人間で共有してください。

- GitHub: このファイルへのリンクを README に記載
- Obsidian: `_INDEX.md` から参照可能にする
- AI への依頼: 「REQUEST_TO_AI.md テンプレートと PROJECT_STARTUP_CHECKLIST を参照」とコメント
