# Claude Code 作業ガイド

このファイルは、Claude Code がこのリポジトリで作業する際の入口です。

## プロジェクト開始プロトコル（必須）

`AGENTS.md` と [AI Delegation Charter](docs/workflow/AI_DELEGATION_CHARTER.md) が、すべてのAIに共通する正本です。Claude Code固有のMemoryやSkillだけを作業開始の必須条件にしません。

実装前に、Required Obsidian Context、Plan、Approval StatusをTaskで確認します。確認できない場合は調査・提案に留め、実装を開始しません。

---

## 最初に読むファイル

作業を始める前に、次の順序で確認します。

1. `AGENTS.md` — AI非依存の共通入口
2. `README.md` — プロジェクトの目的と全体像
3. `guidelines/AI_COLLABORATION.md` — 全参加者共通の協働ルール
4. `docs/workflow/AI_DELEGATION_CHARTER.md` — Context、Plan、Approval、委任規則
5. 作業に関連するObsidianノート、設計、決定記録、Task、Current State

関連ドキュメントがまだ存在しない場合は、その事実と前提を明示して作業します。

## 必ず守る共通ルール

`guidelines/AI_COLLABORATION.md` が、このリポジトリにおける共通ルールの正本です。

- 人間からの最新の明示的な指示を最優先する
- 変更前に目的、完了条件、影響範囲を確認する
- 不明点や影響の大きい判断は推測で確定させず、人間に確認する
- 小さく変更し、変更に見合う検証を行う
- 秘密情報を追加せず、既存の変更を確認なく上書き・削除しない

詳細は必ず `guidelines/AI_COLLABORATION.md` を参照します。

## 作業完了時の報告

作業を完了したら、以下を簡潔に報告します。

- 実施した変更とその目的
- 変更したファイル
- 実施した検証と結果
- 未検証事項、残る懸念、または次に必要な作業
