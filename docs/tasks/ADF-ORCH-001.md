# Task — ADF-ORCH-001: 複数AI管制エンジンの設計契約を定める

> Type: Design / Docs
> Status: Done
> Owner: Codex
> Review: Project Owner
> Related: [Goal](../project/GOAL.md) / [MVP](../project/MVP.md) / [Roadmap](../project/ROADMAP.md) / [Current State](../project/CURRENT_STATE.md)

このTaskは、[Task Lifecycle](../workflow/TASK_LIFECYCLE.md)と[AI Delegation Charter](../workflow/AI_DELEGATION_CHARTER.md)に従う。複数AIを接続する実装ではなく、将来の接続を安全に判断するための設計契約を残す文書Taskである。

## 1. Objective

- なぜ今このTaskが必要か: Phase 0で人間承認つきのCodex単独ループを完走し、Product MVP 1を手動・読み取り専用Boardとして先行する判断を記録した。将来、複数AIの成果物を安全に比較・統合できるよう、Board実装前に責務・正本・承認・統合の境界を定める必要がある。
- 達成したい結果: Control Plane、Work Plane、Evidence Planeの責務、Adapter登録、成果物契約、承認・統合ゲート、サブエージェント上限を、GitHubとObsidianの正本境界を壊さずに定義する。
- 完了条件: 本Task、設計2文書、Goal・MVP・Roadmap・Current State、Obsidian判断記録が同じ段階的方針を示し、Project Ownerが差分・検証・残存リスクをレビューできる。

## 2. Required Context

### GitHub

- [AI Context](../../AI_CONTEXT.md)
- [AI Delegation Charter](../workflow/AI_DELEGATION_CHARTER.md)
- [Task Lifecycle](../workflow/TASK_LIFECYCLE.md)
- [Task Board MVP設計](../design/ADF_TASK_BOARD_MVP.md)
- [ADF-RETRO-001](ADF-RETRO-001.md)
- [Current State](../project/CURRENT_STATE.md)
- 現在のbranch・変更状況: `codex/adf-pilot-governance`、HEAD `3c0eab8`。`CURRENT_STATE.md`、`GOAL.md`、`MVP.md`、`ROADMAP.md`、`docs/design/`、`ADF-PILOT-004.md`、`ADF-RETRO-001.md`には本Task開始前から未コミット変更がある。既存の変更を整理、stage、commit、pushしない。

### Obsidian

| ノート | Taskで採用する制約・学び | 確認者 |
| --- | --- | --- |
| `Projects/AI-Development-Framework/00_MOC.md` | GitHubはTask・実装・検証、Obsidianは理念・背景・判断理由・学びの正本とする。 | Codex |
| `Projects/AI-Development-Framework/04_AIRFLOWとループコーディング型ADF構想_2026-08-03.md` | アプリは正本を置き換えず、人間の判断を助ける司令塔とする。 | Codex |
| `Projects/AI-Development-Framework/05_Phase0振り返り_2026-08-03.md` | Board先行の実装判断は維持し、外部AIは別Task・別承認で扱う。 | Codex |

## 3. Scope

- In scope: 将来の複数AI協働に必要な設計境界、Adapterの登録契約、成果物・Evidence・Approval・Integration Gate、画面構成と遷移、段階導入、リスクを文書化する。
- 変更対象: 本Task、`docs/design/ADF_MULTI_AI_CONTROL_PLANE.md`、`docs/design/ADF_AGENT_ADAPTER_CONTRACT.md`、`docs/project/{GOAL,MVP,ROADMAP,CURRENT_STATE}.md`、`Projects/AI-Development-Framework/06_複数AI管制エンジン設計_2026-08-04.md`、同MOC入口。
- Out of scope: UI・コード・設定・依存関係、GitHub/Obsidian API、各AIのAPI/CLI接続、認証・APIキー、DB、Adapter実装、外部送信、費用発生、サブエージェントの実行、commit、push、PR。
- 触れてはいけない部分: 既存Taskの実施記録、Task LifecycleとAI Delegation Charterの本文、既存未コミット変更の整理。

## 4. Plan（実装前）

| Step | 行うこと | 影響 | 検証方法 | Reversible? |
| --- | --- | --- | --- | --- |
| 1 | 管制面・作業面・証跡面、正本、権限と人間承認の境界を設計する | 将来の責務競合を減らす | 設計文書と既存Charterを手動照合 | Yes |
| 2 | Agent Registry、Adapter、Job、Artifact、Context Bundleの最小契約を設計する | 新規AIの加入を審査可能にする | 「登録だけで接続しない」ことを契約と照合 | Yes |
| 3 | サブエージェント上限、統合ゲート、停止・失敗・記録方針を設計する | 無制限委任と無根拠統合を防ぐ | 権限・証跡・Owner承認の各条件を照合 | Yes |
| 4 | Goal・MVP・Roadmap・Current StateとObsidianの判断記録を更新する | GitHub/Obsidian間の引き継ぎを維持する | Markdownリンク、内容整合、`git diff --check` | Yes |

