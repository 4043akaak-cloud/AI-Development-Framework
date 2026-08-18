# AI 作業ガイド

このファイルは、Codex、Claude Code、Z.ai、将来追加されるAIが、このリポジトリで作業する際の共通入口です。

## 最初に読むファイル

作業を始める前に、次の順序で確認します。

1. `README.md` — プロジェクトの目的と全体像
2. `guidelines/AI_COLLABORATION.md` — 全参加者共通の協働ルール
3. `docs/workflow/AI_DELEGATION_CHARTER.md` — Context、Plan、Approval、委任規則
4. `docs/workflow/TASK_LIFECYCLE.md` — Taskの状態遷移と停止条件
5. `docs/project/CURRENT_STATE.md`、関連するTask、設計、決定記録
6. Taskに列挙されたRequired Obsidian Context

関連ドキュメントがまだ存在しない場合は、その事実と前提を明示して作業します。

## 必ず守る共通ルール

`guidelines/AI_COLLABORATION.md` が、このリポジトリにおける共通ルールの正本です。

- 人間からの最新の明示的な指示を最優先する
- 変更前に目的、完了条件、影響範囲を確認する
- 不明点や影響の大きい判断は推測で確定させず、人間に確認する
- 小さく変更し、変更に見合う検証を行う
- 秘密情報を追加せず、既存の変更を確認なく上書き・削除しない

詳細は必ず `guidelines/AI_COLLABORATION.md` を参照します。

## 完成形から逆算する標準

ADFの全作業は [ADF Product Completion Blueprint](docs/project/ADF_PRODUCT_COMPLETION_BLUEPRINT.md) を最上位の製品運用標準として扱います。

- Task開始時に、最終フローのどの段階を進めるかを明示する
- まずOwnerが体験できる縦切りの流れを完成させ、細部の改善は後段に回す
- Taskには `Final Flow Contribution`、`Vertical Slice Outcome`、`Next Flow Unlocked`、`Deferred Details` を記録する
- データ損失、権限逸脱、未承認送信、正本破壊、または現在の縦切りを止める問題以外は、記録して進行を止めない
- 進捗はテスト件数だけでなく、完成形の利用者フローがどこまで繋がったかで報告する

## 現在の最小運用

[Codex単独パイロット](docs/workflow/CODEX_SOLO_PILOT.md) は、承認・検証・引き継ぎを行うための運用基準として維持する。製品骨格は、上記Blueprintに従い、既存のFrontdoor／MCP／Fake／local Ollama資産を統合して完成形の一周を先に実証する。外部API、未承認のAI間自動連携、自動commit、自動push、Canonical自動書込みは導入しない。

依頼時は [AI Task Packet](templates/AI_TASK_PACKET.md) を使う。Codexに渡す最小の固定依頼文は [Codex Solo Request](templates/CODEX_SOLO_REQUEST.md) にある。

## 作業完了時の報告

作業を完了したら、以下を簡潔に報告します。

- 実施した変更とその目的
- 変更したファイル
- 実施した検証と結果
- 未検証事項、残る懸念、または次に必要な作業
