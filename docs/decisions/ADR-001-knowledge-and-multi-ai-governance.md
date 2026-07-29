# ADR-001: 知識基盤と複数AI協働の統治

- **Status:** Accepted
- **Date:** 2026-07-29
- **Decision Owner:** Project Owner

## Context

複数のAIを利用する開発では、会話履歴、AI固有のMemory、ローカルファイル、GitHub、Obsidianの間で現在地と判断理由が分裂しやすい。AIごとに異なる作業手順を持たせると、同じTaskでも確認・品質・権限の基準が変わる。

また、将来的には実装AI、レビューAI、統括AIを分け、承認済みの範囲では安全に委任したい。一方で、目的変更、不可逆操作、公開、費用、権限変更はプロジェクトオーナーの判断を必要とする。

## Decision

1. **GitHub / Repositoryを実装運用の正本とする。** コード、設定、テスト、Task、ADR、Current State、検証結果、変更履歴はRepositoryに記録する。
2. **Obsidianを知識基盤とする。** 理念、発想、調査、長い判断理由、失敗学、プロジェクト横断の関係を記録する。実装状態を無計画に二重管理しない。
3. **`AGENTS.md`をAI非依存の共通入口とする。** Claude CodeなどのAI固有ファイルは、共通規約への薄いアダプタとして扱う。
4. **実装前にObsidian ContextとPlanをTaskへ記録する。** 必読ノート、採用する制約、Scope、Out of Scope、受入条件、検証方法を明示し、承認前は調査・提案に留める。
5. **権限は役割で分離する。** 実装AI、レビューAI、統括AI、CIの責務を分け、実装AIが自分の変更を最終承認しない。
6. **不可逆・高影響の操作は実行前にエスカレーションする。** 問題発生後ではなく、DB移行・削除・公開・SNS投稿・課金・権限変更などを事前に止める。

詳細な作業規則は [AI Delegation Charter](../workflow/AI_DELEGATION_CHARTER.md) を正本とする。

## Consequences

### Positive

- 新しいAIでもRepositoryを読めば、何を読んで、どこまで変更してよいか判断できる。
- 承認済みのGoal、MVP、Roadmapの範囲では、統括AIが小さな実装Taskを委任できる。
- Obsidianの長文知識をMOCとリンクで参照し、会話履歴に依存しない。

### Constraints

- AIがノートを意味的に読んだことを機械的に完全証明することはできない。Taskには参照ノートと採用した制約を記録し、人間・レビューAIが確認する。
- 自動修正、Push、Merge、公開、投稿を初期の自動ループへ含めない。
- ObsidianとGitHubのリンク先・ID・Current Stateを更新する運用コストが発生する。

## Alternatives Considered

- **AI固有のMemoryだけに保存する:** 別AI・別環境で再現できないため不採用。
- **Obsidianを実装状態の正本にする:** Git履歴・テスト結果・PRと分離するため不採用。
- **最初から完全自動の実装修正ループを作る:** 目的や設計の逸脱を検出しにくいため不採用。

## Related Documents

- [AI Collaboration Rules](../../guidelines/AI_COLLABORATION.md)
- [AI Delegation Charter](../workflow/AI_DELEGATION_CHARTER.md)
- [Development Flow](../workflow/DEVELOPMENT_FLOW.md)