### 代替案・リスク

- 検討した代替案: 先に全AIへ接続する。一見早いが、権限、費用、データ送信、停止、統合責任が未定義のままになるため不採用とする。
- リスク: 設計だけでは各AI製品の実接続性・価格・品質・サブエージェント機能を証明しない。クラウドAIへ送信しないこととクラウドAIを使うことは両立しないため、将来のAdapterごとにデータ方針・費用・接続を別承認する。
- 停止条件: APIキー、外部送信、費用、認証、UI・コード・DB、正本への自動書き込み、commit・pushが必要になった場合は`Waiting Approval`または`Blocked`へ戻る。

## 5. Approval

- Approval required?: Yes。
- 承認対象: 本TaskのScopeに限定した設計文書、GitHub正本の方針更新、Obsidianの長い判断記録とMOC入口。接続や実装は含まない。
- 承認者: Project Owner。
- 承認記録: 2026-08-04、Project Ownerが`ADF-ORCH-001 設計OK`と明示した。
- 承認日時: 2026-08-04。

## 6. Implementation Log

| 日時 | 実施者 | 変更 | 理由 | 逸脱・追加判断 |
| --- | --- | --- | --- | --- |
| 2026-08-04 | Codex | 管制面、Adapter契約、プロジェクト方針、Obsidian判断記録を追加・更新 | 複数AIを将来導入する前に、人間承認・正本・統合の境界を引き継げるようにするため | 接続・APIキー・UI・DB・外部操作・commit・pushは行わない。 |

## 7. Verification

| 種別 | 実施内容 | 結果 | 実施者 | 未実施なら理由 |
| --- | --- | --- | --- |
| 自動 | `git diff --check`、対象ファイルと主要なMarkdownリンク先の存在確認 | Pass | Codex | |
| 手動 | Charter、Board設計、Task、GitHub方針、Obsidian判断記録の正本境界・段階順・禁止事項を照合 | Pass | Codex | |
| 独立レビュー | Project Ownerによる差分・検証・残存リスクの確認 | Approved | Project Owner | `ADF-ORCH-001 レビューOK`（2026-08-04） |

- 受入条件の照合:
  - [x] Boardを第三の意味的正本にせず、GitHub・Obsidianの分担を明記した。
  - [x] 人間承認がTask ID・Scope/Version・Owner・有効期限に結び付く設計を明記した。
  - [x] 新規AIが手動登録・別承認なしに接続、送信、書き込みできないことを明記した。
  - [x] 成果物の統合前に、Scope・差分・検証・レビュー・証跡・リスク・Owner承認を確認するゲートを定義した。
  - [x] サブエージェントの深さ・権限・回数・停止を制限した。
- 残るリスク・未検証事項: 各製品の実接続、API/CLI仕様、認証、費用、品質、UI操作、バックグラウンド実行、実際の複数AIレビューは未検証。

## 8. Completion and Handover

- GitHub更新: 本Task、設計2文書、Goal、MVP、Roadmap、Current Stateを更新する。
- Obsidian更新: 複数AI管制エンジンの長い判断記録とMOC入口を更新する。
- 次の安全な一手: Project Ownerの差分・検証レビュー後、`ADF-MVP1-001`として読み取り専用Task Boardの実装設計をこの契約に照らして改訂する。Board実装やAdapter接続は自動開始しない。
- Handover文書: 本Task、`ADF_MULTI_AI_CONTROL_PLANE.md`、`ADF_AGENT_ADAPTER_CONTRACT.md`、Obsidianの06ノート。

## 9. Project Owner Review

| 対象 | 決定 | 根拠・確認内容 | 日時 | 記録リンク |
| --- | --- | --- | --- | --- |
| Plan / Scope | Approved | `ADF-ORCH-001 設計OK` | 2026-08-04 | 本TaskのApproval記録 |
| Diff / Verification | Approved | Project Ownerが`ADF-ORCH-001 レビューOK`と明示し、差分と検証結果を確認 | 2026-08-04 | この会話 |
| 残存リスク | Accepted | 接続・費用・品質・UI・複数AI実証は未検証。後続の別Taskで扱う | 2026-08-04 | この会話 |

### Done checklist

- [x] Required Contextを確認し、採用した制約を記録した。
- [x] PlanとScopeが承認済みである、または承認不要の理由を記録した。
- [x] 承認済みScopeだけを変更した。
- [x] Verificationの結果と未検証事項を記録した。
- [x] 独立レビュー、または該当しない理由を記録した。
- [x] Project Owner Reviewの対象・決定・根拠を記録した。
- [x] GitHubと必要なObsidianの記録を更新した。
