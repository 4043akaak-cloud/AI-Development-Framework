# 運用テンプレート

このディレクトリのテンプレートは、GitHubをプロジェクト運用の正本にするための最小セットである。各プロジェクトでコピーして使い、実際の進捗・承認・検証結果はコピー先のファイルまたはGitHub Issue/PRへ記録する。

## 作成する順序

1. [PROJECT_GOAL.md](PROJECT_GOAL.md) — 誰のどの課題を解くか、成功を何で測るかを決める。
2. [MVP.md](MVP.md) — 最初に届ける価値と、今回あえて作らないものを決める。
3. [ROADMAP.md](ROADMAP.md) — MVPまでの段階、依存関係、判断ゲートを決める。
4. [CURRENT_STATE.md](CURRENT_STATE.md) — 現在地、次に承認済みの作業、阻害要因を常に1か所で示す。
5. [TASK.md](TASK.md) — 実装・調査・設計・レビューを1つのTaskとして依頼・承認・検証する。
6. [HANDOVER.md](HANDOVER.md) — 担当AIまたは人間が交代するときに、続きから安全に再開できるようにする。

Taskの状態遷移と停止条件は、[Task Lifecycle](../docs/workflow/TASK_LIFECYCLE.md) を正本とする。役割と承認境界は、[AI Delegation Charter](../docs/workflow/AI_DELEGATION_CHARTER.md) を参照する。

## 置き場所

- プロジェクトのGoal、MVP、Roadmap、Current State、Task、Handoverは、そのプロジェクトのGitHubリポジトリ内に置く。最初の4つは、例えば同じ`docs/project/`に置くと相互リンクを保ちやすい。
- TaskがGitHub Issueの場合は、`TASK.md`の項目をIssue本文へ転記してよい。Plan、Approval、Verification、Handoverを省略しない。
- Obsidianには、発想、調査、長い背景、学びを残す。Taskには、参照したObsidianノートと採用した制約をリンクして残す。
- `REQUEST_TO_AI.md`と`PROJECT_STARTUP_CHECKLIST.md`は補助資料であり、新規Taskの必須記録にはこのセットを用いる。

テンプレートを別のディレクトリへコピーした場合は、相対リンクを実際の記録先へ更新する。GitHub Issueに転記する場合は、リンク切れを避けるため、文書名とリポジトリ内パスを明記する。
